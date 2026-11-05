import { existsSync,readFileSync } from 'node:fs';
import path from 'node:path';
import type { Route } from '../http/router.js';
import { send } from '../http/util.js';
import { embedPage } from './embed.js';

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

export const cadreWebRoute:Route={path:['/api/cadre/web','/api/cadre/embed'],method:'GET',auth:'session',handle(ctx,{req,res,session,path:requestPath}){
  res.setHeader('Cache-Control','no-store');
  if(!session.account||ctx.accounts.get(session.account.id)?.role!=='admin')return send(res,403,{error:'Not available'});
  try {
    const config=cadreWeb(ctx.cfg.dataDir);
    if(!config)return send(res,200,{available:false});
    // Cookies are hostname-scoped, not port-scoped. Require a distinct loopback hostname.
    const officeHost=new URL(`http://${req.headers.host}`).hostname;
    if(new URL(config.url).hostname===officeHost)return send(res,200,{available:false,reason:'Cadre Web needs a different loopback hostname to isolate office cookies.'});
    if(requestPath==='/api/cadre/embed'){
      const scheme=ctx.cfg.tls?'https:':'http:';
      const page=embedPage(config.url,config.token,`${scheme}//${req.headers.host}`);
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':page.csp,'referrer-policy':'no-referrer','x-content-type-options':'nosniff'}).end(page.html);return;
    }
    return send(res,200,{available:true});
  }catch{return send(res,200,{available:false,reason:'Cadre Web configuration is invalid.'});}
}};
