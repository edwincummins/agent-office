import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { EffectsBudget } from '../src/client/features/model-effects/profile.ts';
import { FrameSamples } from '../src/client/core/frame-samples.ts';
register('./support/assets-loader.mjs', import.meta.url);

test('actual frameLoop caps do not masquerade as slow rAF; real slow frames degrade and healthy sixty Hz recovers', async () => {
 const keys = ['performance', 'document', 'requestAnimationFrame', 'addEventListener'] as const;
 const saved = keys.map(k => Object.getOwnPropertyDescriptor(globalThis, k));
 let now = 0, panel = false, pending: (t: number) => void = () => {};
 const listeners = new Map<string, () => void>();
 const values = [{ now: () => now }, { hidden: false, querySelector: () => panel ? {} : null }, (fn: (t: number) => void) => { pending = fn; return 1; }, (kind: string, fn: () => void) => listeners.set(kind, fn)];
 keys.forEach((key, i) => Object.defineProperty(globalThis, key, { configurable: true, value: values[i] }));
 try {
  const { frameLoop, installLoop } = await import('../src/client/core/loop.ts');
  const callbacks = new Map<string, ((f: any) => void)[]>();
  installLoop({ ticks: { add: (phase: string, fn: (f: any) => void) => callbacks.set(phase, [...(callbacks.get(phase) ?? []), fn]) }, view: { draw: () => { now += 5; } } } as never, {} as never, {} as never, {} as never);
  const measured = { delta: .016, dt: .016, t: 0, now, performance: new FrameSamples().take(.016, 60) };
  callbacks.get('render')![0](measured);
  assert.equal(measured.performance.renderCpuMs, 5);
  assert.equal(measured.performance.gpuMs, null);
  for (const mode of ['active', 'idle', 'panel', 'slow-panel']) {
   now = 0; panel = mode.includes('panel'); listeners.clear();
   const budget = new EffectsBudget(), changes: { at: number; message: string }[] = [];
   let tickMs = 0, rawMs = 0, draws = 0;
   const frame = frameLoop({ ticks: { run: f => {
    const sample = f.performance!;
    tickMs = f.delta * 1000; rawMs = sample.rawDelta * 1000;
    const message = budget.frame(sample.rawDelta, true, sample.samples);
    if (message) changes.push({ at: now / 1000, message });
   } } } as Parameters<typeof frameLoop>[0], { drew: () => draws++ });
   let started = false;
   const run = (seconds: number, dt: number) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) {
     now += dt * 1000;
     if (mode === 'active') listeners.get('pointermove')?.();
     if (!started) { frame(now); started = true; } else pending(now);
    }
   };
   if (mode === 'slow-panel') {
    run(100, .04);
    assert.equal(budget.bloom, false); assert.equal(budget.reduced, true);
    assert.ok(changes[0].at >= 16 && changes[0].at < 18, 'slow qualification uses real sampled seconds');
    assert.ok(changes[1].at - changes[0].at >= 60);
    run(130, 1 / 60);
    assert.equal(budget.bloom, true); assert.equal(budget.reduced, false);
    assert.equal(changes.length, 4);
    for (let i = 1; i < changes.length; i++) assert.ok(changes[i].at - changes[i - 1].at >= 60);
   } else {
    run(200, 1 / 60);
    assert.deepEqual(changes, [], mode);
    assert.ok(Math.abs(rawMs - 1000 / 60) < .001);
    assert.ok(Math.abs(tickMs - (mode === 'active' ? 1000 / 60 : mode === 'idle' ? 1000 / 30 : 1000 * 8 / 60)) < .001);
    assert.ok(draws > 1000);
   }
  }
 } finally {
  keys.forEach((key, i) => { if (saved[i]) Object.defineProperty(globalThis, key, saved[i]!); else Reflect.deleteProperty(globalThis, key); });
 }
});

test('skipped callback intervals contribute to the average; hidden and cold gaps are excluded', () => {
 const sample = new FrameSamples();
 sample.sample(0, true); sample.sample(40, true); sample.sample(50, true);
 const batch = sample.take(.05, 30);
 assert.equal(batch.samples, 2); assert.equal(batch.rawDelta, .025); assert.equal(batch.sampleElapsed, .05);
 sample.sample(1000, true); assert.equal(sample.take(.95, 30).samples, 0);
 sample.sample(1016, false); sample.sample(1032, true);
 assert.equal(sample.take(.032, 30).rawDelta, .016);
});

test('slow callbacks cannot be concealed by healthy final callbacks in capped batches', () => {
 const sampler = new FrameSamples(), budget = new EffectsBudget();
 let now = 0; const changes: number[] = [];
 sampler.sample(now, true);
 for (let batch = 0; batch < 800; batch++) {
  for (const delta of [.05, .01, .05, .01]) { now += delta * 1000; sampler.sample(now, true); }
  const sample = sampler.take(.12, 8);
  assert.ok(Math.abs(sample.rawDelta - .03) < 1e-10);
  if (budget.frame(sample.rawDelta, true, sample.samples)) changes.push(now / 1000);
 }
 assert.equal(budget.bloom, false); assert.equal(budget.reduced, true);
 assert.equal(changes.length, 2); assert.ok(changes[1] - changes[0] >= 60);
});
