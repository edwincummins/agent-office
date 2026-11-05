import type * as THREE from 'three';
import type {JukeboxView} from '../../features/jukebox/world';
import type {CabinetModel} from '../../features/cabinet/world';
import type {World} from '../world';
export interface FixtureHandles {tv?:THREE.Mesh;jukebox?:JukeboxView;arcade?:CabinetModel}
const handles=new WeakMap<World,FixtureHandles>();
export const fixturesOf=(world:World)=>handles.get(world)??{};
export const setFixtures=(world:World,value:FixtureHandles)=>{handles.set(world,value);};
