import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Merge static leaf meshes under one parent. The parent's transform moves the batch for free. */
export function batchRigidSiblings(parent: THREE.Object3D, material?: THREE.Material): () => void {
  const candidates = parent.children.filter((o): o is THREE.Mesh<THREE.BufferGeometry, THREE.Material> =>
    o instanceof THREE.Mesh && o.visible && !o.children.length && !Array.isArray(o.material) &&
    !(o instanceof THREE.SkinnedMesh) && !(o instanceof THREE.InstancedMesh) &&
    !Object.keys(o.geometry.morphAttributes).length && (!material || o.material === material),
  );
  if (!material) {
    const materials = [...new Set(candidates.map(part => part.material as THREE.Material))];
    const releases = materials.map(current => batchRigidSiblings(parent, current));
    return () => { for (const release of releases) release(); };
  }
  const parts = candidates;
  if (parts.length < 2) return () => {};
  parent.updateMatrixWorld(true);
  const groups = new Map<string, typeof parts>();
  for (const part of parts) {
    const key = `${part.castShadow}/${part.receiveShadow}/${part.renderOrder}/${part.layers.mask}`;
    const group = groups.get(key) ?? [];
    group.push(part);
    groups.set(key, group);
  }
  const restores: (() => void)[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const originals = group.map(part => ({ geometry: part.geometry, visible: part.visible }));
    const copies = group.map(part => {
      part.updateMatrix();
      const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      geometry.applyMatrix4(part.matrix);
      return geometry;
    });
    const geometry = mergeGeometries(copies, false);
    copies.forEach(copy => copy.dispose());
    if (!geometry) continue;
    const first = group[0];
    const batch = new THREE.Mesh(geometry, material);
    batch.name = 'rigid-sibling-batch';
    batch.raycast = () => {};
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder;
    batch.layers.mask = first.layers.mask;
    batch.frustumCulled = true;
    group.forEach(part => { part.visible = false; });
    parent.add(batch);
    restores.push(() => {
      group.forEach((part, i) => {
        part.geometry = originals[i].geometry;
        part.visible = originals[i].visible;
      });
      batch.removeFromParent();
      geometry.dispose();
    });
  }
  return () => { for (const restore of restores.splice(0)) restore(); };
}
