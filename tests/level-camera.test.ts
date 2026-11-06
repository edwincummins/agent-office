import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {aimCamera,type Followed} from '../src/client/player/camera.js';
test('slab-edge approaches stay smooth in all directions without entering the slab',()=>{
let worst={max:0,yaw:0,pitch:0,dist:0,diag:0,frame:0};
for(const yaw of [0,.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6])for(const pitch of [.25,.5,.8,1.1])for(const dist of [7,16])for(const diag of [0,.5,-.5]){
 const c=new THREE.PerspectiveCamera();const p:Followed={view:'third',pos:new THREE.Vector3(0,0,-12),lookPitch:0,camYaw:yaw,camPitch:pitch,camDist:dist,stepOffset:0,room:{minX:-40,maxX:40,minZ:-40,maxZ:40,wall:.2,enclosed:true},wing:0,rig:null,riding:false,colliders:[{minX:-20,maxX:20,minZ:0,maxZ:20,bottom:2.75,top:3,levelSurface:true}],street:0};
 aimCamera(c,p,0,0,true);
 for(let i=0;i<240;i++){const old=c.position.clone();p.pos.z+=.1;p.pos.x+=.1*diag;aimCamera(c,p,0,0,false);assert.ok(!(c.position.x > -20 && c.position.x < 20 && c.position.z > 0 && c.position.z < 20 && c.position.y > 2.75 && c.position.y < 3), 'camera entered slab');const jump=old.distanceTo(c.position);if(jump>worst.max)worst={max:jump,yaw,pitch,dist,diag,frame:i};}
}
assert.ok(worst.max < .5, JSON.stringify(worst));
});
