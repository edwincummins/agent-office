import { mapChoices } from '../../../shared/maps';
import { ROOF, ROOF_NAME } from '../../../shared/rooftop';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { blockerAt } from '../../player/collide';
import { store } from '../../state';
import { closeAllModals, toast, type Modal } from '../../ui/dom';
import { closeFloorMenu } from '../../ui/floormenu';
import { GARAGE } from '../../ui/elevator';
import { atPlace, namedPlaces, type NamedPlace } from './destinations';
import { openTravel, type TravelRow } from './ui';

export function installTravelMenu(ctx:Ctx, parts:Pick<Parts,'travel'|'place'|'walking'>) {
  let modal:Modal|null=null;
  function visit(place:NamedPlace){
    if(ctx.trip()||ctx.upTop()||!store.floor)return;
    const fresh=namedPlaces(ctx.plan()).find(p=>p.id===place.id);
    if(!fresh||(fresh.owner&&store.me.owner!==true))return;
    if(ctx.player.rig||blockerAt(ctx.player,fresh.at.x,fresh.at.z,fresh.at.y)){toast('That arrival is blocked. Finish your ride or walk there.','warn');return;}
    closeAllModals();closeFloorMenu();ctx.activities.stopAll('trip');parts.walking.stopWalkingTo();
    parts.place.placeAt(fresh.at);ctx.player.clearKeys();parts.place.saveSpot();
  }
  function home(){
    const place=namedPlaces(ctx.plan()).find(p=>p.id==='home');
    if(!place){toast('Home is in Hustle Labs HQ. Changing maps affects everyone; use Settings.');return;}
    if(store.me.owner!==true){toast('Hustle Labs Home is the owner’s workspace.');return;}
    visit(place);
  }
  function open(){
    if(modal){modal.close();return;}
    if(ctx.trip())return;
    closeAllModals();closeFloorMenu();
    const named=namedPlaces(ctx.plan());
    const namedRow=(p:NamedPlace):TravelRow=>({id:p.id,name:p.id==='home'?'Home':p.name,icon:p.icon,sub:p.id==='home'?`${p.name} · Home key · standing arrival`:'Lift lobby',disabled:!store.floor||ctx.upTop()||(p.owner&&store.me.owner!==true),here:!ctx.upTop()&&atPlace(ctx.player.pos,p.at),go:()=>visit(p)});
    const homeRow=named.find(p=>p.id==='home');
    const building:TravelRow[]=[];
    if(ctx.inOffice())building.push({id:'roof',name:ROOF_NAME,icon:'🍸',sub:'Rooftop bar',here:ctx.upTop(),disabled:!store.floors.length,go:()=>parts.travel.ride(ROOF)});
    building.push(...named.filter(p=>p.id!=='home').reverse().map(namedRow));
    building.push(...store.floors.map((f,i):TravelRow=>({id:f.id,name:f.name,icon:String(i+1),sub:f.cloning?'Still being cloned':'Project floor',stats:`🙋 ${f.waiting} · 👷 ${f.busy} · 💻 ${f.workers}`,here:f.id===store.floor&&!parts.place.downstairs(),disabled:f.cloning,go:()=>parts.place.downstairs()?parts.travel.ride(f.id):parts.travel.switchFloor(f.id)})).reverse());
    if(ctx.inOffice())building.push({id:'garage',name:'Garage',icon:'🚗',sub:'Cars and the way out',here:parts.place.downstairs(),disabled:!store.floors.length,go:()=>parts.travel.ride(GARAGE)});
    modal=openTravel([
      {name:'Home',rows:[homeRow?namedRow(homeRow):{id:'home',name:'Home',icon:'🏠',sub:'Hustle Labs HQ · Changes the office for everyone · Settings',disabled:true,go:home}]},
      {name:'This building',rows:building},
      {name:'Other places',rows:mapChoices(store.map.custom).filter(m=>m.id!==ctx.plan().id).map(m=>({id:m.id,name:m.name,icon:m.icon,sub:'Changes the office for everyone · Settings',disabled:true,go:()=>{}}))},
    ],()=>{modal=null;});
  }
  ctx.hud.add({id:'travel',icon:'🧭',label:'Travel',key:'J',section:'Open',status:()=>true,dock:'before-workers',run:open});
  ctx.keys.bind({code:'KeyJ',run:e=>{e.preventDefault();open();return true;}});
  ctx.keys.bind({code:'Home',run:e=>{e.preventDefault();if(!e.repeat)home();return true;}});
  for(const topic of ['map','floor'] as const)store.on(topic,()=>modal?.close());
}
