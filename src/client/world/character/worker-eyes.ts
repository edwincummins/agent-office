import * as THREE from 'three';
import { mesh } from '../toon';
import { batchRigidSiblings } from '../rigid-batch';

export function workerEyes(body: THREE.Group, white: THREE.Material, ink: THREE.Material) {
  const eyeGroup = new THREE.Group(), pupils: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.09, 12, 10), white, sx * 0.11, 0.7, 0.23, false);
    eye.scale.z = 0.6;
    const pupil = mesh(new THREE.SphereGeometry(0.045, 10, 8), ink, sx * 0.11, 0.7, 0.29, false);
    eyeGroup.add(eye); body.add(pupil); pupils.push(pupil);
  }
  body.add(eyeGroup);
  return { eyes: [eyeGroup, ...pupils], pupils, release: batchRigidSiblings(eyeGroup, white) };
}
