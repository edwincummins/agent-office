import type { Level } from './types.js';

/** A shared slab edge wide enough for a walker. Point contacts are not doors. */
export function slabPortal(a: Level, b: Level): [number, number] | undefined {
  if (Math.abs(a.y - b.y) > 0.001) return;
  const x0 = Math.max(a.minX, b.minX),
    x1 = Math.min(a.maxX, b.maxX);
  const z0 = Math.max(a.minZ, b.minZ),
    z1 = Math.min(a.maxZ, b.maxZ);
  if (Math.abs(x1 - x0) < 0.001 && z1 - z0 >= 0.8) return [(x0 + x1) / 2, (z0 + z1) / 2];
  if (Math.abs(z1 - z0) < 0.001 && x1 - x0 >= 0.8) return [(x0 + x1) / 2, (z0 + z1) / 2];
}
