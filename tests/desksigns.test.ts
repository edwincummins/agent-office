import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildDeskSigns } from '../src/client/world/desksigns.js';

test('map desk-sign exclusions omit the complete assembly, including cords', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const context = {
    fillRect() {}, stroke() {}, beginPath() {}, roundRect() {}, fillText() {},
    measureText: () => ({ width: 10 }),
  };
  const canvas = { width: 0, height: 0, getContext: () => context };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => canvas } });
  const signs = buildDeskSigns();
  const hidden = ['desk-7', 'desk-8', 'desk-15', 'desk-16', 'desk-17', 'desk-18', 'desk-19', 'desk-20'];
  const labels = Object.fromEntries(hidden.map(id => [id, { text: `Pod ${id}`, color: '#6b4a2e', by: 'test', at: 0 }]));
  const orphaned = new THREE.Group();
  const orphanCord = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  orphanCord.userData.deskSignId = 'desk-7';
  orphaned.add(orphanCord);
  signs.group.add(orphaned);

  try {
    signs.set(labels, () => true);
    assert.ok(hidden.every(id => signs.get(id)));
    signs.set(labels, () => true, hidden);
    assert.equal(orphanCord.visible, false);
    signs.group.remove(orphaned);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }

  assert.ok(hidden.every(id => signs.get(id) === undefined));
  assert.equal(signs.group.children.length, 0);
});
