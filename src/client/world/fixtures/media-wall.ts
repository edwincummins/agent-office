import * as THREE from 'three';
import type {ResolvedSlots, Slot} from '../../../shared/fixtures';
import type {World} from '../world';
/** Paired screens share a face plane and a four-centimetre frame, independent of legacy TV trim. */
export function mediaPanels(world: World, slots: ResolvedSlots, tv: THREE.Mesh): THREE.Mesh[] {
 if (!slots.mediaWall || !slots.tv || !slots.services) return [];
 const frames: THREE.Mesh[]=[];
 const place=(screen:THREE.Mesh,slot:Slot)=>{
  const parent=screen.parent;
  if(!screen.userData.interact && parent?.userData.interact)screen.userData.interact=parent.userData.interact;
  if(screen.userData.interact&&!world.pickables.includes(screen))world.pickables.push(screen);
  if(parent && parent!==world.group)for(const sibling of parent.children)if(sibling!==screen)sibling.visible=false;
  screen.removeFromParent();world.group.add(screen);
  screen.geometry.dispose();screen.geometry=new THREE.PlaneGeometry(slot.size.width,slot.size.height);
  screen.position.set(slot.position.x,slot.position.y,slot.position.z);screen.rotation.set(0,slot.rotY,0);screen.scale.set(1,1,1);
  const frame=new THREE.Mesh(new THREE.BoxGeometry(slot.size.width+.08,slot.size.height+.08,.04),new THREE.MeshBasicMaterial({color:'#202225'}));
  frame.position.copy(screen.position).addScaledVector(new THREE.Vector3(Math.sin(slot.rotY),0,Math.cos(slot.rotY)),-.021);frame.rotation.y=slot.rotY;
  world.group.add(frame);frames.push(frame);
 };
 place(tv,slots.tv);place(world.boardMeshes!.services,slots.services);
 return frames;
}
