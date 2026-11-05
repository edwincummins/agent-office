import type {Route} from '../http/router.js';
import {sameOrigin,readBody,send,isSecure} from '../http/util.js';
import {authLimits} from './limits.js';
export const passwordRoutes:Route[]=[{
 path:'/api/account/password',method:'GET',auth:'session',handle(ctx,{res,session}){
  send(res,200,{canSet:!!session.account?.identity&&session.account.passwordUnset===true});
 }
},{
 path:'/api/account/password',method:'POST',auth:'session',async handle(ctx,{req,res,session}){
  if(!sameOrigin(req,ctx.cfg)||!session.account?.identity||session.account.passwordUnset!==true)return send(res,403,{error:'Sign in to your Google-created account first.'});
  if(!authLimits(ctx).take(`set-password:${session.account.id}`))return send(res,429,{error:'Too many tries. Try again in 300 s.'});
  try{
   const b=JSON.parse(await readBody(req,4096));
   if(typeof b.password!=='string'||b.password!==b.confirm||!await ctx.accounts.setPassword(session.account.id,b.password,true,()=>ctx.auth.fromRequest(req)?.account?.id===session.account!.id))return send(res,400,{error:'Enter matching passwords of 8 to 512 characters.'});
   const token=ctx.auth.issue(session.account.id),renewed=ctx.auth.verify(token)!;
   for(const c of ctx.clients?.values()??[])if(c.accountId===session.account.id&&session.sessionId&&c.sessionId===session.sessionId){c.sessionEpoch=renewed.sessionEpoch;c.sessionId=renewed.sessionId;}
   ctx.accountsChanged();
   send(res,200,{ok:true},{'set-cookie':ctx.auth.cookie(req,token,isSecure(req,ctx.cfg))});
  }catch{send(res,400,{error:'Could not set the password.'});}
 }
}];
