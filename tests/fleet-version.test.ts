import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {cadreGateway,stopCadreGateway} from '../src/server/fleet/gateway.js';


import type {Ctx} from '../src/server/office/context.js';
import {BuildVersion} from '../src/server/fleet/build-version.js';
const listen=(s:ReturnType<typeof createServer>)=>new Promise<number>(resolve=>s.listen(0,'127.0.0.1',()=>resolve((s.address() as {port:number}).port)));
const close=(s:ReturnType<typeof createServer>)=>new Promise<void>(resolve=>{s.closeAllConnections();s.close(()=>resolve());});

test('anonymous exact GET version is bounded, cached and unaudited; private routes still need grants',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cadre-anon-version-'));let calls=0;const auth:(string|undefined)[]=[];
 const upstream=createServer((req,res)=>{calls++;auth.push(req.headers.authorization);res.end(JSON.stringify({v:42,private:'must not forward'}));});
 const port=await listen(upstream),ctx={cfg:{dataDir:dir},accounts:{get:()=>undefined}} as unknown as Ctx;
 try{
  const g=await cadreGateway(ctx);g.issue({accountId:'synthetic',upstream:`http://127.0.0.1:${port}`,token:'must-not-send',officeOrigin:'http://127.0.0.1:9999'});
  const base=`http://localhost:${g.port}`;
  for(let i=0;i<3;i++){const r=await fetch(base+'/version');assert.equal(r.status,200);assert.deepEqual(await r.json(),{v:42});}
  assert.equal(calls,1);assert.deepEqual(auth,[undefined]);
  for(const route of ['/app','/api/fleet','/api/capture','/api/seats','/api/queue','/api/inbox','/version?x=1','/%76ersion'])assert.equal((await fetch(base+route)).status,403,route);
  assert.equal((await fetch(base+'/version',{headers:{Origin:'http://evil.test'}})).status,403);
  assert.equal((await fetch(base+'/version',{method:'POST',body:'x'})).status,403);
  const bodyStatus=await new Promise<number>(resolve=>{const r=request({hostname:'127.0.0.1',port:g.port,path:'/version',method:'GET',headers:{Host:`localhost:${g.port}`,'Content-Length':'1'}},res=>{res.resume();resolve(res.statusCode!);});r.end('x');});
  assert.equal(bodyStatus,403);
  assert.throws(()=>readFileSync(path.join(dir,'cadre-audit.jsonl')));
 }finally{stopCadreGateway(ctx);await close(upstream);await new Promise(r=>setTimeout(r,20));rmSync(dir,{recursive:true,force:true});}
});
test('anonymous version rejects oversized and invalid JSON without forwarding it',async()=>{
 let payload='x'.repeat(4097);const upstream=createServer((_req,res)=>res.end(payload));const port=await listen(upstream);
 try{for(const value of [payload,'not json','{"v":"42"}','{"v":null}']){payload=value;const cache=new BuildVersion();cache.configure(`http://127.0.0.1:${port}`);assert.equal((await cache.read()).status,502);}}
 finally{await close(upstream);}
});

test('gateway preserves exact routes, team queries and action bodies, with owner audit records',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cadre-routes-'));const seen:{url:string;method:string;body:string;auth:string|undefined}[]=[];
 let failNext=false;const upstream=createServer(async(req,res)=>{if(failNext){failNext=false;req.socket.destroy();return;}let body='';for await(const chunk of req)body+=chunk;seen.push({url:req.url!,method:req.method!,body,auth:req.headers.authorization});res.writeHead(200,{'Content-Type':'application/json'}).end('{}');});
 const port=await listen(upstream),account={id:'owner',name:'Owner',role:'admin'};
 const ctx={cfg:{dataDir:dir},accounts:{get:(id:string)=>id==='owner'?account:undefined}} as unknown as Ctx;
 writeFileSync(path.join(dir,'config.json'),JSON.stringify({cadre:{ownerAllowlist:[{id:'owner'}]}}));
 try{
  const g=await cadreGateway(ctx),grant=g.issue({accountId:'owner',upstream:`http://127.0.0.1:${port}`,token:'synthetic-upstream',officeOrigin:'http://127.0.0.1:9999'}),headers={Authorization:`Bearer ${grant.token}`},base=`http://localhost:${g.port}`;
  for(const url of ['/api/seats?team=demo','/api/queue?team=demo','/api/inbox']){assert.equal((await fetch(base+url,{headers})).status,200);await fetch(base+url,{headers});}
  const actions:[string,object][]=[['/api/inbox/read',{id:'sample'}],...['up','down'].map(action=>['/api/team',{team:'demo',action}] as [string,object]),...['up','down','interrupt'].map(action=>['/api/seat',{seat:'lead@demo',action}] as [string,object]),['/api/access',{team:'demo',on:true,seats:['lead@demo']}]];
  for(const [url,body] of actions){assert.equal((await fetch(base+url,{method:'POST',headers,body:JSON.stringify(body)})).status,200);assert.deepEqual(JSON.parse(seen.at(-1)!.body),body);assert.equal(seen.at(-1)!.url,url);}
  assert.deepEqual(seen.slice(0,6).map(r=>r.url),['/api/seats?team=demo','/api/seats?team=demo','/api/queue?team=demo','/api/queue?team=demo','/api/inbox','/api/inbox']);assert.ok(seen.every(r=>r.auth==='Bearer synthetic-upstream'));
  const audit=readFileSync(path.join(dir,'cadre-audit.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
  assert.equal(audit.filter(r=>r.event==='read.open').length,3);assert.equal(audit.filter(r=>r.event==='read.result').length,3);
  assert.equal(audit.filter(r=>r.event==='action.request').length,actions.length);assert.equal(audit.filter(r=>r.event==='action.result').length,actions.length);assert.ok(audit.every(r=>r.accountId==='owner'));
  failNext=true;assert.equal((await fetch(base+'/api/seats?team=retry',{headers})).status,502);
  assert.equal((await fetch(base+'/api/seats?team=retry',{headers})).status,200);
  const retries=readFileSync(path.join(dir,'cadre-audit.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s)).filter(r=>r.target==='retry');
  assert.deepEqual(retries.map(r=>[r.event,r.status]),[['read.open',undefined],['read.result',502],['read.open',undefined],['read.result',200]]);
 }finally{stopCadreGateway(ctx);await close(upstream);await new Promise(r=>setTimeout(r,20));rmSync(dir,{recursive:true,force:true});}
});
