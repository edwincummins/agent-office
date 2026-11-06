import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { planMap } from '../src/shared/maps/index.js';
import { seatFloor } from '../src/shared/levels/attach.js';
import { LevelNav } from '../src/shared/levels/navigation.js';
import { furnishings } from '../src/client/world/model/furniture.js';
import { modelColliders } from '../src/client/world/model/colliders.js';
import { TWO_LEVEL_MODEL } from './fixtures/two-level-model.js';
import { crossesRect } from '../src/shared/levels/segment.js';
import { withLevels } from '../src/client/world/levels/index.js';
import type { World } from '../src/client/world/world.js';
import {liftViews} from '../src/client/world/levels/lifts.js';

test('model furniture, laptops, proxies and colliders share their assigned elevation', () => {
  const p = planMap(structuredClone(TWO_LEVEL_MODEL)),
    group = new THREE.Group(),
    interactions: any[] = [];
  const desks = furnishings(group, [...p.desks, ...p.overflow, ...p.stations, ...p.meeting], interactions, [], undefined, (id) => seatFloor(p, id));
  group.updateMatrixWorld(true);
  const upper = desks.get('desk-9')!,
    ground = desks.get('desk-1')!;
  assert.equal(upper.group.position.y, 3);
  assert.equal(ground.group.position.y, 0);
  assert.equal(upper.laptopAnchor.getWorldPosition(new THREE.Vector3()).y, 3.8);
  assert.equal(interactions.find((i) => i.deskId === 'desk-9').y, 3);
  const colliders = modelColliders(p, p.config!.model!);
  assert.ok(colliders.some((c) => c.bottom === 3 && c.top === 3.8));
  const nav = new LevelNav(p.bounds, p.levels!, [...colliders.map((c) => ({ ...c, bottom: c.bottom ?? 0 })), ...p.levels!.solids]);
  for (const d of desks.values()) assert.ok(nav.wayTo([p.door.x, p.door.z], d.def).length, d.def.id);
});

test('authored model chair anchors stay absolute while their laptops follow the floor', () => {
  const p = planMap(structuredClone(TWO_LEVEL_MODEL)),
    d = p.desks[8],
    group = new THREE.Group();
  const chairs = new Map([[d.id, { x: d.x, z: d.z + 0.85, rotY: Math.PI, y: 3.4 }]]);
  const view = furnishings(group, [d], [], [], chairs, (id) => seatFloor(p, id)).get(d.id)!;
  group.updateMatrixWorld(true);
  assert.equal(view.seatAnchor.getWorldPosition(new THREE.Vector3()).y, 3.4);
  assert.equal(view.laptopAnchor.getWorldPosition(new THREE.Vector3()).y, 3.8);
});

test('proxy sit anchors place the seated avatar at the authored map seat point',()=>{
  const p=planMap(structuredClone(TWO_LEVEL_MODEL)),d=p.desks[8],group=new THREE.Group();
  const chairs=new Map([[d.id,{x:d.x,z:d.z-.03,rotY:d.rotY,y:3.47,sit:{forward:.03,y:.47}}]]);
  const view=furnishings(group,[d],[],[],chairs,(id)=>seatFloor(p,id)).get(d.id)!;
  group.updateMatrixWorld(true);
  const anchor=view.seatAnchor.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(anchor.x-d.x)<1e-10);
  assert.ok(Math.abs(anchor.z-d.z)<1e-10);
  assert.equal(anchor.y,3.47);
});

test('upper model walls retain their underside and reject invalid spans', () => {
  const c = structuredClone(TWO_LEVEL_MODEL);
  c.model!.walls = [{ minX: -12, maxX: -11, minZ: -2, maxZ: -1, bottom: 3, top: 6 }];
  const p = planMap(c),
    wall = modelColliders(p, p.config!.model!).find((c) => c.bottom === 3 && c.top === 6);
  assert.ok(wall);
  assert.equal(wall.fence, true);
  c.model!.walls[0].bottom = 6;
  assert.throws(() => planMap(c), /wall.bottom/);
});

test('fixture navigation rebuild uses its physical height instead of flattening it to ground', () => {
  const p = planMap(structuredClone(TWO_LEVEL_MODEL));
  const base = { plan: p, group: new THREE.Group(), colliders: [], pickables: [], interactables: [], desks: new Map() } as unknown as World;
  const w = withLevels(() => base)(p);
  const wall = { minX: -12, maxX: 12, minZ: 9, maxZ: 10, bottom: 3, top: 5 };
  w.colliders.push(wall);
  const nav = w.navigation!(p.obstacles!);
  assert.ok(nav.route(Object.assign([0, 8], { height: 0 }), Object.assign([0, 12], { height: 0 })).length);
  assert.equal(nav.clearLine(Object.assign([0, 8], { height: 3 }), Object.assign([0, 12], { height: 3 })), false);
});

test('north-facing lift mirrors doors, bridge and back wall while retaining clear car access',()=>{
 const c=structuredClone(TWO_LEVEL_MODEL);
 const mirror=(v:any):void=>{if(!v||typeof v!=='object')return;if(typeof v.z==='number')v.z=-v.z;if(typeof v.minZ==='number')[v.minZ,v.maxZ]=[-v.maxZ,-v.minZ];if(typeof v.rotY==='number')v.rotY=Math.PI-v.rotY;for(const x of Object.values(v))mirror(x);};mirror(c);
 const p=planMap(c),base={plan:p,group:new THREE.Group(),colliders:[],pickables:[],interactables:[],desks:new Map()} as unknown as World;
 const w=withLevels(()=>base)(p),view=[...liftViews.get(w)!.values()][0];
 assert.equal(view.spec.z,1.5);assert.equal(view.gates[0].panels[0].position.z,.5);
 assert.ok(w.colliders.some(c=>Math.abs(c.minZ-2.5)<1e-8&&c.maxZ>2.6));
 assert.ok(w.colliders.some(c=>c.minZ===-.5&&c.maxZ===.5&&c.top===3));
});

test('a thin partition blocks an authored-chair sit hop continuously', () => {
  assert.equal(crossesRect([0, 0], [1, 0], { minX: 0.021, maxX: 0.022, minZ: -0.2, maxZ: 0.2 }), true);
  assert.equal(crossesRect([0, 1], [1, 1], { minX: 0.021, maxX: 0.022, minZ: -0.2, maxZ: 0.2 }), false);
});

test('source council chairs remain obstacles, with only the destination exempted from its sit hop', () => {
  const c = structuredClone(TWO_LEVEL_MODEL),
    base = planMap(c);
  c.model!.source = {
    chairs: [...base.desks, ...base.overflow].map((d) => ({
      x: d.x + Math.sin(d.rotY) * 0.85,
      z: d.z + Math.cos(d.rotY) * 0.85,
      rotY: d.rotY + Math.PI,
      y: seatFloor(base, d.id) + 0.4,
    })),
    council: base.meeting.map((d) => ({ x: d.x + Math.sin(d.rotY) * 0.85, z: d.z + Math.cos(d.rotY) * 0.85, rotY: d.rotY + Math.PI, y: 0.4 })),
    meetingBoard: { x: 7, y: 2, z: -19, rotY: 0, width: 2, height: 1 },
  };
  const p = planMap(c),
    solids = modelColliders(p, p.config!.model!).map((s) => ({ ...s, bottom: s.bottom ?? 0 }));
  const anchors = new Map(p.meeting.map((d, i) => [d.id, c.model!.source!.council[i]]));
  const nav = new LevelNav(p.bounds, p.levels!, [...solids, ...p.levels!.solids], anchors);
  assert.equal(solids.filter((s) => 'seatId' in s).length, 5);
  for (const d of p.meeting) assert.ok(nav.wayTo([p.door.x, p.door.z], d).length, d.id);
  const chair = c.model!.source!.council[0];
  assert.equal(nav.clearLine([chair.x - 1, chair.z], [chair.x + 1, chair.z]), false);
});

test('overhead model solids do not block ground spawn or door validation', () => {
 const c = structuredClone(TWO_LEVEL_MODEL);
 c.model!.walls = [{minX:-13,maxX:13,minZ:-20,maxZ:20,bottom:6,top:7}];
 assert.doesNotThrow(()=>planMap(c));
 c.model!.walls[0].bottom=0;
 assert.throws(()=>planMap(c));
});
