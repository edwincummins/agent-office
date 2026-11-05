import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { Ctx } from '../office/context.js';
import { readBody,send } from '../http/util.js';
import { auditCadre,cadreOwner } from './access.js';

interface Grant {accountId:string; expires:number; upstream:string; token:string; officeOrigin:string; screen?:string}
const gateways=new WeakMap<Ctx,Promise<Gateway>>();
const TTL=30*60_000;
class Gateway {
  readonly grants=new Map<string,Grant>();
  constructor(readonly server:Server,readonly port:number,readonly ctx:Ctx){}
  revoke(key:string){const grant=this.grants.get(key);if(!grant)return;this.grants.delete(key);const a=this.ctx.accounts.get(grant.accountId);if(a&&grant.screen)auditCadre(this.ctx.cfg.dataDir,a,'screen.close',{target:grant.screen});}
  issue(grant:Omit<Grant,'expires'>){
    for(const [key,value] of this.grants)if(value.expires<Date.now())this.revoke(key);
    if(this.grants.size>=128)this.revoke(this.grants.keys().next().value!);
    const key=randomBytes(32).toString('hex');this.grants.set(key,{...grant,expires:Date.now()+TTL});
    return {url:`http://localhost:${this.port}/`,token:key};
  }
}
async function start(ctx:Ctx):Promise<Gateway>{
  let gateway:Gateway;
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??''))return send(res,403,{error:'Not available'});
      const host=new URL(`http://${req.headers.host}`).hostname;
      if(host!=='localhost')return send(res,403,{error:'Not available'});
      const url=new URL(req.url??'/','http://localhost');
      // A public bootstrap contains no app or grant. It waits for the authenticated office wrapper.
      if(req.method==='GET'&&url.pathname==='/'){
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'");
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(`<!doctype html><title>Cadre connection</title><script>
const receive=async e=>{if(e.source!==parent||e.data?.type!=='cadre.web.authenticate')return;const r=await fetch('/app',{headers:{Authorization:'Bearer '+e.data.token}});if(!r.ok)return;const html=await r.text();removeEventListener('message',receive);clearInterval(timer);document.open();document.write(html);document.close();};
addEventListener('message',receive);const timer=setInterval(()=>parent.postMessage({type:'cadre.web.ready'},'*'),1000);
</script>`);return;
      }
      if(req.method==='POST'&&url.pathname==='/revoke'){
        const key=await readBody(req,256),grant=gateway.grants.get(key);
        if(!grant||req.headers.origin!==grant.officeOrigin)return send(res,403,{error:'Not available'});
        gateway.revoke(key);res.writeHead(204).end();return;
      }
      const bearer=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';
      const grant=gateway.grants.get(bearer);
      const account=grant&&grant.expires>Date.now()?cadreOwner(ctx,grant.accountId):undefined;
      if(!grant||!account)return send(res,403,{error:'Not available'});
      if(req.headers.origin&&req.headers.origin!==`http://localhost:${gateway.port}`)return send(res,403,{error:'Not available'});
      const route=url.pathname;
      const read=req.method==='GET'&&['/app','/api/fleet','/api/capture'].includes(route);
      const action=req.method==='POST'&&['/api/say','/api/decide'].includes(route);
      if(!read&&!action&&!(req.method==='POST'&&route==='/auth'))return send(res,404,{error:'Not available'});
      let body:string|undefined,detail:Record<string,string>={};
      const capture=route==='/api/capture';
      if(capture){const target=(url.searchParams.get('seat')??'').slice(0,160);if(grant.screen!==target){
        if(grant.screen)auditCadre(ctx.cfg.dataDir,account,'screen.close',{target:grant.screen});
        auditCadre(ctx.cfg.dataDir,account,'screen.open',{target});grant.screen=target;
      }}
      if(action){
        body=await readBody(req,16384);
        if(gateway.grants.get(bearer)!==grant||grant.expires<=Date.now()||!cadreOwner(ctx,grant.accountId))return send(res,403,{error:'Not available'});
        const parsed=JSON.parse(body);
        detail={action:route==='/api/say'?'message':String(parsed.kind??'').slice(0,32),target:String(parsed.seat??parsed.id??'').slice(0,160)};
        auditCadre(ctx.cfg.dataDir,account,'action.request',detail);
      }
      const target=new URL(route==='/app'?'/':route,grant.upstream);target.search=url.search;
      const upstream=await fetch(target,{method:req.method,headers:{Authorization:`Bearer ${grant.token}`,...(body?{'Content-Type':'application/json'}:{})},body,redirect:'error',signal:AbortSignal.timeout(10000)});
      const content=await upstream.text();
      if(action)auditCadre(ctx.cfg.dataDir,account,'action.result',{...detail,status:upstream.status});
      if(route==='/app')res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors ${grant.officeOrigin}; base-uri 'none'; form-action 'none'`);
      res.writeHead(upstream.status,{'Content-Type':route==='/app'?'text/html; charset=utf-8':'application/json'}).end(content);
    }catch{if(!res.headersSent)send(res,502,{error:'Cadre request unavailable'});else res.end();}
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();if(!address||typeof address==='string')throw Error('Cadre gateway unavailable');
  gateway=new Gateway(server,address.port,ctx);server.unref();return gateway;
}
export async function cadreGateway(ctx:Ctx){
  let pending=gateways.get(ctx);if(!pending){pending=start(ctx);gateways.set(ctx,pending);pending.catch(()=>gateways.delete(ctx));}return pending;
}
export function stopCadreGateway(ctx:Ctx){const pending=gateways.get(ctx);gateways.delete(ctx);void pending?.then(g=>{g.grants.clear();g.server.closeAllConnections();g.server.close();}).catch(()=>{});}
