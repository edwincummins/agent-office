import type {Ctx} from '../office/context.js';
import type {SignIns} from '../signins.js';
import type {RunAs} from '../workers/types.js';
import {isOwner,OWNER_ONLY} from './access.js';
const blank=()=>({claude:{status:'none',how:'login'},github:{status:'none',how:'login'},office:false});
/** Non-owners never load a provider profile or start a credential/status command. */
export function ownerSignIns(ctx:Pick<Ctx,'cfg'|'accounts'>,signins:SignIns):SignIns{
 const server=new Set(['shutdown','prune','forget','why']);
 return new Proxy(signins,{get(target,key){const value=Reflect.get(target,key);if(typeof value!=='function')return value;
  return (...args:unknown[])=>{
   if(!server.has(String(key))&&!isOwner(ctx,typeof args[0]==='string'?args[0]:undefined)){
    if(key==='state')return blank();if(key==='look'||key==='token'||key==='signOut')return Promise.resolve(key==='look'?undefined:OWNER_ONLY);
    if(key==='apply')throw Error(OWNER_ONLY);if(key==='start'||key==='code'||key==='useOffice'||key==='ghAs')return OWNER_ONLY;
    return false;
   }
   return Reflect.apply(value,target,args);
  };
 }});
}
export function ownerRunAs(ctx:Pick<Ctx,'cfg'|'accounts'|'signins'>):RunAs{
 return {canRun:id=>isOwner(ctx,id),claudeReady:id=>isOwner(ctx,id)&&ctx.signins.claudeReady(id),why:()=>OWNER_ONLY,
  apply:(id,env,dirs)=>{if(!isOwner(ctx,id))throw Error(OWNER_ONLY);return scrubOfficeSecrets(ctx.signins.apply(id,env,dirs));}};
}
/** Keep only this worker's hook capability; never pass web/session/config secrets to a CLI. */
export function scrubOfficeSecrets(env:Record<string,string>){
 const keep=new Set(['AGENT_OFFICE_WORKER_ID','AGENT_OFFICE_HOOK_TOKEN','AGENT_OFFICE_HOOK_URL','AGENT_OFFICE_HOOK_PORT']);
 for(const key of Object.keys(env))if((/^AGENT_OFFICE_/i.test(key)&&!keep.has(key.toUpperCase()))||/^(CADRE_|GOOGLE_CLIENT_SECRET|SESSION_SECRET)/i.test(key))delete env[key];
 return env;
}
