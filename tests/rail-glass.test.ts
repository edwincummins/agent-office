import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { planMap } from '../src/shared/maps/index.js';
import { withLevels } from '../src/client/world/levels/index.js';
import type { World } from '../src/client/world/world.js';
import { TWO_LEVEL_MODEL } from './fixtures/two-level-model.js';

test('rail glass batches one centred vertical sheet per collider in either orientation', () => {
  const p = planMap(structuredClone(TWO_LEVEL_MODEL));
  const rails = [
    { minX: 2, maxX: 6, minZ: 1, maxZ: 1.2, bottom: 3, top: 4.1, fence: true },
    { minX: 8, maxX: 8.2, minZ: 2, maxZ: 7, bottom: 3, top: 4.5, fence: true },
  ];
  p.levels!.solids = rails;
  p.levels!.lifts = [];
  const base = { plan: p, group: new THREE.Group(), colliders: [], pickables: [], interactables: [], desks: new Map() } as unknown as World;
  const world = withLevels(() => base)(p);
  const meshes: THREE.Mesh[] = [];
  world.group.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
  assert.equal(meshes.length, 1, 'all rail glass retains one material draw call');
  const mesh = meshes[0], positions = mesh.geometry.getAttribute('position');
  assert.equal(positions.count, 12, 'two triangles per pane, without back or edge faces');
  for (const [i, expected] of [[0, [2, 6, 3, 4.1, 1.1, 1.1]], [6, [8.1, 8.1, 3, 4.5, 2, 7]]] as const) {
    const points = Array.from({ length: 6 }, (_, j) => new THREE.Vector3().fromBufferAttribute(positions, i + j));
    const bounds = new THREE.Box3().setFromPoints(points);
    const actual = [bounds.min.x, bounds.max.x, bounds.min.y, bounds.max.y, bounds.min.z, bounds.max.z];
    actual.forEach((n, j) => assert.ok(Math.abs(n - expected[j]) < 1e-5, `${actual} != ${expected}`));
  }
  const material = mesh.material as THREE.MeshStandardMaterial;
  assert.equal(material.side, THREE.DoubleSide);
  assert.equal(material.depthWrite, false);
  assert.equal(material.forceSinglePass, true);
  assert.equal(mesh.renderOrder, 0);
  assert.deepEqual(world.colliders, rails.map(r => ({ ...r, levelSurface: true })), 'collision volume stays intact');
  mesh.geometry.dispose(); material.dispose();
});
