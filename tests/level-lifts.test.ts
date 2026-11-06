import test from 'node:test';
import assert from 'node:assert/strict';
import { levelsHandlers } from '../src/server/ws/handlers/levels.js';
import { planMap } from '../src/shared/maps/index.js';
import { TWO_LEVEL_MAP } from './fixtures/two-level-map.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';
import type { LevelsServerMsg } from '../src/shared/protocol/levels.js';

function harness() {
  const plan = planMap(TWO_LEVEL_MAP),
    sent: LevelsServerMsg[] = [];
  const client = (id: string, x = 10, y = 0, z = -1.5, floor = 'one') => ({ id, peer: { x, y, z, floor }, throttles: new Map() }) as Client;
  const a = client('rider'),
    b = client('neighbor'),
    other = client('other', 10, 0, -1.5, 'two');
  const ctx = {
    maps: { plan: () => plan },
    floorOf: (c: Client) => (c.peer.floor ? { id: c.peer.floor } : undefined),
    clients: new Map([a, b, other].map((c) => [c.id, c])),
    sendTo: (_c: Client, msg: LevelsServerMsg) => sent.push(msg),
    toFloor: (_f: unknown, msg: LevelsServerMsg) => sent.push(msg),
  } as unknown as Ctx;
  return { ctx, a, b, other, sent };
}

test('lift rides are floor-local, capture co-riders, and wait for door closure', () => {
  const { ctx, a, sent } = harness();
  const before = Date.now();
  levelsHandlers['levels.lift'](ctx, a, { t: 'levels.lift', id: 'lift', stop: 1 });
  const m = sent[0].motions[0];
  assert.deepEqual(m.riders, ['rider', 'neighbor']);
  assert.equal(m.from, 0);
  assert.equal(m.to, 3);
  assert.ok(m.started >= before + 600);
  a.throttles.clear();
  levelsHandlers['levels.lift'](ctx, a, { t: 'levels.lift', id: 'lift', stop: 0 });
  assert.equal(sent.length, 1, 'cannot reverse while doors close or the car moves');
});

test('malformed, distant and wrong-floor lift requests have no effect', () => {
  for (const stop of [-1, 2, NaN, Infinity, 0.5]) {
    const { ctx, a, sent } = harness();
    levelsHandlers['levels.lift'](ctx, a, { t: 'levels.lift', id: 'lift', stop });
    assert.equal(sent.length, 0);
  }
  const { ctx, a, sent } = harness();
  a.peer.x = 0;
  a.peer.z = -8;
  levelsHandlers['levels.lift'](ctx, a, { t: 'levels.lift', id: 'lift', stop: 1 });
  assert.equal(sent.length, 0);
  a.throttles.clear();
  a.peer.x = 10;
  a.peer.z = 0.5;
  levelsHandlers['levels.lift'](ctx, a, { t: 'levels.lift', id: 'lift', stop: 1 });
  assert.equal(sent.length, 0, 'a ground landing cannot send the car away');
});

test('upper landing can call the car without teleporting a waiting rider', () => {
  const { ctx, a, sent } = harness();
  a.peer.y = 3;
  a.peer.z = 0.5;
  levelsHandlers['levels.lift'](ctx, a, { t: 'levels.lift', id: 'lift', stop: 1 });
  assert.equal(sent.length, 1);
  assert.ok(!sent[0].motions[0].riders.includes(a.id));
});

test('lift synchronization returns that floor only and is rate limited', () => {
  const { ctx, a, other, sent } = harness();
  levelsHandlers['levels.lift'](ctx, a, { t: 'levels.lift', id: 'lift', stop: 1 });
  levelsHandlers['levels.sync'](ctx, other);
  assert.equal(sent.at(-1)!.motions[0].to, 0);
  levelsHandlers['levels.sync'](ctx, other);
  assert.equal(sent.length, 2);
});
