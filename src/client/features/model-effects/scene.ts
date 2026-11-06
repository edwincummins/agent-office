import * as THREE from 'three';
import type { World } from '../../world/world';

export interface ModelScene {
  environmentIntensity?: number;
  background?: string;
  fog?: { color: string; near: number; far: number };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const color = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function modelScene(v: unknown): ModelScene | null {
  if (!record(v) || Object.keys(v).some(k => !['environmentIntensity', 'background', 'fog'].includes(k))) return null;
  if (v.environmentIntensity !== undefined && !finite(v.environmentIntensity)) return null;
  if (v.background !== undefined && !color(v.background)) return null;
  const f = v.fog;
  if (f !== undefined && (!record(f) || Object.keys(f).some(k => !['color', 'near', 'far'].includes(k)) || !color(f.color) || !finite(f.near) || !finite(f.far) || f.near < 0 || f.far <= f.near || f.far > 1000)) return null;
  return { ...v, ...(finite(v.environmentIntensity) ? { environmentIntensity: Math.max(0, Math.min(2, v.environmentIntensity)) } : {}) } as ModelScene;
}

/** Apply after the sky's mood, then restore the exact previous scene references on exit. */
export function applyModelScene(world: World, scene: THREE.Scene, profile: ModelScene): () => void {
  const previous = world.mood;
  const old = { environmentIntensity: scene.environmentIntensity, background: scene.background, fog: scene.fog };
  const background = profile.background === undefined ? undefined : new THREE.Color(profile.background);
  const fog = profile.fog === undefined ? undefined : new THREE.Fog(profile.fog.color, profile.fog.near, profile.fog.far);
  const apply = () => {
    if (profile.environmentIntensity !== undefined) scene.environmentIntensity = profile.environmentIntensity;
    if (background) { background.set(profile.background!); scene.background = background; }
    if (fog !== undefined) {
      if (fog && profile.fog) { fog.color.set(profile.fog.color); fog.near = profile.fog.near; fog.far = profile.fog.far; }
      scene.fog = fog;
    }
  };
  const mood: NonNullable<World['mood']> = (...args) => { previous?.apply(world, args); apply(); };
  world.mood = mood; apply();
  return () => { if (world.mood === mood) world.mood = previous; Object.assign(scene, old); };
}
