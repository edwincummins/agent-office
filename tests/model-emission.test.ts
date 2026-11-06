import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { modelEffects } from '../src/client/features/model-effects/profile.ts';
import { authoredEmissionMaterials, limitEmission } from '../src/client/features/model-effects/emission.ts';
import { installModelEffects } from '../src/client/features/model-effects/index.ts';
import { ModelBloom } from '../src/client/features/model-effects/filter.ts';

const profile = { exposure: 1, bloom: { strength: .9, radius: .3, threshold: 3.5 } };

test('emission ceiling is optional, clamps finite values, and rejects malformed input', () => {
  assert.deepEqual(modelEffects(profile), profile);
  assert.equal(modelEffects({ ...profile, emissiveCeiling: -1 })!.emissiveCeiling, 0);
  assert.equal(modelEffects({ ...profile, emissiveCeiling: 99 })!.emissiveCeiling, 8);
  for (const emissiveCeiling of [NaN, Infinity, null, '2', true]) assert.equal(modelEffects({ ...profile, emissiveCeiling }), null);
});

test('only validated ceiling-enabled roots preserve authored glow materials', () => {
  const root = new THREE.Group(), opted = new THREE.Group(); root.add(opted);
  const authored = new THREE.MeshStandardMaterial(), outside = new THREE.MeshStandardMaterial();
  opted.add(new THREE.Mesh(new THREE.BoxGeometry(), authored)); root.add(new THREE.Mesh(new THREE.BoxGeometry(), outside));
  for (const value of [undefined, profile, { ...profile, emissiveCeiling: NaN }]) {
    opted.userData.officeEffects = value;
    assert.equal(authoredEmissionMaterials(root).size, 0);
  }
  opted.userData.officeEffects = { ...profile, emissiveCeiling: 0 };
  assert.deepEqual([...authoredEmissionMaterials(root)], [authored]);
});

test('effective RGB emission is capped without whitening or replacing its texture', () => {
  const material = new THREE.MeshStandardMaterial();
  material.emissive.setRGB(.5, .25, .05); material.emissiveIntensity = 7;
  const map = material.emissiveMap = new THREE.Texture();
  limitEmission(material, 2);
  assert.equal(material.emissiveIntensity, 4);
  assert.deepEqual(material.emissive.toArray(), [.5, .25, .05]);
  assert.equal(material.emissiveMap, map);
  limitEmission(material, 8); assert.equal(material.emissiveIntensity, 4);
  limitEmission(material, 0); assert.equal(material.emissiveIntensity, 0);
  material.emissive.setRGB(0, 0, 0); material.emissiveIntensity = 1;
  limitEmission(material, 0); assert.equal(Number.isFinite(material.emissiveIntensity), true);
});

test('ceiling runs after surface overrides and restores on leave and reentry', t => {
  t.mock.method(ModelBloom.prototype, 'prepare', () => {});
  const group = new THREE.Group(), root = new THREE.Group(); group.add(root);
  root.userData.officeEffects = { ...profile, emissiveCeiling: 2 };
  const overridden = new THREE.MeshStandardMaterial(), plain = new THREE.MeshStandardMaterial();
  overridden.emissive.setRGB(1, .5, .1); overridden.emissiveIntensity = 7;
  overridden.userData.officeSurface = { emissiveIntensity: 8, additive: true };
  plain.emissive.setRGB(.5, .1, .05); plain.emissiveIntensity = 7;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), overridden), new THREE.Mesh(new THREE.BoxGeometry(), plain));
  let rooftop = false, ratio = 1;
  const renderer = { toneMapping: THREE.AgXToneMapping, toneMappingExposure: .8, getPixelRatio: () => ratio, setPixelRatio: (n: number) => { ratio = n; } };
  const ticks = new Map<string, (() => void)[]>();
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  try {
    installModelEffects({ renderer, world: () => ({ group }), upTop: () => rooftop, plan: () => ({ style: 'model' }),
      ticks: { add: (phase: string, fn: () => void) => ticks.set(phase, [...(ticks.get(phase) ?? []), fn]) }, view: { add() {} } } as never);
    const hud = () => (ticks.get('hud')![0] as (f: {delta: number}) => void)({ delta: 1 / 60 });
    for (let i = 0; i < 2; i++) {
      rooftop = false; hud();
      assert.equal(overridden.emissiveIntensity, 2); assert.equal(plain.emissiveIntensity, 4);
      assert.equal(overridden.blending, THREE.AdditiveBlending);
      assert.deepEqual(overridden.emissive.toArray(), [1, .5, .1]);
      rooftop = true; ticks.get('pre')![0]();
      assert.equal(overridden.emissiveIntensity, 7); assert.equal(plain.emissiveIntensity, 7);
      assert.equal(overridden.blending, THREE.NormalBlending);
      assert.equal(overridden.transparent, false); assert.equal(overridden.depthWrite, true);
    }
    root.userData.officeEffects = profile; rooftop = false; hud();
    assert.equal(overridden.emissiveIntensity, 8); assert.equal(plain.emissiveIntensity, 7);
    rooftop = true; ticks.get('pre')![0]();
  } finally {
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
