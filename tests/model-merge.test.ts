import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeOpaqueModelMeshes } from '../src/client/world/model/merge.js';

test('model batching merges opaque static siblings by material and keeps moving and transparent geometry separate', () => {
  const root = new THREE.Group();
  const opaque = new THREE.MeshStandardMaterial({ color: '#735642' });
  const glass = new THREE.MeshStandardMaterial({ color: '#91b7c5', transparent: true, opacity: .3 });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const west = new THREE.Mesh(cube, opaque);
  west.position.x = -2;
  const east = new THREE.Mesh(cube, opaque);
  east.position.x = 2;
  const pane = new THREE.Mesh(cube, glass);
  const door = new THREE.Group();
  door.name = 'Door__north';
  door.add(new THREE.Mesh(cube, opaque));
  const interactive = new THREE.Group();
  interactive.userData.interact = { kind: 'meeting' };
  const interactiveMesh = new THREE.Mesh(cube, opaque);
  interactive.add(interactiveMesh);
  root.add(west, east, pane, door, interactive);

  assert.equal(mergeOpaqueModelMeshes(root), 1);
  assert.equal(root.children.length, 4);
  assert.equal(root.children.filter((child) => child.name.startsWith('local-model-batch:')).length, 1);
  const batch = root.children.find((child) => child.name.startsWith('local-model-batch:')) as THREE.Mesh;
  const bounds = new THREE.Box3().setFromObject(batch);
  assert.equal(bounds.min.x, -2.5);
  assert.equal(bounds.max.x, 2.5);
  assert.ok(root.getObjectByName('Door__north'));
  assert.equal(pane.parent, root);
  assert.equal(interactiveMesh.parent, interactive, 'geometry under an interactive node stays addressable');
});

test('model batching leaves reflected geometry and hidden named subtrees intact', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#735642' });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const regular = new THREE.Mesh(geometry, material);
  regular.name = 'visible-a';
  const other = new THREE.Mesh(geometry, material);
  other.name = 'visible-b';
  const reflected = new THREE.Mesh(geometry, material);
  reflected.scale.x = -1;
  const hiddenGroup = new THREE.Group();
  hiddenGroup.name = 'hide-by-name';
  hiddenGroup.visible = false;
  hiddenGroup.add(new THREE.Mesh(geometry, material));
  root.add(regular, other, reflected, hiddenGroup);

  assert.equal(mergeOpaqueModelMeshes(root), 1);
  assert.equal(regular.parent, null);
  assert.equal(other.parent, null);
  assert.equal(reflected.parent, root);
  assert.equal(hiddenGroup.children.length, 1);
  assert.equal(root.getObjectByName('hide-by-name'), hiddenGroup);
  hiddenGroup.visible = true;
  assert.equal(root.getObjectByName('hide-by-name')?.visible, true);
  const batch = root.children.find((child) => child.name.startsWith('local-model-batch:')) as THREE.Mesh;
  assert.equal(batch.frustumCulled, true);
  assert.deepEqual(batch.userData.sourceNames, ['visible-a', 'visible-b']);
});

test('model batching excludes hidden descendants from visible batch geometry', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#735642' });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const hidden = new THREE.Group();
  hidden.visible = false;
  const hiddenMesh = new THREE.Mesh(geometry, material);
  hidden.add(hiddenMesh);
  const sibling = new THREE.Mesh(geometry, material);
  sibling.name = 'visible-sibling';
  const secondSibling = new THREE.Mesh(geometry, material);
  secondSibling.name = 'visible-second-sibling';
  root.add(hidden, sibling, secondSibling);

  assert.equal(mergeOpaqueModelMeshes(root), 1);
  const batch = root.children.find((child) => child.name.startsWith('local-model-batch:')) as THREE.Mesh;
  assert.ok(batch);
  assert.equal(batch.geometry.index!.count / 3, 24, 'the batch contains exactly the two visible cubes');
  assert.deepEqual(batch.userData.sourceNames, ['visible-sibling', 'visible-second-sibling']);
  assert.equal(hidden.visible, false);
  assert.equal(hiddenMesh.parent, hidden, 'the hidden mesh remains under its named ancestor');
});
