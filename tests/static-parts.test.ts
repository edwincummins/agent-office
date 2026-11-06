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
