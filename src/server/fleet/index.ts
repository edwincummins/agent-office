import type { Ctx } from '../office/context.js';
import type { Client } from '../office/client.js';
import { fleetCommand, runFleet } from './source.js';
import { FleetPoller } from './poller.js';
import { cadreOwner,ownerAllowlist } from './access.js';
import { stopCadreGateway } from './gateway.js';
import { guestView, loadGuests, sanitizeGuests, saveGuests } from './guests.js';
import type { FleetGuestSettings } from '../../shared/protocol/fleet.js';

const feeds=new WeakMap<Ctx,{subscribe:(client:Client)=>void;remove:(client:Client)=>void;setGuests:(client:Client,settings:FleetGuestSettings)=>void}>();
/** Shared-password guests are admins elsewhere, but never receive private fleet data. */
export const maySeeFleet=(ctx:Pick<Ctx,'cfg'|'accounts'>,c:Pick<Client,'accountId'|'out'>)=>!c.out&&!!cadreOwner(ctx,c.accountId);

export function installFleet(ctx:Ctx):()=>void {
  let command:string[]|undefined;
  try{command=fleetCommand(ctx.cfg.dataDir);}catch{console.warn('Cadre fleet disabled: invalid or unreadable fleet configuration');}
  if(!command||!ownerAllowlist(ctx.cfg.dataDir).length)return ()=>stopCadreGateway(ctx);
  const subscribers=new Set<Client>();
  // Everyone else watches a filtered, masked copy (guests.ts), per the owner's privacy eye.
  const watchers=new Set<Client>();
  let guests=loadGuests(ctx.cfg.dataDir);
  const guestCopy=()=>poller.state?guestView(poller.state,guests):null;
  const check=()=>{
    for(const c of subscribers)if(!maySeeFleet(ctx,c)){subscribers.delete(c);if(!c.out){watchers.add(c);ctx.sendTo(c,{t:'fleet',state:guestCopy(),guest:true});}}
    for(const c of watchers)if(c.out){watchers.delete(c);}else if(maySeeFleet(ctx,c)){watchers.delete(c);subscribers.add(c);ctx.sendTo(c,{t:'fleet',state:poller.state});ctx.sendTo(c,{t:'fleet.guests',settings:guests});}
  };
  const sendGuests=()=>{const copy=guestCopy();for(const c of watchers)ctx.sendTo(c,{t:'fleet',state:copy,guest:true});};
  const poller=new FleetPoller(signal=>runFleet(command!,signal),state=>{
    check();for(const c of subscribers)ctx.sendTo(c,{t:'fleet',state});sendGuests();
  });
  feeds.set(ctx,{
    subscribe:c=>{
      if(c.out||subscribers.has(c)||watchers.has(c))return;
      if(maySeeFleet(ctx,c)){subscribers.add(c);ctx.sendTo(c,{t:'fleet',state:poller.state});ctx.sendTo(c,{t:'fleet.guests',settings:guests});}
      else{watchers.add(c);ctx.sendTo(c,{t:'fleet',state:guestCopy(),guest:true});}
    },
    remove:c=>{subscribers.delete(c);watchers.delete(c);},
    // Only the Cadre owner changes what guests see; it applies to every guest at once.
    setGuests:(c,settings)=>{
      if(!maySeeFleet(ctx,c))return;
      guests=sanitizeGuests(settings);
      try{saveGuests(ctx.cfg.dataDir,guests);}catch{console.warn('Cadre guest settings could not be saved');}
      for(const o of subscribers)ctx.sendTo(o,{t:'fleet.guests',settings:guests});
      sendGuests();
    },
  });
  const roles=setInterval(check,1000);roles.unref();poller.start();
  return ()=>{clearInterval(roles);poller.stop();subscribers.clear();feeds.delete(ctx);stopCadreGateway(ctx);};
}
export function subscribeFleet(ctx:Ctx,c:Client){feeds.get(ctx)?.subscribe(c);}
export function leaveFleet(ctx:Ctx,c:Client){feeds.get(ctx)?.remove(c);}
export function setFleetGuests(ctx:Ctx,c:Client,msg:{settings:FleetGuestSettings}){feeds.get(ctx)?.setGuests(c,msg.settings);}
