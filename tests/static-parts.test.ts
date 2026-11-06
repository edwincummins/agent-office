import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticParts } from '../src/client/world/static-parts.js';

test('static batching preserves transformed bounds, triangles, material animation and pivot hierarchy', () => {
 const root=new THREE.Group(), pivot=new THREE.Group(), mat=new THREE.MeshBasicMaterial();root.add(pivot);pivot.position.set(7,3,-2);
 for(const x of [-2,2]){const m=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),mat);m.position.x=x;m.rotation.z=.3;pivot.add(m);}
 root.updateMatrixWorld(true);const before=new THREE.Box3().setFromObject(root);
 batchStaticParts(root);root.updateMatrixWorld(true);
 assert.equal(root.children[0],pivot);assert.equal(pivot.children.length,1);
 const batch=pivot.children[0] as THREE.Mesh;assert.equal(batch.material,mat);assert.equal(batch.geometry.getAttribute('position').count,72);
 const after=new THREE.Box3().setFromObject(root);assert.ok(before.min.distanceTo(after.min)<1e-6);assert.ok(before.max.distanceTo(after.max)<1e-6);
 mat.color.set('red');assert.equal((batch.material as THREE.MeshBasicMaterial).color.getHexString(),'ff0000');
 pivot.rotation.x=.4;root.updateMatrixWorld(true);assert.notDeepEqual(new THREE.Box3().setFromObject(root).min.toArray(),before.min.toArray());
});

test('transparent, hidden, interactive, differing shadow state and distinct material meshes stay separate',()=>{
 const root=new THREE.Group(),mat=new THREE.MeshBasicMaterial();const parts:THREE.Mesh[]=[];
 for(let i=0;i<5;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(),mat);parts.push(m);root.add(m);}
 parts[0].visible=false;parts[1].userData.interact={kind:'test'};parts[2].castShadow=true;
 parts[3].material=mat.clone();parts[4].material=new THREE.MeshBasicMaterial({transparent:true});
 batchStaticParts(root);assert.deepEqual(root.children,parts);
});
import { toon, toonUnique } from '../src/client/world/toon.js';

test('cached palette batching preserves linear vertex colours and separates animated and emissive materials', () => {
 const root = new THREE.Group();
 const colors = [toon('#ff8000'), toon('#0080ff')];
 const animated = toonUnique('#ff8000');
 const glow = toon('#ff8000', { emissive: '#ff8000' });
 for (const material of [...colors, animated, glow]) root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
 batchStaticParts(root);
 assert.equal(root.children.length, 3);
 const batch = root.children.find(n => n.name === 'static-fixture-batch') as THREE.Mesh;
 const material = batch.material as THREE.MeshToonMaterial;
 assert.equal(material.color.getHexString(), 'ffffff');
 assert.equal(material.vertexColors, true);
 const values = batch.geometry.getAttribute('color');
 for (const [index, color] of colors.entries()) {
  const actual = new THREE.Color().fromBufferAttribute(values, index * 36);
  assert.ok(actual.toArray().every((n, i) => Math.abs(n - color.color.toArray()[i]) < 1e-6));
 }
 assert.equal(colors[0].vertexColors, false);
 animated.color.set('green');
 assert.ok(root.children.some(n => n instanceof THREE.Mesh && n.material === animated));
 assert.ok(root.children.some(n => n instanceof THREE.Mesh && n.material === glow));
});

test('rebuilding a fixture reuses the immutable palette rather than leaking a material per world', () => {
 const build = () => {
  const root = new THREE.Group();
  for (const color of ['#123456', '#654321']) root.add(new THREE.Mesh(new THREE.BoxGeometry(), toon(color)));
  batchStaticParts(root);
  return root.children[0] as THREE.Mesh;
 };
 assert.equal(build().material, build().material);
});

test('a mesh carrying child controls stays attached with those controls intact', () => {
 const root = new THREE.Group(), material = toon('#123123');
 const panel = new THREE.Mesh(new THREE.BoxGeometry(), material);
 const button = new THREE.Mesh(new THREE.SphereGeometry(), material);
 panel.add(button); root.add(panel, new THREE.Mesh(new THREE.BoxGeometry(), material));
 batchStaticParts(root);
 assert.equal(panel.parent, root);
 assert.equal(button.parent, panel);
 assert.equal(root.children.length, 2);
});

import { workerHeadset } from '../src/client/world/character/worker-headset.js';
test('worker headset is one draw and remains one independently hideable outfit piece', () => {
 const headset = workerHeadset();
 assert.equal(headset.children.length, 1);
 const bounds = new THREE.Box3().setFromObject(headset);
 assert.ok(Math.abs(bounds.min.x + .36) < .005);
 assert.ok(Math.abs(bounds.max.x - .36) < .005);
 assert.ok(bounds.min.y < .66 && bounds.max.y > 1.03);
 const body = new THREE.Group(); body.add(headset); headset.visible = false;
 let visible = 0; body.traverseVisible(n => { if (n instanceof THREE.Mesh) visible++; });
 assert.equal(visible, 0);
});
