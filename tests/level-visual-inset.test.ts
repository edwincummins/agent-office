import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { planMap } from '../src/shared/maps/index.js';
import { withLevels } from '../src/client/world/levels/index.js';
import type { World } from '../src/client/world/world.js';
import { TWO_LEVEL_MODEL } from './fixtures/two-level-model.js';

function fixture(inset?: unknown) {
  const raw = structuredClone(TWO_LEVEL_MODEL);
  if (inset !== undefined) Object.assign(raw.levels!.floors[1], { visualInset: inset });
  return raw;
}
function build(inset?: unknown) {
  const p = planMap(fixture(inset));
  const base = { plan:p, group:new THREE.Group(), colliders:[], pickables:[], interactables:[], desks:new Map() } as unknown as World;
  return withLevels(() => base)(p);
}
function concreteBounds(w: World) {
  const bounds = new THREE.Box3();
  w.group.updateMatrixWorld(true);
  w.group.traverse(o => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && o.material.color.getHexString() === '777c82') {
      // The last stair tread shares concrete material; inspect slab vertices outside the stair width.
      const p=o.geometry.attributes.position, v=new THREE.Vector3();
      for(let i=0;i<p.count;i++) { v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld); if(Math.abs(v.x)>2)bounds.expandByPoint(v); }
    }
  });
  return bounds;
}

test('recess only the opted-in floor edge while retaining collision and stair routes', () => {
  const before=build(), after=build({minZ:.005});
  const a=concreteBounds(before), b=concreteBounds(after);
  assert.ok(Math.abs(b.min.z-a.min.z-.005)<.000002);
  for(const axis of ['x','y'] as const) { assert.equal(b.min[axis],a.min[axis]); assert.equal(b.max[axis],a.max[axis]); }
  assert.equal(b.max.z,a.max.z);
  assert.deepEqual(after.colliders,before.colliders);
  const from=Object.assign([0,-8],{height:0}), to=Object.assign([0,3],{height:3});
  assert.deepEqual(after.nav.route(from,to),before.nav.route(from,to));
  assert.ok(after.nav.route(from,to).length);
  assert.equal(after.pickables.length,before.pickables.length);
});

test('omitted and zero insets retain the existing rendered floor bounds',()=>{
  assert.deepEqual(concreteBounds(build({minX:0,maxX:0,minZ:0,maxZ:0})),concreteBounds(build()));
});

test('each selected edge moves inward without shifting the opposite edge',()=>{
  const original=concreteBounds(build());
  for(const [edge,side,axis,direction] of [['minX','min','x',1],['maxX','max','x',-1],['minZ','min','z',1],['maxZ','max','z',-1]] as const){
    const bounds=concreteBounds(build({[edge]:.02}));
    assert.ok(Math.abs(bounds[side][axis]-original[side][axis]-direction*.02)<.000002);
    assert.ok(Math.abs(bounds[side==='min'?'max':'min'][axis]-original[side==='min'?'max':'min'][axis])<.000002);
  }
});

test('inset validation rejects unknown edges and nonfinite or excessive values',()=>{
  for(const inset of [null,[],.005,{south:.005},{maxZ:-.001},{maxZ:.021},{maxZ:NaN},{maxZ:Infinity},{maxZ:'0.005'}]) {
    assert.throws(()=>planMap(fixture(inset)),/visualInset/);
  }
});

test('a ground floor cannot request an inset for a generated slab it does not have',()=>{
  const raw=fixture();Object.assign(raw.levels!.floors[0],{visualInset:{maxZ:.005}});
  assert.throws(()=>planMap(raw),/visualInset/);
});
