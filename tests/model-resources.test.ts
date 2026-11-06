import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {releaseModel,retainModelTextures} from '../src/client/world/model/resources.js';

test('owned GLB resources shared by meshes are released exactly once',()=>{
 const geometry=new THREE.BoxGeometry(),texture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:texture});
 const root=new THREE.Group();root.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material));
 const disposed={geometry:0,texture:0,material:0};
 geometry.addEventListener('dispose',()=>disposed.geometry++);texture.addEventListener('dispose',()=>disposed.texture++);material.addEventListener('dispose',()=>disposed.material++);
 releaseModel(root);assert.deepEqual(disposed,{geometry:1,texture:1,material:1});
});

test('removed glass normals remain owned until the imported model is released',()=>{
 const normal=new THREE.Texture(),material=new THREE.MeshStandardMaterial({normalMap:normal});
 const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));let disposed=0;normal.addEventListener('dispose',()=>disposed++);
 retainModelTextures(root);material.normalMap=null;releaseModel(root);assert.equal(disposed,1);
});
