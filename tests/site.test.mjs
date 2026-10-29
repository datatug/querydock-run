import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../worker.mjs';
const assets={fetch:async req=>new Response('asset',{status:new URL(req.url).pathname.includes('missing')?404:200})};
const request=(path,env={},method='GET')=>worker.fetch(new Request(`https://querydock.run${path}`,{method}),{ASSETS:assets,...env});
test('root and GraphQL have explicit redirects',async()=>{for(const [path,target] of [['/','/en/'],['/graphql','/en/graphql/'],['/graphql/','/en/graphql/']]){const r=await request(path);assert.equal(r.status,302);assert.equal(new URL(r.headers.get('location')).pathname,target);}});
test('prelaunch SQL routes redirect to localized useful guides',async()=>{for(const engine of ['postgres','sqlite','duckdb']){const r=await request(`/sql/${engine}/?lang=ru`);assert.equal(r.status,302);assert.equal(new URL(r.headers.get('location')).pathname,`/ru/sql/${engine}/`);}assert.equal(new URL((await request('/sql')).headers.get('location')).pathname,'/en/');});
test('API and app assets fail honestly without bindings',async()=>{for(const path of ['/api/querydock','/api/querydock/fiddles','/_querydock/a.js']){const r=await request(path);assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),path.startsWith('/api/')?'no-store, must-revalidate':'no-store');}assert.equal((await request('/sql','', 'POST')).status,503);});
test('API proxy retains revocation cache policy on public reads and failures',async(t)=>{
 let status=200;
 t.mock.method(globalThis,'fetch',async upstream=>{
  assert.equal(upstream.url,'https://fixed-api.example/api/querydock/fiddles/abcdefghijklmnop/revisions/1');
  return new Response('controlled snapshot',{status,headers:{'Cache-Control':status===200?'no-store, must-revalidate':'public, max-age=3600','Access-Control-Allow-Origin':'*'}});
 });
 for(status of [200,404,503]){
  const response=await request('/api/querydock/fiddles/abcdefghijklmnop/revisions/1',{API_ORIGIN:'https://fixed-api.example'});
  assert.equal(response.status,status);
  assert.equal(response.headers.get('cache-control'),'no-store, must-revalidate');
  assert.equal(response.headers.get('access-control-allow-origin'),'*');
  assert.equal(await response.text(),'controlled snapshot');
 }
});
test('route boundaries and unknown paths stay with static 404',async()=>{for(const path of ['/missing','/sql-missing','/api/querydock-missing']){const r=await request(path);assert.equal(r.status,404);}assert.equal((await request('/en/sql/postgres/')).status,200);});
test('app binding owns nested SQL and asset requests',async()=>{for(const path of ['/sql','/sql/postgres/fiddle/a','/_querydock/a.wasm']){let observed;const r=await request(path,{QUERYDOCK_APP:{fetch:async req=>{observed=req.url;return new Response('app');}}});assert.equal(await r.text(),'app');assert.equal(observed,`https://querydock.run${path}`);}});
test('security headers and public embed framing',async()=>{assert.equal((await request('/en/')).headers.get('x-frame-options'),'DENY');const r=await request('/sql/abcdefghijklmnop/3/embed',{QUERYDOCK_APP:{fetch:async()=>new Response('embed')}});assert.equal(r.headers.get('x-frame-options'),null);assert.equal(r.headers.get('x-content-type-options'),'nosniff');for(const invalid of ['/sql/embed/a','/sql/abcdefghijklmnop/0/embed','/sql/short/1/embed','/sql/abcdefghijklmnop/9007199254740992/embed'])assert.equal((await request(invalid,{QUERYDOCK_APP:{fetch:async()=>new Response('app')}})).headers.get('x-frame-options'),'DENY');});
test('invalid API deployment origin fails closed',async()=>{for(const API_ORIGIN of ['not-a-url','http://example.com','https://example.com/other','https://user:pass@example.com'])assert.equal((await request('/api/querydock',{API_ORIGIN})).status,503);});
test('embed framing rewrite preserves non-ASCII and non-CSP whitespace exactly',async()=>{
 const resourcePolicy="script-src 'nonce-abc'\v; \u00a0sandbox; frame-ancestors\u00a0'none'";
 const response=await request('/sql/abcdefghijklmnop/3/embed',{QUERYDOCK_APP:{fetch:async()=>new Response('app',{headers:{'Content-Security-Policy':resourcePolicy+"; \tFRAME-ANCESTORS\t'none' \t"}})}});
 assert.equal(response.headers.get('content-security-policy'),resourcePolicy+", frame-ancestors *; base-uri 'self'; object-src 'none'");
});
test('workspace preserves every upstream CSP policy and adds framing protection',async()=>{
 const upstream="default-src 'self'; script-src 'nonce-abc'; connect-src 'none'; base-uri 'none', worker-src 'self'; object-src 'none'; frame-ancestors 'self'";
 const reportOnly="script-src 'none'; report-to csp";
 const response=await request('/sql/postgres',{QUERYDOCK_APP:{fetch:async()=>new Response('app',{headers:{'Content-Security-Policy':upstream,'Content-Security-Policy-Report-Only':reportOnly}})}});
 assert.equal(response.headers.get('content-security-policy'),upstream+", frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
 assert.equal(response.headers.get('content-security-policy-report-only'),reportOnly);
 assert.equal(response.headers.get('x-frame-options'),'DENY');
});
test('only valid public embeds replace framing across all upstream CSP policies',async()=>{
 const upstream="default-src 'self'; FRAME-ANCESTORS\t'none'; connect-src 'none', frame-ancestors 'self'; script-src 'nonce-abc'; frame-ancestors https://example.com, frame-ancestors 'none'";
 const binding={fetch:async()=>new Response('app',{headers:{'Content-Security-Policy':upstream,'X-Frame-Options':'SAMEORIGIN'}})};
 const response=await request('/sql/abcdefghijklmnop/3/embed',{QUERYDOCK_APP:binding});
 assert.equal(response.headers.get('content-security-policy'),"default-src 'self'; connect-src 'none', script-src 'nonce-abc', frame-ancestors *; base-uri 'self'; object-src 'none'");
 assert.equal(response.headers.get('x-frame-options'),null);
 for(const path of ['/sql/abcdefghijklmnop/0/embed','/sql/abcdefghijklmnop/3/embed/extra','/sql/embed/example']) {
  const invalid=await request(path,{QUERYDOCK_APP:binding});
  assert.equal(invalid.headers.get('content-security-policy'),upstream+", frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  assert.equal(invalid.headers.get('x-frame-options'),'DENY');
 }
});
test('all localized generated HTML contains reciprocal SEO and truthful copy',async()=>{const sitemap=await readFile('dist/sitemap-0.xml','utf8');for(const locale of ['en','ru'])for(const suffix of ['','graphql/','privacy/','terms/','sql/postgres/','sql/sqlite/','sql/duckdb/']){const html=await readFile(`dist/${locale}/${suffix}index.html`,'utf8');assert.match(html,new RegExp(`lang="${locale}"`));assert.ok(html.includes(`https://querydock.run/${locale}/${suffix}`));for(const alternate of ['en','ru'])assert.ok(html.includes(`https://querydock.run/${alternate}/${suffix}`));assert.ok(sitemap.includes(`https://querydock.run/${locale}/${suffix}`));assert.doesNotMatch(html,/googletagmanager|fonts.googleapis/);assert.equal((html.match(/<script\b/g)||[]).length,3);assert.equal((html.match(/https:\/\/improveit.now\/widget.js/g)||[]).length,1);assert.match(html,/data-space="ao58m" data-app="68be5a2b72bb6213ed8378a2aa3814c0"/);assert.match(html,new RegExp(`data-lang="${locale}"`));assert.match(html,/<script[^>]*src="\/feedback\.js"/);assert.match(html,/data-launcher="hidden"/);assert.doesNotMatch(html,/data-screen|data-url|data-path/);assert.match(html,/<script[^>]*src="\/theme\.js"/);assert.match(html,/id="theme-mode"/);assert.doesNotMatch(html,/href="\/sql\//);if(suffix==='graphql/')assert.ok(html.includes(locale==='en'?'Coming soon':'Скоро'));}assert.ok((await readFile('dist/404.html','utf8')).includes('noindex,follow'));});

test('only exact localized home and examples routes reach the app binding',async()=>{
 const seen=[]; const QUERYDOCK_APP={fetch:async req=>{seen.push(new URL(req.url).pathname);return new Response('tool',{headers:{'Referrer-Policy':'no-referrer'}});}};
 for(const path of ['/en/','/ru/','/en/examples/','/ru/examples/','/en/sql/postgres/run/','/ru/sql/duckdb/run/','/ru/sql/sqlite/run/']){const r=await request(path,{QUERYDOCK_APP});assert.equal(await r.text(),'tool');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('x-frame-options'),'DENY');}
 for(const path of ['/en/sql/postgres/','/ru/privacy/','/en/graphql/','/ru/examples-missing','/en/missing']) assert.notEqual(await(await request(path,{QUERYDOCK_APP})).text(),'tool');
 assert.equal(seen.length,7);
});

test('engine guides retain selected locale and engine in clean tool entry URLs',async()=>{for(const locale of ['en','ru'])for(const engine of ['postgres','sqlite','duckdb']){const html=await readFile(`dist/${locale}/sql/${engine}/index.html`,'utf8');assert.ok(html.includes(`href="/${locale}/sql/${engine}/run/"`));assert.doesNotMatch(html,/\?lang=/);}});

test('localized app aliases canonicalize before binding without dropping URL fields',async()=>{for(const path of ['/en','/ru/examples','/en/sql/sqlite/run']){let called=false;const r=await request(path+'?keep=value',{QUERYDOCK_APP:{fetch:async()=>{called=true;return new Response('unexpected');}}});assert.equal(r.status,308);assert.equal(new URL(r.headers.get('location')).pathname,path+'/');assert.equal(new URL(r.headers.get('location')).search,'?keep=value');assert.equal(called,false);}});
test('account-free hash embed path is frameable exactly like a pinned embed and nothing else is',async()=>{
 const upstream="default-src 'self'; frame-ancestors 'none'; connect-src 'self'";
 const binding={fetch:async()=>new Response('app',{headers:{'Content-Security-Policy':upstream,'X-Frame-Options':'DENY'}})};
 const pinned=await request('/sql/abcdefghijklmnop/3/embed',{QUERYDOCK_APP:binding});
 for(const path of ['/sql/embed','/sql/embed/']) {
  const r=await request(path,{QUERYDOCK_APP:binding});
  assert.equal(r.headers.get('x-frame-options'),null,path);
  assert.equal(r.headers.get('content-security-policy'),pinned.headers.get('content-security-policy'),path);
  assert.equal(r.headers.get('content-security-policy'),"default-src 'self'; connect-src 'self', frame-ancestors *; base-uri 'self'; object-src 'none'");
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
 }
 for(const path of ['/sql/embed/x','/sql/embed//','/sql/embeds','/sql/embed.html','/sql/','/sql','/sql/postgres/embed','/en/embed']) {
  const r=await request(path,{QUERYDOCK_APP:binding});
  assert.equal(r.headers.get('x-frame-options'),'DENY',path);
  assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'; base-uri/,path);
 }
});
