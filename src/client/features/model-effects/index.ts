import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Ctx } from '../../core/context';
import { ModelBloom } from './filter';
import { EffectsBudget, modelEffects, modelSurface } from './profile';

export function installModelEffects(ctx: Ctx) {
  let root: THREE.Object3D | null = null;
  let bloom: ModelBloom | null = null;
  let budget = new EffectsBudget();
  let studio: THREE.WebGLRenderTarget | null = null;
  let restore: (() => void) | null = null;
  const clear = () => { restore?.(); restore = null; bloom?.dispose(); bloom = null; studio?.dispose(); studio = null; root = null; };
  // Restore before model-map's HUD hook restores the stock renderer on departure.
  ctx.ticks.add('pre', () => {
    if (root && (ctx.upTop() || !ctx.world().group.getObjectById(root.id))) clear();
  });
  ctx.ticks.add('hud', ({ delta }) => {
    if (ctx.upTop()) return;
    if (!root && ctx.plan().style === 'model') {
      let found: THREE.Object3D | null = null;
      ctx.world().group.traverse(o => { if (!found && modelEffects(o.userData.officeEffects)) found = o; });
      if (found) activate(found);
    }
    if (root) {
      budget.frame(delta);
      if (budget.reduced && ctx.renderer.getPixelRatio() > 1) ctx.renderer.setPixelRatio(1);
    }
  });
  ctx.view.add({ filter: {
    begin() { if (!bloom || !budget.bloom) return false; bloom.begin(); return true; },
    end() { bloom?.end(); },
  } });

  function activate(object: THREE.Object3D) {
    const profile = modelEffects(object.userData.officeEffects)!;
    root = object; budget = new EffectsBudget();
    const renderer = ctx.renderer;
    const tone = renderer.toneMapping, exposure = renderer.toneMappingExposure, ratio = renderer.getPixelRatio();
    const materialRestores: (() => void)[] = [];
    const seen = new Set<THREE.Material>();
    object.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!(m instanceof THREE.MeshStandardMaterial) || seen.has(m)) continue;
        seen.add(m);
        const surface = modelSurface(m.userData.officeSurface);
        if (!surface) continue;
        const old = { envMap: m.envMap, envMapIntensity: m.envMapIntensity, blending: m.blending, transparent: m.transparent, depthWrite: m.depthWrite, emissiveIntensity: m.emissiveIntensity };
        materialRestores.push(() => { Object.assign(m, old); m.needsUpdate = true; });
        if (surface.studioIntensity !== undefined) {
          if (!studio) {
            const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
            studio = pmrem.fromScene(room, .04); room.dispose(); pmrem.dispose();
          }
          m.envMap = studio.texture; m.envMapIntensity = surface.studioIntensity;
        }
        if (surface.additive) { m.blending = THREE.AdditiveBlending; m.transparent = true; m.depthWrite = false; }
        if (surface.emissiveIntensity !== undefined) m.emissiveIntensity = surface.emissiveIntensity;
        m.needsUpdate = true;
      }
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = profile.exposure;
    bloom = new ModelBloom(renderer, profile);
    restore = () => {
      renderer.toneMapping = tone; renderer.toneMappingExposure = exposure; renderer.setPixelRatio(ratio);
      materialRestores.forEach(fn => fn());
    };
  }
}
