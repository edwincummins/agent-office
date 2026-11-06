import { mapChoices } from '../../../shared/maps';
import { ROOF, ROOF_NAME } from '../../../shared/rooftop';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { blockerAt, groundAt } from '../../player/collide';
import { store } from '../../state';
import { closeAllModals, toast, type Modal } from '../../ui/dom';
import { closeFloorMenu } from '../../ui/floormenu';
import { GARAGE } from '../../ui/elevator';
import { arrivalSupported, atPlace, namedPlaces, nearbyArrival, type NamedPlace } from './destinations';
import { openTravel, type TravelRow, type TravelSection } from './ui';

export function installTravelMenu(ctx:Ctx,parts:Pick<Parts,'travel'|'place'|'walking'>) {
  let modal:Modal|null=null;
  const places=()=>namedPlaces(ctx.plan(),store.me.owner===true);
  function visit(place:NamedPlace){
    if(ctx.trip()||ctx.upTop()||!store.floor)return;
    const fresh=places().find(p=>p.id===place.id);
    if(!fresh||(fresh.owner&&store.me.owner!==true))return;
    if(ctx.player.rig){toast('Finish your ride before travelling.','warn');return;}
    const b=ctx.plan().bounds;
    const at=nearbyArrival(fresh.at,p=>arrivalSupported(b,p,groundAt(ctx.player.colliders,p.x,p.z,p.y+.1))
      &&!blockerAt(ctx.player,p.x,p.z,p.y)
      &&![...store.peers.values()].some(peer=>peer.id!==store.you&&!peer.lite&&store.onMyFloor(peer)&&Math.abs(peer.y-p.y)<1.7&&Math.hypot(peer.x-p.x,peer.z-p.z)<.7));
    if(!at){toast('That arrival is blocked. Walk there or try again.','warn');return;}
    closeAllModals();closeFloorMenu();ctx.activities.stopAll('trip');parts.walking.stopWalkingTo();
    parts.place.placeAt(at);ctx.player.clearKeys();parts.place.saveSpot();
  }
  function home(){
    const place=places().find(p=>p.id==='home');
    if(!place){toast('This map has no Home arrival available for you. Map changes affect everyone; use Settings.');return;}
    visit(place);
  }
  function open(){
    if(modal){modal.close();return;}
    if(ctx.trip())return;
    closeAllModals();closeFloorMenu();
    const named=places();
    const namedRow=(p:NamedPlace):TravelRow=>({id:p.id,name:p.id==='home'?'Home':p.name,icon:p.icon??'📍',sub:p.id==='home'?p.name+' · '+p.description:p.description??'Standing arrival',disabled:!store.floor||ctx.upTop()||(p.owner&&store.me.owner!==true),here:!ctx.upTop()&&atPlace(ctx.player.pos,p.at),go:()=>visit(p)});
    const homeRow=named.find(p=>p.id==='home');
    const sections:TravelSection[]=[{name:'Home',rows:[homeRow?namedRow(homeRow):{id:'home',name:'Home',icon:'🏠',sub:ctx.plan().name+' · No Home arrival available',disabled:true,go:home}]}];
    for(const p of named.filter(p=>p.id!=='home')){
      const group=p.group?ctx.plan().name+' · '+p.group:ctx.plan().name;
      let section=sections.find(s=>s.name===group);if(!section){section={name:group,rows:[]};sections.push(section);}section.rows.push(namedRow(p));
    }
    const building:TravelRow[]=[];
    if(ctx.inOffice())building.push({id:'roof',name:ROOF_NAME,icon:'🍸',sub:'Rooftop bar',here:ctx.upTop(),disabled:!store.floors.length,go:()=>parts.travel.ride(ROOF)});
    building.push(...store.floors.map((f,i):TravelRow=>({id:f.id,name:f.name,icon:String(i+1),sub:f.cloning?'Still being cloned':'Project floor',stats:'🙋 '+f.waiting+' · 👷 '+f.busy+' · 💻 '+f.workers,here:f.id===store.floor&&!parts.place.downstairs(),disabled:f.cloning,go:()=>parts.place.downstairs()?parts.travel.ride(f.id):parts.travel.switchFloor(f.id)})).reverse());
    if(ctx.inOffice())building.push({id:'garage',name:'Garage',icon:'🚗',sub:'Cars and the way out',here:parts.place.downstairs(),disabled:!store.floors.length,go:()=>parts.travel.ride(GARAGE)});
    sections.push({name:'This building',rows:building},{name:'Other places',rows:mapChoices(store.map.custom).filter(m=>m.id!==ctx.plan().id).map(m=>({id:m.id,name:m.name,icon:m.icon,sub:'Changes the office for everyone · Settings',disabled:true,go:()=>{}}))});
    modal=openTravel(sections,()=>{modal=null;});
  }
  ctx.hud.add({id:'travel',icon:'🧭',label:'Travel',key:'J',section:'Open',status:()=>true,dock:'before-workers',run:open});
  ctx.keys.bind({code:'KeyJ',run:e=>{e.preventDefault();open();return true;}});
  ctx.keys.bind({code:'Home',when:()=>!!ctx.plan().travel,run:e=>{e.preventDefault();if(!e.repeat)home();return true;}});
  for(const topic of ['map','floor'] as const)store.on(topic,()=>modal?.close());
}
