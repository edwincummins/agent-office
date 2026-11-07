import * as THREE from 'three';
import { mesh } from '../toon';
import { batchRigidSiblings } from '../rigid-batch';

export function workerEyes(body: THREE.Group, white: THREE.Material, ink: THREE.Material) {
  const eyeGroup = new THREE.Group(), pupilGroup = new THREE.Group();
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.09, 12, 10), white, sx * 0.11, 0.7, 0.23, false);
    eye.scale.z = 0.6;
    const pupil = mesh(new THREE.SphereGeometry(0.045, 10, 8), ink, sx * 0.11, 0, 0.29, false);
    eyeGroup.add(eye); pupilGroup.add(pupil);
  }
  pupilGroup.position.y = 0.7;
  body.add(eyeGroup);
  body.add(pupilGroup);
  const releaseEyes = batchRigidSiblings(eyeGroup, white);
  const releasePupils = batchRigidSiblings(pupilGroup, ink);
  return { eyes: [eyeGroup, pupilGroup], pupils: pupilGroup, release: () => { releaseEyes(); releasePupils(); } };
}
