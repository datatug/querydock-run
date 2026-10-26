const unavailable = () => Response.json({error:'not_available',message:'QueryDock execution and sharing are not available yet.'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'3600','X-Content-Type-Options':'nosniff'}});
const isPath = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);
function secure(response, {api=false, embed=false}={}) {
 const headers=new Headers(response.headers);
 headers.set('X-Content-Type-Options','nosniff');
 headers.set('Referrer-Policy','strict-origin-when-cross-origin');
 headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 if(api) headers.set('Cache-Control','no-store');
 if(embed) {headers.delete('X-Frame-Options');headers.set('Content-Security-Policy',"frame-ancestors *; base-uri 'self'; object-src 'none'");}
 if(!embed) {headers.set('X-Frame-Options','DENY');headers.set('Content-Security-Policy',"frame-ancestors 'none'; base-uri 'self'; object-src 'none'");}
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {
 async fetch(request,env) {
  const url=new URL(request.url); const path=url.pathname;
  if(path==='/') return secure(Response.redirect(new URL('/en/',url),302));
  if(path==='/graphql'||path==='/graphql/') return secure(Response.redirect(new URL('/en/graphql/',url),302));
  if(isPath(path,'/api/querydock')) {
   if(!env.API_ORIGIN) return secure(unavailable(),{api:true});
   // Deployment-only fixed origin; no request parameter can select an upstream.
   let origin;
   try { origin=new URL(env.API_ORIGIN); } catch { return secure(unavailable(),{api:true}); }
   if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash) return secure(unavailable(),{api:true});
   const upstream=new URL(path+url.search,origin);
   const headers=new Headers(request.headers); headers.delete('host');headers.delete('cookie');
   try { return secure(await fetch(new Request(upstream,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'})),{api:true}); }
   catch { return secure(unavailable(),{api:true}); }
  }
  if(isPath(path,'/sql')||isPath(path,'/_querydock')) {
   if(env.QUERYDOCK_APP) return secure(await env.QUERYDOCK_APP.fetch(request),{embed:/^\/sql\/[^/]+\/[1-9]\d*\/embed\/?$/.test(path)});
   if(isPath(path,'/_querydock')) return secure(new Response('Application assets are not available yet.',{status:503,headers:{'Cache-Control':'no-store'}}));
   if(!['GET','HEAD'].includes(request.method)) return secure(unavailable(),{api:true});
   const locale=url.searchParams.get('lang')==='ru'||url.searchParams.get('locale')==='ru'?'ru':'en';
   const engine=path.split('/')[2]; const suffix=['postgres','sqlite','duckdb'].includes(engine)?`sql/${engine}/`:'';
   return secure(Response.redirect(new URL(`/${locale}/${suffix}`,url),302));
  }
  return secure(await env.ASSETS.fetch(request));
 }
};
