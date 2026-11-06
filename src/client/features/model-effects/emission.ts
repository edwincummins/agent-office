import * as THREE from 'three';
import { modelEffects } from './profile';

const EMISSION_CEILING = 2;

/** Preserve authored glow colour below a validated model-effects root. */
export function authoredEmissionMaterials(root: THREE.Object3D): Set<THREE.Material> {
  const materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (!modelEffects(node.userData.officeEffects)) return;
    node.traverse(child => {
      if (child instanceof THREE.Mesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
    });
  });
  return materials;
}

/** Bound effective linear emission without changing its hue, texture, or bloom threshold. */
export function limitEmission(material: THREE.MeshStandardMaterial): void {
  const peak = Math.max(material.emissive.r, material.emissive.g, material.emissive.b);
  if (peak > 0) material.emissiveIntensity = Math.min(material.emissiveIntensity, EMISSION_CEILING / peak);
}
