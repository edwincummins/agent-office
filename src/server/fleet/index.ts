import type { Ctx } from '../office/context.js';
import type { Client } from '../office/client.js';
import { fleetCommand, runFleet } from './source.js';
import { FleetPoller } from './poller.js';

const feeds=new WeakMap<Ctx,{subscribe:(client:Client)=>void;remove:(client:Client)=>void}>();
/** Shared-password guests are admins elsewhere, but never receive private fleet data. */
export const maySeeFleet=(ctx:Pick<Ctx,'accounts'>,c:Pick<Client,'accountId'|'out'>)=>!c.out&&!!c.accountId&&ctx.accounts.get(c.accountId)?.role==='admin';

export function installFleet(ctx:Ctx):()=>void {
  let command:string[]|undefined;
  try{command=fleetCommand(ctx.cfg.dataDir);}catch{console.warn('Cadre fleet disabled: invalid or unreadable fleet configuration');}
  if(!command)return ()=>{};
  const subscribers=new Set<Client>();
  const check=()=>{for(const c of subscribers)if(!maySeeFleet(ctx,c)){subscribers.delete(c);if(!c.out)ctx.sendTo(c,{t:'fleet',state:null});}};
  const poller=new FleetPoller(signal=>runFleet(command!,signal),state=>{
    check();for(const c of subscribers)ctx.sendTo(c,{t:'fleet',state});
  });
  feeds.set(ctx,{subscribe:c=>{if(maySeeFleet(ctx,c)&&!subscribers.has(c)){subscribers.add(c);ctx.sendTo(c,{t:'fleet',state:poller.state});}},remove:c=>subscribers.delete(c)});
  const roles=setInterval(check,1000);roles.unref();poller.start();
  return ()=>{clearInterval(roles);poller.stop();subscribers.clear();feeds.delete(ctx);};
}
export function subscribeFleet(ctx:Ctx,c:Client){feeds.get(ctx)?.subscribe(c);}
export function leaveFleet(ctx:Ctx,c:Client){feeds.get(ctx)?.remove(c);}
