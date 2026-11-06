export interface ModelEffects {
  exposure: number;
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
  if (!record(value) || Object.keys(value).some(k => !['exposure', 'bloom'].includes(k))) return null;
  const b = value.bloom;
  if (!range(value.exposure, .1, 2) || !record(b) || Object.keys(b).some(k => !['strength', 'radius', 'threshold'].includes(k))) return null;
  if (!range(b.strength, 0, 2) || !range(b.radius, 0, 1) || !range(b.threshold, 0, 10)) return null;
  return { exposure: value.exposure, bloom: { strength: b.strength, radius: b.radius, threshold: b.threshold } };
}

export function modelSurface(value: unknown) {
  if (!record(value) || Object.keys(value).some(k => !['studioIntensity', 'additive', 'emissiveIntensity'].includes(k))) return null;
  if (value.studioIntensity !== undefined && !range(value.studioIntensity, 0, 4)) return null;
  if (value.emissiveIntensity !== undefined && !range(value.emissiveIntensity, 0, 8)) return null;
  if (value.additive !== undefined && typeof value.additive !== 'boolean') return null;
  return value as { studioIntensity?: number; additive?: boolean; emissiveIntensity?: number };
}

/** Two sustained slow windows shed bloom first, then resolution. Never oscillates. */
export class EffectsBudget {
  bloom = true;
  reduced = false;
  private elapsed = 0;
  private frames = 0;
  frame(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > .25) return;
    this.elapsed += seconds; this.frames++;
    if (this.elapsed < 2) return;
    if (this.elapsed / this.frames > .018) {
      if (this.bloom) this.bloom = false;
      else this.reduced = true;
    }
    this.elapsed = 0; this.frames = 0;
  }
}
