import { modelScene, type ModelScene } from './scene';
import { modelLights, type ModelLights } from './lighting';
export interface ModelEffects {
  exposure: number;
  lights?: ModelLights;
  scene?: ModelScene;
  bloom: { strength: number; radius: number; threshold: number };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function range(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Invalid asset extras are ignored, never coerced into renderer settings. */
export function modelEffects(value: unknown): ModelEffects | null {
  if (!record(value) || Object.keys(value).some(k => !['exposure', 'bloom', 'lights', 'scene'].includes(k))) return null;
  const b = value.bloom;
  if (!range(value.exposure, .1, 2) || !record(b) || Object.keys(b).some(k => !['strength', 'radius', 'threshold'].includes(k))) return null;
  if (!range(b.strength, 0, 2) || !range(b.radius, 0, 1) || !range(b.threshold, 0, 10)) return null;
  const lights = value.lights === undefined ? undefined : modelLights(value.lights);
  const scene = value.scene === undefined ? undefined : modelScene(value.scene);
  if (lights === null || scene === null) return null;
  return { ...(scene ? { scene } : {}), ...(lights ? { lights } : {}), exposure: value.exposure, bloom: { strength: b.strength, radius: b.radius, threshold: b.threshold } };
}

export function modelSurface(value: unknown) {
  if (!record(value) || Object.keys(value).some(k => !['studioIntensity', 'additive', 'emissiveIntensity'].includes(k))) return null;
  if (value.studioIntensity !== undefined && !range(value.studioIntensity, 0, 4)) return null;
  if (value.emissiveIntensity !== undefined && !range(value.emissiveIntensity, 0, 8)) return null;
  if (value.additive !== undefined && typeof value.additive !== 'boolean') return null;
  return value as { studioIntensity?: number; additive?: boolean; emissiveIntensity?: number };
}

/** Warm-up and recovery hysteresis keep a cold shader compile from fixing quality for a visit. */
export class EffectsBudget {
  bloom = true;
  reduced = false;
  private warm = 4;
  private hold = 0;
  private elapsed = 0;
  private frames = 0;
  private healthy = 0;
  private slow = 0;
  frame(seconds: number, visible = true) {
    if (!visible) { this.elapsed = 0; this.frames = 0; this.healthy = 0; this.slow = 0; return; }
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    if (seconds <= .25) this.hold = Math.max(0, this.hold - seconds);
    if (this.warm > 0) { this.warm -= Math.min(seconds, .25); return; }
    if (seconds > .25) return;
    this.elapsed += seconds; this.frames++;
    if (this.elapsed < 2) return;
    const average = this.elapsed / this.frames;
    if (average >= .028) {
      this.healthy = 0;
      this.slow += this.elapsed;
      if (this.slow >= 12 && this.hold === 0) {
        this.slow = 0;
        if (this.bloom) { this.bloom = false; return this.finish('Bloom paused: sustained slow frames'); }
        if (!this.reduced) { this.reduced = true; return this.finish('Resolution reduced: sustained slow frames'); }
      }
    } else if (average < .015 - Number.EPSILON && (!this.bloom || this.reduced)) {
      this.slow = 0;
      this.healthy += this.elapsed;
      if (this.healthy >= 20 && this.hold === 0) {
        if (!this.bloom) {
          this.bloom = true; this.healthy = 0; this.warm = 4;
          return this.finish('Retrying bloom after sustained recovery');
        }
        this.reduced = false; this.healthy = 0;
        return this.finish('Resolution restored after sustained recovery');
      }
    } else { this.healthy = 0; this.slow = 0; }
    this.finish();
  }
  private finish(message?: string) {
    this.elapsed = 0; this.frames = 0;
    if (message) { this.hold = 60; this.healthy = 0; this.slow = 0; }
    return message;
  }
}
