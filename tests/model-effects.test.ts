import { applyModelLights } from '../src/client/features/model-effects/lighting.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectsBudget, modelEffects, modelSurface } from '../src/client/features/model-effects/profile.ts';
import * as THREE from 'three';
import { ModelBloom } from '../src/client/features/model-effects/filter.ts';
import { installModelEffects } from '../src/client/features/model-effects/index.ts';

const profile = { exposure: 1, bloom: { strength: .9, radius: .3, threshold: 3.5 } };
test('bounded opt-in profile; absent and malformed extras leave the renderer alone', () => {
  assert.deepEqual(modelEffects(profile), profile);
  for (const bad of [null, undefined, [], {}, { ...profile, exposure: NaN }, { ...profile, exposure: 100 }, { ...profile, url: 'file://' }, { ...profile, bloom: { ...profile.bloom, strength: -1 } }]) assert.equal(modelEffects(bad), null);
  assert.equal(modelSurface({ studioIntensity: Infinity }), null);
  assert.equal(modelSurface({ additive: 'true' }), null);
  assert.equal(modelSurface({ envMap: 'file://' }), null);
  assert.deepEqual(modelSurface({ studioIntensity: 2.2, additive: true }), { studioIntensity: 2.2, additive: true });
});
test('sustained slow frames shed bloom before resolution; healthy frames do neither', () => {
  const slow = new EffectsBudget();
  for (let i = 0; i < 250; i++) slow.frame(1 / 60);
  for (let i = 0; i < 101; i++) slow.frame(.02);
  assert.equal(slow.bloom, false); assert.equal(slow.reduced, false);
  for (let i = 0; i < 101; i++) slow.frame(.02);
  assert.equal(slow.reduced, true);
  const normal = new EffectsBudget();
  for (let i = 0; i < 600; i++) normal.frame(1 / 60);
  normal.frame(NaN); normal.frame(100, false);
  assert.equal(normal.bloom, true); assert.equal(normal.reduced, false);
});
test('cold hitches are ignored and bloom retries after sustained healthy recovery', () => {
  const b = new EffectsBudget();
  b.frame(.538); b.frame(.456);
  for (let i = 0; i < 600; i++) b.frame(1 / 60);
  assert.equal(b.bloom, true);
  for (let i = 0; i < 200; i++) b.frame(.03);
  assert.equal(b.bloom, false);
  for (let i = 0; i < 1000; i++) b.frame(1 / 60);
  assert.equal(b.bloom, true);
  for (let i = 0; i < 20; i++) b.frame(2, false);
  assert.equal(b.bloom, true);
});
test('leaving an opted-in model restores renderer settings and disables the filter', (t) => {
  t.mock.method(ModelBloom.prototype, 'prepare', () => {});
  const group = new THREE.Group(), root = new THREE.Group();
  root.userData.officeEffects = profile; group.add(root);
  let ratio = 1.25, rooftop = false;
  const renderer = { toneMapping: THREE.AgXToneMapping, toneMappingExposure: .8, getPixelRatio: () => ratio, setPixelRatio: (n: number) => { ratio = n; } };
  const ticks = new Map<string, ((f: { delta: number }) => void)[]>();
  let filter: { begin(): boolean };
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: { hidden: false }, configurable: true });
  try {
    installModelEffects({ renderer, world: () => ({ group }), upTop: () => rooftop, plan: () => ({ style: 'model' }), ticks: { add: (p: string, fn: (f: { delta: number }) => void) => ticks.set(p, [...(ticks.get(p) ?? []), fn]) }, view: { add: (e: { filter: typeof filter }) => { filter = e.filter; } } } as never);
    ticks.get('hud')![0]({ delta: 1 / 60 });
    assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
    assert.equal(renderer.toneMappingExposure, 1);
    rooftop = true; ticks.get('pre')![0]({ delta: 1 / 60 });
    assert.equal(renderer.toneMapping, THREE.AgXToneMapping);
    assert.equal(renderer.toneMappingExposure, .8); assert.equal(ratio, 1.25);
    assert.equal(filter!.begin(), false);
  } finally {
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('room light profile clamps finite intensities and rejects malformed values', () => {
  const lights = { hemi: { sky: '#ffd9a8', ground: '#2a2d33', intensity: -5 }, directional: { color: '#ffb46b', intensity: 99 } };
  const parsed = modelEffects({ ...profile, lights })!;
  assert.equal(parsed.lights!.hemi.intensity, 0); assert.equal(parsed.lights!.directional.intensity, 2);
  for (const bad of [null, {}, { ...lights, extra: true }, { ...lights, directional: { color: 'red', intensity: 1 } }, { ...lights, hemi: { ...lights.hemi, intensity: NaN } }]) assert.equal(modelEffects({ ...profile, lights: bad }), null);
  assert.equal(modelEffects(profile)!.lights, undefined);
});
test('room lights replace daylight on every mood tick and restore colours/intensities on leave', () => {
  const hemi = new THREE.HemisphereLight('#aabbcc', '#112233', .65), sun = new THREE.DirectionalLight('#ffeedd', 1.8);
  const original = () => { hemi.intensity = .65; sun.intensity = 1.8; };
  const world = { mood: original };
  const old = [hemi.color.getHex(), hemi.groundColor.getHex(), sun.color.getHex()];
  const restore = applyModelLights(world as never, { hemi: { sky: '#ffd9a8', ground: '#2a2d33', intensity: .45 }, directional: { color: '#ffb46b', intensity: .5 } });
  for (let i = 0; i < 3; i++) {
    (world.mood as Function)({ hemi, sun }, 1, 0);
    assert.equal(hemi.intensity, .45); assert.equal(sun.intensity, .5);
    assert.equal(sun.color.getHex(), 0xffb46b);
  }
  restore(); assert.equal(world.mood, original);
  assert.deepEqual([hemi.color.getHex(), hemi.groundColor.getHex(), sun.color.getHex()], old);
  assert.equal(hemi.intensity, .65); assert.equal(sun.intensity, 1.8);
});
