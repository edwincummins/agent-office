import type {CrewSlot,CrewPlace,CrewZone} from '../../../shared/fixtures/crew';
import type {FleetSeat,FleetSnapshot} from '../../../shared/protocol/fleet';
export interface CrewEntry {seat:FleetSeat;place:CrewPlace;zone:CrewZone;teamStart:boolean}
export const urgent=(s:FleetSeat)=>s.state==='needs-you'||s.state==='stuck';
export function placeCrew(feed:FleetSnapshot|null,slot:CrewSlot):{entries:CrewEntry[];overflow:number} {
 const seen=new Set<string>();const seats=(feed?.seats??[]).filter(s=>{if(s.state==='stopped'||seen.has(s.session))return false;seen.add(s.session);return true;});
 const positions=slot.zones.flatMap(zone=>zone.places.map(place=>({zone,place})));
 const fill=(gaps:boolean,limit:number)=>{
  const entries:CrewEntry[]=[];let cursor=0,previous='';
  for(const seat of seats){
   if(gaps&&previous&&previous!==seat.rig&&positions[cursor]?.zone.gapBetweenTeams)cursor++;
   if(cursor>=limit)break;
   const p=positions[cursor++];entries.push({...p,seat,teamStart:previous!==seat.rig||entries.at(-1)?.zone!==p.zone});previous=seat.rig;
  }
  return entries;
 };
 let entries=fill(true,positions.length);if(entries.length<seats.length)entries=fill(false,positions.length);
 if(entries.length<seats.length){
  entries=entries.filter(e=>Math.hypot(e.place.x-slot.overflow.x,e.place.z-slot.overflow.z)>.01);
  for(const seat of seats.filter(s=>urgent(s)&&!entries.some(e=>e.seat.session===s.session))){
   const index=lastIndex(entries,e=>e.seat.state==='idle');
   const fallback=index<0?lastIndex(entries,e=>!urgent(e.seat)):index;
   if(fallback>=0)entries[fallback]={...entries[fallback],seat};
  }
 }
 // Bring urgent seats into the hall by swapping with the last idle seat before the final zone.
 if(slot.zones.length>1){const last=slot.zones.at(-1)!;
  for(const e of entries.filter(e=>e.zone===last&&urgent(e.seat))){const other=[...entries].reverse().find(v=>v.zone!==last&&v.seat.state==='idle');if(other){const seat=other.seat;other.seat=e.seat;e.seat=seat;}}
 }
 entries.forEach((e,i)=>{e.teamStart=i===0||entries[i-1].seat.rig!==e.seat.rig||entries[i-1].zone!==e.zone;});
 return {entries,overflow:seats.length-entries.length};
}
export const SHIRTS=['#5b6b7f','#7a5c8e','#3f7f7a','#9a6b4f','#6f7a45','#3d4f7a'];
export const COLORS={working:'#3ecf8e','needs-you':'#e3a948',stuck:'#e2605f',waiting:'#7fb2ff',idle:'#8b8676',stopped:'#8b8676',unknown:'#8b8676'};
export function hash(value:string){let h=2166136261;for(const c of value)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function crewPose(e:CrewEntry){const p=e.place,stand=p.pose==='sit'&&e.seat.state==='needs-you';return {x:p.x-(stand?.35:0)*Math.sin(p.rotY),y:p.y,z:p.z-(stand?.35:0)*Math.cos(p.rotY),rotY:p.rotY,sit:p.pose==='sit'&&!stand,seatHeight:p.seatHeight};}

function lastIndex<T>(items:T[],test:(item:T)=>boolean){for(let i=items.length-1;i>=0;i--)if(test(items[i]))return i;return -1;}
