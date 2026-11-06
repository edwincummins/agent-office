import * as THREE from 'three';
import type { LevelSolid } from '../../../shared/levels/types';

/** One vertical sheet through the centre of an axis-aligned rail collider. */
export function railGeometry(rail: LevelSolid): THREE.PlaneGeometry {
  const width = rail.maxX - rail.minX, depth = rail.maxZ - rail.minZ;
  const geometry = new THREE.PlaneGeometry(Math.max(width, depth), rail.top - rail.bottom);
  if (depth > width) geometry.rotateY(Math.PI / 2);
  return geometry;
}
