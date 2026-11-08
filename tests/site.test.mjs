import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../worker.mjs';
const assets={fetch:async req=>new Response('asset',{status:new URL(req.url).pathname.includes('missing')?404:200})};
const request=(path,env={},method='GET')=>worker.fetch(new Request(`https://querydock.run${path}`,{method}),{ASSETS:assets,...env});
test('GraphQL retains its explicit localized redirects',async()=>{for(const [path,target] of [['/graphql','/en/graphql/'],['/graphql/','/en/graphql/']]){const r=await request(path);assert.equal(r.status,302);assert.equal(new URL(r.headers.get('location')).pathname,target);}});

test('English home aliases redirect directly to the same-origin root for GET and HEAD',async()=>{
 const query='?keep=a%20b&q=one%2Ftwo&next=https%3A%2F%2Felsewhere.example%2F';
 for(const method of ['GET','HEAD']) for(const path of ['/en','/en/']) {
  const r=await request(path+query,{
   QUERYDOCK_APP:{fetch:async()=>assert.fail('Aliases must not reach the app')},
   ASSETS:{fetch:async()=>assert.fail('Aliases must not reach static assets')},
  },method);
  assert.equal(r.status,308);
  assert.equal(r.headers.get('location'),'https://querydock.run/'+query);
  // Real HTTP requests do not contain a fragment. A Location with no fragment
  // inherits the browser's existing fragment instead of explicitly clearing it.
  assert.equal(new URL(r.headers.get('location')).hash,'');
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  assert.equal(r.headers.get('x-frame-options'),'DENY');
  assert.equal(await r.text(),'');
 }
});
test('cold English root reaches the app unchanged for GET and HEAD',async(t)=>{
 t.mock.method(globalThis,'fetch',async()=>assert.fail('Home must use the service binding'));
 for(const method of ['GET','HEAD']) {
  let seen;
  const r=await request('/?keep=a%20b&target=https%3A%2F%2Felsewhere.example',{
   QUERYDOCK_APP:{fetch:async req=>{seen=req;return new Response(method==='HEAD'?null:'English tool',{headers:{'Content-Security-Policy':"default-src 'self'; connect-src 'none'"}});}},
   ASSETS:{fetch:async()=>assert.fail('Bound root must not use the static fallback')},
   API_ORIGIN:'https://fixed-api.example',
  },method);
  assert.equal(r.status,200);
  assert.equal(seen.url,'https://querydock.run/?keep=a%20b&target=https%3A%2F%2Felsewhere.example');
  assert.equal(seen.method,method);
  assert.equal(r.headers.get('location'),null);
  assert.equal(r.headers.get('content-security-policy'),"default-src 'self'; connect-src 'none', frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  assert.equal(r.headers.get('x-frame-options'),'DENY');
  assert.equal(await r.text(),method==='HEAD'?'':'English tool');
 }
});
test('unbound root serves the internal English asset without a redirect loop',async()=>{
 const html=await readFile('dist/en/index.html','utf8');
 for(const method of ['GET','HEAD']) {
  let seen;
  const r=await request('/?keep=a%20b',{
   ASSETS:{fetch:async req=>{seen=req;return new Response(method==='HEAD'?null:html,{headers:{'Content-Type':'text/html; charset=utf-8'}});}},
  },method);
  assert.equal(r.status,200);
  assert.equal(seen.url,'https://querydock.run/en/?keep=a%20b');
  assert.equal(seen.method,method);
  assert.equal(r.headers.get('location'),null);
  assert.equal(r.headers.get('x-frame-options'),'DENY');
  const body=await r.text();
  if(method==='GET') {
   assert.match(body,/<html lang="en"/);
   assert.ok(body.includes('rel="canonical" href="https://querydock.run/"'));
   assert.doesNotMatch(body,/rel="canonical" href="https:\/\/querydock.run\/en\/"/);
  } else assert.equal(body,'');
 }
 assert.equal((await request('/',{},'POST')).status,503);
});

test('prelaunch SQL routes redirect to localized useful guides',async()=>{for(const engine of ['postgres','sqlite','duckdb']){const r=await request(`/sql/${engine}/?lang=ru`);assert.equal(r.status,302);assert.equal(new URL(r.headers.get('location')).pathname,`/ru/sql/${engine}/`);}assert.equal(new URL((await request('/sql')).headers.get('location')).pathname,'/');});
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
test('generated pages use the canonical English root and retain localized non-root SEO',async()=>{
 const sitemap=await readFile('dist/sitemap-0.xml','utf8');
 const locations=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
 for(const location of locations) assert.equal(new URL(location).href,location);
 assert.equal(locations.filter(url=>url==='https://querydock.run/').length,1);
 assert.ok(!locations.some(url=>url==='https://querydock.run/en/'));
 const descriptions=new Set();
 const engineTitles={
  'en/sql/postgres/':'PostgreSQL online playground — run SQL in your browser | QueryDock',
  'en/sql/sqlite/':'SQLite online playground — learn SQL in your browser | QueryDock',
  'en/sql/duckdb/':'DuckDB online playground — run analytical SQL in your browser | QueryDock',
  'ru/sql/postgres/':'PostgreSQL онлайн-песочница — запускайте SQL в браузере | QueryDock',
  'ru/sql/sqlite/':'SQLite онлайн-песочница — изучайте SQL в браузере | QueryDock',
  'ru/sql/duckdb/':'DuckDB онлайн-песочница — аналитический SQL в браузере | QueryDock',
 };
 for(const locale of ['en','ru']) for(const suffix of ['','graphql/','privacy/','terms/','sql/postgres/','sql/sqlite/','sql/duckdb/']) {
  const html=await readFile(`dist/${locale}/${suffix}index.html`,'utf8');
  const english=suffix?`https://querydock.run/en/${suffix}`:'https://querydock.run/';
  const russian=`https://querydock.run/ru/${suffix}`;
  const canonical=locale==='en'?english:russian;
  assert.match(html,new RegExp(`lang="${locale}"`));
  assert.ok(html.includes(`rel="canonical" href="${canonical}"`));
  assert.ok(html.includes(`property="og:url" content="${canonical}"`));
  assert.ok(html.includes(`hreflang="en" href="${english}"`));
  assert.ok(html.includes(`hreflang="ru" href="${russian}"`));
  assert.ok(html.includes(`hreflang="x-default" href="${english}"`));
  assert.ok(locations.some(url=>url===canonical),canonical);
  assert.ok(html.includes(`href="${locale==='en'?'/':'/ru/'}"`));
  assert.ok(html.includes(`class="language" href="${new URL(locale==='en'?russian:english).pathname}"`));
  assert.doesNotMatch(html,/href="\/en\/(?:#|")/);
  assert.doesNotMatch(html,/googletagmanager|fonts.googleapis/);
  assert.equal((html.match(/<script\b/g)||[]).length,4);
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(html.includes('property="og:image" content="https://querydock.run/og-card.png"'));
  assert.ok(html.includes('property="og:image:width" content="1200"'));
  assert.ok(html.includes('property="og:image:height" content="630"'));
  assert.doesNotMatch(html,/og-card\.svg/);
  const ld=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(ld,`${locale}/${suffix} json-ld`);
  const graph=JSON.parse(ld[1]);
  const nodes=graph['@graph'];
  assert.ok(nodes.some(node=>node['@type']==='WebSite'&&Array.isArray(node.inLanguage)&&node.inLanguage.includes(locale)));
  assert.equal(nodes.find(node=>node['@type']==='Organization').name,'DataTug');
  assert.equal(nodes.find(node=>node['@type']==='Organization').url,'https://datatug.app/');
  const page=nodes.find(node=>node['@type']==='TechArticle'||node['@type']==='WebPage');
  assert.equal(page['@type'],suffix.startsWith('sql/')?'TechArticle':'WebPage');
  assert.equal(page.inLanguage,locale);
  assert.equal(page.url,canonical);
  assert.doesNotMatch(JSON.stringify(graph),/aggregateRating|"price"|offers|reviewCount|ratingValue/);
  if(suffix.startsWith('sql/')){
   const meta=html.match(/<meta name="description" content="([^"]*)"/);
   assert.ok(meta,`${locale}/${suffix} description`);
   const desc=meta[1];
   assert.ok(desc.length>=120&&desc.length<=160,`${locale}/${suffix} description length ${desc.length}`);
   assert.equal(descriptions.has(desc),false,desc);
   descriptions.add(desc);
   assert.ok(html.includes(`<title>${engineTitles[`${locale}/${suffix}`]}</title>`));
   assert.equal(page.headline,engineTitles[`${locale}/${suffix}`]);
  }
  assert.equal((html.match(/https:\/\/improveit.now\/widget.js/g)||[]).length,1);
  assert.match(html,/data-space="ao58m" data-app="68be5a2b72bb6213ed8378a2aa3814c0"/);
  assert.match(html,new RegExp(`data-lang="${locale}"`));
  assert.match(html,/<script[^>]*src="\/feedback\.js"/);
  assert.match(html,/data-launcher="hidden"/);
  assert.doesNotMatch(html,/data-screen|data-url|data-path/);
  assert.match(html,/<script[^>]*src="\/theme\.js"/);
  assert.match(html,/id="theme-mode"/);
  assert.doesNotMatch(html,/href="\/sql\//);
  if(suffix==='graphql/')assert.ok(html.includes(locale==='en'?'Coming soon':'Скоро'));
  if(suffix==='graphql/'||suffix.startsWith('sql/'))assert.ok(html.includes(`href="${locale==='en'?'/':'/ru/'}#engines"`));
 }
 for(const locale of ['en','ru']) assert.ok(locations.some(url=>url===`https://querydock.run/${locale}/examples/`));
 const missing=await readFile('dist/404.html','utf8');
 assert.ok(missing.includes('noindex,follow'));
 assert.ok(missing.includes('href="/">English home'));
 assert.ok(missing.includes('href="/ru/">На главную'));
 const robots=await readFile('dist/robots.txt','utf8');
 assert.match(robots,/User-agent: \*\r?\nAllow: \/\r?\n/);
 assert.doesNotMatch(robots,/Disallow:/);
 for(const bot of ['GPTBot','ClaudeBot','PerplexityBot','Google-Extended']) assert.match(robots,new RegExp(`User-agent: ${bot}\\r?\\nAllow: /\\r?\\n`));
 assert.match(robots,/Sitemap: https:\/\/querydock\.run\/sitemap-index\.xml\s*$/);
 const png=await readFile('dist/og-card.png');
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(png.readUInt32BE(16),1200);
 assert.equal(png.readUInt32BE(20),630);
 await assert.rejects(()=>readFile('dist/og-card.svg'));
 assert.equal((missing.match(/<script\b/g)||[]).length,3);
 assert.doesNotMatch(missing,/application\/ld\+json/);
});

test('only exact public home and localized tool routes reach the app binding',async()=>{
 const seen=[]; const QUERYDOCK_APP={fetch:async req=>{seen.push(new URL(req.url).pathname);return new Response('tool',{headers:{'Referrer-Policy':'no-referrer'}});}};
 for(const path of ['/','/ru/','/en/examples/','/ru/examples/','/en/sql/postgres/run/','/ru/sql/duckdb/run/','/ru/sql/sqlite/run/']){const r=await request(path,{QUERYDOCK_APP});assert.equal(await r.text(),'tool');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('x-frame-options'),'DENY');}
 for(const path of ['/en/sql/postgres/','/ru/privacy/','/en/graphql/','/ru/examples-missing','/en/missing']) assert.notEqual(await(await request(path,{QUERYDOCK_APP})).text(),'tool');
 assert.equal(seen.length,7);
});

test('engine guides retain selected locale and engine in clean tool entry URLs',async()=>{for(const locale of ['en','ru'])for(const engine of ['postgres','sqlite','duckdb']){const html=await readFile(`dist/${locale}/sql/${engine}/index.html`,'utf8');assert.ok(html.includes(`href="/${locale}/sql/${engine}/run/"`));assert.doesNotMatch(html,/\?lang=/);}});

test('localized app aliases canonicalize before binding without dropping URL fields',async()=>{for(const path of ['/ru','/ru/examples','/en/sql/sqlite/run']){let called=false;const r=await request(path+'?keep=value',{QUERYDOCK_APP:{fetch:async()=>{called=true;return new Response('unexpected');}}});assert.equal(r.status,308);assert.equal(new URL(r.headers.get('location')).pathname,path+'/');assert.equal(new URL(r.headers.get('location')).search,'?keep=value');assert.equal(called,false);}});
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


function linksPublicRepo(text){
 return [...text.matchAll(/https?:\/\/[^\s)]+/g)].some(match=>{
  let url;
  try { url=new URL(match[0].replace(/[.,;]+$/,'')); } catch { return false; }
  const parts=url.pathname.split('/').filter(Boolean);
  return url.protocol==='https:' && url.hostname==='github.com' && parts[0]==='datatug' && parts[1]==='querydock-run';
 });
}
test('llms files are text/plain and describe QueryDock without invented counts',async()=>{
 assert.equal(linksPublicRepo('The licence is at https://github.com/datatug/querydock-run.'),true);
 assert.equal(linksPublicRepo('licence https://github.com.evil/datatug/querydock-run'),false);
 assert.equal(linksPublicRepo('licence https://evil.example/https://github.com/datatug/querydock-run'),false);
 const short=await readFile('dist/llms.txt','utf8');
 const full=await readFile('dist/llms-full.txt','utf8');
 assert.ok(full.length>short.length);
 for(const [name,body] of [['llms.txt',short],['llms-full.txt',full]]){
  assert.match(body,/^# QueryDock\n\n> QueryDock is a free in-browser SQL playground/);
  for(const phrase of ['PGlite','SQLite','DuckDB','No sign-up is required to run queries','Sign in to save','embed','/examples/','coming soon','https://datatug.app/','https://querydock.run/en/sql/postgres/','https://querydock.run/ru/sql/postgres/','https://querydock.run/en/sql/sqlite/','https://querydock.run/ru/sql/sqlite/','https://querydock.run/en/sql/duckdb/','https://querydock.run/ru/sql/duckdb/','https://querydock.run/en/graphql/','https://querydock.run/ru/graphql/','https://querydock.run/en/examples/','https://querydock.run/ru/examples/']) assert.ok(body.includes(phrase),`${name} missing ${phrase}`);
  assert.equal(linksPublicRepo(body),true,`${name} public repo`);
  assert.doesNotMatch(body,/\b\d[\d,]*\s+(users|customers|developers|teams|stars)\b/i,name);
  let appCalled=false;
  const response=await request('/'+name,{
   QUERYDOCK_APP:{fetch:async()=>{appCalled=true;return new Response('app');}},
   ASSETS:{fetch:async()=>new Response(body,{status:200,headers:{'Content-Type':'application/octet-stream'}})},
  });
  assert.equal(appCalled,false);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'text/plain; charset=utf-8');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(await response.text(),body);
 }
 assert.ok(full.includes('IndexedDB'));
 assert.ok(full.includes('unlisted'));
});

test('sitemap.xml permanently redirects to the sitemap index and is not an app route',async()=>{
 for(const method of ['GET','HEAD']){
  let called=false;
  const response=await request('/sitemap.xml?x=1',{
   QUERYDOCK_APP:{fetch:async()=>{called=true;return new Response('app');}},
   ASSETS:{fetch:async()=>{called=true;return new Response('asset');}},
  },method);
  assert.equal(called,false);
  assert.equal(response.status,301);
  assert.equal(response.headers.get('location'),'https://querydock.run/sitemap-index.xml?x=1');
 }
 const index=await request('/sitemap-index.xml');
 assert.equal(index.status,200);
 assert.equal(await index.text(),'asset');
});

test('only exact root Angular offline controls reach the app and preserve its resource policy',async(t)=>{
 t.mock.method(globalThis,'fetch',async()=>assert.fail('Offline controls must use the service binding'));
 const policy="script-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'none'";
 for(const path of ['/ngsw-worker.js','/safety-worker.js','/ngsw.json']) for(const method of ['GET','HEAD']) {
  let seen;
  const response=await request(path+'?ngsw-cache-bust=0.125',{
   QUERYDOCK_APP:{fetch:async req=>{seen=req;return new Response(method==='HEAD'?null:'official bytes',{headers:{'Content-Security-Policy':policy,'Cache-Control':'no-cache','Content-Type':path.endsWith('.json')?'application/json; charset=utf-8':'text/javascript; charset=utf-8'}});}},
   ASSETS:{fetch:async()=>assert.fail('Bound controls must not fall through to Astro')},
  },method);
  assert.equal(seen.url,'https://querydock.run'+path+'?ngsw-cache-bust=0.125');
  assert.equal(seen.method,method);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-cache');
  assert.equal(response.headers.get('content-type'),path.endsWith('.json')?'application/json; charset=utf-8':'text/javascript; charset=utf-8');
  assert.equal(response.headers.get('content-security-policy'),policy+", frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  assert.equal(response.headers.get('x-frame-options'),'DENY');
  assert.equal(await response.text(),method==='HEAD'?'':'official bytes');
 }
 for(const path of ['/ngsw-worker.js','/safety-worker.js','/ngsw.json']) {
  const absent=await request(path,{ASSETS:{fetch:async()=>assert.fail('Absent controls cannot become static HTML')}});
  assert.equal(absent.status,503);assert.equal(absent.headers.get('cache-control'),'no-store');assert.equal(absent.headers.get('location'),null);
  for(const method of ['POST','PUT','DELETE']) {
   const rejected=await request(path,{QUERYDOCK_APP:{fetch:async()=>assert.fail('Control mutations must not reach binding')}},method);
   assert.equal(rejected.status,405);assert.equal(rejected.headers.get('allow'),'GET, HEAD');
  }
 }
 for(const path of ['/ngsw-worker.js/extra','/ngsw.json/','/ngsw-worker.js.map','/NGSW.json','/other-worker.js']) {
  let seen;
  const response=await request(path,{QUERYDOCK_APP:{fetch:async()=>assert.fail('Control prefix must not broaden app ownership')},ASSETS:{fetch:async req=>{seen=new URL(req.url).pathname;return new Response('static missing',{status:404});}}});
  assert.equal(response.status,404);assert.equal(seen,path);
 }
});
