import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCrew,arrivalClear} from '../src/shared/fixtures/crew.js';
import {STOCK_CREW} from '../src/shared/fixtures/crew-stock.js';
import {resolveSlots} from '../src/shared/fixtures/index.js';
import {OFFICE_PLAN} from '../src/shared/maps/index.js';
import {placeCrew,crewPose} from '../src/client/features/crew/layout.js';
import {CrewPick} from '../src/client/features/crew/pick.js';
import * as T from 'three';
import type {FleetSnapshot} from '../src/shared/protocol/fleet.js';
const bounds={minX:-20,maxX:20,minZ:-20,maxZ:20};
const feed=(n:number):FleetSnapshot=>({status:'ready',teams:['a','b'],needs:[],seats:Array.from({length:n},(_,i)=>({session:'s'+i,rig:i<16?'a':'b',name:'Seat '+i,state:'idle',activity:''}))});
test('stock has 34 places, clear of arrival and camera corridor',()=>{
 const plan=OFFICE_PLAN;assert.equal(STOCK_CREW.zones[0].places.length,34);assert.doesNotThrow(()=>resolveCrew(STOCK_CREW,plan.bounds,plan.height,plan.spawn));
 assert.ok(STOCK_CREW.zones[0].places.every(p=>!(p.x>-5.8&&p.x<-2.2)));
});
test('invalid crew is removed with a path warning, without losing other slots',()=>{
 for(const bad of [null,{}, {zones:[]}, {...STOCK_CREW,zones:Array(9).fill(STOCK_CREW.zones[0])}, {...STOCK_CREW,zones:[{...STOCK_CREW.zones[0],places:[{x:NaN,z:1}]}]}]){
  const r=resolveSlots({crew:bad},bounds,8);assert.equal(r.slots.crew,undefined);assert.match(r.slotWarnings[0],/fixtures.crew/);
 }
 assert.deepEqual(resolveSlots(undefined,bounds,8).slots,{});
});
test('arrival clearance is orientation independent',()=>{
 assert.equal(arrivalClear({x:0,z:-4},{x:0,z:0,rotY:0}),false);
 assert.equal(arrivalClear({x:-4,z:0},{x:0,z:0,rotY:Math.PI/2}),false);
 assert.equal(arrivalClear({x:2,z:-4},{x:0,z:0,rotY:0}),true);
 const slot=structuredClone(STOCK_CREW);slot.zones[0].places[0]={x:0,z:0,y:0,rotY:0,pose:'stand',seatHeight:0};assert.throws(()=>resolveCrew(slot,bounds,8,{x:0,z:0,rotY:0}),/arrival/);
});
test('empty/stopped seats produce nobody; overflow drops gaps and keeps urgent seats',()=>{
 assert.equal(placeCrew(null,STOCK_CREW).entries.length,0);
 const stopped=feed(1);stopped.seats[0].state='stopped';assert.equal(placeCrew(stopped,STOCK_CREW).entries.length,0);
 const all=feed(34);assert.equal(placeCrew(all,STOCK_CREW).entries.length,34);
 const over=feed(40);over.seats[39].state='needs-you';over.seats[38].state='stuck';const result=placeCrew(over,STOCK_CREW);
 assert.equal(result.entries.length,33);assert.equal(result.overflow,7);assert.ok(result.entries.some(e=>e.seat.session==='s39'));assert.ok(result.entries.some(e=>e.seat.session==='s38'));
 assert.ok(!result.entries.some(e=>e.place.x===STOCK_CREW.overflow.x&&e.place.z===STOCK_CREW.overflow.z));
});
test('capsule picking needs no scene mesh; seated needs-you stands behind stool',()=>{
 const e=placeCrew(feed(1),STOCK_CREW).entries[0];e.place={x:0,y:0,z:0,rotY:0,pose:'sit',seatHeight:.75};e.seat.state='needs-you';assert.equal(crewPose(e).z,-.35);assert.equal(crewPose(e).sit,false);
 const pick=new CrewPick();pick.sync([e]);const ray=new T.Raycaster(new T.Vector3(0,1,3),new T.Vector3(0,0,-1));assert.equal(ray.intersectObject(pick).length,1);pick.sync([]);assert.equal(ray.intersectObject(pick).length,0);
});

test('capsule ray hits its front surface, not its centre',()=>{
 const e=placeCrew(feed(1),STOCK_CREW).entries[0];e.place={x:0,y:0,z:0,rotY:0,pose:'stand',seatHeight:0};const pick=new CrewPick();pick.sync([e]);
 const hits=new T.Raycaster(new T.Vector3(0,1,2.7),new T.Vector3(0,0,-1)).intersectObject(pick);assert.ok(Math.abs(hits[0].distance-2.35)<1e-8);
});

test('cross-map usable opt-in leaves stock-only targets behind',async()=>{
 const {Usables}=await import('../src/client/core/registry.js');const registry=new Usables<string,string>();registry.add({usable:()=>['stock'],pickable:()=>'stock-mesh'});registry.add({allMaps:true,usable:()=>['crew'],pickable:()=>'crew-capsules'});
 assert.deepEqual(registry.lists(true),[['crew']]);assert.deepEqual(registry.pickables(true),['crew-capsules']);assert.equal(registry.lists().length,2);
});
test('fallback keeps seven shared geometries through replacement',async()=>{
 const {CrewBodies}=await import('../src/client/features/crew/body.js');const bodies=new CrewBodies(false);bodies.sync(placeCrew(feed(32),STOCK_CREW).entries,0);bodies.tick(1,false);assert.equal(bodies.mesh.children.length,7);bodies.sync([],2);bodies.tick(3,false);bodies.sync(placeCrew(feed(32),STOCK_CREW).entries,4);bodies.tick(5,false);assert.equal(bodies.mesh.children.length,7);bodies.dispose();
});

test('duplicate session rows never make duplicate people',()=>{const f=feed(2);f.seats.push(f.seats[0]);assert.equal(placeCrew(f,STOCK_CREW).entries.length,2);});

test('hidden roster churn reclaims old instance slots without visible ticks',async()=>{
 const {CrewBodies}=await import('../src/client/features/crew/body.js');for(const batching of [true,false]){const bodies=new CrewBodies(batching);for(let n=0;n<12;n++){const f=feed(64);f.seats.forEach(s=>s.session+='-'+n);bodies.sync(placeCrew(f,STOCK_CREW).entries,n*5);}bodies.tick(61,true);bodies.dispose();}
});
test('seated urgent stand-back must also clear the camera corridor',()=>{
 const slot=structuredClone(STOCK_CREW);slot.zones[0].places=[{x:1.2,y:0,z:-3,rotY:Math.PI/2,pose:'sit',seatHeight:.75}];assert.throws(()=>resolveCrew(slot,bounds,8,{x:0,z:0,rotY:0}),/standing.*arrival/);
});
