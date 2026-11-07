import type * as THREE from 'three';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { atmosphereProfile, modelAtmosphere } from './model';

export function installAtmosphere(ctx: Ctx) {
  let root: THREE.Object3D | null = null;
  let atmosphere: ReturnType<typeof modelAtmosphere> | null = null;
  ctx.ticks.add('hud', ({ delta }) => {
    if (root && (ctx.upTop() || !ctx.world().group.getObjectById(root.id))) {
      atmosphere?.dispose(); atmosphere = null; root = null;
    }
    if (ctx.upTop() || ctx.plan().style !== 'model') return;
    if (!root) ctx.world().group.traverse(object => {
      const profile = !root && atmosphereProfile(object.userData.officeAtmosphere);
      if (!profile) return;
      root = object; atmosphere = modelAtmosphere(object, profile); ctx.scene.add(atmosphere.sky);
    });
    if (store.sky) atmosphere?.update(store.sky, Date.now(), ctx.camera, delta);
  });
}
