import type {Bounds} from '../nav.js';
import {MapError,isObj,num} from '../maps/check.js';
export const SLOT_KEYS=['tv','jukebox','arcade','lounge','mediaWall','gong'] as const;
export type SlotKind=typeof SLOT_KEYS[number];
export interface Slot {position:{x:number;y:number;z:number};size:{width:number;height:number;depth:number};rotY:number}
export interface MediaWall extends Slot {gap?:number;boardSide?:'left'|'right';panels?:{board:{width:number;mountDepth:number};tv:{width:number;mountDepth:number}}}
export type FixtureConfig=Partial<Record<Exclude<SlotKind,'mediaWall'>,Slot>> & {mediaWall?:MediaWall};
export interface ResolvedSlots extends FixtureConfig {services?:Slot}
export function resolveSlots(raw:unknown,bounds:Bounds,height:number):{slots:ResolvedSlots;slotWarnings:string[]}{
 const slots:ResolvedSlots={},slotWarnings:string[]=[];
 if(raw===undefined)return {slots,slotWarnings};
 if(!isObj(raw))throw new MapError('fixtures must be an object');
 for(const key of Object.keys(raw)){
  if(!SLOT_KEYS.includes(key as SlotKind))throw new MapError(`Unknown fixture slot ${key}`);
  const v=raw[key];if(!isObj(v)||!isObj(v.position)||!isObj(v.size))throw new MapError(`fixtures.${key} needs position and size`);
  const label=`fixtures.${key}`;
  const position={x:num(v.position.x,label+'.x',bounds.minX,bounds.maxX),y:num(v.position.y,label+'.y',0,height),z:num(v.position.z,label+'.z',bounds.minZ,bounds.maxZ)};
  const size={width:num(v.size.width,label+'.width',.05,60),height:num(v.size.height,label+'.height',.01,height),depth:num(v.size.depth,label+'.depth',.01,60)};
  const rotY=num(v.rotY??0,label+'.rotY',-Math.PI*2,Math.PI*2);
  const screen=key==='tv'||key==='mediaWall';
  if(screen?(position.y-size.height/2<0||position.y+size.height/2>height):position.y+size.height>height)throw new MapError(label+' exceeds room height');
  const hx=(Math.abs(Math.cos(rotY))*size.width+Math.abs(Math.sin(rotY))*size.depth)/2,hz=(Math.abs(Math.sin(rotY))*size.width+Math.abs(Math.cos(rotY))*size.depth)/2;
  if(position.x-hx<bounds.minX||position.x+hx>bounds.maxX||position.z-hz<bounds.minZ||position.z+hz>bounds.maxZ)throw new MapError(label+' extends outside room');
  slots[key as SlotKind]={position,size,rotY};
  if(key==='mediaWall'){
   const gap=num(v.gap??.2,label+'.gap',0,size.width-.1);
   if(v.boardSide!==undefined&&!['left','right'].includes(String(v.boardSide)))throw new MapError(label+'.boardSide must be left or right');
   const media=slots.mediaWall!;media.gap=gap;media.boardSide=v.boardSide==='right'?'right':'left';
   if(v.panels!==undefined){
    if(!isObj(v.panels)||!isObj(v.panels.board)||!isObj(v.panels.tv))throw new MapError(label+'.panels needs board and tv');
    const panel=(p:Record<string,unknown>)=>({width:num(p.width,label+'.panel.width',.05,size.width),mountDepth:num(p.mountDepth??0,label+'.panel.mountDepth',-size.depth/2,size.depth/2)});
    media.panels={board:panel(v.panels.board),tv:panel(v.panels.tv)};
    if(Math.abs(media.panels.board.width+media.panels.tv.width+gap-size.width)>1e-6)throw new MapError(label+' panel widths plus gap must equal width');
   }
  }
 }
 const wall=slots.mediaWall;
 if(wall){
  if(slots.tv)slotWarnings.push('mediaWall-overrides-tv');
  const gap=wall.gap!,half=(wall.size.width-gap)/2;
  const panel=(kind:'board'|'tv'):Slot=>{
   const info=wall.panels?.[kind]??{width:half,mountDepth:0};
   const left=(kind==='board')===(wall.boardSide==='left'),x=(left?-1:1)*(wall.size.width-info.width)/2;
   return {position:{x:wall.position.x+Math.cos(wall.rotY)*x+Math.sin(wall.rotY)*info.mountDepth,y:wall.position.y,z:wall.position.z-Math.sin(wall.rotY)*x+Math.cos(wall.rotY)*info.mountDepth},size:{width:info.width,height:wall.size.height,depth:wall.size.depth},rotY:wall.rotY};
  };
  slots.services=panel('board');slots.tv=panel('tv');
 }
 return {slots,slotWarnings};
}
