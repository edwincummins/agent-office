import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectsBudget, modelEffects, modelSurface } from '../src/client/features/model-effects/profile.ts';

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
