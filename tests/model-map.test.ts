import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkModel } from '../src/shared/maps/model.js';
import { planMap } from '../src/shared/maps/index.js';
import { CASTLE } from '../src/shared/maps/castle.js';
import { readMapModel } from '../src/server/http/routes/map-model.js';

const bounds={minX:-30,maxX:30,minZ:-30,maxZ:30};
test('lounge rugs stay in the room and clear of walls',()=>{
 assert.equal(checkModel({...model(),lounges:[]},bounds,10).lounges?.length,0);
 assert.equal(checkModel({...model(),lounges:[{x:0,z:-10,rotY:0}]},bounds,10).lounges?.[0].x,0);
 assert.throws(()=>checkModel({...model(),lounges:[{x:29,z:0}]},bounds,10),/outside the hall/);
 assert.throws(()=>checkModel({...model(),lounges:[{x:0,z:-10}],walls:[{minX:-1,maxX:1,minZ:-11,maxZ:-9,top:4}]},bounds,10),/rug overlaps/);
 assert.throws(()=>checkModel({...model(),lounges:[{x:0,z:-10,rotY:1}]},bounds,10),/rotation 0/);
 assert.throws(()=>checkModel({...model(),lounges:[{x:0,z:-10}],platforms:[{minX:-1,maxX:1,minZ:-11,maxZ:-9,top:.5}]},bounds,10),/raised platform/);
 assert.throws(()=>checkModel({...model(),platforms:[{minX:-.1,maxX:.1,minZ:6.7,maxZ:7,top:.2}]},bounds,10),/soft seat overlaps/);
});
function model(){return {asset:'room.glb',seats:Array.from({length:32},(_,i)=>({x:-12+(i%8)*3,z:Math.floor(i/8)*3,rotY:0})),walls:[],screen:{x:0,y:3,z:-20,rotY:0,width:6,height:3},whiteboard:{x:10,y:2,z:-20,rotY:0,width:3,height:2}};}
test('model maps retain all stable seat ids and explicit zero coordinates',()=>{
 const p=planMap({...CASTLE,id:'test-model',style:'model',hall:{width:60,length:60,height:10},tables:[],props:[],dungeon:null,throne:null,herald:null,lineup:null,sendHome:null,model:model()});
 assert.equal(p.desks.length,20);assert.equal(p.overflow.length,12);
 assert.equal(p.desks[4].x,0);assert.equal(p.desks[4].z,0);assert.equal(p.desks[19].id,'desk-20');assert.equal(p.overflow[11].id,'beanbag-12');
 assert.equal(p.config!.model!.asset,'room.glb');
});
test('models reject missing, duplicate, nonfinite and wall-covered seats and external assets',()=>{
 assert.throws(()=>checkModel({...model(),seats:[]},bounds,10),/20 desks then 12/);
 const duplicate=model();duplicate.seats[1]=duplicate.seats[0];assert.throws(()=>checkModel(duplicate,bounds,10),/distinct/);
 const bad=model();bad.seats[0].x=Infinity;assert.throws(()=>checkModel(bad,bounds,10));
 assert.throws(()=>checkModel({...model(),walls:[{minX:-13,maxX:-11,minZ:-1,maxZ:1,top:3}]},bounds,10),/inside a wall/);
 for(const asset of ['../room.glb','https://example.com/room.glb','C:\\room.glb',''])assert.throws(()=>checkModel({...model(),asset},bounds,10),/filename/);
});
test('model route reads only a valid embedded GLB from its local asset directory',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'office-model-'));
 try{
  await mkdir(path.join(dir,'assets'));
  const json=Buffer.from(JSON.stringify({asset:{version:'2.0'}}).padEnd(28,' '));
  const bytes=Buffer.alloc(20+json.length);bytes.write('glTF');bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);
  await writeFile(path.join(dir,'assets','room.glb'),bytes);
  assert.deepEqual(await readMapModel(dir,'room.glb'),bytes);
  await assert.rejects(readMapModel(dir,'../room.glb'),/filename/);
  await writeFile(path.join(dir,'assets','bad.glb'),'not a GLB');await assert.rejects(readMapModel(dir,'bad.glb'),/Invalid GLB/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('model chair and approach cannot overlap a wall or leave the hall',()=>{
 const m=model();
 assert.throws(()=>checkModel({...m,walls:[{minX:-12.3,maxX:-11.7,minZ:.6,maxZ:1.4,top:3}]},bounds,10),/chair or approach/);
 m.seats[0]={x:0,z:29.7,rotY:0};assert.throws(()=>checkModel(m,bounds,10),/outside/);
});
test('models reject legacy structures they cannot render',()=>{
 const base={...CASTLE,id:'test-model',style:'model',hall:{width:60,length:60,height:10},tables:[],props:[],dungeon:null,throne:null,herald:null,lineup:null,sendHome:null,model:model()};
 for(const patch of [{tables:CASTLE.tables},{throne:CASTLE.throne},{herald:CASTLE.herald},{lineup:CASTLE.lineup}]) assert.throws(()=>planMap({...base,...patch}),/model maps use explicit/);
});
test('GLBs with external images or buffers are rejected',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'office-model-'));
 try{
  await mkdir(path.join(dir,'assets'));
  for(const field of ['images','buffers']){
   const raw=JSON.stringify({asset:{version:'2.0'},[field]:[{uri:'https://example.invalid/asset'}]});
   const json=Buffer.from(raw.padEnd(Math.ceil(raw.length/4)*4,' '));
   const bytes=Buffer.alloc(20+json.length);bytes.write('glTF');bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);
   await writeFile(path.join(dir,'assets','room.glb'),bytes);await assert.rejects(readMapModel(dir,'room.glb'),/embed all/);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
