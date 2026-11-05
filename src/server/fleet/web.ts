import { existsSync,readFileSync } from 'node:fs';
import path from 'node:path';
import type { Route } from '../http/router.js';
import { send } from '../http/util.js';
import { embedPage } from './embed.js';
import { auditCadre,cadreOwner } from './access.js';
import { cadreGateway } from './gateway.js';
import { sameOrigin } from '../http/util.js';

export function cadreWeb(dataDir:string,env=process.env):{url:string;token:string}|null {
  const file=path.join(dataDir,'config.json');
  const config=existsSync(file)?JSON.parse(readFileSync(file,'utf8')).cadre??{}:{};
  const raw=env.AGENT_OFFICE_CADRE_WEB_URL??config.webUrl,token=env.AGENT_OFFICE_CADRE_WEB_TOKEN??config.webToken;
  if(!raw)return null;
  const url=new URL(raw);
  if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash)throw Error('Invalid Cadre Web URL');
  if(typeof token!=='string'||!token||token.length>4096)throw Error('Cadre Web token required');
  return {url:url.href,token};
}

export const cadreWebRoute:Route={path:['/api/cadre/web','/api/cadre/embed','/api/cadre/open','/api/cadre/health','/api/cadre/version'],auth:'session',async handle(ctx,{req,res,session,path:requestPath}){
  res.setHeader('Cache-Control','no-store');
  const account=cadreOwner(ctx,session.account?.id);
  if(!account)return send(res,403,{error:'Not available'});
  if(requestPath==='/api/cadre/open'){
    if(req.method!=='POST'||!sameOrigin(req,ctx.cfg))return send(res,403,{error:'Not available'});
    try{auditCadre(ctx.cfg.dataDir,account,'panel.open');return send(res,200,{ok:true});}catch{return send(res,503,{error:'Audit unavailable'});}
  }
  if(req.method!=='GET')return send(res,405,{error:'Not available'});
  try {
    const config=cadreWeb(ctx.cfg.dataDir);
    if(!config)return send(res,200,{allowed:true,available:false});
    // Cookies are hostname-scoped, not port-scoped. Require a distinct loopback hostname.
    const officeHost=new URL(`http://${req.headers.host}`).hostname;
    if(officeHost!=='127.0.0.1')return send(res,200,{allowed:true,available:false,reason:'Open the office on 127.0.0.1 to isolate Cadre cookies.'});
    if(ctx.cfg.tls)return send(res,200,{allowed:true,available:false,reason:'Cadre gateway requires the local HTTP office.'});
    if(requestPath==='/api/cadre/version'){
      const r=await fetch(new URL('/version',config.url),{redirect:'error',signal:AbortSignal.timeout(2000)});
      if(!r.ok)return send(res,502,{error:'Version unavailable'});
      const value=await r.json() as {v?:unknown};
      if(typeof value.v!=='number'||!Number.isFinite(value.v))return send(res,502,{error:'Invalid version'});
      return send(res,200,{v:value.v});
    }
    if(requestPath==='/api/cadre/health'){const r=await fetch(new URL('/api/fleet',config.url),{headers:{Authorization:`Bearer ${config.token}`},redirect:'error',signal:AbortSignal.timeout(2000)});await r.body?.cancel();return send(res,200,{allowed:true,available:r.ok});}
    if(requestPath==='/api/cadre/embed'){
      const scheme=ctx.cfg.tls?'https:':'http:';
      if(ctx.cfg.tls)return send(res,200,{available:false,reason:'Cadre gateway requires the local HTTP office.'});
      const officeOrigin=`${scheme}//${req.headers.host}`;
      const gateway=await cadreGateway(ctx);
      auditCadre(ctx.cfg.dataDir,account,'panel.embed');
      const grant=gateway.issue({accountId:account.id,upstream:config.url,token:config.token,officeOrigin});
      const page=embedPage(grant.url,grant.token,officeOrigin);
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':page.csp,'referrer-policy':'no-referrer','x-content-type-options':'nosniff'}).end(page.html);return;
    }
    return send(res,200,{allowed:true,available:true});
  }catch{if(requestPath==='/api/cadre/version')return send(res,502,{error:'Version unavailable'});return send(res,200,{allowed:true,available:false,reason:'Cadre Web configuration or audit is unavailable.'});}
}};
