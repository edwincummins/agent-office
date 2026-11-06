import * as T from 'three';
import type {Ctx} from '../../core/context';
import {store} from '../../state';
import {hintTitle,key} from '../../core/hint';
import type {FleetSnapshot} from '../../../shared/protocol/fleet';
import {resolveCrew,type CrewSlot} from '../../../shared/fixtures/crew';
import {CrewBodies} from './body';
import {CrewLabels} from './labels';
import {CrewPick} from './pick';
import {placeCrew,type CrewEntry} from './layout';
import {crewCard} from './panel';
import type {Modal} from '../../ui/dom';
import './style.css';
declare module '../../world/types' {interface InteractKinds {crew:true} interface Interactable {crewId?:string}}
/** Reuses the owner-authorized fleet stream; no second poller, worker or server data path. */
export function installCrew(ctx:Ctx){
 let feed:FleetSnapshot|null=null,allowed=false,request=0,scope:unknown,slot:CrewSlot|undefined,panel:Modal|undefined,signature='',now=0;
 let previous:CrewEntry[]=[];
 let bodies:CrewBodies|undefined,labels:CrewLabels|undefined;
 const root=new T.Group();root.name='cadre-crew';root.visible=false;ctx.scene.add(root);
 const pick=new CrewPick();
 const clear=(preserve=false)=>{if(!preserve)feed=null;previous=[];signature='';root.visible=false;root.userData.places=[];root.userData.count=0;root.userData.overflow=0;pick.visible=false;pick.sync([]);panel?.close();bodies?.dispose();labels?.dispose();root.clear();bodies=undefined;labels=undefined;};
 const sync=()=>{
  if(!allowed||!slot||!feed){clear(allowed);return;}
  const value=JSON.stringify([slot,feed.seats.map(({tail,...seat})=>seat)]);if(value===signature)return;signature=value;
  const {entries,overflow}=placeCrew(feed,slot,previous);previous=entries;
  if(!entries.length){clear(true);return;}
  if(!bodies){bodies=new CrewBodies(ctx.renderer.extensions.has('WEBGL_multi_draw'));labels=new CrewLabels(ctx.renderer);root.add(bodies.mesh,labels.tags.mesh,labels.signs.mesh,labels.shadows);}
  bodies.sync(entries,now);labels!.sync(entries,slot,overflow,ctx.plan().bounds);pick.sync(entries);root.visible=true;root.userData.places=entries.map(e=>({session:e.seat.session,state:e.seat.state,...e.place}));root.userData.count=entries.length;root.userData.overflow=overflow;
 };
 const permission=()=>{const attempt=++request;allowed=false;clear();if(store.me.account?.role!=='admin')return;
  void fetch('/api/cadre/web',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(value=>{if(attempt!==request)return;allowed=value?.allowed===true;if(allowed){ctx.net.send({t:'fleet.subscribe'});sync();}}).catch(()=>{});
 };
 ctx.messages.on('welcome',permission);store.on('me',permission);ctx.net.onStatus(up=>{if(!up){++request;allowed=false;clear();}});
 ctx.messages.on('fleet',m=>{if(m.guest){++request;allowed=false;clear();}else if(m.state===null){clear();}else{feed=m.state;if(allowed)sync();}});
 ctx.usables.add({allMaps:true,usable:()=>root.visible?pick.items:[],pickable:()=>pick});
 ctx.interactions.define('crew',{reach:2.5,hint:it=>({k:'crew:'+it.crewId,parts:[hintTitle(it.label??'Crew'),key('E','View')]}),use:(it,k)=>{if(k!=='E'||!allowed||!root.visible)return;const seat=feed?.seats.find(s=>s.session===it.crewId);if(!seat)return;panel?.close();panel=crewCard(seat,()=>{});}});
 ctx.ticks.add('others',f=>{
  now=f.t;const plan=ctx.plan();if(scope!==plan){scope=plan;signature='';previous=[];panel?.close();slot=undefined;
   if(plan.slots.crew)try{slot=resolveCrew(plan.slots.crew,plan.bounds,plan.height,plan.spawn);}catch(error){console.warn(String(error));}
   if(!slot){const saved=feed;clear();feed=saved;}else sync();
  }
  root.visible=!!(allowed&&slot&&feed&&!ctx.upTop()&&ctx.player.pos.y>-2);
  pick.visible=root.visible;
  if(root.visible){bodies?.tick(now,ctx.reduceMotion.matches);labels?.tick(ctx.camera,now,ctx.reduceMotion.matches,ctx.renderer.domElement.clientHeight);}
 });
}
