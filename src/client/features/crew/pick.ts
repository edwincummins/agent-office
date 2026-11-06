import * as T from 'three';
import type {Interactable} from '../../world/types';
import {crewPose,type CrewEntry} from './layout';
export function capsuleHit(ray:T.Ray,bottom:T.Vector3,top:T.Vector3,radius:number):T.Vector3|null {
 const o=ray.origin,d=ray.direction,x=o.x-bottom.x,z=o.z-bottom.z;
 const closestY=Math.max(bottom.y,Math.min(top.y,o.y));
 if(x*x+z*z+(o.y-closestY)**2<=radius*radius)return o.clone();
 let nearest=Infinity;const a=d.x*d.x+d.z*d.z,b=2*(x*d.x+z*d.z),c=x*x+z*z-radius*radius,disc=b*b-4*a*c;
 if(a>1e-12&&disc>=0)for(const t of [(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)]){const y=o.y+t*d.y;if(t>=0&&y>=bottom.y&&y<=top.y)nearest=Math.min(nearest,t);}
 for(const center of [bottom,top]){const hit=ray.intersectSphere(new T.Sphere(center,radius),new T.Vector3());if(hit)nearest=Math.min(nearest,hit.distanceTo(o));}
 return Number.isFinite(nearest)?ray.at(nearest,new T.Vector3()):null;
}
/** Analytic capsules only. These lightweight hit records never enter the rendered scene. */
export class CrewPick extends T.Object3D {
 entries:CrewEntry[]=[];
 items:Interactable[]=[];
 sync(entries:CrewEntry[]){this.entries=entries;this.items=entries.map(e=>{const p=crewPose(e);return {kind:'crew',x:p.x,y:p.y,z:p.z,radius:2.5,label:e.seat.name,crewId:e.seat.session};});}
 override raycast(raycaster:T.Raycaster,hits:T.Intersection[]){
  if(!this.visible)return;this.entries.forEach((e,i)=>{const p=crewPose(e),bottom=new T.Vector3(p.x,p.y+.3,p.z),top=bottom.clone();top.y=p.y+1.4+(p.sit?p.seatHeight-.42:0);
   const point=capsuleHit(raycaster.ray,bottom,top,.35);if(!point)return;
   const distance=point.distanceTo(raycaster.ray.origin);if(distance<raycaster.near||distance>raycaster.far)return;
   const object=new T.Object3D();object.userData.interact=this.items[i];hits.push({distance,point,object});
  });
 }
}
