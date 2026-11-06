/** Disposable synthetic wrapper proof. Never point this fixture at real Cadre or office data. */
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {cadreWebRoute} from '../../src/server/fleet/web.js';
import {requestHandler} from '../../src/server/http/router.js';
import type {Ctx} from '../../src/server/office/context.js';
const port=Number(process.env.CADRE_VERSION_TEST_PORT||4637),dir=mkdtempSync(path.join(tmpdir(),'cadre-version-browser-'));
let version=1,loads=0,auths=0,versionReads=0,versionBearer=false;
const upstream=createServer((req,res)=>{
 if(req.url==='/version'){versionReads++;versionBearer ||=!!req.headers.authorization;res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({v:version}));return;}
 if(req.url==='/auth'){auths++;res.writeHead(req.headers.authorization==='Bearer synthetic-version-token'?204:403).end();return;}
 if(req.url!=='/'){res.writeHead(404).end();return;}loads++;
 res.writeHead(200,{'content-type':'text/html'}).end(`<!doctype html><title>Synthetic version ${version}</title><body style="background:#08090a;color:#ece6d6;font:24px system-ui"><h1>Synthetic version ${version}</h1><p id="state">Waiting</p><script>
 let active=false,previous;
 addEventListener('message',async e=>{if(e.source!==parent||e.data?.type!=='cadre.web.authenticate')return;const r=await fetch('/auth',{method:'POST',headers:{Authorization:'Bearer '+e.data.token}});if(r.ok){active=true;document.querySelector('#state').textContent='Authenticated';parent.postMessage({type:'cadre.web.connected'},e.origin);}});
 setInterval(()=>{if(!active)parent.postMessage({type:'cadre.web.ready'},'*');else fetch('/version',{cache:'no-store'}).then(r=>r.json()).then(value=>{if(previous!==undefined&&previous!==value.v)location.reload();previous=value.v;}).catch(()=>{});},250);
 </script>`);
});
await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
writeFileSync(path.join(dir,'config.json'),JSON.stringify({cadre:{ownerAllowlist:[{id:'synthetic-owner'}],webUrl:`http://127.0.0.1:${(upstream.address() as {port:number}).port}`,webToken:'synthetic-version-token'}}));
const account={id:'synthetic-owner',name:'Synthetic Owner',role:'admin'};
const ctx={cfg:{dataDir:dir,port},accounts:{get:(id:string)=>id===account.id?account:undefined},auth:{fromRequest:(req:any)=>req.headers.cookie?.includes('synthetic-owner=1')?{account}:undefined}} as unknown as Ctx;
const routes=requestHandler(ctx,[cadreWebRoute]);
createServer((req,res)=>{
 if(req.url==='/'){res.writeHead(200,{'content-type':'text/html','set-cookie':'synthetic-owner=1; HttpOnly; SameSite=Strict; Path=/'}).end('<!doctype html><title>Version bridge test</title><iframe title="Office wrapper" src="/api/cadre/embed" style="border:0;width:100%;height:90vh"></iframe>');return;}
 if(req.url==='/advance'&&req.method==='POST'){version++;res.writeHead(204).end();return;}
 if(req.url==='/stats'){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({version,loads,auths,versionReads,versionBearer}));return;}
 routes(req,res);
}).listen(port,'127.0.0.1',()=>console.log(`Synthetic version preview on ${port}`));
