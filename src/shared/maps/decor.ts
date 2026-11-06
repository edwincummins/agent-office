import type { Bounds } from '../nav.js';
import { isObj, num, MapError } from './check.js';

/** The most decor items a map lists. */
export const MAX_DECOR_ITEMS = 300;
/** How small or big a decor item can be scaled. */
export const DECOR_SCALE: readonly [number, number] = [0.05, 20];

/**
 * A movable thing on a model map (a plant, a sign, a lamp): its own self-contained GLB in maps/assets,
 * put where the map says. The owner can move, turn and resize each one in Arrange mode (see
 * shared/arrange.ts), and those placements win over the map's.
 */
export interface DecorItem {
  /** Lowercase letters, digits and dashes, unique in the map: what the owner's placement is saved under. */
  id: string;
  /** A local GLB in maps/assets, like model.asset. */
  asset: string;
  position: { x: number; y: number; z: number };
  rotY: number;
  /** Uniform scale, 1 = as modelled. */
  scale: number;
  label?: string;
}

export const DECOR_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
export const DECOR_ASSET = /^[a-z0-9][a-z0-9-]{0,79}\.glb$/;

/** Checks a map's `decor` list. Only model maps have one: their items load like the model does. */
export function checkDecor(value: unknown, bounds: Bounds, height: number, style: string): DecorItem[] {
  if (style !== 'model') throw new MapError('decor is only for model maps');
  if (!Array.isArray(value) || value.length > MAX_DECOR_ITEMS) throw new MapError(`decor must be a list of at most ${MAX_DECOR_ITEMS} items`);
  const seen = new Set<string>();
  return value.map((v, i) => {
    const label = `decor[${i}]`;
    if (!isObj(v)) throw new MapError(`${label} must be an object`);
    if (typeof v.id !== 'string' || !DECOR_ID.test(v.id)) throw new MapError(`${label}.id must be lowercase letters, digits and dashes`);
    if (seen.has(v.id)) throw new MapError(`another decor item has the id "${v.id}" too`);
    seen.add(v.id);
    if (typeof v.asset !== 'string' || !DECOR_ASSET.test(v.asset)) throw new MapError(`${label}.asset must be a local filename like plant.glb`);
    if (!isObj(v.position)) throw new MapError(`${label}.position must be {x, y, z}`);
    const position = {
      x: num(v.position.x, `${label}.position.x`, bounds.minX, bounds.maxX),
      y: num(v.position.y ?? 0, `${label}.position.y`, 0, height),
      z: num(v.position.z, `${label}.position.z`, bounds.minZ, bounds.maxZ),
    };
    const item: DecorItem = { id: v.id, asset: v.asset, position, rotY: num(v.rotY ?? 0, `${label}.rotY`), scale: num(v.scale ?? 1, `${label}.scale`, DECOR_SCALE[0], DECOR_SCALE[1]) };
    if (v.label !== undefined) {
      if (typeof v.label !== 'string' || v.label.length > 60) throw new MapError(`${label}.label must be at most 60 characters`);
      item.label = v.label;
    }
    return item;
  });
}
