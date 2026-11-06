import * as THREE from 'three';
import { isCachedToon } from './toon';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Like toon(), these immutable palettes live across world rebuilds. Do not clone per fixture.
const palettes = new Map<string, THREE.MeshToonMaterial>();

/** Call during construction only, on fixtures whose mesh transforms are static.
 * Groups remain intact so hinges/pivots can animate; materials stay shared so lights can change.
 * Interactive meshes and transparent effects retain their identity and sorting.
 */
export function batchStaticParts(root: THREE.Object3D) {
  for (const child of [...root.children]) if (!(child instanceof THREE.Mesh)) batchStaticParts(child);
  const paletteKeys = new Map<THREE.Material, string>();
  const paletteKey = (material: THREE.Material) => {
    if (!isCachedToon(material) || material.vertexColors) return material.uuid;
    let key = paletteKeys.get(material);
    if (!key) {
      const data = material.toJSON();
      // Only diffuse colour differs. Retain every lighting, texture and render setting.
      const { uuid: _uuid, color: _color, ...settings } = data;
      key = JSON.stringify(settings);
      paletteKeys.set(material, key);
    }
    return key;
  };
  const batches = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
  for (const child of root.children) {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.SkinnedMesh || child instanceof THREE.InstancedMesh || Array.isArray(child.material)) continue;
    if (child.children.length || !child.visible || child.material.transparent || Object.keys(child.userData).length || Object.keys(child.geometry.morphAttributes).length || child.geometry.hasAttribute('color')) continue;
    const key = `${paletteKey(child.material)}/${child.castShadow}/${child.receiveShadow}/${child.renderOrder}/${child.layers.mask}`;
    const list = batches.get(key) ?? []; list.push(child); batches.set(key, list);
  }
  for (const parts of batches.values()) {
    if (parts.length < 2) continue;
    const useColors = parts.some(part => part.material !== parts[0].material);
    const copies = parts.map(part => {
      part.updateMatrix();
      const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      if (useColors) {
        const color = (part.material as THREE.MeshToonMaterial).color;
        const values = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < values.length; i += 3) color.toArray(values, i);
        geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
      }
      return geometry.applyMatrix4(part.matrix);
    });
    const merged = mergeGeometries(copies, false);
    for (const copy of copies) copy.dispose();
    if (!merged) continue;
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    const first = parts[0];
    let material = first.material;
    if (useColors) {
      const key = paletteKey(material);
      let palette = palettes.get(key);
      if (!palette) {
        palette = (material as THREE.MeshToonMaterial).clone();
        palette.color.set(0xffffff); palette.vertexColors = true;
        palettes.set(key, palette);
      }
      material = palette;
    }
    const batch = new THREE.Mesh(merged, material);
    batch.name = 'static-fixture-batch'; batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow; batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask;
    for (const part of parts) part.removeFromParent();
    root.add(batch);
  }
}
