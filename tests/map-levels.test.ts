import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { checkLevels } from '../src/shared/levels/plan.js';
import { LevelNav, elevated, type LevelPoint } from '../src/shared/levels/navigation.js';
import { routeHeight } from '../src/shared/levels/follow.js';
import { groundAt, ceilingAt, stepTo, blockerAt } from '../src/client/player/collide.js';
import { TWO_LEVELS } from './fixtures/two-level.js';
import { clampLevelCamera } from '../src/client/player/level-camera.js';
import { liftHeight, liftMoving } from '../src/shared/levels/lift.js';
import { planMap } from '../src/shared/maps/index.js';
import { TWO_LEVEL_MAP } from './fixtures/two-level-map.js';
const bounds = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 };
const plan = () => checkLevels(structuredClone(TWO_LEVELS), bounds, 7, [])!;
test('a prop crossing the middle of stairs blocks routes even with clear landings', () => {
  const p = plan(),
    wall = { minX: -2, maxX: 2, minZ: -3.2, maxZ: -2.8, bottom: 1, top: 4 };
  const nav = new LevelNav(bounds, p, [...p.solids, wall]);
  assert.deepEqual(nav.route(elevated(4, -7, 0), elevated(4, 4, 3)), []);
  assert.equal(nav.clearLine(elevated(0, -4, 1), elevated(0, -2, 2)), false);
});
test('levels are opt-in and validate finite bounded floor data', () => {
  assert.equal(checkLevels(undefined, bounds, 7, []), undefined);
  for (const raw of [null, [], {}, { ...TWO_LEVELS, unknown: 1 }, { ...TWO_LEVELS, floors: [{ ...TWO_LEVELS.floors[0], y: NaN }] }])
    assert.throws(() => checkLevels(raw, bounds, 7, []));
  assert.equal(plan().solids.length, 15);
});

test('camera boom cannot cross the local slab, including from an eased position', () => {
  const target = new THREE.Vector3(0, 1.3, -1),
    camera = new THREE.Vector3(0, 4, 4);
  const slab = { minX: -4, maxX: 4, minZ: 0, maxZ: 5, bottom: 2.75, top: 3, levelSurface: true };
  clampLevelCamera(target, camera, [slab]);
  assert.ok(camera.y <= 2.57 + 1e-8);
  const plain = new THREE.Vector3(0, 4, 4);
  clampLevelCamera(target, plain, [{ ...slab, levelSurface: false }]);
  assert.equal(plain.y, 4);
});

test('lift closes doors before travel and eases between exact stop heights', () => {
  const motion = { id: 'lift', from: 0, to: 3, started: 1600, duration: 4000, riders: [] };
  assert.equal(liftHeight(motion, 1000), 0);
  assert.equal(liftMoving(motion, 1000), true);
  assert.equal(liftHeight(motion, 3600), 1.5);
  assert.equal(liftHeight(motion, 5600), 3);
  assert.equal(liftMoving(motion, 5600), false);
});

test('lifts refuse side landings, intersecting slabs and insufficient overhead room', () => {
  for (const change of [
    (c: typeof TWO_LEVELS) => {
      c.lifts![0].stops[1].x = 5;
    },
    (c: typeof TWO_LEVELS) => {
      c.lifts![0].z = 0;
    },
  ]) {
    const c = structuredClone(TWO_LEVELS);
    change(c);
    assert.throws(() => checkLevels(c, bounds, 7, []));
  }
  assert.throws(() => checkLevels(TWO_LEVELS, bounds, 5.3, []));
});

test('adjoining upper slabs connect through their shared edge, not a point contact', () => {
  const c = structuredClone(TWO_LEVELS);
  c.floors[1].maxZ = 4;
  c.floors.push({ ...c.floors[1], id: 'upper-back', minZ: 4, maxZ: 8 });
  const p = checkLevels(c, bounds, 7, [])!,
    nav = new LevelNav(bounds, p, p.solids);
  assert.ok(nav.route(elevated(4, -7, 0), elevated(4, 6, 3)).length > 12);
  c.floors[2].minX = 8;
  assert.throws(() => checkLevels(c, bounds, 7, []));
});

test('synthetic map validates the complete upper table assembly before rendering', () => {
  assert.equal(planMap(TWO_LEVEL_MAP).levels!.seats['desk-9'], 'upper');
  const c = structuredClone(TWO_LEVEL_MAP);
  delete c.levels!.seats!['desk-9'];
  assert.throws(() => planMap(c), /same level/);
});
test('invalid risers, blocked headroom and disconnected upper levels are refused', () => {
  for (const mutate of [
    (c: typeof TWO_LEVELS) => {
      c.stairs[0].steps = 8;
    },
    (c: typeof TWO_LEVELS) => {
      c.floors[1].minZ = -2;
    },
    (c: typeof TWO_LEVELS) => {
      c.stairs = [];
    },
  ]) {
    const c = structuredClone(TWO_LEVELS);
    mutate(c);
    assert.throws(() => checkLevels(c, bounds, 7, []));
  }
});
test('ground and underside queries distinguish the two overlapping floors', () => {
  const p = plan();
  assert.equal(groundAt(p.solids, 3, 3, 3), 3);
  assert.equal(groundAt(p.solids, 3, 3, 0), -Infinity);
  assert.equal(ceilingAt(p.solids, 3, 3, 0), 2.75);
  assert.equal(ceilingAt(p.solids, 3, 3, 3), Infinity);
});
test('real collision stepping climbs and descends the synthetic flight without a step above .3m', () => {
  const p = plan(),
    b = { pos: new THREE.Vector3(0, 0, -6.8), colliders: p.solids, grounded: true, stepOffset: 0 };
  for (let i = 0; i < 180; i++) {
    const y = b.pos.y;
    stepTo(b, 0, b.pos.z + 0.05);
    assert.ok(b.pos.y - y <= 0.3 + 1e-6);
  }
  assert.ok(b.pos.z > 1);
  assert.equal(b.pos.y, 3);
  for (let i = 0; i < 180; i++) {
    stepTo(b, 0, b.pos.z - 0.05);
    b.pos.y = Math.max(0, groundAt(p.solids, b.pos.x, b.pos.z, b.pos.y));
  }
  assert.equal(b.pos.y, 0);
  assert.ok(b.pos.z < -6);
});
test('rail blocks an upper walker but allows the lower floor underneath', () => {
  const p = plan(),
    b = { pos: new THREE.Vector3(3, 3, 0.6), colliders: p.solids, grounded: true, stepOffset: 0 };
  for (let i = 0; i < 20; i++) stepTo(b, 3, b.pos.z - 0.1);
  assert.ok(b.pos.z > 0.3);
  assert.equal(blockerAt({ ...b, pos: new THREE.Vector3(3, 0, 0.6) }, 3, 0, 0), null);
});
test('layered routes visit the stairs and cannot jump directly between overlapping destinations', () => {
  const p = plan(),
    nav = new LevelNav(bounds, p, p.solids),
    way = nav.route(elevated(4, -7, 0), elevated(4, 4, 3)) as LevelPoint[];
  assert.ok(way.length > 12);
  assert.equal(way[0].height, 0);
  assert.equal(way.at(-1)!.height, 3);
  assert.ok(way.every((v, i) => !i || nav.clearLine(way[i - 1], v)));
  assert.ok(way.some((v) => v[0] === 0 && v[1] === -6));
  const back = nav.route(elevated(4, 4, 3), elevated(4, -7, 0));
  assert.ok(back.length > 12);
  assert.equal(routeHeight([elevated(0, -1, 0.5), elevated(0, 0, 0.75)], 1, 0), 0.85);
  assert.equal(
    routeHeight(
      [
        [0, 0],
        [1, 1],
      ],
      1,
      2,
    ),
    2,
  );
});
