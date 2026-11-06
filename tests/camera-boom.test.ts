import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {shortenCameraBoom} from '../src/client/player/camera-boom.js';
import {aimCamera,type Followed} from '../src/client/player/camera.js';
import type {Collider} from '../src/client/world/types.js';
const wall:Collider={minX:-2,maxX:2,minZ:2,maxZ:2.01,top:5};
function followed():Followed{return {view:'third',pos:new Vector3(),lookPitch:0,camYaw:0,camPitch:.42,camDist:7.5,stepOffset:0,room:{minX:-20,maxX:20,minZ:-20,maxZ:20,wall:.2,enclosed:true},wing:0,rig:null,riding:false,street:0,colliders:[{minX:-20,maxX:20,minZ:-20,maxZ:20,bottom:-.2,top:0}]};}
test('a thin inner wall shortens the segment even when the endpoint is past it',()=>{
 const camera=new Vector3(0,3,7);shortenCameraBoom(new Vector3(0,1.3,0),camera,[wall]);assert.ok(Math.abs(camera.z-1.82)<1e-10);assert.ok(camera.y>1.3&&camera.y<3);
});
test('nearest of multiple walls wins regardless of order; parallel and zero segments are safe',()=>{
 const farther={...wall,minZ:4,maxZ:4.1};
 for(const boxes of [[wall,farther],[farther,wall]]){const camera=new Vector3(0,2,8);shortenCameraBoom(new Vector3(0,1.3,0),camera,boxes);assert.ok(Math.abs(camera.z-1.82)<1e-10);}
 const same=new Vector3(0,1.3,0);shortenCameraBoom(same,same,[wall]);assert.deepEqual(same.toArray(),[0,1.3,0]);
 const parallel=new Vector3(8,1.3,0);shortenCameraBoom(new Vector3(0,1.3,0),parallel,[wall]);assert.equal(parallel.x,8);
});
test('unobstructed distance, low furniture and elevated slabs remain clear',()=>{
 for(const boxes of [[],[{...wall,top:.7}],[{...wall,bottom:4,top:5}]]){
  const camera=new Vector3(0,2,7),before=camera.clone();shortenCameraBoom(new Vector3(0,1.3,0),camera,boxes);assert.deepEqual(camera.toArray(),before.toArray());
 }
});
test('internal room wall inside hall bounds pulls in immediately then eases outward',()=>{
 const p=followed(),camera=new PerspectiveCamera();aimCamera(camera,p,0,0,true);const open=camera.position.clone();assert.ok(open.z>6);
 p.colliders.push(wall);aimCamera(camera,p,0,0,false);assert.ok(camera.position.z<=1.82+1e-10);
 const shortened=camera.position.clone();p.colliders.pop();aimCamera(camera,p,0,0,false);
 assert.ok(camera.position.z>shortened.z&&camera.position.z<open.z);assert.ok(camera.position.distanceTo(shortened.clone().lerp(open,.25))<1e-10);
});
test('a map switch immediately checks the old camera against the new colliders',()=>{
 const p=followed(),camera=new PerspectiveCamera();aimCamera(camera,p,0,0,true);
 p.colliders=[...p.colliders,{...wall,minZ:1,maxZ:1.01}];aimCamera(camera,p,0,0,false);assert.ok(camera.position.z<=.82+1e-10);
 p.colliders=[];aimCamera(camera,p,0,0,true);assert.ok(camera.position.z>6);
});
test('first person and existing unobstructed hall-bound clamp stay unchanged',()=>{
 const p=followed(),camera=new PerspectiveCamera();p.view='first';p.colliders.push(wall);aimCamera(camera,p,0,0,true);assert.deepEqual(camera.position.toArray(),[0,1.4,0]);
 p.view='third';p.colliders=[];p.room.maxZ=3;aimCamera(camera,p,0,0,true);assert.equal(camera.position.z,2.6);
});

test('non-landable authored walls still occlude the camera',()=>{
 const camera=new Vector3(0,2,7);shortenCameraBoom(new Vector3(0,1.3,0),camera,[{...wall,fence:true}]);assert.ok(Math.abs(camera.z-1.82)<1e-10);
});

test('invisible movement-only barriers do not shorten the camera',()=>{
 const camera=new Vector3(0,2,7);shortenCameraBoom(new Vector3(0,1.3,0),camera,[{...wall,fence:true,cameraOcclusion:false}]);assert.deepEqual(camera.toArray(),[0,2,7]);
});
