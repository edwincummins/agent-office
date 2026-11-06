import type { Ctx } from '../office/context.js';
import type { Client } from '../office/client.js';
import { fleetCommand, runFleet } from './source.js';
import { FleetPoller } from './poller.js';
import { cadreOwner,ownerAllowlist } from './access.js';
import { stopCadreGateway } from './gateway.js';
import { guestView, loadGuests, sanitizeGuests, saveGuests } from './guests.js';
import { ScreenWatcher, maskScreen } from './screens.js';
import { cadreWeb } from './web.js';
import type { FleetGuestSettings, FleetScreen } from '../../shared/protocol/fleet.js';

const feeds=new WeakMap<Ctx,{subscribe:(client:Client)=>void;remove:(client:Client)=>void;setGuests:(client:Client,settings:FleetGuestSettings)=>void;screens:(client:Client,on:boolean)=>void;
  guests:()=>FleetGuestSettings;seatTeam:(seat:string)=>string|null;stream:(seat:string,write:(s:FleetScreen)=>void)=>(()=>void)|null}>();
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
  // Colour screens (screens.ts) for whoever has the watch view open: the owner gets every running seat as is, guests
  // only the seats of teams they may watch, masked, and nothing while his eye hides terminals.
  const viewers=new Set<Client>();
  const guestSeat=(seat:string)=>{if(!guests.terminals)return false;const s=poller.state?.seats.find(x=>x.session===seat);return !!s&&guests.teams[s.rig]===true;};
  const forClient=(c:Client,all:Record<string,FleetScreen>)=>{
    // The eye applies to the watch view everywhere, his own on the Mac included (his PC's live panel is separate).
    if(subscribers.has(c))return guests.terminals?all:{};
    const out:Record<string,FleetScreen>={};
    for(const [seat,sc] of Object.entries(all))if(guestSeat(seat))out[seat]={cols:sc.cols,lines:maskScreen(sc.lines)};
    return out;
  };
  // Live tiles of the read-only Cadre showcase (showcase.ts) follow their seats here too.
  const streamers=new Map<string,Set<(s:FleetScreen)=>void>>();
  const screenWatch=new ScreenWatcher(()=>{try{return cadreWeb(ctx.cfg.dataDir);}catch{return null;}},all=>{
    // One viewer's closed tile must never take the office down (11-06: the office stopped while he watched on his Mac).
    for(const [seat,sc] of Object.entries(all))for(const w of streamers.get(seat)??[])try{w(sc);}catch{/* that viewer is gone */}
    for(const c of viewers){if(c.out){viewers.delete(c);continue;}const mine=forClient(c,all);if(Object.keys(mine).length)ctx.sendTo(c,{t:'fleet.screens',screens:mine});}
  });
  const refollow=()=>{
    for(const c of viewers)if(c.out||(!subscribers.has(c)&&!watchers.has(c)))viewers.delete(c);
    const running=(poller.state?.seats??[]).filter(s=>s.state!=='stopped').map(s=>s.session);
    const owner=[...viewers].some(c=>subscribers.has(c)),guest=[...viewers].some(c=>watchers.has(c));
    screenWatch.follow([...new Set([...running.filter(seat=>owner||(guest&&guestSeat(seat))),...[...streamers.keys()].filter(s=>running.includes(s))])]);
  };
  const poller=new FleetPoller(signal=>runFleet(command!,signal),state=>{
    check();for(const c of subscribers)ctx.sendTo(c,{t:'fleet',state});sendGuests();refollow();
  });
  feeds.set(ctx,{
    subscribe:c=>{
      if(c.out||subscribers.has(c)||watchers.has(c))return;
      if(maySeeFleet(ctx,c)){subscribers.add(c);ctx.sendTo(c,{t:'fleet',state:poller.state});ctx.sendTo(c,{t:'fleet.guests',settings:guests});}
      else{watchers.add(c);ctx.sendTo(c,{t:'fleet',state:guestCopy(),guest:true});}
    },
    remove:c=>{subscribers.delete(c);watchers.delete(c);if(viewers.delete(c))refollow();},
    guests:()=>guests,
    seatTeam:seat=>poller.state?.seats.find(s=>s.session===seat)?.rig??null,
    stream:(seat,write)=>{
      if(!(poller.state?.seats??[]).some(s=>s.session===seat&&s.state!=='stopped'))return null;
      let set=streamers.get(seat);if(!set)streamers.set(seat,set=new Set());
      set.add(write);refollow();
      const now=screenWatch.all()[seat];if(now)write(now);
      return ()=>{set!.delete(write);if(!set!.size)streamers.delete(seat);refollow();};
    },
    screens:(c,on)=>{
      if(!on){if(viewers.delete(c))refollow();return;}
      if(!subscribers.has(c)&&!watchers.has(c))return;
      viewers.add(c);refollow();
      const now=forClient(c,screenWatch.all());if(Object.keys(now).length)ctx.sendTo(c,{t:'fleet.screens',screens:now});
    },
    // Only the Cadre owner changes what guests see; it applies to every guest at once.
    setGuests:(c,settings)=>{
      if(!maySeeFleet(ctx,c))return;
      guests=sanitizeGuests(settings);
      try{saveGuests(ctx.cfg.dataDir,guests);}catch{console.warn('Cadre guest settings could not be saved');}
      for(const o of subscribers)ctx.sendTo(o,{t:'fleet.guests',settings:guests});
      sendGuests();refollow();
      // Instantly, whatever each viewer has open: drop what they hold and send only what they may now see.
      for(const v of viewers)ctx.sendTo(v,{t:'fleet.screens',screens:forClient(v,screenWatch.all()),reset:true});
    },
  });
  const roles=setInterval(check,1000);roles.unref();poller.start();
  return ()=>{clearInterval(roles);poller.stop();screenWatch.close();viewers.clear();subscribers.clear();feeds.delete(ctx);stopCadreGateway(ctx);};
}
export function subscribeFleet(ctx:Ctx,c:Client){feeds.get(ctx)?.subscribe(c);}
export function leaveFleet(ctx:Ctx,c:Client){feeds.get(ctx)?.remove(c);}
export function setFleetGuests(ctx:Ctx,c:Client,msg:{settings:FleetGuestSettings}){feeds.get(ctx)?.setGuests(c,msg.settings);}
export function fleetScreens(ctx:Ctx,c:Client,msg:{on:boolean}){feeds.get(ctx)?.screens(c,msg.on===true);}
export const fleetGuestSettings=(ctx:Ctx)=>feeds.get(ctx)?.guests()??loadGuests(ctx.cfg.dataDir);
export const fleetSeatTeam=(ctx:Ctx,seat:string)=>feeds.get(ctx)?.seatTeam(seat)??null;
export const openScreenStream=(ctx:Ctx,seat:string,write:(s:FleetScreen)=>void)=>feeds.get(ctx)?.stream(seat,write)??null;
