import './panel.css';
import {reconnect} from './reconnect';
import type { FleetGuestSettings, FleetScreen, FleetSnapshot } from '../../../shared/protocol/fleet';
import { paintScreen } from './screen-paint';
import { h,openModal } from '../../ui/dom';
import { store } from '../../state';
import { fleetColors } from './draw';

/** The fallback is a data viewer. Interactive work remains in the separately hosted Cadre app. */
export interface FleetPanelOptions { guest:boolean; guests:()=>FleetGuestSettings|null; setGuests:(s:FleetGuestSettings)=>void;
  /** Colour screens by seat, and a counter that moves when any changes; watch(true) while the watch view shows. */
  screens?:()=>{map:Map<string,FleetScreen>;version:number}; watch?:(on:boolean)=>void }
export function openFleet(snapshot:()=>FleetSnapshot|null,services:()=>void,opts:FleetPanelOptions={guest:false,guests:()=>null,setGuests:()=>{}}) {
  const notice=h('p.cadre-notice',{},opts.guest?'Watching Cadre, read-only.':'Read-only preview. Live Cadre is not connected yet (Cadre Web).');
  // The owner's privacy eye (Fetty, 11-06): what guests see, changed live; the office filters on his PC.
  const eyeBar=h('div.cadre-eye',{hidden:true});
  const drawEye=()=>{
    const s=opts.guests();if(!s){eyeBar.replaceChildren(h('span',{},'Guest settings loading…'));return;}
    const flip=(next:FleetGuestSettings)=>{opts.setGuests(next);};
    const chip=(label:string,on:boolean,next:()=>FleetGuestSettings)=>h('button',{class:on?'on':'off','aria-pressed':String(on),title:on?`Guests see ${label}: click to hide`:`Hidden from guests: click to show`,onclick:()=>flip(next())},h('span.cadre-eye-name',{},label),h('span.cadre-eye-state',{},on?'SHOWN':'HIDDEN'));
    const teams=[...new Set([...(snapshot()?.teams??[]),...Object.keys(s.teams)])].sort();
    eyeBar.replaceChildren(h('span.cadre-eye-label',{},'Guests see:'),
      chip('Terminals',s.terminals,()=>({...s,terminals:!s.terminals})),
      chip('Gold cards',s.cards,()=>({...s,cards:!s.cards})),
      h('span.cadre-eye-label',{},'Teams:'),
      ...teams.map(t=>chip(t,s.teams[t]===true,()=>({...s,teams:{...s.teams,[t]:s.teams[t]!==true}}))));
  };
  const eye=h('button.cadre-eye-toggle',{title:'What guests can see',onclick:()=>{eyeBar.hidden=!eyeBar.hidden;drawEye();}},'👁 Guests');
  const rows=h('div');
  const body=h('div.cadre-body',{},notice,rows);
  const content=h('div.modal.cadre-panel',{role:'dialog','aria-label':'Cadre'},
    h('header',{},h('h2',{},'Cadre'),...(opts.guest?[]:[eye]),h('div.cadre-modes',{},h('button',{onclick:()=>{modal.close();services();}},'Services'),h('span.selected',{},'Cadre'))),...(opts.guest?[]:[eyeBar]),body);
  let closed=false,connectionAttempted=false,key='',frame:HTMLIFrameElement|undefined,lastAlive=0;
  // Colour terminals in the watch view: asked for only while it is what's showing (not behind the live panel).
  let painted=-1,watching=false,shownSince=0;
  const paint=()=>{
    const s=opts.screens?.();if(!s)return;
    for(const pre of rows.querySelectorAll<HTMLElement>('.cadre-tail')){
      const sc=s.map.get(pre.dataset.seat??'');if(!sc)continue;
      const atBottom=pre.scrollTop+pre.clientHeight>=pre.scrollHeight-4;
      paintScreen(pre,sc);if(atBottom)pre.scrollTop=pre.scrollHeight;
    }
    painted=s.version;
  };
  const watchView=()=>{
    const visible=!body.hidden&&!closed;
    if(visible&&!shownSince)shownSince=Date.now();if(!visible)shownSince=0;
    // The owner on the PC sees the live panel within a second or two; only ask if the watch view stays up.
    const want=visible&&(opts.guest||Date.now()-shownSince>3000);
    if(want!==watching){watching=want;opts.watch?.(want);}
  };
  const render=()=>{
    const state=snapshot(),next=JSON.stringify(state);if(next===key)return;key=next;painted=-1;
    const scroll=new Map(Array.from(rows.querySelectorAll<HTMLElement>('.cadre-tail'),el=>[el.dataset.seat,{top:el.scrollTop,left:el.scrollLeft,bottom:el.scrollTop+el.clientHeight>=el.scrollHeight-4}]));
    rows.replaceChildren();
    if(!state){rows.append(h('p',{},'Cadre feed is off. Set cadre.fleetCommand'));return;}
    if(state.status==='stale')rows.append(h('p.cadre-notice',{},'Feed unavailable — showing the last received snapshot.'));
    if(!state.teams.length)rows.append(h('p',{},'No teams or seats yet.'));
    for(const need of state.needs)rows.append(h('p.cadre-gate',{},`${need.rig} · ${need.summary}`));
    const grid=h('div.cadre-grid');rows.append(grid);
    for(const seat of state.seats){
      const tile=h('section.cadre-team',{style:`border-color:${fleetColors[seat.state]}`},
        h('h3',{},`${seat.rig} · ${seat.name}`,h('small',{style:`color:${fleetColors[seat.state]}`},seat.state.replace('-',' '))));
      if(seat.reason)tile.append(h('p.cadre-reason',{style:`color:${fleetColors[seat.state]}`},`${seat.reason}${seat.since!==undefined?` · seen ${seat.state} since ${new Date(seat.since).toLocaleString()}`:''}`));
      const tail=h('pre.cadre-tail',{'data-seat':seat.session,style:seat.state==='stopped'?'opacity:.4':''},seat.tail?.length?seat.tail.join('\n'):'no output yet');
      tile.append(tail);grid.append(tile);const position=scroll.get(seat.session);tail.scrollTop=position&&!position.bottom?position.top:tail.scrollHeight;tail.scrollLeft=position?.left??0;
    }
  };
  const load=()=>{connectionAttempted=true;frame?.remove();lastAlive=Date.now();frame=h('iframe',{title:'Cadre connection',src:'/api/cadre/embed',sandbox:'allow-scripts allow-same-origin allow-forms',referrerpolicy:'no-referrer',hidden:true});content.append(frame);};
  const recovery=reconnect(async signal=>{
    const response=await fetch('/api/cadre/health',{cache:'no-store',signal});
    if(response.status===403||response.status===401){modal.close();return false;}
    return response.ok&&(await response.json()).available===true;
  },load);
  let retryTimer:ReturnType<typeof setTimeout>|undefined;
  const scheduleRetry=()=>{
    if(closed||retryTimer!==undefined)return;
    const delay=recovery.delay();if(delay===null)return;
    retryTimer=setTimeout(async()=>{await recovery.tick();retryTimer=undefined;scheduleRetry();},delay);
  };
  const message=(event:MessageEvent)=>{
    if(opts.guest||!frame||store.me.account?.role!=='admin'||event.source!==frame.contentWindow||event.origin!==location.origin)return;
    if(event.data?.type==='cadre.web.connected'||event.data?.type==='cadre.web.heartbeat'){
      recovery.connected();lastAlive=Date.now();frame.hidden=false;body.hidden=true;
    }
    if(event.data?.type==='cadre.web.close')modal.close();
  };
  window.addEventListener('message',message);
  const timer=setInterval(()=>{
    if(!opts.guest&&store.me.account?.role!=='admin'){modal.close();return;}
    if(opts.guest&&!snapshot()){modal.close();return;}
    render();if(!eyeBar.hidden)drawEye();
    watchView();const sv=opts.screens?.();if(sv&&sv.version!==painted)paint();
    if(connectionAttempted&&(!frame||Date.now()-lastAlive>6000)){frame?.remove();frame=undefined;body.hidden=false;notice.textContent='Read-only preview · Reconnecting…';recovery.waiting();}
    scheduleRetry();
  },1000);
  const modal=openModal(content,{onClose:()=>{closed=true;if(watching){watching=false;opts.watch?.(false);}recovery.close();clearTimeout(retryTimer);clearInterval(timer);window.removeEventListener('message',message);frame?.remove();}});
  render();
  if(opts.guest)return modal;
  void fetch('/api/cadre/web',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(config=>{
    if(closed||store.me.account?.role!=='admin'||!config?.available){if(config?.reason)notice.textContent=`Read-only preview. ${config.reason}`;return;}
    load();
  }).catch(()=>{notice.textContent='Read-only preview. Cadre Web could not be reached.';});
  return modal;
}
