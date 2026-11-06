import * as THREE from 'three';
import { mesh, toon } from '../toon';
import { batchRigidSiblings } from '../rigid-batch';

export function workerHeadset() {
  const group = new THREE.Group(), material = toon('#2b2d42');
  const band = mesh(new THREE.TorusGeometry(0.29, 0.025, 6, 20, Math.PI), material, 0, 0.72, 0, false);
  band.rotation.y = Math.PI / 2; group.add(band);
  for (const sx of [-1, 1]) group.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), material, sx * 0.29, 0.72, 0, false));
  return { group, release: batchRigidSiblings(group, material) };
}
