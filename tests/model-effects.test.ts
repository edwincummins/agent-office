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
test('loaded 60 Hz frames keep quality; twelve seconds of 28 ms frames shed bloom before resolution', () => {
  const slow = new EffectsBudget();
  for (let i = 0; i < 600; i++) slow.frame(1 / 60);
  for (let i = 0; i < 3000; i++) slow.frame(.02);
  assert.equal(slow.bloom, true); assert.equal(slow.reduced, false);
  for (let i = 0; i < 8 * 34; i++) slow.frame(.03);
  assert.equal(slow.bloom, true); assert.equal(slow.reduced, false);
  for (let i = 0; i < 5 * 34; i++) slow.frame(.03);
  assert.equal(slow.bloom, false); assert.equal(slow.reduced, false);
  for (let i = 0; i < 8 * 34; i++) slow.frame(.03);
  assert.equal(slow.reduced, false);
  for (let i = 0; i < 55 * 34; i++) slow.frame(.03);
  assert.equal(slow.reduced, true);
  const normal = new EffectsBudget();
  for (let i = 0; i < 600; i++) normal.frame(1 / 60);
  normal.frame(NaN); normal.frame(100, false);
  assert.equal(normal.bloom, true); assert.equal(normal.reduced, false);
});
test('a loaded near-60 Hz display averaging 18 ms never sheds quality', () => {
  const b = new EffectsBudget();
  for (let i = 0; i < 2400; i++) b.frame(.018);
  assert.equal(b.bloom, true);
  assert.equal(b.reduced, false);
});
test('loaded 24–26 ms frames and occasional long frames keep quality', () => {
  const b = new EffectsBudget();
  for (let i = 0; i < 3000; i++) b.frame(i % 20 === 0 ? .06 : .026);
  assert.equal(b.bloom, true);
  assert.equal(b.reduced, false);
});
test('loaded 18–24 ms windows with occasional long frames keep quality', () => {
  const b = new EffectsBudget();
  for (let i = 0; i < 2400; i++) b.frame(i % 20 === 0 ? .06 : .021);
  assert.equal(b.bloom, true);
  assert.equal(b.reduced, false);
});
test('cold hitches are ignored and bloom retries after sustained healthy recovery', () => {
  const b = new EffectsBudget();
  b.frame(.538); b.frame(.456);
  for (let i = 0; i < 600; i++) b.frame(1 / 60);
  assert.equal(b.bloom, true);
  for (let i = 0; i < 8 * 34; i++) b.frame(.03);
  assert.equal(b.bloom, true);
  for (let i = 0; i < 7 * 34; i++) b.frame(.03);
  assert.equal(b.bloom, false);
  for (let i = 0; i < 6500; i++) b.frame(.01);
  assert.equal(b.bloom, true);
  for (let i = 0; i < 20; i++) b.frame(2, false);
  assert.equal(b.bloom, true);
});
test('reduced resolution recovers only after bloom returns and another sustained healthy period', () => {
  const b = new EffectsBudget();
  for (let i = 0; i < 600; i++) b.frame(1 / 60);
  for (let i = 0; i < 3200; i++) b.frame(.03);
  assert.equal(b.bloom, false);
  assert.equal(b.reduced, true);

  for (let i = 0; i < 6500; i++) b.frame(.01);
  assert.equal(b.bloom, true);
  assert.equal(b.reduced, true);
  for (let i = 0; i < 6500; i++) b.frame(.01);
  assert.equal(b.bloom, true);
  assert.equal(b.reduced, false);
});
test('leaving an opted-in model restores renderer settings and disables the filter', (t) => {
  const logs = t.mock.method(console, 'info', () => {});
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
    for (let i = 0; i < 3200; i++) ticks.get('hud')![0]({ delta: .03 });
    assert.equal(ratio, 1);
    for (let i = 0; i < 6500; i++) ticks.get('hud')![0]({ delta: .01 });
    assert.deepEqual(root.userData.officeEffectsRuntime, { bloom: true, reducedResolution: true });
    for (let i = 0; i < 6500; i++) ticks.get('hud')![0]({ delta: .01 });
    assert.equal(ratio, 1.25);
    assert.deepEqual(root.userData.officeEffectsRuntime, { bloom: true, reducedResolution: false });
    assert.equal(logs.mock.callCount(), 4, 'one console event per bloom or DPR transition');
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

test('scene controls reject malformed values and clamp IBL intensity', async () => {
  const { modelScene } = await import('../src/client/features/model-effects/scene.ts');
  assert.equal(modelScene({ environmentIntensity: 99 })!.environmentIntensity, 2);
  for (const bad of [null, [], { url: 'file://' }, { environmentIntensity: Infinity }, { background: 'blue' }, { fog: false }, { fog: { color: '#000000', near: 5, far: 4 } }, { fog: { color: '#000000', near: 0, far: 1001 } }]) assert.equal(modelEffects({ ...profile, scene: bad }), null);
});
test('a normal window breaks the consecutive slow-window streak and hidden time resets it', () => {
  const b = new EffectsBudget();
  for (let i = 0; i < 600; i++) b.frame(1 / 60);
  for (let i = 0; i < 78; i++) b.frame(.026);
  for (let i = 0; i < 78; i++) b.frame(.026);
  for (let i = 0; i < 100; i++) b.frame(.02);
  for (let i = 0; i < 78; i++) b.frame(.026);
  for (let i = 0; i < 78; i++) b.frame(.026);
  assert.equal(b.bloom, true);
  b.frame(1 / 60, false);
  for (let i = 0; i < 78; i++) b.frame(.026);
  assert.equal(b.bloom, true);
});
test('scene controls override sky ticks and restore scene references and mood chain', async () => {
  const { applyModelScene } = await import('../src/client/features/model-effects/scene.ts');
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#c8d8e5'); scene.fog = new THREE.Fog('#ffffff', 20, 100);
  const old = { background: scene.background, fog: scene.fog, intensity: scene.environmentIntensity };
  const environment = new THREE.Texture(); scene.environment = environment;
  const world = { mood: () => { (scene.background as THREE.Color).set('#ffffff'); scene.fog!.color.set('#ffffff'); scene.environmentIntensity = 1; } };
  const mood = world.mood;
  const restore = applyModelScene(world as never, scene, { environmentIntensity: .35, background: '#101826', fog: { color: '#101826', near: 200, far: 500 } });
  for (let i = 0; i < 3; i++) { world.mood(); assert.equal(scene.environmentIntensity, .35); assert.equal((scene.background as THREE.Color).getHex(), 0x101826); assert.equal(scene.fog!.color.getHex(), 0x101826); }
  assert.equal(scene.environment, environment);
  restore(); assert.equal(world.mood, mood); assert.equal(scene.background, old.background); assert.equal(scene.fog, old.fog); assert.equal(scene.environmentIntensity, old.intensity);
  assert.equal((scene.background as THREE.Color).getHex(), 0xc8d8e5);
});

test('environment tint validates and preserves original PMREM ownership', async () => {
  const { tintEnvironment } = await import('../src/client/features/model-effects/environment.ts');
  assert.equal(modelEffects({ ...profile, scene: { environmentTint: 'red' } }), null);
  assert.equal(modelEffects({ ...profile, scene: { environmentTint: '#ffc890' } })!.scene!.environmentTint, '#ffc890');
  const scene = new THREE.Scene(), original = new THREE.Texture({ width: 768, height: 1024 });
  original.mapping = THREE.CubeUVReflectionMapping; scene.environment = original;
  let sourceDisposed = false; original.addEventListener('dispose', () => { sourceDisposed = true; });
  const previous = new THREE.WebGLRenderTarget(1, 1); let current = previous, renders = 0;
  const renderer = { getRenderTarget: () => current, setRenderTarget: (t: THREE.WebGLRenderTarget) => { current = t; }, render: (quad: THREE.Scene) => {
    renders++; const m = (quad.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
    assert.equal(m.uniforms.source.value, original); assert.equal(m.uniforms.tint.value.getHex(), 0xffc890);
    assert.equal(current.width, 768); assert.equal(current.height, 1024);
  } };
  const restore = tintEnvironment(renderer as never, scene, '#ffc890');
  assert.equal(renders, 1); assert.equal(current, previous); assert.notEqual(scene.environment, original);
  assert.equal(scene.environment!.mapping, THREE.CubeUVReflectionMapping);
  restore(); assert.equal(scene.environment, original); assert.equal(sourceDisposed, false);
  scene.environment = null; tintEnvironment(renderer as never, scene, '#ffffff')(); assert.equal(renders, 1);
});

test('maps without a valid effects profile never allocate or change renderer quality', (t) => {
  const prepare = t.mock.method(ModelBloom.prototype, 'prepare', () => {});
  const log = t.mock.method(console, 'info', () => {});
  for (const style of ['office', 'model']) {
    const group = new THREE.Group();
    let ratio = 1.25;
    const renderer = { toneMapping: THREE.AgXToneMapping, toneMappingExposure: .8, getPixelRatio: () => ratio, setPixelRatio: (n: number) => { ratio = n; } };
    const ticks = new Map<string, ((f: { delta: number }) => void)[]>();
    installModelEffects({ renderer, world: () => ({ group }), upTop: () => false, plan: () => ({ style }), ticks: { add: (p: string, fn: (f: { delta: number }) => void) => ticks.set(p, [...(ticks.get(p) ?? []), fn]) }, view: { add() {} } } as never);
    for (let i = 0; i < 6000; i++) ticks.get('hud')![0]({ delta: .03 });
    assert.equal(ratio, 1.25); assert.equal(renderer.toneMapping, THREE.AgXToneMapping);
    assert.equal(renderer.toneMappingExposure, .8);
  }
  assert.equal(prepare.mock.callCount(), 0); assert.equal(log.mock.callCount(), 0);
});
