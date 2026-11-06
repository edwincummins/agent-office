import type {Bounds} from '../nav.js';
import {isObj,num,MapError,str} from '../maps/check.js';
export interface CrewPoint {x:number;y:number;z:number;rotY:number}
export interface CrewOffset {x:number;y:number;z:number}
export interface CrewPlace extends CrewPoint {pose:'sit'|'stand';seatHeight:number;marker?:CrewOffset;tagLift?:number}
export interface CrewZone {id:string;places:CrewPlace[];gapBetweenTeams:boolean;marker:{kind:'post'|'tent';offset:CrewOffset}}
export interface CrewSlot {zones:CrewZone[];overflow:CrewPoint}
type Arrival={x:number;z:number;rotY:number};
/** The default orbit is 7m behind arrival; reserve its one-metre half-width corridor. */
export function arrivalClear(p:{x:number;z:number},spawn:Arrival):boolean {
 const dx=p.x-spawn.x,dz=p.z-spawn.z,along=-dx*Math.sin(spawn.rotY)-dz*Math.cos(spawn.rotY),side=dx*Math.cos(spawn.rotY)-dz*Math.sin(spawn.rotY);
 return Math.hypot(dx,dz)>=1.5 && !(along>=0&&along<=7&&Math.abs(side)<=1);
}
export function resolveCrew(raw:unknown,bounds:Bounds,height:number,spawn?:Arrival):CrewSlot {
 const fail=(path:string):never=>{throw new MapError('fixtures.crew.'+path);};
 const object=(v:unknown,path:string)=>isObj(v)?v:fail(path+' must be an object');
 const keys=(o:Record<string,unknown>,allowed:string[],path:string)=>{for(const key of Object.keys(o))if(!allowed.includes(key))fail(path+'.'+key+' is unknown');};
 const root=object(raw,'slot');keys(root,['zones','overflow'],'slot');
 if(!Array.isArray(root.zones)||!root.zones.length||root.zones.length>8)fail('zones needs 1-8 zones');
 const n=(v:unknown,path:string,min:number,max:number)=>num(v,'fixtures.crew.'+path,min,max);
 const offset=(v:unknown,path:string):CrewOffset=>{const o=object(v,path);keys(o,['x','y','z'],path);return {x:n(o.x,path+'.x',-5,5),y:n(o.y,path+'.y',0,5),z:n(o.z,path+'.z',-5,5)};};
 const point=(v:Record<string,unknown>,path:string):CrewPoint=>{
  const p={x:n(v.x,path+'.x',bounds.minX,bounds.maxX),y:n(v.y??0,path+'.y',0,height),z:n(v.z,path+'.z',bounds.minZ,bounds.maxZ),rotY:n(v.rotY??0,path+'.rotY',-Math.PI*2,Math.PI*2)};
  if(spawn&&!arrivalClear(p,spawn))fail(path+' blocks arrival or its camera corridor');return p;
 };
 let count=0;const ids=new Set<string>();
 const zones=(root.zones as unknown[]).map((value,i):CrewZone=>{
  const path='zones['+i+']',z=object(value,path),defaults=z.defaults===undefined?{}:object(z.defaults,path+'.defaults');
  keys(z,['id','defaults','places','gapBetweenTeams','marker'],path);keys(defaults,['rotY','pose','seatHeight','y','tagLift'],path+'.defaults');
  const id=str(z.id,'fixtures.crew.'+path+'.id',40);if(ids.has(id))fail(path+'.id must be unique');ids.add(id);
  if(!Array.isArray(z.places)||!z.places.length)fail(path+'.places must be nonempty');
  if(z.gapBetweenTeams!==undefined&&typeof z.gapBetweenTeams!=='boolean')fail(path+'.gapBetweenTeams must be boolean');
  const marker=object(z.marker,path+'.marker');keys(marker,['kind','offset'],path+'.marker');if(marker.kind!=='post'&&marker.kind!=='tent')fail(path+'.marker.kind must be post or tent');
  const places=(z.places as unknown[]).map((value,j):CrewPlace=>{
   const p=object(value,path+'.places['+j+']'),v={...defaults,...p},label=path+'.places['+j+']';
   keys(p,['x','y','z','rotY','pose','seatHeight','marker','tagLift'],label);
   if(v.pose!==undefined&&v.pose!=='sit'&&v.pose!=='stand')fail(label+'.pose must be sit or stand');
   const pose=v.pose==='sit'?'sit':'stand',seatHeight=n(v.seatHeight??0,label+'.seatHeight',pose==='sit'?.3:0,1.2);
   if(++count>64)fail('places exceeds 64');
   const at=point(v,label);if(pose==='sit'){point({...at,x:at.x-.35*Math.sin(at.rotY),z:at.z-.35*Math.cos(at.rotY)},label+'.standing');}if(at.y+seatHeight+1.7>height)fail(label+' exceeds room height');
   return {...at,pose,seatHeight,tagLift:n(v.tagLift??0,label+'.tagLift',0,1),marker:p.marker===undefined?undefined:offset(p.marker,label+'.marker')};
  });
  return {id,places,gapBetweenTeams:z.gapBetweenTeams===true,marker:{kind:marker.kind as 'post'|'tent',offset:offset(marker.offset,path+'.marker.offset')}};
 });
 const overflow=object(root.overflow,'overflow');keys(overflow,['x','y','z','rotY'],'overflow');
 return {zones,overflow:point(overflow,'overflow')};
}
