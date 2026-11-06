import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { DecorItem } from '../../../shared/maps/decor';
import { releaseModel, retainModelTextures } from './resources';
import { retryModelLoad } from './retry';

/** What Arrange mode looks for on a thing it can move: see features/arrange. */
export interface ArrangeTag {
  kind: 'fixture' | 'decor';
  id: string;
}

/**
 * A model map's decor (shared/maps/decor.ts): each item its own holder group where the map puts it,
 * tagged for Arrange mode, and never merged into the room, so it can be moved on its own. Each GLB
 * is downloaded once however many items use it (one after another, under the server's two-download
 * cap the room model shares), and the items share its geometry and materials.
 */
export function modelDecor(parent: THREE.Group, items: readonly DecorItem[] = []) {
  const holders: THREE.Group[] = [];
  const loaded: THREE.Group[] = [];
  const download = new AbortController();
  let disposed = false;
  for (const item of items) {
    const holder = new THREE.Group();
    holder.name = `Decor__${item.id}`;
    holder.position.set(item.position.x, item.position.y, item.position.z);
    holder.rotation.y = item.rotY;
    holder.scale.setScalar(item.scale);
    holder.userData.arrange = { kind: 'decor', id: item.id } satisfies ArrangeTag;
    parent.add(holder);
    holders.push(holder);
  }
  const byAsset = new Map<string, THREE.Group[]>();
  items.forEach((item, i) => byAsset.set(item.asset, [...(byAsset.get(item.asset) ?? []), holders[i]]));
  const ready = (async () => {
    for (const [asset, targets] of byAsset) {
      const url = `/api/map-model/${asset}`;
      const loader = new GLTFLoader(new THREE.LoadingManager());
      loader.manager.setURLModifier((u) => {
        if (u.startsWith('blob:') || u.startsWith('data:') || u === url) return u;
        throw new Error('Decor models must embed their textures and buffers');
      });
      try {
        const gltf = await retryModelLoad(() => loader.loadAsync(url), download.signal);
        if (disposed) {
          releaseModel(gltf.scene);
          return;
        }
        retainModelTextures(gltf.scene);
        gltf.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.geometry.computeBoundingSphere();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            m.userData.localModel = true;
            m.userData.outlineParameters = { visible: false };
            m.fog = false;
          }
        });
        loaded.push(gltf.scene);
        // The first item gets the model itself; the rest share its geometry and materials.
        targets.forEach((t, i) => t.add(i === 0 ? gltf.scene : gltf.scene.clone(true)));
      } catch (error) {
        if (disposed) return;
        console.error(`Decor model ${asset} failed`, error);
      }
    }
  })();
  return {
    holders,
    ready,
    dispose() {
      disposed = true;
      download.abort();
      for (const h of holders) h.removeFromParent();
      // Clones share the original's resources: releasing each original once frees them all.
      for (const scene of loaded) releaseModel(scene);
    },
  };
}
