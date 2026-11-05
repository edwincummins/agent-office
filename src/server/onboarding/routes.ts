import {randomBytes,createHash} from 'node:crypto';
import type {Route} from '../http/router.js';
import type {Ctx} from '../office/context.js';
import {clientIp,isSecure,readBody,sameOrigin,send} from '../http/util.js';
import {parseCookies} from '../auth.js';
import {cleanName} from '../accounts.js';
import {AttemptLimits} from './limits.js';
import {googleConfig} from './config.js';
import {googleProvider,type IdentityProvider} from './oidc.js';
import {localBootstrap} from './admission.js';
type Flow={expires:number;nonce:string;verifier:string;invite:string;first:boolean;accountId?:string;config:string;ip:string};
const random=()=>randomBytes(32).toString('base64url');
const signature=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const states=new WeakMap<Ctx,{flows:Map<string,Flow>;limits:AttemptLimits}>();
function state(ctx:Ctx){let s=states.get(ctx);if(!s){s={flows:new Map(),limits:new AttemptLimits()};states.set(ctx,s);}return s;}
const cookieName=(ctx:Ctx)=>`ao_google_${ctx.cfg.port}`;
export function onboardingRoutes(provider:IdentityProvider=googleProvider):Route[]{return [{
  path:'/api/onboarding',method:'GET',auth:'public',handle(ctx,{req,res}){
    const google=googleConfig(ctx.cfg.dataDir);
    send(res,200,{first:!ctx.accounts.any&&!ctx.accounts.ownerAccountId,local:localBootstrap(ctx,req),google:!!google,shared:ctx.accounts.sharedPassword,canLink:!!ctx.auth.fromRequest(req)?.account});
  }
},{
  path:'/api/signup',method:'POST',auth:'public',async handle(ctx,{req,res}){
    if(!sameOrigin(req,ctx.cfg))return send(res,403,{error:'Open this form in the office.'});
    if(!localBootstrap(ctx,req))return send(res,403,{error:'Create the first account on the office computer. Existing offices require an invite.'});
    const limits=state(ctx).limits,ip=clientIp(req,ctx.cfg.trustProxy);
    if(!limits.take(`signup-ip:${ip}`))return send(res,429,{error:'Too many tries. Try again in 300 s.'});
    try{
      const b=JSON.parse(await readBody(req,4096));
      if(typeof b.name!=='string'||typeof b.password!=='string'||b.password!==b.confirm)return send(res,400,{error:'Enter your name and matching passwords.'});
      const key=`signup-name:${cleanName(b.name).toLowerCase()}`;
      if(!limits.take(key))return send(res,429,{error:'Too many tries. Try again in 300 s.'});
      const a=await ctx.accounts.createFirst(b.name,b.password);
      if(typeof a==='string')return send(res,409,{error:a});
      limits.success(key);ctx.accountsChanged();
      send(res,200,{ok:true},{'set-cookie':ctx.auth.cookie(req,ctx.auth.issue(a.id),isSecure(req,ctx.cfg))});
    }catch{send(res,400,{error:'Could not create the account. Please try again.'});}
  }
},{
  path:'/auth/google/start',method:'POST',auth:'public',async handle(ctx,{req,res}){
    const config=googleConfig(ctx.cfg.dataDir);if(!config)return send(res,404,{error:'Google sign-in is not configured.'});
    if(!sameOrigin(req,ctx.cfg)||req.headers.origin!==new URL(config.redirectUri).origin)return send(res,403,{error:'Open the office at the configured Google redirect address.'});
    const s=state(ctx),ip=clientIp(req,ctx.cfg.trustProxy);
    if(!s.limits.take(`google-ip:${ip}`,30))return send(res,429,{error:'Too many tries. Try again in 300 s.'});
    try{
      const b=JSON.parse(await readBody(req,4096)),first=localBootstrap(ctx,req);
      const invite=typeof b.invite==='string'?b.invite:'';
      if(invite&&!ctx.accounts.findInvite(invite))return send(res,410,{error:'This invite expired. Ask for a new one.'});
      if(!ctx.accounts.any&&!first)return send(res,403,{error:'Create the first account on the office computer.'});
      const accountId=b.link===true?ctx.auth.fromRequest(req)?.account?.id:undefined;
      if(b.link===true&&!accountId)return send(res,403,{error:'Sign in with your password before linking Google.'});
      for(const [k,v] of s.flows)if(v.expires<Date.now())s.flows.delete(k);
      if(s.flows.size>=256)return send(res,429,{error:'Too many sign-ins. Try again shortly.'});
      const id=random(),nonce=random(),verifier=random();
      s.flows.set(id,{expires:Date.now()+600000,nonce,verifier,invite,first,accountId,config:signature(config),ip});
      const url=new URL(provider.authorize);
      url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:'openid email profile',state:id,nonce,code_challenge:signaturePkce(verifier),code_challenge_method:'S256'}).toString();
      send(res,200,{url:url.href},{'set-cookie':`${cookieName(ctx)}=${id}; Path=/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${isSecure(req,ctx.cfg)?'; Secure':''}`});
    }catch{send(res,400,{error:'Could not start Google sign-in.'});}
  }
},{
  path:'/auth/google/callback',method:'GET',auth:'public',async handle(ctx,{req,res,url}){
    const config=googleConfig(ctx.cfg.dataDir);if(!config)return send(res,404,{error:'Google sign-in is not configured.'});
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    const finish=(error?:string)=>{res.writeHead(302,{location:error?`/login?authError=${error}`:'/',...(!error?{}:{})}).end();};
    const s=state(ctx),id=url.searchParams.get('state')??'',flow=s.flows.get(id);
    const bound=parseCookies(req.headers.cookie)[cookieName(ctx)];
    if(!flow||id!==bound||flow.expires<Date.now()||flow.config!==signature(config)||req.headers.host!==new URL(config.redirectUri).host)return finish('invalid');
    s.flows.delete(id);
    res.setHeader('Set-Cookie',`${cookieName(ctx)}=; Path=/auth/google; HttpOnly; SameSite=Lax; Max-Age=0`);
    if(url.searchParams.get('error')==='access_denied'){res.writeHead(302,{location:'/login'}).end();return;}
    const code=url.searchParams.get('code');if(!code||code.length>4096)return finish('invalid');
    if(!s.limits.take(`callback-ip:${flow.ip}`,30))return finish('limited');
    try{
      const identity=await provider.exchange(code,flow.verifier,flow.nonce,config);
      const key=`google-sub:${identity.subject}`;
      if(!s.limits.take(key))return finish('limited');
      let a=ctx.accounts.byIdentity(identity);
      if(flow.accountId){
        if(ctx.auth.fromRequest(req)?.account?.id!==flow.accountId||!ctx.accounts.linkIdentity(flow.accountId,identity))return finish('link');
        a=ctx.accounts.get(flow.accountId);
      }else if(a){if(a.identity?.email!==identity.email)return finish('link');}
      else{
        const result=flow.first&&localBootstrap(ctx,req)?await ctx.accounts.createFirst(identity.name,random(),identity):flow.invite?await ctx.accounts.join(flow.invite,identity.name,random(),identity):'Not invited';
        if(typeof result==='string')return finish('invite');a=result;
      }
      if(!a)return finish('invalid');
      s.limits.success(key);ctx.accountsChanged();
      res.setHeader('Set-Cookie',[`${cookieName(ctx)}=; Path=/auth/google; HttpOnly; SameSite=Lax; Max-Age=0`,ctx.auth.cookie(req,ctx.auth.issue(a.id),isSecure(req,ctx.cfg))]);finish();
    }catch{finish('invalid');}
  }
}];}
function signaturePkce(verifier:string){return createHash('sha256').update(verifier).digest('base64url');}
