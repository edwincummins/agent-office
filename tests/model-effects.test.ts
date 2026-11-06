import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectsBudget, modelEffects, modelSurface } from '../src/client/features/model-effects/profile.ts';
import * as THREE from 'three';
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
  for (let i = 0; i < 101; i++) slow.frame(.02);
  assert.equal(slow.bloom, false); assert.equal(slow.reduced, false);
  for (let i = 0; i < 101; i++) slow.frame(.02);
  assert.equal(slow.reduced, true);
  const normal = new EffectsBudget();
  for (let i = 0; i < 600; i++) normal.frame(1 / 60);
  normal.frame(NaN); normal.frame(100, false);
  assert.equal(normal.bloom, true); assert.equal(normal.reduced, false);
});
test('very slow visible frames still shed effects, hidden windows do not', () => {
  const b = new EffectsBudget();
  b.frame(10, false); assert.equal(b.bloom, true);
  for (let i = 0; i < 4; i++) b.frame(.5);
  assert.equal(b.bloom, false);
});
test('leaving an opted-in model restores renderer settings and disables the filter', () => {
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
