import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Batch {
  material: THREE.Material;
  meshes: THREE.Mesh[];
}

function attributeLayout(geometry: THREE.BufferGeometry): string {
  return Object.keys(geometry.attributes).sort().map((name) => {
    const attribute = geometry.attributes[name];
    return `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`;
  }).join('|') + `|indexed:${geometry.index !== null}`;
}

function belongsToMovingDoor(mesh: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = mesh; node && node !== root; node = node.parent) {
    if (node.name.startsWith('Door__')) return true;
  }
  return false;
}

/** Combine opaque, non-interactive model meshes by material while preserving root-space transforms. */
export function mergeOpaqueModelMeshes(root: THREE.Group): number {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const batches = new Map<string, Batch>();
  const candidates = new Set<THREE.Mesh>();

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh) return;
    if (!object.visible || object.userData.interact || belongsToMovingDoor(object, root)) return;
    if (Array.isArray(object.material) || object.material.transparent || object.material.opacity < 1 || object.material.alphaTest > 0) return;
    if (Object.keys(object.geometry.morphAttributes).length > 0) return;
    const layout = attributeLayout(object.geometry);
    const key = `${object.material.uuid}|${object.castShadow}|${object.receiveShadow}|${object.renderOrder}|${object.layers.mask}|${layout}`;
    let batch = batches.get(key);
    if (!batch) batches.set(key, batch = { material: object.material, meshes: [] });
    batch.meshes.push(object);
    candidates.add(object);
  });

  const retainedGeometries = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !candidates.has(object)) retainedGeometries.add(object.geometry);
  });

  let mergedCount = 0;
  for (const batch of batches.values()) {
    if (batch.meshes.length < 2) continue;
    const geometries = batch.meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(rootInverse.clone().multiply(mesh.matrixWorld)));
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) continue;

    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, batch.material);
    mesh.name = `local-model-batch:${batch.material.name || batch.material.uuid}`;
    mesh.castShadow = batch.meshes[0].castShadow;
    mesh.receiveShadow = batch.meshes[0].receiveShadow;
    mesh.renderOrder = batch.meshes[0].renderOrder;
    mesh.layers.mask = batch.meshes[0].layers.mask;
    mesh.userData.localModel = true;
    root.add(mesh);
    for (const original of batch.meshes) {
      original.removeFromParent();
      if (!retainedGeometries.has(original.geometry)) original.geometry.dispose();
    }
    mergedCount += batch.meshes.length - 1;
  }
  return mergedCount;
}
