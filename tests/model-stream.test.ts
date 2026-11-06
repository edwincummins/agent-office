import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, get} from 'node:http';
import {mkdtemp, mkdir, open, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {mapModelRoute, modelRange} from '../src/server/http/routes/map-model.js';
import {requestHandler} from '../src/server/http/router.js';
import type {Ctx} from '../src/server/office/context.js';

test('single byte ranges reject malformed, multiple and unsatisfiable ranges',()=>{
 for(const input of ['bytes=100-','bytes=4-2','bytes=-0','bytes=0-2,4-6','bytes=-','bytes=9007199254740999-']) assert.equal(modelRange(input,100),null);
 assert.deepEqual(modelRange('bytes=-10',100),[90,99]);
 assert.deepEqual(modelRange('bytes=10-',100),[10,99]);
 assert.deepEqual(modelRange('bytes=0-999',100),[0,99]);
});
test('authenticated GLBs stream with ranges, revalidation, concurrency cap and abort cleanup',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'model-stream-'));
 await mkdir(path.join(dir,'assets'));
 const size=90*1024*1024,json=Buffer.from('{"asset":{"version":"2.0"}} '.padEnd(28,' '));
 const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(size,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const file=await open(path.join(dir,'assets','room.glb'),'w');await file.write(header);await file.write(json);await file.truncate(size);await file.close();
 const ctx={maps:{folder:dir},cfg:{port:0},auth:{fromRequest:(req:{headers:{cookie?:string}})=>req.headers.cookie==='owner'?{account:{id:'owner'}}:req.headers.cookie==='visitor'?{account:{id:'visitor'}}:req.headers.cookie==='shared'?{}:null}} as unknown as Ctx;
 const server=createServer(requestHandler(ctx,[mapModelRoute]));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 ctx.cfg.port=(server.address() as {port:number}).port;
 const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/map-model/room.glb`;
 const held:ReturnType<typeof get>[]=[];
 try{
  assert.equal((await fetch(url)).status,401);
  for(const cookie of ['owner','visitor','shared']) {
   const response=await fetch(url,{headers:{cookie,range:'bytes=0-19'}});
   assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),header);
   assert.equal(response.headers.get('content-range'),`bytes 0-19/${size}`);
   assert.equal(response.headers.get('cache-control'),'private, no-cache');
   const etag=response.headers.get('etag')!;
   assert.equal((await fetch(url,{headers:{cookie,'if-none-match':etag}})).status,304);
   assert.equal((await fetch(url,{headers:{cookie,range:'bytes=999999999-'}})).status,416);
  }
  const before=process.memoryUsage().rss;
  for(let i=0;i<2;i++)await new Promise<void>((resolve,reject)=>{const request=get(url,{headers:{cookie:'visitor'}},response=>{response.pause();resolve();});request.on('error',()=>{});held.push(request);request.once('error',reject);});
  const refused=await Promise.all(Array.from({length:6},async()=>{const response=await fetch(url,{headers:{cookie:'visitor'}});await response.text();return response.status;}));
  assert.deepEqual(refused,Array(6).fill(429));
  assert.ok(process.memoryUsage().rss-before<64*1024*1024,'eight requests do not allocate eight 90 MB buffers');
  for(const request of held)request.destroy();
  await new Promise(resolve=>setTimeout(resolve,150));
  const resumed=await fetch(url,{headers:{cookie:'visitor',range:'bytes=0-19'}});assert.equal(resumed.status,206);await resumed.arrayBuffer();
 }finally{for(const request of held)request.destroy();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
