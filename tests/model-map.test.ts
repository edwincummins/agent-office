import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkModel } from '../src/shared/maps/model.js';
import { planMap } from '../src/shared/maps/index.js';
import { CASTLE } from '../src/shared/maps/castle.js';
import { openMapModel } from '../src/server/http/routes/map-model.js';

async function readMapModel(folder: string, name: string) { const model = await openMapModel(folder, name); try { return await model.handle.readFile(); } finally { await model.handle.close(); } }

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
test('model seat anchors preserve their authored chair type and reject unsupported types',()=>{
 const value=model();value.seats[0]={...value.seats[0],chairType:'task'};
 const checked=checkModel(value,bounds,10);
 assert.equal(checked.seats[0].chairType,'task');
 assert.throws(()=>checkModel({...value,seats:value.seats.map((s,i)=>i? s:{...s,chairType:'beanbag'})},bounds,10),/chairType is not supported/);
});
test('a resolved model plan keeps its checked config independent from caller-owned map data',()=>{
 const input={...CASTLE,id:'config-snapshot',style:'model' as const,hall:{width:60,length:60,height:10},tables:[],props:[],dungeon:null,throne:null,herald:null,lineup:null,sendHome:null,hideDeskSigns:['desk-1'],model:model()};
 const plan=planMap(input);
 assert.notEqual(plan.config,input);
 assert.notEqual(plan.config!.model,input.model);
 assert.notEqual(plan.config!.model!.seats,input.model.seats);
 assert.notEqual(plan.config!.hideDeskSigns,input.hideDeskSigns);
 input.model.seats[0].x=18;input.hideDeskSigns[0]='desk-2';
 assert.equal(plan.config!.model!.seats[0].x,-12);
 assert.deepEqual(plan.config!.hideDeskSigns,['desk-1']);
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

test('source furniture preserves 32 worker ids and five explicit council chairs without a circle',()=>{
 const value=model();
 const chairs=value.seats.map(s=>({x:s.x,z:s.z+.85,rotY:Math.PI,y:.4}));
 const council=Array.from({length:5},(_,i)=>({x:-8+i*2,z:-12,rotY:0,y:.4}));
 const source={chairs,council,meetingBoard:value.whiteboard,stations:['issues' as const,'queue' as const]};
 const config={...CASTLE,id:'source-room',style:'model' as const,hall:{width:60,length:60,height:10},tables:[],props:[],dungeon:null,throne:null,herald:null,lineup:null,sendHome:null,model:{...value,source}};
 const plan=planMap(config);
 assert.equal(plan.meeting.length,5);assert.equal(plan.desks.length+plan.overflow.length,32);
 assert.deepEqual(plan.config!.model!.source!.stations,['issues','queue']);
 for(const [i,d] of plan.meeting.entries())assert.ok(Math.hypot(d.x+Math.sin(d.rotY)*.85-council[i].x,d.z+Math.cos(d.rotY)*.85-council[i].z)<1e-10);
 assert.throws(()=>checkModel({...value,source:{...source,council:[]}},bounds,10),/exactly 5/);
 assert.throws(()=>checkModel({...value,source:{...source,chairs:chairs.map(p=>({...p,x:p.x+1}))}},bounds,10),/authored sit offset/);
 assert.throws(()=>checkModel({...value,source:{...source,stations:['issues','issues']}},bounds,10),/distinct list/);
});

test('model station label offsets are bounded and limited to known stations',()=>{
 const checked=checkModel({...model(),stationLabelOffsets:{queue:1.5}},bounds,10);
 assert.equal(checked.stationLabelOffsets?.queue,1.5);
 assert.throws(()=>checkModel({...model(),stationLabelOffsets:{queue:2.01}},bounds,10),/between|at most|stationLabelOffsets/);
 assert.throws(()=>checkModel({...model(),stationLabelOffsets:{unknown:1}},bounds,10),/unknown station/);
});

test('model-authored station chairs place board workers on their proxy sit points',()=>{
 const value=model();
 const chairs=value.seats.map(s=>({x:s.x,z:s.z+.85,rotY:Math.PI,y:.47}));
 const council=Array.from({length:5},(_,i)=>({x:-8+i*2,z:-12,rotY:0,y:.47}));
 const source={chairs,council,meetingBoard:value.whiteboard,stations:['issues' as const,'pulls' as const,'queue' as const],stationChairs:{queue:{x:0,z:-8,rotY:Math.PI,y:.47,chairType:'task' as const,sit:{forward:.03,y:.47}}}};
 const config={...CASTLE,id:'station-chair-room',style:'model' as const,hall:{width:60,length:60,height:10},tables:[],props:[],dungeon:null,throne:null,herald:null,lineup:null,sendHome:null,model:{...value,source}};
 const plan=planMap(config);const queue=plan.stations.find(s=>s.station==='queue')!;
 assert.ok(Math.hypot(queue.x,queue.z-(-8.03))<1e-10);
 assert.equal(queue.rotY,Math.PI);
});

test('model-authored chair sit offsets preserve proxy types and replace the legacy 0.85 m offset',()=>{
 const value=model();
 const chairs=value.seats.map(s=>({
  x:s.x-Math.sin(s.rotY)*.03,z:s.z-Math.cos(s.rotY)*.03,rotY:s.rotY,y:.47,
  chairType:'task' as const,sit:{forward:.03,y:.47},
 }));
 const council=Array.from({length:5},(_,i)=>({x:-8+i*2,z:-12,rotY:0,y:.47,chairType:'conference' as const,sit:{forward:.03,y:.47}}));
 const checked=checkModel({...value,source:{chairs,council,meetingBoard:value.whiteboard}},bounds,10);
 assert.equal(checked.source!.chairs[0].chairType,'task');
 assert.deepEqual(checked.source!.chairs[0].sit,{forward:.03,y:.47});
 const config={...CASTLE,id:'proxy-sit-room',style:'model' as const,hall:{width:60,length:60,height:10},tables:[],props:[],dungeon:null,throne:null,herald:null,lineup:null,sendHome:null,model:{...value,source:{chairs,council,meetingBoard:value.whiteboard}}};
 const plan=planMap(config);
 assert.ok(Math.hypot(plan.meeting[0].x-(council[0].x+Math.sin(council[0].rotY)*.03),plan.meeting[0].z-(council[0].z+Math.cos(council[0].rotY)*.03))<1e-10);
 assert.equal(plan.meeting[0].rotY,council[0].rotY);
 const bad=chairs.map((c,i)=>i?c:{...c,sit:{forward:.4,y:.47}});
 assert.throws(()=>checkModel({...value,source:{chairs:bad,council,meetingBoard:value.whiteboard}},bounds,10),/authored sit offset/);
});

test('sofa-seat and pouf entries sit exactly at their authored centres',()=>{
 const value=model();
 value.seats=value.seats.map((s,i)=>({...s,chairType:i<30?'task' as const:'pouf' as const}));
 const chairs=value.seats.map((s,i)=>i<30
  ?{x:s.x,z:s.z-.03,rotY:s.rotY,y:.47,chairType:'task' as const,sit:{forward:.03,y:.47}}
  :{x:s.x,z:s.z,rotY:s.rotY,y:.44,chairType:'pouf' as const,sit:{forward:0,y:.44}});
 const council=Array.from({length:5},(_,i)=>({x:-8+i*2,z:-12,rotY:0,y:.47,chairType:'conference' as const,sit:{forward:.03,y:.47}}));
 const config={...CASTLE,id:'sofa-centres',style:'model' as const,hall:{width:60,length:60,height:10},tables:[],props:[],dungeon:null,throne:null,herald:null,lineup:null,sendHome:null,model:{...value,source:{chairs,council,meetingBoard:value.whiteboard}}};
 const plan=planMap(config);
 assert.equal(plan.config!.model!.seats[30].chairType,'pouf');
 assert.deepEqual(plan.config!.model!.source!.chairs[30].sit,{forward:0,y:.44});
 assert.deepEqual({x:plan.overflow[10].x,z:plan.overflow[10].z},{x:value.seats[30].x,z:value.seats[30].z});
 assert.deepEqual({x:plan.overflow[11].x,z:plan.overflow[11].z},{x:value.seats[31].x,z:value.seats[31].z});
});

import {modelColliders} from '../src/client/world/model/colliders.js';
test('authored low platform stays low when also present in navigation rectangles',()=>{
 const platform={minX:-2,maxX:2,minZ:-12,maxZ:-10,top:.4};const checked=checkModel({...model(),platforms:[platform]},bounds,10);
 const plan=planMap({...CASTLE,id:'platform-room',style:'model',hall:{width:60,length:60,height:10},tables:[],props:[],dungeon:null,throne:null,herald:null,lineup:null,sendHome:null,model:checked});
 plan.obstacles!.rects.push([-2,2,-12,-10]);
 const matching=modelColliders(plan,checked).filter(c=>c.minX===-2&&c.maxX===2&&c.minZ===-12&&c.maxZ===-10);
 assert.equal(matching.length,1);assert.equal(matching[0].top,.4);
});
