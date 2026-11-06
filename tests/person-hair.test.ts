import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { styleHair } from '../src/client/world/character/person-hair.ts';
import { HAIR_STYLES } from '../src/shared/avatar.ts';

test('every hairstyle retains its triangles and material in at most one draw', () => {
  // Counts recorded from the original unbatched styles.
  const triangles = [460, 1020, 768, 604, 2480, 860, 0];
  const hair = new THREE.Group(), material = new THREE.MeshToonMaterial();
  for (let i = 0; i < HAIR_STYLES.length; i++) {
    styleHair(hair, material, i);
    assert.equal(hair.children.length, triangles[i] ? 1 : 0, HAIR_STYLES[i]);
    const part = hair.children[0] as THREE.Mesh | undefined;
    if (!part) continue;
    assert.equal(part.material, material); assert.equal(part.castShadow, true); assert.equal(part.receiveShadow, true);
    assert.equal((part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3, triangles[i]);
    for (const value of part.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
  }
});
test('changing a batched hairstyle disposes its geometry without disposing shared colour', () => {
  const hair = new THREE.Group(), material = new THREE.MeshToonMaterial();
  styleHair(hair, material, HAIR_STYLES.indexOf('Curly'));
  let disposed = 0, materialDisposed = 0;
  (hair.children[0] as THREE.Mesh).geometry.addEventListener('dispose', () => disposed++);
  material.addEventListener('dispose', () => materialDisposed++);
  styleHair(hair, material, HAIR_STYLES.indexOf('Bald'));
  assert.equal(disposed, 1); assert.equal(materialDisposed, 0); assert.equal(hair.children.length, 0);
});
