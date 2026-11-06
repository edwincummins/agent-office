import type { Bounds, Pt } from '../nav.js';

/** Continuous slab intersection: even sub-cell partitions stop a sit hop. */
export function crossesRect(a: Pt, b: Pt, rect: Bounds): boolean {
  let near = 0,
    far = 1;
  for (const [origin, delta, min, max] of [
    [a[0], b[0] - a[0], rect.minX, rect.maxX],
    [a[1], b[1] - a[1], rect.minZ, rect.maxZ],
  ]) {
    if (Math.abs(delta) < 1e-12) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const t0 = (min - origin) / delta,
      t1 = (max - origin) / delta;
    near = Math.max(near, Math.min(t0, t1));
    far = Math.min(far, Math.max(t0, t1));
  }
  return near <= far;
}
