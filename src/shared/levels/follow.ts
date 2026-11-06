import type { Pt } from '../nav.js';
import type { LevelPoint } from './navigation.js';

/** Height probe for the active authored route segment; legacy paths use their old probe. */
export function routeHeight(path: Pt[], next: number, fallback: number): number {
  const a = path[Math.max(0, next - 1)] as LevelPoint | undefined,
    b = path[Math.min(next, path.length - 1)] as LevelPoint | undefined;
  if (a?.height === undefined || b?.height === undefined) return fallback;
  return Math.max(a.height, b.height) + 0.1;
}
