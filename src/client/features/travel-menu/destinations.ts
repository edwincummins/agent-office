import type { MapPlan, Spot } from '../../../shared/maps';
import type { TravelPlace } from '../../../shared/travel/config';

export interface NamedPlace extends TravelPlace { owner?:boolean }
export function namedPlaces(plan:MapPlan,owner=false):NamedPlace[] {
  const travel=plan.travel;if(!travel)return [];
  const home=owner?travel.home??travel.visitorHome:travel.visitorHome;
  return [
    ...(home?[{id:'home',name:plan.name,icon:'🏠',at:home,owner:owner&&!!travel.home,description:owner?'Home key · standing arrival':'arrival'}]:[]),
    ...(travel.places??[]),
  ];
}
export function atPlace(position:{x:number;y:number;z:number},at:Spot):boolean {
  return Math.abs(position.y-at.y)<.3&&Math.hypot(position.x-at.x,position.z-at.z)<.65;
}
/** Closest rings, bounded to a 1.5 m recovery radius. */
export function nearbyArrival(at:Spot,free:(at:Spot)=>boolean):Spot|undefined {
  if(free(at))return at;
  for(const radius of [.3,.6,.9,1.2,1.5])for(let i=0;i<16;i++){
    const candidate={...at,x:at.x+Math.sin(i*Math.PI/8)*radius,z:at.z+Math.cos(i*Math.PI/8)*radius};
    if(free(candidate))return candidate;
  }
}
