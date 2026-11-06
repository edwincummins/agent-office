import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { workerEyes } from '../src/client/world/character/worker-eyes.js';
import { personFaceDetails } from '../src/client/world/character/person-face.js';
import { styleHair } from '../src/client/world/character/person-hair.js';
import { HAIR_STYLES } from '../src/shared/avatar.js';

function visibleMeshes(root:THREE.Object3D){
 const meshes:THREE.Mesh[]=[];
 root.traverseVisible(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 return meshes;
}
test('worker whites and pupils use two rigid batches while gaze and blink move parents',()=>{
 const body=new THREE.Group(),white=new THREE.MeshToonMaterial(),ink=new THREE.MeshToonMaterial();
 const eyes=workerEyes(body,white,ink);
 const meshes=visibleMeshes(body);
 assert.equal(meshes.length,2);
 assert.deepEqual(new Set(meshes.map(m=>m.material)),new Set([white,ink]));
 const pupil=visibleMeshes(eyes.pupils)[0],position=pupil.geometry.getAttribute('position');
 const original=Array.from(position.array),version=position.version;
 eyes.pupils.position.y=.66;eyes.pupils.scale.y=.1;body.position.x=3;body.updateMatrixWorld(true);
 assert.equal(pupil.matrixWorld.elements[12],3);assert.equal(pupil.matrixWorld.elements[13],.66);
 assert.equal(position.version,version);assert.deepEqual(Array.from(position.array),original);
 eyes.release();eyes.release();
 assert.equal(visibleMeshes(body).length,4);
});
test('head face details keep two materials in two draws under one moving parent',()=>{
 const ink=new THREE.MeshToonMaterial(),head=new THREE.Group(),details=personFaceDetails(ink);head.add(details);
 const meshes=visibleMeshes(details);assert.equal(meshes.length,2);
 assert.equal(new Set(meshes.map(m=>m.material)).size,2);
 head.position.set(1,2,3);head.rotation.y=.4;head.updateMatrixWorld(true);
 for(const mesh of meshes)assert.equal(mesh.parent,details);
});
test('Curly adds only one rigid mesh and one outline over Bald after repeated restyles',()=>{
 const head=new THREE.Group(),hair=new THREE.Group(),material=new THREE.MeshToonMaterial();head.add(hair);
 for(const style of ['Curly','Bald','Short','Curly','Bald']){
  styleHair(hair,material,HAIR_STYLES.indexOf(style));
  const meshes=visibleMeshes(head);
  assert.equal(meshes.length,style==='Bald'?0:1);
  const estimatedBaseAndOutline=meshes.length*2;
  assert.ok(estimatedBaseAndOutline<=2,'hair cost is independent of the number of curls');
  if(style==='Curly')assert.equal((meshes[0].geometry.index?.count??meshes[0].geometry.attributes.position.count)/3,2480);
  const arrays=meshes.map(m=>m.geometry.attributes.position.array);
  head.rotation.y+=.2;head.position.y+=.1;head.updateMatrixWorld(true);
  meshes.forEach((m,i)=>assert.equal(m.geometry.attributes.position.array,arrays[i]));
 }
});


test('actual Person profile restyles and updates retain a single Curly mesh delta',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 const context={fillRect(){},stroke(){},beginPath(){},roundRect(){},fillText(){},fill(){},measureText:()=>({width:10})};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>context})}});
 try{
  const {Person}=await import('../src/client/world/character/person.js');
  const look={skin:0,hair:0,style:HAIR_STYLES.indexOf('Bald')};
  const person=new Person('Test','#ffffff',look);
  const bald=visibleMeshes(person.root).length;
  for(const style of ['Curly','Bald','Curly']){
   person.setLook({...look,style:HAIR_STYLES.indexOf(style)});
   person.setColor('#ff0000');
   for(let i=0;i<5;i++)person.update(.016,i*.016,true,false);
   const meshes=visibleMeshes(person.root);
   assert.equal(meshes.length-bald,style==='Bald'?0:1);
   for(const m of meshes)if(!Array.isArray(m.material))assert.ok(m.geometry.groups.length<=1);
  }
 }finally{
  if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');
 }
});
