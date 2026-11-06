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
  screens?:()=>{map:Map<string,FleetScreen>;version:number;resets:number}; watch?:(on:boolean)=>void }
export function openFleet(snapshot:()=>FleetSnapshot|null,services:()=>void,opts:FleetPanelOptions={guest:false,guests:()=>null,setGuests:()=>{}}) {
  const notice=h('p.cadre-notice',{hidden:true},opts.guest?'Watching Cadre, read-only.':'Read-only preview. Live Cadre is not connected yet (Cadre Web).');
  // The owner's privacy eye (Fetty, 11-06): a dropdown right under its button, one click per switch, applied at once
  // to everyone watching (the office filters guests on his PC).
  const eyeBar=h('div.cadre-eye',{hidden:true,role:'menu'});
  const drawEye=()=>{
    const s=opts.guests();if(!s){eyeBar.replaceChildren(h('div.cadre-eye-head',{},'Loading…'));return;}
    const row=(label:string,on:boolean,next:()=>FleetGuestSettings)=>h('button.cadre-eye-row',{class:on?'on':'off',role:'menuitemcheckbox','aria-checked':String(on),onclick:(e:Event)=>{e.stopPropagation();opts.setGuests(next());}},
      h('span.cadre-eye-name',{},label),h('span.cadre-eye-state',{},on?'SHOWN':'HIDDEN'));
    const teams=[...new Set([...(snapshot()?.teams??[]),...Object.keys(s.teams)])].sort();
    eyeBar.replaceChildren(h('div.cadre-eye-head',{},'Watchers see'),
      row('Terminals',s.terminals,()=>({...s,terminals:!s.terminals})),
      row('Gold cards',s.cards,()=>({...s,cards:!s.cards})),
      h('div.cadre-eye-head',{},'Teams guests can watch'),
      ...teams.map(t=>row(t,s.teams[t]===true,()=>({...s,teams:{...s.teams,[t]:s.teams[t]!==true}}))));
  };
  const eye=h('button.cadre-eye-toggle',{title:'What watchers can see','aria-haspopup':'menu',onclick:(e:Event)=>{e.stopPropagation();eyeBar.hidden=!eyeBar.hidden;drawEye();}},'👁 Guests ▾');
  const eyeWrap=h('div.cadre-eye-wrap',{},eye,eyeBar);
  // A click anywhere else closes the dropdown.
  const closeEye=(e:Event)=>{if(!eyeWrap.contains(e.target as Node))eyeBar.hidden=true;};
  document.addEventListener('pointerdown',closeEye,true);
  const rows=h('div');
  const body=h('div.cadre-body',{},notice,rows);
  const content=h('div.modal.cadre-panel',{role:'dialog','aria-label':'Cadre'},
    h('header',{},h('h2',{},h('span.cw-logo',{}),'Cadre'),h('div.cw-tabs',{},h('span.on',{},'Team')),...(opts.guest?[]:[eyeWrap]),h('div.cadre-modes',{},h('button',{onclick:()=>{modal.close();services();}},'Services'),h('span.selected',{},'Cadre'))),body);
  let closed=false,connectionAttempted=false,key='',frame:HTMLIFrameElement|undefined,lastAlive=0;
  // Colour terminals in the watch view: asked for only while it is what's showing (not behind the live panel).
  let painted=-1,watching=false,shownSince=0;
  const paint=()=>{
    const s=opts.screens?.();if(!s)return;
    for(const pre of rows.querySelectorAll<HTMLElement>('.cadre-tail')){
      const sc=s.map.get(pre.dataset.seat??'');if(!sc)continue;
      paintScreen(pre,sc);pre.scrollTop=pre.scrollHeight;
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
  // The watch view looks like Cadre (Fetty chose a read-only lookalike, 11-06): its rail with teams and seats, the team
  // header, the gold "your call" bar and seat tiles with colour terminals. Nothing in it sends, approves or changes.
  let sel='';
  const dot=(st:string)=>h('i.cw-dot',{style:`background:${fleetColors[st as keyof typeof fleetColors]??'#728578'}`});
  const label:Record<string,string>={working:'Working',idle:'Idle','needs-you':'Needs you',stuck:'Stuck',waiting:'Waiting',stopped:'Stopped',unknown:'Unknown'};
  const render=()=>{
    // The eye shapes his own watch view too (Fetty, 11-06), and any change redraws at once.
    const eyeNow=opts.guest?null:opts.guests(),showTerms=eyeNow?.terminals!==false,showCards=eyeNow?.cards!==false;
    const state=snapshot(),next=JSON.stringify([state,showTerms,showCards,sel,opts.screens?.().resets??0]);if(next===key)return;key=next;painted=-1;
    rows.replaceChildren();
    if(!state){rows.append(h('p.cw-empty',{},'Cadre feed is off.'));return;}
    if(!state.teams.length){rows.append(h('p.cw-empty',{},'No teams to watch yet.'));return;}
    if(!state.teams.includes(sel))sel=state.teams[0];
    const seatsOf=(t:string)=>state.seats.filter(x=>x.rig===t);
    const rail=h('nav.cw-rail',{},h('div.cw-rail-head',{},'TEAMS'),h('div.cw-machine',{},'PC · Windows'),
      ...state.teams.map(t=>{const ss=seatsOf(t),busy=ss.filter(x=>x.state==='working').length;
        return h('div.cw-team',{},
          h('button.cw-team-row',{class:t===sel?'on':'',onclick:()=>{sel=t;render();}},h('span',{},(t===sel?'▾ ':'▸ ')+t),h('span.cw-count',{},`${busy}/${ss.length}`)),
          ...(t===sel?ss.map(x=>h('div.cw-seat',{},dot(x.state),h('span',{},x.name))):[]));}));
    const team=seatsOf(sel),needs=showCards?state.needs.filter(n=>n.rig===sel):[];
    const head=h('div.cw-head',{},h('span.cw-title',{},sel),h('span.cw-chip',{},'PC · Windows'),h('span.cw-chip',{},`${team.length} seats`),
      ...(needs.length?[h('span.cw-chip.gold',{},`◆ ${needs.length} waiting on Fetty`)]:[]),h('span.cw-chip.ro',{},'👁 Watching · read-only'),
      ...(state.status==='stale'?[h('span.cw-chip.warn',{},'feed paused')]:[]));
    const bars=needs.map(n=>h('div.cw-call',{},h('b',{},'◆ Your call · '),n.summary));
    const grid=h('div.cw-grid',{style:`grid-template-columns:repeat(${team.length>1?2:1},minmax(0,1fr))`},
      ...team.map(x=>h('section.cw-tile',{class:x.state==='working'?'working':''},
        h('div.cw-th',{},h('span.cw-av',{},x.name.slice(0,1).toUpperCase()),h('span.cw-nm',{},x.name),h('span.cw-act',{},x.activity||x.reason||''),h('span.cw-st',{},dot(x.state),label[x.state]??x.state)),
        h(showTerms?'pre.cadre-tail':'pre.cadre-tail.cadre-hidden',{'data-seat':showTerms?x.session:'',style:x.state==='stopped'?'opacity:.4':''},!showTerms?'🙈 Terminal hidden (privacy eye)':x.tail?.length?x.tail.join('\n'):'no output yet'))));
    rows.append(h('div.cw',{},rail,h('div.cw-main',{},head,...bars,grid)));
    for(const pre of rows.querySelectorAll<HTMLElement>('.cadre-tail'))pre.scrollTop=pre.scrollHeight;
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
  const modal=openModal(content,{onClose:()=>{closed=true;document.removeEventListener('pointerdown',closeEye,true);if(watching){watching=false;opts.watch?.(false);}recovery.close();clearTimeout(retryTimer);clearInterval(timer);window.removeEventListener('message',message);frame?.remove();}});
  render();
  if(opts.guest)return modal;
  void fetch('/api/cadre/web',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(config=>{
    if(closed||store.me.account?.role!=='admin'||!config?.available){if(config?.reason)notice.textContent=`Read-only preview. ${config.reason}`;return;}
    load();
  }).catch(()=>{notice.textContent='Read-only preview. Cadre Web could not be reached.';});
  return modal;
}
