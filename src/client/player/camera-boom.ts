import type { Vector3 } from 'three';
import type { Collider } from '../world/types';

/** Keep the camera's near plane clear without raycasting rendered room geometry. */
export function shortenCameraBoom(target: Vector3, camera: Vector3, colliders: readonly Collider[], clearance = 0.18): void {
  const dx = camera.x - target.x, dy = camera.y - target.y, dz = camera.z - target.z;
  let fraction = 1;
  for (const box of colliders) {
    if (box.cameraOcclusion === false) continue;
    const low = [box.minX - clearance, (box.bottom ?? 0) - clearance, box.minZ - clearance];
    const high = [box.maxX + clearance, box.top + clearance, box.maxZ + clearance];
    const origin = [target.x, target.y, target.z], delta = [dx, dy, dz];
    // A seated target can be inside its own furniture. That solid cannot separate it from the camera.
    if (origin.every((value, axis) => value >= low[axis] && value <= high[axis])) continue;
    let enter = 0, leave = fraction;
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(delta[axis]) < 1e-12) {
        if (origin[axis] < low[axis] || origin[axis] > high[axis]) { leave = -1; break; }
      } else {
        const a = (low[axis] - origin[axis]) / delta[axis], b = (high[axis] - origin[axis]) / delta[axis];
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      }
    }
    if (enter <= leave && leave >= 0) fraction = Math.min(fraction, enter);
  }
  if (fraction < 1) camera.set(target.x + dx * fraction, target.y + dy * fraction, target.z + dz * fraction);
}
