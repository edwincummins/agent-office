import type { LevelsConfig } from '../../src/shared/levels/types.js';
/** Public, synthetic dimensions. No purchased or project-specific map data. */
export const TWO_LEVELS: LevelsConfig = {
  floors: [
    { id: 'ground', minX: -8, maxX: 8, minZ: -8, maxZ: 8, y: 0, thickness: 0.2 },
    { id: 'upper', minX: -8, maxX: 8, minZ: 0, maxZ: 8, y: 3, thickness: 0.25 },
  ],
  stairs: [{ id: 'stairs', from: { x: 0, z: -6, level: 'ground' }, to: { x: 0, z: 0, level: 'upper' }, width: 2, steps: 12 }],
  rails: [
    { minX: -8, maxX: -1.1, minZ: -0.1, maxZ: 0.1, level: 'upper', height: 1.6 },
    { minX: 1.1, maxX: 8, minZ: -0.1, maxZ: 0.1, level: 'upper', height: 1.6 },
  ],
  lifts: [
    {
      id: 'lift',
      x: 6,
      z: -1.5,
      width: 2,
      depth: 2,
      stops: [
        { x: 6, z: 0.5, level: 'ground' },
        { x: 6, z: 0.5, level: 'upper' },
      ],
    },
  ],
};
