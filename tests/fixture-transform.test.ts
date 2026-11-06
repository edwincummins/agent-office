import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {transformFixture} from '../src/client/world/fixtures/transform.js';
import {ScreenZoom} from '../src/client/features/arcade/ui.js';
import type {Interactable} from '../src/client/world/types.js';
const base={position:{x:0,y:0,z:0},size:{width:1,height:1,depth:1},rotY:0};
test('elevated fixture interactions follow its floor even when native y was omitted',()=>{
 const interaction:Interactable={kind:'jukebox',x:0,z:0,radius:2};
 transformFixture(base,{...base,position:{x:4,y:3,z:6}},[],[],[interaction]);
 assert.deepEqual(interaction,{kind:'jukebox',x:4,y:3,z:6,radius:2});
});
test('screen zoom frames world dimensions independently of depth scale',()=>{
 Object.assign(globalThis,{innerWidth:1000,innerHeight:1000});
 const parent=new THREE.Group();parent.position.set(4,3,6);parent.scale.set(2,3,.1);
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(2,1));parent.add(screen);
 const zoom=new ScreenZoom(screen),camera=new THREE.PerspectiveCamera(60,1,.1,100);
 zoom.update(camera,1,true);
 const span=2*Math.tan(Math.PI/6)*.8;
 assert.ok(Math.abs(camera.position.z-(6+4/span))<1e-9);
 assert.ok(Math.abs(zoom.box().width/zoom.box().height-4/3)<1e-9);
});

test('resizing thin screens does not scale their approach distance or interaction radius',()=>{
 const interaction:Interactable={kind:'tv',x:0,z:2,radius:3};
 transformFixture(base,{...base,size:{width:4,height:2,depth:10}},[],[],[interaction]);
 assert.equal(interaction.z,2);assert.equal(interaction.radius,3);assert.equal(interaction.y,0);
});
