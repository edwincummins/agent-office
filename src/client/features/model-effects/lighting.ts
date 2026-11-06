import type { World } from '../../world/world';

export interface ModelLights {
  hemi: { sky: string; ground: string; intensity: number };
  directional: { color: string; intensity: number };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const color = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const intensity = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function modelLights(value: unknown): ModelLights | null {
  if (!object(value) || Object.keys(value).some(k => !['hemi', 'directional'].includes(k))) return null;
  const h = value.hemi, d = value.directional;
  if (!object(h) || !object(d) || Object.keys(h).some(k => !['sky', 'ground', 'intensity'].includes(k)) || Object.keys(d).some(k => !['color', 'intensity'].includes(k))) return null;
  if (!color(h.sky) || !color(h.ground) || !color(d.color) || !intensity(h.intensity) || !intensity(d.intensity)) return null;
  const clamp = (n: number) => Math.max(0, Math.min(2, n));
  return { hemi: { sky: h.sky, ground: h.ground, intensity: clamp(h.intensity) }, directional: { color: d.color, intensity: clamp(d.intensity) } };
}

/** Replaces the existing daylight contribution, adding no lights or shadow passes. */
export function applyModelLights(world: World, profile: ModelLights): () => void {
  const previous = world.mood;
  let restoreLights: (() => void) | undefined;
  const mood: NonNullable<World['mood']> = (lights, ...args) => {
    previous?.call(world, lights, ...args);
    const { hemi, sun } = lights;
    if (!restoreLights) {
      const sky = hemi.color.clone(), ground = hemi.groundColor.clone(), directional = sun.color.clone();
      const hi = hemi.intensity, si = sun.intensity;
      restoreLights = () => { hemi.color.copy(sky); hemi.groundColor.copy(ground); hemi.intensity = hi; sun.color.copy(directional); sun.intensity = si; };
    }
    hemi.color.set(profile.hemi.sky); hemi.groundColor.set(profile.hemi.ground); hemi.intensity = profile.hemi.intensity;
    sun.color.set(profile.directional.color); sun.intensity = profile.directional.intensity;
  };
  world.mood = mood;
  return () => { if (world.mood === mood) world.mood = previous; restoreLights?.(); };
}
