import * as THREE from 'three';
import { mesh, toon } from '../toon';
import { batchRigidSiblings } from '../rigid-batch';

/** Eyes and cheeks share one rigid head parent; the animated mouth stays separate. */
export function personFaceDetails(ink:THREE.Material):THREE.Group {
  const group=new THREE.Group();
  for(const sx of [-1,1]){
    group.add(mesh(new THREE.SphereGeometry(.055,10,8),ink,sx*.12,.02,.3,false));
    group.add(mesh(new THREE.SphereGeometry(.05,10,8),toon('#ff9f9f'),sx*.2,-.08,.27,false));
  }
  batchRigidSiblings(group);
  return group;
}
