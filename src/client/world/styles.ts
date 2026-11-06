import {withFixtures} from './fixtures/build';
import type { MapPlan, MapStyle } from '../../shared/maps';
import { buildCastle } from './castle';
import { buildStation } from './station';
import { buildModel } from './model';
import type { World } from './world';
import {withLevels} from './levels';

/*
 * How each style of map is put up (see shared/maps): the castle's stone hall, the station's deck in
 * orbit. A new style is a builder here, taking a map's plan to a World, and its name in MAP_STYLES:
 * every map in that style can then be picked, and main.ts shows it like any other.
 */
export const BUILDERS: Record<MapStyle, (plan: MapPlan) => World> = {
  castle: buildCastle,
  station: buildStation,
  model: buildModel,
};

// Decorate registry entries uniformly, including separately installed map styles.
for (const style of Object.keys(BUILDERS) as MapStyle[]) BUILDERS[style] = withFixtures(withLevels(BUILDERS[style]));
