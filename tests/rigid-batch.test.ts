import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchRigidSiblings } from '../src/client/world/rigid-batch.ts';

test('static siblings retain their local arrangement and follow parent motion without frame updates', () => {
  const parent = new THREE.Group(), a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), a.material);
  a.position.x = -2; b.position.x = 2; parent.add(a, b);
  const ga = a.geometry, gb = b.geometry, release = batchRigidSiblings(parent, a.material as THREE.Material);
  const batch = parent.getObjectByName('rigid-sibling-batch') as THREE.Mesh;
  assert.ok(batch); assert.equal(a.visible, false); assert.equal(b.visible, false);
  batch.geometry.computeBoundingBox();
  assert.equal(batch.geometry.boundingBox!.min.x, -2.5); assert.equal(batch.geometry.boundingBox!.max.x, 2.5);
  parent.position.y = 3; parent.updateMatrixWorld(true);
  assert.equal(batch.position.y, 0);
  assert.ok(batch.matrixWorld.elements[13] === 3);
  release(); release();
  assert.equal(a.geometry, ga); assert.equal(b.geometry, gb); assert.equal(a.visible, true); assert.equal(b.visible, true);
  assert.equal(parent.getObjectByName('rigid-sibling-batch'), undefined);
});

test('meshes with different parents or render settings stay separate', () => {
  const root = new THREE.Group(), left = new THREE.Group(), right = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  const a = new THREE.Mesh(new THREE.BoxGeometry(), material), b = new THREE.Mesh(new THREE.BoxGeometry(), material);
  left.add(a); right.add(b); root.add(left, right);
  assert.equal(root.getObjectByName('rigid-sibling-batch'), undefined);
  batchRigidSiblings(left, material);
  assert.equal(left.children.length, 1);
  const c = new THREE.Mesh(new THREE.BoxGeometry(), material); c.castShadow = true; left.add(c);
  const original = a.geometry; batchRigidSiblings(left, material);
  assert.equal(a.geometry, original); assert.equal(left.children.length, 2);
});

test('animated meshes are excluded from static batching', () => {
  const parent = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  const a = new THREE.Mesh(new THREE.BoxGeometry(), material), b = new THREE.Mesh(new THREE.BoxGeometry(), material);
  a.morphTargetInfluences = [0]; a.geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([0, 0, 0], 3)];
  parent.add(a, b);
  batchRigidSiblings(parent, material);
  assert.equal(a.visible, true); assert.equal(b.visible, true); assert.equal(parent.children.length, 2);
});
