import type {Bounds} from '../../../shared/nav';
import {crewPose,type CrewEntry} from './layout';
/** Prefer the authored gap; when overflow fills it, use the nearest clear side of the block. */
export function crewMarker(entry:CrewEntry,entries:readonly CrewEntry[],bounds:Bounds){
 const p=entry.place,o=p.marker??entry.zone.marker.offset,r=p.rotY;
 const authored={x:p.x+Math.cos(r)*o.x+Math.sin(r)*o.z,z:p.z-Math.sin(r)*o.x+Math.cos(r)*o.z};
 if(entry.zone.marker.kind==='tent')return authored;
 const clear=(q:{x:number;z:number})=>q.x>=bounds.minX+.45&&q.x<=bounds.maxX-.45&&q.z>=bounds.minZ+.45&&q.z<=bounds.maxZ-.45&&entries.every(e=>{const at=crewPose(e);return Math.hypot(at.x-q.x,at.z-q.z)>=.7;});
 if(clear(authored))return authored;
 for(const radius of [.85,1.7,2.55])for(const angle of [Math.PI,0,-Math.PI/2,Math.PI/2,Math.PI*.75,-Math.PI*.75,Math.PI*.25,-Math.PI*.25]){
  const q={x:p.x+Math.sin(r+angle)*radius,z:p.z+Math.cos(r+angle)*radius};if(clear(q))return q;
 }
 return null;
}
