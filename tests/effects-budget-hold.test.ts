import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectsBudget } from '../src/client/features/model-effects/profile.ts';

function advance(b: EffectsBudget, seconds: number, dt: number, changes: string[] = []) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const message = b.frame(dt);
    if (message) changes.push(message);
  }
  return changes;
}
function shedBloom() {
  const b = new EffectsBudget();
  while (b.bloom) b.frame(.03);
  return b;
}

test('all quality transitions share a sixty-second hold during three minutes of oscillation', () => {
  const b = new EffectsBudget(), times: number[] = [];
  let time = 0;
  while (time < 180) {
    const phase = Math.floor(time / 40) % 2;
    const dt = phase ? .01 : (Math.floor(time / 2) % 2 ? .029 : .028);
    time += dt;
    if (b.frame(dt)) times.push(time);
  }
  assert.ok(times.length >= 2 && times.length <= 3, String(times));
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 60, String(times));
});

test('healthy frames cannot undo a reduction within sixty seconds; each transition emits once', () => {
  const b = shedBloom(), messages: string[] = [];
  for (let i = 0; i < 100; i++) { b.frame(1); b.frame(1, false); }
  advance(b, 59, .01, messages);
  assert.equal(b.bloom, false); assert.equal(messages.length, 0);
  advance(b, 4, .01, messages);
  assert.equal(b.bloom, true); assert.equal(messages.length, 1);
  advance(b, 30, .01, messages);
  assert.equal(messages.length, 1);
});

test('recovery requires twenty sustained seconds below fifteen ms after the hold', () => {
  const b = shedBloom();
  advance(b, 65, .02); // expires hold, but is not healthy enough to recover
  advance(b, 14, .01); assert.equal(b.bloom, false);
  advance(b, 4, .018); // breaks healthy-window streak
  advance(b, 14, .01); assert.equal(b.bloom, false);
  advance(b, 9, .01); assert.equal(b.bloom, true);
});

test('entry warm-up and cold/hidden handling remain conservative', () => {
  const b = new EffectsBudget();
  for (let i = 0; i < 16; i++) assert.equal(b.frame(.5), undefined); // four seconds warm-up credit
  advance(b, 10, .03); assert.equal(b.bloom, true);
  b.frame(100); b.frame(100, false); // stall excluded; hidden resets slow streak
  advance(b, 10, .03); assert.equal(b.bloom, true);
  advance(b, 4, .03); assert.equal(b.bloom, false);
});

test('fifteen ms average is not below the recovery threshold', () => {
  const b = shedBloom();
  advance(b, 90, .015);
  assert.equal(b.bloom, false);
});
