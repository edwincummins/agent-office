import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {checkModel} from '../src/shared/maps/model.js';
import {furnishings} from '../src/client/world/model/furniture.js';

const bounds={minX:-30,maxX:30,minZ:-30,maxZ:30};
const model=()=>({asset:'room.glb',seats:Array.from({length:32},(_,i)=>({x:-12+i%8*3,z:Math.floor(i/8)*3,rotY:0})),walls:[],screen:null,whiteboard:{x:10,y:2,z:-20,rotY:0,width:3,height:2}});
const valid={x:1,y:5.58,z:2,rotY:Math.PI/2};
function check(laptop:unknown){const m=model();return checkModel({...m,seats:m.seats.map((s,i)=>i?s:{...s,laptop})},bounds,10);}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('mount is copied through validation and omission adds no mount',()=>{
 const result=check(valid);assert.deepEqual(result.seats[0].laptop,valid);assert.notEqual(result.seats[0].laptop,valid);
 assert.ok(!('laptop' in checkModel(model(),bounds,10).seats[0]));
});
test('mount requires four finite bounded numeric fields and no extras',()=>{
 for(const value of [null,[],true,'mount',{...valid,extra:1}])assert.throws(()=>check(value),/laptop/);
 for(const key of ['x','y','z','rotY']){
  const missing={...valid};delete missing[key as keyof typeof missing];assert.throws(()=>check(missing),/laptop/);
  for(const value of [NaN,Infinity,-Infinity,'1',null,true])assert.throws(()=>check({...valid,[key]:value}),/laptop/);
 }
 for(const bad of [{x:30},{x:-30},{z:30},{z:-30},{y:-.01},{y:10.01},{rotY:Math.PI+.01},{rotY:-Math.PI-.01}])assert.throws(()=>check({...valid,...bad}),/laptop/);
 assert.equal(check({...valid,x:0,y:0,z:0,rotY:0}).seats[0].laptop!.y,0);
});
test('world mount and screen direction survive arbitrary desk yaw and upper-floor height',()=>{
 for(const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI,.73]){
  const def={id:'desk-1',x:4,z:-6,rotY:yaw};const group=new THREE.Group();
  const source=new Map([[def.id,{x:4,y:5.27,z:-6,rotY:yaw,sit:{forward:0,y:.47}}]]);
  const pose={x:4+Math.sin(yaw)*.7,y:5.58,z:-6+Math.cos(yaw)*.7,rotY:yaw};
  const before=furnishings(new THREE.Group(),[def],[],[],source,()=>4.8).get(def.id)!;
  const view=furnishings(group,[def],[],[],source,()=>4.8,[],new Map([[def.id,pose]])).get(def.id)!;
  group.updateMatrixWorld(true);
  const world=view.laptopAnchor.getWorldPosition(new THREE.Vector3());near(world.x,pose.x);near(world.y,pose.y);near(world.z,pose.z);
  const normal=new THREE.Vector3(0,0,1).transformDirection(view.laptopAnchor.matrixWorld);
  near(normal.x,-Math.sin(yaw));near(normal.z,-Math.cos(yaw));
  assert.deepEqual(view.seatAnchor.position.toArray(),before.seatAnchor.position.toArray());
  assert.deepEqual(view.seatAnchor.rotation.toArray(),before.seatAnchor.rotation.toArray());
 }
});
test('omitted mounts preserve legacy desk and soft-seat offsets and yaw',()=>{
 for(const id of ['desk-1','beanbag-1']){
  const group=new THREE.Group(),def={id,x:2,z:3,rotY:.4};
  const view=furnishings(group,[def],[]).get(id)!;
  assert.deepEqual(view.laptopAnchor.position.toArray(),[0,id==='desk-1'?.8:.4,0]);
  assert.equal(view.laptopAnchor.rotation.y,0);
 }
});
