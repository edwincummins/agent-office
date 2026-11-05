import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {cadreGateway,stopCadreGateway} from '../src/server/fleet/gateway.js';
import {cadreWebRoute} from '../src/server/fleet/web.js';
import {requestHandler} from '../src/server/http/router.js';
import type {Ctx} from '../src/server/office/context.js';
const listen=(s:ReturnType<typeof createServer>)=>new Promise<number>(resolve=>s.listen(0,'127.0.0.1',()=>resolve((s.address() as {port:number}).port)));
const close=(s:ReturnType<typeof createServer>)=>new Promise<void>(resolve=>{s.closeAllConnections();s.close(()=>resolve());});

test('owner-session version endpoint forwards without a bearer; other sessions are denied',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cadre-version-')),calls:(string|undefined)[]=[];
 let broken=false;const upstream=createServer((req,res)=>{calls.push(req.headers.authorization);if(broken){res.end('not json');return;}res.writeHead(200,{'Content-Type':'application/json'}).end('{"v":42}');});
 const port=await listen(upstream),accounts=new Map([['owner',{id:'owner',name:'Owner',role:'admin'}],['other',{id:'other',name:'Other',role:'admin'}]]);
 writeFileSync(path.join(dir,'config.json'),JSON.stringify({cadre:{ownerAllowlist:[{id:'owner'}],webUrl:`http://127.0.0.1:${port}`,webToken:'synthetic'}}));
 const ctx={cfg:{dataDir:dir,port:0},accounts:{get:(id:string)=>accounts.get(id)},auth:{fromRequest:(req:any)=>req.headers['x-account']?{account:accounts.get(req.headers['x-account'])}:undefined}} as unknown as Ctx;
 const office=createServer(requestHandler(ctx,[cadreWebRoute])),officePort=await listen(office);ctx.cfg.port=officePort;
 try{
  const url=`http://127.0.0.1:${officePort}/api/cadre/version`;
  assert.equal((await fetch(url)).status,401);
  for(const id of ['other','shared'])assert.equal((await fetch(url,{headers:{'x-account':id}})).status,403);
  assert.equal(calls.length,0);
  const response=await fetch(url,{headers:{'x-account':'owner'}});assert.equal(response.status,200);assert.deepEqual(await response.json(),{v:42});assert.deepEqual(calls,[undefined]);
  broken=true;assert.equal((await fetch(url,{headers:{'x-account':'owner'}})).status,502);broken=false;
  writeFileSync(path.join(dir,'config.json'),JSON.stringify({cadre:{ownerAllowlist:[]}}));assert.equal((await fetch(url,{headers:{'x-account':'owner'}})).status,403);assert.equal(calls.length,2);
 }finally{await close(office);await close(upstream);rmSync(dir,{recursive:true,force:true});}
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
