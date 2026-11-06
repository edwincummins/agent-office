import { isObj, MapError, num } from '../maps/check.js';
import type { MapPlan, Spot } from '../maps/types.js';

export interface TravelPlace { id:string; name:string; at:Spot; icon?:string; group?:string; description?:string }
/** Home is a standing arrival for the owner; visitorHome is an optional separate public arrival. */
export interface TravelConfig { home?:Spot; visitorHome?:Spot; places?:TravelPlace[] }
declare module '../maps/types.js' {
  interface MapConfig { travel?:TravelConfig }
  interface MapPlan { travel?:TravelConfig }
}
function keys(raw:Record<string,unknown>,allowed:string[],label:string) {
  for(const k of Object.keys(raw))if(!allowed.includes(k))throw new MapError(`${label}.${k} is not supported`);
}
function text(raw:unknown,label:string,max:number):string {
  if(typeof raw!=='string'||!raw.trim()||raw.length>max||/[\p{C}]/u.test(raw))throw new MapError(`${label} must be 1 to ${max} characters without controls`);
  return raw.trim();
}
export function checkTravel(raw:unknown,plan:Pick<MapPlan,'bounds'|'height'|'levels'>):TravelConfig|undefined {
  if(raw===undefined)return;
  if(!isObj(raw))throw new MapError('travel must be an object');
  keys(raw,['home','visitorHome','places'],'travel');
  const spot=(value:unknown,label:string):Spot=>{
    if(!isObj(value))throw new MapError(`${label} must be a standing arrival`);
    keys(value,['x','y','z','rotY'],label);
    const b=plan.bounds;
    const at={x:num(value.x,`${label}.x`,b.minX+.32,b.maxX-.32),y:num(value.y,`${label}.y`,0,plan.height-1.7),z:num(value.z,`${label}.z`,b.minZ+.32,b.maxZ-.32),rotY:num(value.rotY,`${label}.rotY`,-Math.PI*2,Math.PI*2)};
    const supported=at.y===0||plan.levels?.floors.some(f=>Math.abs(f.y-at.y)<.01&&at.x>=f.minX+.32&&at.x<=f.maxX-.32&&at.z>=f.minZ+.32&&at.z<=f.maxZ-.32);
    if(!supported)throw new MapError(`${label} must land on the ground or a declared level`);
    return at;
  };
  const result:TravelConfig={};
  if(raw.home!==undefined)result.home=spot(raw.home,'travel.home');
  if(raw.visitorHome!==undefined)result.visitorHome=spot(raw.visitorHome,'travel.visitorHome');
  if(raw.places!==undefined){
    if(!Array.isArray(raw.places)||raw.places.length>32)throw new MapError('travel.places must be a list of at most 32 places');
    const ids=new Set(['home','roof','garage']);
    result.places=raw.places.map((p,i)=>{
      const label=`travel.places[${i}]`;
      if(!isObj(p))throw new MapError(`${label} must be an object`);
      keys(p,['id','name','icon','group','description','at'],label);
      const id=text(p.id,`${label}.id`,40);
      if(!/^[a-z][a-z0-9-]*$/.test(id)||ids.has(id))throw new MapError(`${label}.id must be unique, lowercase, and not reserved`);
      ids.add(id);
      return {id,name:text(p.name,`${label}.name`,60),at:spot(p.at,`${label}.at`),...(p.icon===undefined?{}:{icon:text(p.icon,`${label}.icon`,8)}),...(p.group===undefined?{}:{group:text(p.group,`${label}.group`,60)}),...(p.description===undefined?{}:{description:text(p.description,`${label}.description`,160)})};
    });
  }
  return result;
}
/** Called after level validation; absent travel preserves the original config exactly. */
export function attachTravel(plan:MapPlan):MapPlan {
  const travel=checkTravel(plan.config?.travel,plan);
  if(travel!==undefined){plan.travel=travel;plan.config={...plan.config!,travel};}
  return plan;
}
