import type {Slot} from './index.js';
/** Maps a point in one fixture's local frame to another; shared by visuals, seats and collision. */
export function slotPoint(from:Slot,to:Slot,p:{x:number;y?:number;z:number}){
 const dx=p.x-from.position.x,dz=p.z-from.position.z,c=Math.cos(from.rotY),s=Math.sin(from.rotY);
 const x=(c*dx-s*dz)*to.size.width/from.size.width,z=(s*dx+c*dz)*to.size.depth/from.size.depth;
 return {x:to.position.x+Math.cos(to.rotY)*x+Math.sin(to.rotY)*z,y:to.position.y+((p.y??0)-from.position.y)*to.size.height/from.size.height,z:to.position.z-Math.sin(to.rotY)*x+Math.cos(to.rotY)*z};
}
