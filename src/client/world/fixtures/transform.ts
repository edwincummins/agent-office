import * as THREE from 'three';
import type {Slot} from '../../../shared/fixtures';
import {slotPoint} from '../../../shared/fixtures/transform';
import type {Collider,Interactable} from '../types';
export function transformFixture(from:Slot,to:Slot,objects:THREE.Object3D[],colliders:Collider[],interactables:Interactable[]){
 const matrix=(s:Slot)=>new THREE.Matrix4().compose(new THREE.Vector3(s.position.x,s.position.y,s.position.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),s.rotY),new THREE.Vector3(s.size.width,s.size.height,s.size.depth));
 const delta=matrix(to).multiply(matrix(from).invert());
 for(const o of objects)o.applyMatrix4(delta);
 for(const c of colliders){const points=[c.minX,c.maxX].flatMap(x=>[c.minZ,c.maxZ].map(z=>slotPoint(from,to,{x,y:c.top,z})));c.minX=Math.min(...points.map(p=>p.x));c.maxX=Math.max(...points.map(p=>p.x));c.minZ=Math.min(...points.map(p=>p.z));c.maxZ=Math.max(...points.map(p=>p.z));c.top=points[0].y;const bottom=slotPoint(from,to,{x:from.position.x,y:c.bottom??0,z:from.position.z}).y;if(c.bottom!==undefined||bottom!==0)c.bottom=bottom;}
 for(const i of interactables){const seating=i.kind==='seat';const p=slotPoint(from,seating?to:{...to,size:from.size},i);i.x=p.x;i.z=p.z;i.y=p.y;if(seating)i.radius*=Math.max(to.size.width/from.size.width,to.size.depth/from.size.depth);}
}
