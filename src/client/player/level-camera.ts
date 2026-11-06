import type { Vector3 } from 'three';
import type { Collider } from '../world/types';

declare module '../world/types' {
  interface Collider {
    levelSurface?: boolean;
  }
}

/** Clip the actual boom segment against local slabs, including after camera easing. */
export function clampLevelCamera(target: Vector3, camera: Vector3, solids: readonly Collider[]) {
  const start = [target.x, target.y, target.z],
    delta = [camera.x - target.x, camera.y - target.y, camera.z - target.z];
  let fraction = 1;
  for (const s of solids) {
    if (!s.levelSurface) continue;
    const low = [s.minX - 0.18, (s.bottom ?? 0) - 0.18, s.minZ - 0.18],
      high = [s.maxX + 0.18, s.top + 0.18, s.maxZ + 0.18];
    if (start.every((v, i) => v >= low[i] && v <= high[i])) continue;
    let enter = 0,
      leave = fraction;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(delta[i]) < 1e-12) {
        if (start[i] < low[i] || start[i] > high[i]) {
          leave = -1;
          break;
        }
      } else {
        const a = (low[i] - start[i]) / delta[i],
          b = (high[i] - start[i]) / delta[i];
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
      }
    }
    if (enter <= leave && leave >= 0) fraction = Math.min(fraction, enter);
  }
  if (fraction < 1) camera.set(target.x + delta[0] * fraction, target.y + delta[1] * fraction, target.z + delta[2] * fraction);
}
