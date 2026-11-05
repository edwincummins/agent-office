import type {MapPlan} from '../../../shared/maps';
import type {ModelMapData} from '../../../shared/maps/model';
import type {Collider} from '../types';
/** Navigation footprints never replace authored physical collision heights. */
export function modelColliders(plan:MapPlan,config:ModelMapData):Collider[]{
 const authored=[...config.walls,...config.platforms??[]];
 const rectangles=plan.obstacles!.rects.filter(([x1,x2,z1,z2])=>!authored.some(w=>w.minX===x1&&w.maxX===x2&&w.minZ===z1&&w.maxZ===z2));
 return [...rectangles.map(([minX,maxX,minZ,maxZ])=>({minX,maxX,minZ,maxZ,top:(config.lounges??[]).some(p=>Math.abs(minX-(p.x-.3))<1e-6&&Math.abs(maxX-(p.x+.3))<1e-6&&Math.abs(minZ-(p.z-.6))<1e-6&&Math.abs(maxZ-(p.z+.6))<1e-6)?.4:.8})),...config.walls.map(w=>({...w,fence:true})),...config.platforms??[],...(config.source?[]:[{minX:plan.council!.x-1.3,maxX:plan.council!.x+1.3,minZ:plan.council!.z-1.3,maxZ:plan.council!.z+1.3,top:.78}])];
}
