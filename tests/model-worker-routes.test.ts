import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Arrivals, Departures } from '../src/client/features/workers/leaving';
import type { Worker } from '../src/client/world/character';
import type { DeskView } from '../src/client/world/types';
import type { Laptop } from '../src/client/features/workers/laptop';
const ways={in:()=>[],home:()=>({way:[],chute:false})};
function fixture(){
 const root=new THREE.Group(),seatAnchor=new THREE.Group();seatAnchor.add(root);
 let disposed=false;
 const model={root,walking:true,stopDancing(){},leave(){},update(){},dispose(){disposed=true;}} as unknown as Worker;
 const desk={def:{id:'desk-1',x:0,z:0,rotY:0},seatAnchor,chair:new THREE.Group()} as DeskView;
 return {root,model,desk,disposed:()=>disposed};
}
test('unreachable arrivals stay seated without starting a wall-crossing walk',()=>{
 const f=fixture(),arrivals=new Arrivals(new THREE.Group(),()=>0,()=>{},()=>ways);
 arrivals.add(f.model,f.desk);arrivals.update(10);
 assert.equal(f.root.parent,f.desk.seatAnchor);assert.equal(f.model.walking,false);assert.deepEqual(arrivals.positions(),[]);
});
test('unreachable departures finish at the chair and release their resources',()=>{
 const f=fixture();let released=0;
 const laptop={root:new THREE.Group(),shut:()=>true,dispose(){}} as unknown as Laptop;
 const departures=new Departures(new THREE.Group(),()=>0,()=>{},()=>released++,()=>ways);
 departures.add(f.model,laptop,f.desk);departures.update(10,10);
 assert.equal(f.root.parent,null);assert.equal(f.disposed(),true);assert.equal(released,1);
});
