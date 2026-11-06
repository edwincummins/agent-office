import * as THREE from 'three';
import { modelEffects } from './profile';

/** Preserve authored glow colour only below a validated, ceiling-enabled model root. */
export function authoredEmissionMaterials(root: THREE.Object3D): Set<THREE.Material> {
  const materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (modelEffects(node.userData.officeEffects)?.emissiveCeiling === undefined) return;
    node.traverse(child => {
      if (child instanceof THREE.Mesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
    });
  });
  return materials;
}

/** Bound effective linear emission without changing its hue, texture, or bloom threshold. */
export function limitEmission(material: THREE.MeshStandardMaterial, ceiling: number): void {
  const peak = Math.max(material.emissive.r, material.emissive.g, material.emissive.b);
  if (peak > 0) material.emissiveIntensity = Math.min(material.emissiveIntensity, ceiling / peak);
}
