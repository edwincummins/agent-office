import * as THREE from 'three';
import { modelEffects } from './profile';

const EMISSION_CEILING = 2;
/** Additive glow layers sum with whatever is behind them (Fetty, 11-06: the lift sign blew out the screen). */
const ADDITIVE_CEILING = 0.45;

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
  const ceiling = material.blending === THREE.AdditiveBlending ? ADDITIVE_CEILING : EMISSION_CEILING;
  if (peak > 0) material.emissiveIntensity = Math.min(material.emissiveIntensity, ceiling / peak);
  // An additive layer also adds its own colour: keep that from stacking up past the bloom threshold too.
  if (material.blending === THREE.AdditiveBlending) material.opacity = Math.min(material.opacity, 0.5);
}
