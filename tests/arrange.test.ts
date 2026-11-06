import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { applyArrangement, readArrangement, sanitizeChange, withChanges } from '../src/shared/arrange.js';
import { checkDecor, MapError, planMap } from '../src/shared/maps/index.js';
import { Maps } from '../src/server/maps.js';
import { arrangeHandlers, OWNER_ARRANGES } from '../src/server/ws/handlers/arrange.js';
import { ownerHandlers } from '../src/server/owner-workers/access.js';
import { TWO_LEVEL_MODEL } from './fixtures/two-level-model.js';

const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const fern = { id: 'fern-1', asset: 'fern.glb', position: { x: 1, y: 0, z: 2 }, rotY: 0.5, scale: 1.2, label: 'Fern by the door' };

test('decor: a model map lists movable items, each checked', () => {
  assert.deepEqual(checkDecor([fern], bounds, 8, 'model'), [fern]);
  assert.deepEqual(checkDecor([{ id: 'lamp', asset: 'lamp.glb', position: { x: 0, z: 0 } }], bounds, 8, 'model'), [{ id: 'lamp', asset: 'lamp.glb', position: { x: 0, y: 0, z: 0 }, rotY: 0, scale: 1 }]);
  const bad = (items: unknown, style = 'model') => assert.throws(() => checkDecor(items, bounds, 8, style), MapError);
  bad([fern], 'castle');
  bad([{ ...fern, id: 'Fern 1' }]);
  bad([fern, fern]);
  bad([{ ...fern, asset: 'https://x/fern.glb' }]);
  bad([{ ...fern, position: { x: 50, y: 0, z: 0 } }]);
  bad([{ ...fern, scale: 40 }]);
  bad(Array.from({ length: 301 }, (_, i) => ({ ...fern, id: `f-${i}` })));
  // Through the whole map check, onto the config the page builds from.
  const plan = planMap({ ...structuredClone(TWO_LEVEL_MODEL), decor: [{ ...fern, position: { x: 0, y: 0, z: 0 } }] });
  assert.equal(plan.config?.decor?.[0].id, 'fern-1');
});

test('arrange: changes are sanitized, laid over the map, and unknown ids are kept but ignored', () => {
  assert.equal(typeof sanitizeChange({ kind: 'fixture', id: 'sofa', position: { x: 0, y: 0, z: 0 }, rotY: 0 }), 'string');
  assert.equal(typeof sanitizeChange({ kind: 'decor', id: 'fern-1', position: { x: 0, y: NaN, z: 0 }, rotY: 0 }), 'string');
  assert.equal(typeof sanitizeChange({ kind: 'decor', id: 'fern-1', position: { x: 0, y: 0, z: 0 }, rotY: 0, scale: 99 }), 'string');
  const moved = sanitizeChange({ kind: 'decor', id: 'fern-1', position: { x: 3.12345, y: 0, z: -1 }, rotY: 7, scale: 2 });
  assert.ok(typeof moved !== 'string');
  assert.equal(moved.position.x, 3.123);
  assert.ok(Math.abs(moved.rotY - (7 - 2 * Math.PI)) < 1e-3, 'turns fold into -π..π');
  const a = withChanges(undefined, [moved, { kind: 'decor', id: 'gone', position: { x: 0, y: 0, z: 0 }, rotY: 0, scale: 1 }, { kind: 'fixture', id: 'tv', position: { x: 2, y: 2.3, z: 0 }, rotY: 1 }]);
  const map = { id: 'm', decor: [fern], fixtures: { tv: { position: { x: 0, y: 2, z: 0 }, size: { width: 3, height: 2, depth: 0.1 }, rotY: 0 } } };
  const out = applyArrangement(map, a) as typeof map;
  assert.deepEqual(out.decor[0].position, { x: 3.123, y: 0, z: -1 });
  assert.equal(out.decor[0].scale, 2);
  assert.equal(out.decor[0].label, 'Fern by the door');
  assert.equal(out.decor.length, 1, 'an id the map lacks adds nothing');
  assert.deepEqual(out.fixtures.tv.size, map.fixtures.tv.size, 'a fixture keeps its size');
  assert.deepEqual(out.fixtures.tv.position, { x: 2, y: 2.3, z: 0 });
  assert.equal(map.decor[0].position.x, 1, 'the map file itself is never changed');
  assert.deepEqual(readArrangement(JSON.parse(JSON.stringify(a))), a);
  assert.deepEqual(withChanges(a, [], [{ kind: 'decor', id: 'fern-1' }]).decor['fern-1'], undefined);
});

function hall() {
  const dir = mkdtempSync(path.join(tmpdir(), 'arrange-'));
  mkdirSync(path.join(dir, 'maps'));
  const write = (x: number) => writeFileSync(path.join(dir, 'maps', 'hq.json'), JSON.stringify({ ...structuredClone(TWO_LEVEL_MODEL), id: 'hq', name: 'HQ', decor: [{ ...fern, position: { x, y: 0, z: 0 } }] }));
  write(0);
  return { dir, write };
}

test('arrange store: the owner’s placements win over the map file, even after the team rewrites it', () => {
  const { dir, write } = hall();
  try {
    const maps = new Maps(dir);
    assert.ok(maps.set('hq', 'Fetty'));
    maps.arranged.set('hq', withChanges(undefined, [{ kind: 'decor', id: 'fern-1', position: { x: 2, y: 0, z: 1 }, rotY: 1, scale: 1.5 }, { kind: 'decor', id: 'later', position: { x: 0, y: 0, z: 0 }, rotY: 0, scale: 1 }]));
    assert.equal(maps.rearranged(), true);
    const item = () => maps.state().custom.find((m) => m.config?.id === 'hq')?.config?.decor?.[0];
    assert.deepEqual(item()?.position, { x: 2, y: 0, z: 1 });
    assert.equal(maps.state().arranged?.decor['later'].scale, 1, 'an id the map lacks is kept for when it comes back');
    // The team rebuilds the map with the fern somewhere else: the owner's spot still wins.
    write(-3);
    maps.rearranged();
    assert.deepEqual(item()?.position, { x: 2, y: 0, z: 1 });
    assert.equal((maps.raw('hq') as { decor: { position: { x: number } }[] }).decor[0].position.x, -3, 'raw is the file as written');
    const saved = JSON.parse(readFileSync(path.join(dir, 'arrange', 'hq.json'), 'utf8'));
    assert.equal(saved.decor['fern-1'].scale, 1.5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('arrange.set: owner only, checked against the map, one save one broadcast', () => {
  const { dir } = hall();
  try {
    writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ ownerAccountId: 'owner' }));
    const maps = new Maps(dir);
    maps.set('hq', 'Fetty');
    const warns: string[] = [];
    const sent: unknown[] = [];
    const broadcasts: unknown[] = [];
    const ctx = {
      cfg: { dataDir: dir },
      accounts: { get: (id: string) => (id === 'owner' ? { role: 'admin' } : { role: 'member' }) },
      maps,
      clients: new Map(),
      warn: (_c: unknown, e: string | undefined) => e && warns.push(e),
      sendTo: (_c: unknown, m: unknown) => sent.push(m),
      broadcast: (m: unknown) => broadcasts.push(m),
      toastAll: () => {},
    } as never;
    const move = (x: number) => ({ t: 'arrange.set' as const, map: 'hq', changes: [{ kind: 'decor' as const, id: 'fern-1', position: { x, y: 0, z: 0 }, rotY: 0, scale: 1 }] });
    const guest = { accountId: 'guest', peer: { name: 'Guest' } } as never;
    const owner = { accountId: 'owner', peer: { name: 'Fetty' } } as never;
    arrangeHandlers['arrange.set'](ctx, guest, move(1));
    assert.deepEqual(warns, [OWNER_ARRANGES]);
    // The office's owner gate refuses it before the handler too.
    ownerHandlers(arrangeHandlers as never)['arrange.set'](ctx, guest, move(1) as never);
    assert.equal(warns.length, 2);
    assert.equal(maps.arranged.get('hq'), undefined, 'nothing saved for a guest');
    arrangeHandlers['arrange.set'](ctx, owner, move(500));
    assert.match(warns[2], /won’t work/);
    assert.equal(maps.arranged.get('hq'), undefined, 'a spot outside the hall is refused');
    arrangeHandlers['arrange.set'](ctx, owner, move(1));
    assert.equal(warns.length, 3);
    assert.equal(maps.arranged.get('hq')?.decor['fern-1'].position.x, 1);
    assert.equal(broadcasts.length, 1, 'one save, one map broadcast');
    assert.equal((broadcasts[0] as { state: { arranged?: unknown } }).state.arranged !== undefined, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
