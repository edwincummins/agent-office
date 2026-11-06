import { CASTLE } from '../../src/shared/maps/castle.js';
import type { MapConfig } from '../../src/shared/maps/index.js';
import type {} from '../../src/shared/levels/attach.js';

/** Public synthetic geometry, independent of any purchased room or HQ layout. */
export const TWO_LEVEL_MAP: MapConfig = {
  ...structuredClone(CASTLE),
  id: 'two-level-test',
  name: 'Two-level test hall',
  description: 'Synthetic stairs, upper seats, rail, slab and lift test.',
  hall: { width: 26, length: 40, height: 7 },
  props: [],
  dungeon: undefined,
  sendHome: undefined,
  spawn: { x: 0, z: -8, rotY: 0 },
  door: { x: -5, z: -18 },
  throne: { x: 0, z: -17, rotY: 0, dais: { width: 6, depth: 3, height: 0.3, steps: 1 } },
  herald: { x: 3.3, z: -17, rotY: 0, name: 'Guide', says: 'Test hall', ask: 'Test', button: 'Send' },
  lineup: { x: 0, z: -14, rotY: Math.PI, step: [0, 1.3], count: 3 },
  council: { x: 7, z: -16, rotY: 0 },
  levels: {
    floors: [
      { id: 'ground', minX: -13, maxX: 13, minZ: -20, maxZ: 20, y: 0, thickness: 0.2 },
      { id: 'upper', minX: -13, maxX: 13, minZ: 0, maxZ: 20, y: 3, thickness: 0.25 },
    ],
    stairs: [{ id: 'stairs', from: { x: 0, z: -6, level: 'ground' }, to: { x: 0, z: 0, level: 'upper' }, width: 2, steps: 12 }],
    rails: [
      { level: 'upper', minX: -13, maxX: -1.1, minZ: 0, maxZ: 0.1, height: 1.1 },
      { level: 'upper', minX: 1.1, maxX: 9, minZ: 0, maxZ: 0.1, height: 1.1 },
      { level: 'upper', minX: 11, maxX: 13, minZ: 0, maxZ: 0.1, height: 1.1 },
    ],
    lifts: [
      {
        id: 'lift',
        x: 10,
        z: -1.5,
        width: 2,
        depth: 2,
        stops: [
          { x: 10, z: 0.5, level: 'ground' },
          { x: 10, z: 0.5, level: 'upper' },
        ],
      },
    ],
    seats: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i < 8 ? `desk-${9 + i}` : `beanbag-${i - 3}`, 'upper'])),
  },
};
