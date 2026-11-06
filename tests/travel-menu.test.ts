import test from 'node:test';
import assert from 'node:assert/strict';
import { atPlace, namedPlaces } from '../src/client/features/travel-menu/destinations.js';
import type { MapPlan } from '../src/shared/maps.js';

const hq = { id:'hustle-hq',name:'Hustle Labs HQ',levels:{floors:[{id:'owner-dais',y:5.7},{id:'ground',y:0},{id:'mezz-main-6',y:4.8}],lifts:[{id:'hq-lift',stops:[{x:21.3,z:-20.45,level:'ground'},{x:21.3,z:-20.45,level:'mezz-main-6'}]}]}} as MapPlan;
test('HQ destinations use the owner dais and both existing lift landings',()=>{
  const rows=namedPlaces(hq);
  assert.deepEqual(rows.map(r=>[r.id,r.at.y]),[['home',5.7],['ground',0],['mezz-main-6',4.8]]);
  assert.equal(rows[0].owner,true);
  assert.equal(rows[0].name,'Hustle Labs');
  assert.equal(rows[1].at.x,21.3);
  assert.equal(rows[2].at.z,-20.45);
});
test('other maps cannot accidentally acquire HQ destinations',()=>{
  assert.deepEqual(namedPlaces({...hq,id:'castle'}),[]);
  assert.deepEqual(namedPlaces({...hq,levels:undefined}),[]);
});
test('a missing landing is omitted and room renames propagate',()=>{
  const changed={...hq,name:'New name HQ',levels:{...hq.levels!,floors:hq.levels!.floors.filter(f=>f.id!=='ground')}};
  assert.deepEqual(namedPlaces(changed).map(r=>r.name),['New name','HQ · Mezzanine']);
});
test('current-place detection distinguishes stacked levels and distant positions',()=>{
  const at={x:21.3,y:4.8,z:-20.45,rotY:0};
  assert.equal(atPlace({...at,x:21.4},at),true);
  assert.equal(atPlace({...at,y:0},at),false);
  assert.equal(atPlace({...at,z:-19},at),false);
});
