import './panel.css';
import type { FleetSnapshot } from '../../../shared/protocol/fleet';
import { h,openModal } from '../../ui/dom';
import { store } from '../../state';
import { fleetColors } from './draw';

/** The fallback is a data viewer. Interactive work remains in the separately hosted Cadre app. */
export function openFleet(snapshot:()=>FleetSnapshot|null,services:()=>void) {
  const notice=h('p.cadre-notice',{},'Read-only preview. Live Cadre is not connected yet (Cadre Web).');
  const rows=h('div');
  const body=h('div.cadre-body',{},notice,rows);
  const content=h('div.modal.cadre-panel',{role:'dialog','aria-label':'Cadre'},
    h('header',{},h('h2',{},'Cadre'),h('div.cadre-modes',{},h('button',{onclick:()=>{modal.close();services();}},'Services'),h('span.selected',{},'Cadre'))),body);
  let closed=false,key='',frame:HTMLIFrameElement|undefined,lastAlive=0;
  const render=()=>{
    const state=snapshot(),next=JSON.stringify(state);if(next===key)return;key=next;rows.replaceChildren();
    if(!state){rows.append(h('p',{},'Cadre feed is off. Set cadre.fleetCommand'));return;}
    if(state.status==='stale')rows.append(h('p.cadre-notice',{},'Feed unavailable — showing the last received snapshot.'));
    if(!state.teams.length)rows.append(h('p',{},'No teams or seats yet.'));
    for(const need of state.needs)rows.append(h('p.cadre-gate',{},`${need.rig} · ${need.summary}`));
    const grid=h('div.cadre-grid');rows.append(grid);
    for(const team of state.teams){
      const seats=state.seats.filter(s=>s.rig===team);
      const status=(['needs-you','stuck','waiting','working','idle','stopped'] as const).find(s=>seats.some(seat=>seat.state===s))??'idle';
      const tile=h('section.cadre-team',{style:`border-color:${fleetColors[status]}`},h('h3',{},team,h('small',{style:`color:${fleetColors[status]}`},status.replace('-',' '))));
      for(const seat of state.seats.filter(s=>s.rig===team))tile.append(h('details.cadre-seat',{},
        h('summary',{},h('span',{style:`color:${seat.state==='stopped'?'#8b8676':fleetColors[seat.state]}`},`${seat.name} · ${seat.state.replace('-',' ')}`)),
        ...(seat.reason?[h('p',{},`${seat.state==='waiting'?'Waiting ':''}${seat.reason}${seat.since!==undefined?` · seen ${seat.state} since ${new Date(seat.since).toLocaleString()}`:''}`)]:[]),h('p',{},seat.activity||'No activity reported')));
      grid.append(tile);
    }
  };
  const message=(event:MessageEvent)=>{
    if(!frame||store.me.account?.role!=='admin'||event.source!==frame.contentWindow||event.origin!==location.origin)return;
    if(event.data?.type==='cadre.web.connected'||event.data?.type==='cadre.web.heartbeat'){
      lastAlive=Date.now();frame.hidden=false;body.hidden=true;
    }
    if(event.data?.type==='cadre.web.close')modal.close();
  };
  window.addEventListener('message',message);
  const timer=setInterval(()=>{
    if(store.me.account?.role!=='admin'){modal.close();return;}
    render();
    if(frame&&Date.now()-lastAlive>6000){frame.hidden=true;body.hidden=false;notice.textContent='Read-only preview. Live Cadre is unavailable or has not completed its connection handshake.';}
  },1000);
  const modal=openModal(content,{onClose:()=>{closed=true;clearInterval(timer);window.removeEventListener('message',message);frame?.remove();}});
  render();
  void fetch('/api/cadre/web',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(config=>{
    if(closed||store.me.account?.role!=='admin'||!config?.available){if(config?.reason)notice.textContent=`Read-only preview. ${config.reason}`;return;}
    frame=h('iframe',{title:'Cadre connection',src:'/api/cadre/embed',sandbox:'allow-scripts allow-same-origin allow-forms',referrerpolicy:'no-referrer',hidden:true});
    content.append(frame);
  }).catch(()=>{notice.textContent='Read-only preview. Cadre Web could not be reached.';});
  return modal;
}
