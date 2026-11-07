import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { skyNow, sunPosition } from '../../../shared/sun';
import type { SkyState } from '../../../shared/protocol';

export function atmosphereProfile(value: unknown): { hideMaterials: string[] } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  if (p.enabled !== true || Object.keys(p).some(k => !['enabled', 'hideMaterials'].includes(k))) return null;
  if (!Array.isArray(p.hideMaterials) || p.hideMaterials.length > 8 || !p.hideMaterials.every(n => typeof n === 'string' && /^sky-[\w-]{1,60}$/.test(n))) return null;
  return { hideMaterials: p.hideMaterials as string[] };
}

export function atmosphereSample(state: SkyState, now: number) {
  const sun = sunPosition(skyNow(now, state), state.lat, state.lon);
  const cover = state.weather === 'clear' ? 0 : state.weather === 'cloudy' ? .6 : 1;
  return { sun, turbidity: 2 + 10 * cover, mie: .003 + .025 * cover, rayleigh: 2 - cover };
}

/** One analytic sky draw; authored backdrop geometry is retained and restored on departure. */
export function modelAtmosphere(root: THREE.Object3D, profile: { hideMaterials: string[] }) {
  const sky = new Sky();
  sky.name = 'office-atmosphere';
  sky.scale.setScalar(1000);
  sky.renderOrder = -1000;
  sky.material.depthWrite = false;
  sky.material.fog = false;
  const hidden: { mesh: THREE.Mesh; visible: boolean }[] = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.length || !materials.every(m => profile.hideMaterials.includes(m.name))) return;
    hidden.push({ mesh: object, visible: object.visible });
    object.visible = false;
  });
  const u = sky.material.uniforms;
  return {
    sky,
    update(state: SkyState, now: number, camera: THREE.Camera, delta: number) {
      const sample = atmosphereSample(state, now);
      const blend = 1 - Math.exp(-Math.max(0, Math.min(delta, 1)) / 3);
      sky.position.copy(camera.position);
      u.sunPosition.value.set(Math.cos(sample.sun.el) * Math.sin(sample.sun.az), Math.sin(sample.sun.el), -Math.cos(sample.sun.el) * Math.cos(sample.sun.az));
      for (const [key, value] of [['turbidity', sample.turbidity], ['mieCoefficient', sample.mie], ['rayleigh', sample.rayleigh]] as const)
        u[key].value += (value - u[key].value) * blend;
      u.mieDirectionalG.value = .8;
    },
    dispose() {
      for (const entry of hidden) entry.mesh.visible = entry.visible;
      sky.removeFromParent(); sky.geometry.dispose(); sky.material.dispose();
    },
  };
}
