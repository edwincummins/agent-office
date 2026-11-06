import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchRigidParts } from '../src/client/world/rigid-batch.ts';

test('rigid batch follows transforms and visibility without losing source picking or ownership', () => {
  const root=new THREE.Group(), pivot=new THREE.Group(), material=new THREE.MeshBasicMaterial();root.add(pivot);
  const a=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material),b=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);
  a.position.x=-2;b.position.x=2;pivot.add(a,b);const ga=a.geometry,gb=b.geometry;
  const release=batchRigidParts(root,[material]);const batch=root.getObjectByName('rigid-part-batch') as THREE.Mesh;
  assert.ok(batch);root.updateMatrixWorld(true);
  batch.geometry.computeBoundingBox();assert.equal(batch.geometry.boundingBox!.min.x,-2.5);assert.equal(batch.geometry.boundingBox!.max.x,2.5);
  pivot.position.y=3;b.visible=false;root.updateMatrixWorld(true);
  const pos=batch.geometry.getAttribute('position');assert.equal(pos.getY(0),3.5);assert.equal(pos.getX(36),0);
  const ray=new THREE.Raycaster(new THREE.Vector3(-2,3,3),new THREE.Vector3(0,0,-1));assert.ok(ray.intersectObject(a).length);
  release();release();assert.equal(a.geometry,ga);assert.equal(b.geometry,gb);assert.equal(root.getObjectByName('rigid-part-batch'),undefined);
});
test('different shadow settings are never merged and unrelated materials remain untouched',()=>{
 const root=new THREE.Group(),m=new THREE.MeshBasicMaterial();const a=new THREE.Mesh(new THREE.BoxGeometry(),m),b=new THREE.Mesh(new THREE.BoxGeometry(),m);b.castShadow=true;root.add(a,b);const original=a.geometry;batchRigidParts(root,[m]);assert.equal(a.geometry,original);assert.equal(root.children.length,2);
});
