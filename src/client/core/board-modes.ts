import type * as THREE from 'three';
import type { Hint } from './context';
import type { DeskKey } from '../interaction';

/** Optional board extensions. Without a registered mode the upstream board is unchanged. */
export interface BoardMode {
  texture(base:THREE.Texture,mesh:THREE.Mesh):THREE.Texture;
  hint():Hint;
  use(key:DeskKey):boolean;
}
export const boardModes=new Map<string,BoardMode>();
