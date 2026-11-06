import type { NavGrid } from '../nav.js';
import { elevated, type LevelPoint } from './navigation.js';

/** Preserve vertical destinations through the ordinary walking controller seam. */
export function walkingRoute(nav: NavGrid, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) {
  return nav
    .route(elevated(from.x, from.z, from.y), elevated(to.x, to.z, to.y))
    .slice(1)
    .map((p: LevelPoint) => ({ x: p[0], z: p[1], ...(p.height === undefined ? {} : { y: p.height }) }));
}
