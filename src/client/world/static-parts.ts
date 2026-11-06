import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Call during construction only, on fixtures whose mesh transforms are static.
 * Groups remain intact so hinges/pivots can animate; materials stay shared so lights can change.
 * Interactive meshes and transparent effects retain their identity and sorting.
 */
export function batchStaticParts(root: THREE.Object3D) {
  for (const child of [...root.children]) if (!(child instanceof THREE.Mesh)) batchStaticParts(child);
  const batches = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
  for (const child of root.children) {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.SkinnedMesh || child instanceof THREE.InstancedMesh || Array.isArray(child.material)) continue;
    if (!child.visible || child.material.transparent || Object.keys(child.userData).length || Object.keys(child.geometry.morphAttributes).length) continue;
    const key = `${child.material.uuid}/${child.castShadow}/${child.receiveShadow}/${child.renderOrder}/${child.layers.mask}`;
    const list = batches.get(key) ?? []; list.push(child); batches.set(key, list);
  }
  for (const parts of batches.values()) {
    if (parts.length < 2) continue;
    const copies = parts.map(part => {
      part.updateMatrix();
      const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      return geometry.applyMatrix4(part.matrix);
    });
    const merged = mergeGeometries(copies, false);
    for (const copy of copies) copy.dispose();
    if (!merged) continue;
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    const first = parts[0], batch = new THREE.Mesh(merged, first.material);
    batch.name = 'static-fixture-batch'; batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow; batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask;
    for (const part of parts) part.removeFromParent();
    root.add(batch);
  }
}
