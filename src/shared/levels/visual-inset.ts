import type { Bounds } from '../nav.js';
import { isObj, MapError, num } from '../maps/check.js';
import type { Level, LevelSolid } from './types.js';

const edges = ['minX', 'maxX', 'minZ', 'maxZ'] as const;

export function checkVisualInset(value: unknown, y: number, what: string): Level['visualInset'] {
  if (value === undefined) return;
  if (!isObj(value) || y === 0) throw new MapError(`${what}.visualInset needs an edge-to-metres object on an elevated floor`);
  const result: NonNullable<Level['visualInset']> = {};
  for (const [key, amount] of Object.entries(value)) {
    if (!edges.includes(key as keyof Bounds)) throw new MapError(`${what}.visualInset has unknown edge ${key}`);
    result[key as keyof Bounds] = num(amount, `${what}.visualInset.${key}`, 0, .02);
  }
  return result;
}

/** A visual-only box footprint. Never pass these recessed bounds to navigation or colliders. */
export function levelRenderBounds(solid: LevelSolid, floors: readonly Level[]): Bounds {
  const inset = floors.find(f => 'id' in solid && f.id === solid.id)?.visualInset;
  return {
    minX: solid.minX + (inset?.minX ?? 0), maxX: solid.maxX - (inset?.maxX ?? 0),
    minZ: solid.minZ + (inset?.minZ ?? 0), maxZ: solid.maxZ - (inset?.maxZ ?? 0),
  };
}
