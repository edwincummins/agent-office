import { planMap, type MapConfig } from '../../src/shared/maps/index.js';
import { TWO_LEVEL_MAP } from './two-level-map.js';

const seats = [...planMap(TWO_LEVEL_MAP).desks, ...planMap(TWO_LEVEL_MAP).overflow].map(({ x, z, rotY }) => ({ x, z, rotY }));
/** The same public test hall through the model builder, with a synthetic embedded GLB supplied by the harness. */
export const TWO_LEVEL_MODEL: MapConfig = {
  ...structuredClone(TWO_LEVEL_MAP),
  style: 'model',
  tables: [],
  throne: null,
  herald: null,
  lineup: null,
  model: { asset: 'synthetic.glb', seats, walls: [], screen: null, whiteboard: { x: -10, y: 2, z: -17, rotY: 0, width: 2, height: 1.2 } },
};
