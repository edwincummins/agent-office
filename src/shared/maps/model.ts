import type { Bounds } from '../nav.js';
import type { BoardPlace, Place } from './types.js';
import type { StationKind } from '../layout.js';
import { isObj, num, MapError } from './check.js';

const MODEL_STATIONS: readonly StationKind[] = ['issues','pulls','queue'];

export interface ModelChair extends Required<Place> {
  y:number;
  chairType?: 'task'|'executive'|'guest'|'conference'|'lounge'|'sofaSeat'|'pouf'|'barStool';
  /** A model-authored seat point relative to this chair. Omitted maps retain the legacy 0.85 m approach. */
  sit?: {forward:number;y:number};
}
export interface ModelMapData {
  source?: {chairs:ModelChair[];council:ModelChair[];meetingBoard:BoardPlace;stations?:StationKind[];stationChairs?:Partial<Record<StationKind,ModelChair>>};
  stationLabelOffsets?: Partial<Record<StationKind,number>>;
  asset: string;
  seats: Required<Place>[];
  walls: { minX: number; maxX: number; minZ: number; maxZ: number; top: number; bottom?: number }[];
  platforms?: ModelMapData['walls'];
  labels?: (Required<Place> & {text:string})[];
  lounges?: (Required<Place> & {rugLength:number})[];
  screen: BoardPlace | null;
  whiteboard: BoardPlace;
}

export function checkModel(value: unknown, bounds: Bounds, height: number, seatHeights: readonly number[] = []): ModelMapData {
  if (!isObj(value)) throw new MapError('model needs an asset, 32 seats, walls, screen and whiteboard');
  if (typeof value.asset !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}\.glb$/.test(value.asset)) throw new MapError('model.asset must be a local filename like room.glb');
  const point = (v: unknown, label: string): Required<Place> => {
    if (!isObj(v)) throw new MapError(`${label} must be a position`);
    return { x: num(v.x, `${label}.x`, bounds.minX + .2, bounds.maxX - .2), z: num(v.z, `${label}.z`, bounds.minZ + .2, bounds.maxZ - .2), rotY: num(v.rotY ?? 0, `${label}.rotY`) };
  };
  if (!Array.isArray(value.seats) || value.seats.length !== 32) throw new MapError('model.seats must contain exactly 20 desks then 12 soft seats');
  const seats = value.seats.map((s, i) => point(s, `model.seats[${i}]`));
  if (new Set(seats.map(s => `${s.x},${s.z}`)).size !== 32) throw new MapError('model seats must have distinct positions');
  if (!Array.isArray(value.walls) || value.walls.length > 300) throw new MapError('model.walls must be a list of at most 300 collision rectangles');
  const rectangles = (items: unknown[], label:string) => items.map((w, i) => {
    if (!isObj(w)) throw new MapError(`${label}[${i}] must be a rectangle`);
    const minX = num(w.minX, 'wall.minX', bounds.minX, bounds.maxX);
    const maxX = num(w.maxX, 'wall.maxX', minX + .001, bounds.maxX);
    const minZ = num(w.minZ, 'wall.minZ', bounds.minZ, bounds.maxZ);
    const maxZ = num(w.maxZ, 'wall.maxZ', minZ + .001, bounds.maxZ);
    const top=num(w.top, 'wall.top', .1, height);
    return { minX, maxX, minZ, maxZ, top, ...(w.bottom===undefined?{}:{bottom:num(w.bottom,'wall.bottom',0,top-.01)}) };
  });
  const walls=rectangles(value.walls,'model.walls');
  if(value.platforms!==undefined && (!Array.isArray(value.platforms)||value.platforms.length>300))throw new MapError('model.platforms must be a list of at most 300 rectangles');
  const platforms=rectangles((value.platforms??[]) as unknown[],'model.platforms');
  for(const s of value.source===undefined?seats.slice(20):[]){
    const x=s.x+Math.sin(s.rotY)*.85,z=s.z+Math.cos(s.rotY)*.85;
    if(platforms.some(w=>Math.hypot(x-Math.max(w.minX,Math.min(x,w.maxX)),z-Math.max(w.minZ,Math.min(z,w.maxZ)))<.578))throw new MapError('a soft seat overlaps a raised platform');
  }
  for (const [i,s] of seats.entries()) if (walls.some(w => w.top>(seatHeights[i]??0) && (w.bottom??0)<(seatHeights[i]??0)+1.7 && s.x > w.minX && s.x < w.maxX && s.z > w.minZ && s.z < w.maxZ)) throw new MapError('a model seat is inside a wall');
  for(const [i,s] of seats.entries())for(const distance of [.85,1.1]){
    const x=s.x+Math.sin(s.rotY)*distance,z=s.z+Math.cos(s.rotY)*distance,r=.22;
    if(x-r<bounds.minX||x+r>bounds.maxX||z-r<bounds.minZ||z+r>bounds.maxZ)throw new MapError(`model.seats[${i}] chair or approach is outside the hall`);
    if(walls.some(w=>w.top>(seatHeights[i]??0) && (w.bottom??0)<(seatHeights[i]??0)+1.7 && x+r>w.minX&&x-r<w.maxX&&z+r>w.minZ&&z-r<w.maxZ))throw new MapError(`model.seats[${i}] chair or approach overlaps a wall`);
  }
  const surface = (v: unknown, label: string): BoardPlace => {
    const p = point(v, label);
    const s = v as Record<string, unknown>;
    return { ...p, y: num(s.y, `${label}.y`, .2, height), width: num(s.width, `${label}.width`, .2, 15), height: num(s.height, `${label}.height`, .2, 10) };
  };
  if(value.labels!==undefined&&(!Array.isArray(value.labels)||value.labels.length>30))throw new MapError('model.labels must contain at most 30 room signs');
  const labels=((value.labels??[]) as unknown[]).map((v,i)=>{
    const p=point(v,`model.labels[${i}]`),text=(v as Record<string,unknown>).text;
    if(typeof text!=='string'||!text.trim()||text.length>60)throw new MapError('model label needs 1-60 characters');
    return {...p,text};
  });
  let stationLabelOffsets:ModelMapData['stationLabelOffsets'];
  if(value.stationLabelOffsets!==undefined){
    if(!isObj(value.stationLabelOffsets))throw new MapError('model.stationLabelOffsets must be a station-to-metres map');
    stationLabelOffsets={};
    for(const [station,offset] of Object.entries(value.stationLabelOffsets)){
      if(!MODEL_STATIONS.includes(station as StationKind))throw new MapError(`model.stationLabelOffsets has unknown station ${station}`);
      stationLabelOffsets[station as StationKind]=num(offset,`model.stationLabelOffsets.${station}`,0,2);
    }
  }
  if(value.lounges!==undefined&&(!Array.isArray(value.lounges)||value.lounges.length>2))throw new MapError('model.lounges must contain at most two centres');
  const lounges=((value.lounges??[]) as unknown[]).map((v,i)=>({...point(v,`model.lounges[${i}]`),rugLength:num((v as Record<string,unknown>).rugLength??4,'lounge.rugLength',3.2,4)}));
  for(const p of lounges){
    if(p.rotY!==0)throw new MapError('model lounges use rotation 0');
    const half=p.rugLength/2;
    if(p.x-1.3<bounds.minX||p.x+1.3>bounds.maxX||p.z-half<bounds.minZ||p.z+half>bounds.maxZ)throw new MapError('model lounge rug is outside the hall');
    if(walls.some(w=>p.x+1.3>w.minX&&p.x-1.3<w.maxX&&p.z+half>w.minZ&&p.z-half<w.maxZ))throw new MapError('model lounge rug overlaps a wall');
    if(platforms.some(w=>p.x+1.3>w.minX&&p.x-1.3<w.maxX&&p.z+half>w.minZ&&p.z-half<w.maxZ))throw new MapError('model lounge rug overlaps a raised platform');
  }
  let source:ModelMapData['source'];
  if(value.source!==undefined){
    if(!isObj(value.source))throw new MapError('model.source must describe existing chairs');
    const chairs=(raw:unknown,count:number,label:string):ModelChair[]=>{
      if(!Array.isArray(raw)||raw.length!==count)throw new MapError(`${label} needs exactly ${count} anchors`);
      const result=raw.map((v,i)=>{
        const p=v as Record<string,unknown>;
        const chairType=p.chairType;
        if(chairType!==undefined&&!['task','executive','guest','conference','lounge','sofaSeat','pouf','barStool'].includes(String(chairType)))throw new MapError(`${label}[${i}].chairType is not supported`);
        let sit:ModelChair['sit'];
        if(p.sit!==undefined){
          if(!isObj(p.sit))throw new MapError(`${label}[${i}].sit must be an anchor offset`);
          sit={forward:num(p.sit.forward,`${label}[${i}].sit.forward`,-.5,.5),y:num(p.sit.y,`${label}[${i}].sit.y`,.2,1.2)};
        }
        return {...point(v,`${label}[${i}]`),y:num(p.y,`${label}[${i}].y`,0,height),...(chairType===undefined?{}:{chairType:chairType as NonNullable<ModelChair['chairType']>}),...(sit?{sit}:{})};
      });
      if(new Set(result.map(p=>`${p.x},${p.z}`)).size!==count)throw new MapError(`${label} anchors must be distinct`);
      for(const p of result)if(walls.some(w=>w.top>p.y && (w.bottom??0)<p.y+1.2 && p.x>w.minX&&p.x<w.maxX&&p.z>w.minZ&&p.z<w.maxZ))throw new MapError(`${label} anchor is inside a wall`);
      return result;
    };
    const stations=value.source.stations===undefined?[]:value.source.stations;
    if(!Array.isArray(stations)||stations.some(s=>s!=='issues'&&s!=='pulls'&&s!=='queue')||new Set(stations).size!==stations.length)throw new MapError('model.source.stations must be a distinct list of issues, pulls and queue');
    let stationChairs:NonNullable<ModelMapData['source']>['stationChairs'];
    if(value.source.stationChairs!==undefined){
      if(!isObj(value.source.stationChairs))throw new MapError('model.source.stationChairs must be a station-to-chair map');
      stationChairs={};
      for(const [station,raw] of Object.entries(value.source.stationChairs)){
        if(!MODEL_STATIONS.includes(station as StationKind))throw new MapError(`model.source.stationChairs has unknown station ${station}`);
        if(!isObj(raw))throw new MapError(`model.source.stationChairs.${station} must be a chair anchor`);
        const chairType=raw.chairType;
        if(chairType!==undefined&&!['task','executive','guest','conference','lounge','sofaSeat','pouf','barStool'].includes(String(chairType)))throw new MapError(`model.source.stationChairs.${station}.chairType is not supported`);
        if(!isObj(raw.sit))throw new MapError(`model.source.stationChairs.${station}.sit must describe its proxy seat`);
        stationChairs[station as StationKind]={...point(raw,`model.source.stationChairs.${station}`),y:num(raw.y,`model.source.stationChairs.${station}.y`,0,height),chairType:chairType as NonNullable<ModelChair['chairType']>,sit:{forward:num(raw.sit.forward,`model.source.stationChairs.${station}.sit.forward`,-.5,.5),y:num(raw.sit.y,`model.source.stationChairs.${station}.sit.y`,.2,1.2)}};
      }
    }
    source={chairs:chairs(value.source.chairs,32,'model.source.chairs'),council:chairs(value.source.council,5,'model.source.council'),meetingBoard:surface(value.source.meetingBoard,'model.source.meetingBoard'),stations,stationChairs};
    for(const [i,chair] of source.chairs.entries()){
      const s=seats[i];
      const forward=chair.sit?.forward??.85;
      if(Math.hypot(s.x-chair.x-Math.sin(chair.rotY)*forward,s.z-chair.z-Math.cos(chair.rotY)*forward)>.02)throw new MapError(`source chair ${i+1} must match its authored sit offset`);
    }
  }
  return { asset: value.asset, seats, walls, platforms, labels, lounges, source, stationLabelOffsets, screen:value.screen===null?null:surface(value.screen, 'model.screen'), whiteboard: surface(value.whiteboard, 'model.whiteboard') };
}
