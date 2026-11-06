import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mediaPanels} from '../src/client/world/fixtures/media-wall';
import type {World} from '../src/client/world/world';
import type {ResolvedSlots} from '../src/shared/fixtures';
test('paired media faces have equal dimensions, centre height, depth and thin frames',()=>{
 const group=new THREE.Group(),legacy=new THREE.Group();group.add(legacy);
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(6.4,3.6)),trim=new THREE.Mesh(new THREE.BoxGeometry(6.7,3.9,.14));legacy.add(screen,trim);screen.position.z=.08;legacy.scale.set(.4,.4,.7);
 const board=new THREE.Mesh(new THREE.PlaneGeometry(2.7,1.52));const boardGroup=new THREE.Group();boardGroup.userData.interact={kind:'services',x:4,z:5,radius:2};boardGroup.add(board);group.add(boardGroup);
 const slot={position:{x:1,y:1.65,z:6},size:{width:2.7,height:1.52,depth:.1},rotY:Math.PI};
 const slots:ResolvedSlots={mediaWall:{...slot},tv:slot,services:{...slot,position:{...slot.position,x:4}}};
 const world={group,pickables:[legacy,boardGroup],boardMeshes:{services:board}} as unknown as World;
 const frames=mediaPanels(world,slots,screen);group.updateMatrixWorld(true);
 const tvBox=new THREE.Box3().setFromObject(screen),boardBox=new THREE.Box3().setFromObject(board);
 assert.ok(tvBox.getSize(new THREE.Vector3()).distanceTo(boardBox.getSize(new THREE.Vector3()))<1e-10);
 assert.equal(screen.position.y,board.position.y);assert.equal(screen.position.z,board.position.z);assert.equal(trim.visible,false);assert.equal(board.userData.interact.kind,'services');assert.ok(world.pickables.includes(board));
 for(const frame of frames){const size=new THREE.Box3().setFromObject(frame).getSize(new THREE.Vector3());assert.ok(Math.abs(size.x-2.78)<1e-6);assert.ok(Math.abs(size.y-1.60)<1e-6);}
});
test('separate stock TV retains its original frame and placement',()=>{
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(6.4,3.6));screen.position.set(18,2.2,.08);const before=screen.toJSON();
 assert.deepEqual(mediaPanels({} as World,{},screen),[]);assert.deepEqual(screen.toJSON(),before);
});
