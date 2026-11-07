import type {MapPlan} from '../../../shared/maps';
import type {ModelMapData} from '../../../shared/maps/model';
import type {Collider} from '../types';
import {seatFloor} from '../../../shared/levels/attach';
import {boxFootprint} from '../../../shared/maps/props';
/** Navigation footprints never replace authored physical collision heights. */
export function modelColliders(plan:MapPlan,config:ModelMapData):Collider[]{
 const authored=[...config.walls,...config.platforms??[]];
 const rectangles=plan.obstacles!.rects.filter(([x1,x2,z1,z2])=>!authored.some(w=>w.minX===x1&&w.maxX===x2&&w.minZ===z1&&w.maxZ===z2));
 const result:Collider[] = [...rectangles.map(([minX,maxX,minZ,maxZ])=>({minX,maxX,minZ,maxZ,top:(config.lounges??[]).some(p=>Math.abs(minX-(p.x-.3))<1e-6&&Math.abs(maxX-(p.x+.3))<1e-6&&Math.abs(minZ-(p.z-.6))<1e-6&&Math.abs(maxZ-(p.z+.6))<1e-6)?.4:.8})),...config.walls.map(w=>({...w,fence:true})),...config.platforms??[],...(config.source?[]:[{minX:plan.council!.x-1.3,maxX:plan.council!.x+1.3,minZ:plan.council!.z-1.3,maxZ:plan.council!.z+1.3,top:.78}])];
 if(!plan.levels)return result;
 // Source council chairs were navigation circles, not generic table solids.
 if(config.source)for(const [i,chair] of config.source.council.entries()){
   const seatId=plan.meeting[i].id,y=seatFloor(plan,seatId);
   result.push({minX:chair.x-.28,maxX:chair.x+.28,minZ:chair.z-.28,maxZ:chair.z+.28,bottom:y,top:y+.8,seatId} as Collider);
 }
 // Desk chairs and the lounge's sofa and pouf spots are solid too, like the council chairs (Fetty, 11-06: "I'm going through
 // chairs"). Sitting places you on the seat directly and standing steps you out in front, clear of the box.
 if(config.source)for(const [i,chair] of config.source.chairs.entries()){
   const def=[...plan.desks,...plan.overflow][i];if(!def)continue;
   const y=seatFloor(plan,def.id);
   result.push({minX:chair.x-.26,maxX:chair.x+.26,minZ:chair.z-.26,maxZ:chair.z+.26,bottom:y,top:y+.9,seatId:def.id} as Collider);
 }
 const matching=(c:Collider,r:readonly number[])=>Math.abs(c.minX-r[0])+Math.abs(c.maxX-r[1])+Math.abs(c.minZ-r[2])+Math.abs(c.maxZ-r[3])<1e-5;
 for(const c of result){
   if('seatId' in c || authored.some(w=>matching(c,[w.minX,w.maxX,w.minZ,w.maxZ])))continue;
   const desk=plan.desks.find(d=>matching(c,boxFootprint(d.x,d.z,1.6,.8,d.rotY)));
   const station=plan.stations.find(d=>d.x>=c.minX&&d.x<=c.maxX&&d.z>=c.minZ&&d.z<=c.maxZ);
   const cp=plan.council!,ex=cp.x-Math.sin(cp.rotY)*3.1,ez=cp.z-Math.cos(cp.rotY)*3.1;
   const council=matching(c,boxFootprint(ex,ez,2.6,.5,cp.rotY)) || matching(c,[cp.x-1.3,cp.x+1.3,cp.z-1.3,cp.z+1.3]);
   const y=seatFloor(plan,(desk??station??(council?plan.meeting[0]:undefined))?.id??'');
   c.bottom=(c.bottom??0)+y;c.top+=y;
 }
 return result;
}
