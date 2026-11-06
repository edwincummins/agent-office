import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer,request } from 'node:http';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cadreOwner } from '../src/server/fleet/access.js';
import { cadreGateway,stopCadreGateway } from '../src/server/fleet/gateway.js';
import { cadreWebRoute } from '../src/server/fleet/web.js';
import { requestHandler } from '../src/server/http/router.js';
import { installFleet,subscribeFleet } from '../src/server/fleet/index.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';

const listen=(server:ReturnType<typeof createServer>)=>new Promise<number>(resolve=>server.listen(0,'127.0.0.1',()=>{const a=server.address();resolve(typeof a==='object'&&a?a.port:0);}));
const close=(server:ReturnType<typeof createServer>)=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());});

test('owner allow-list gates HTTP and fleet; other admins and unset config get no access',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cadre-owner-'));
 const accounts=new Map([['owner',{id:'owner',name:'Synthetic owner',role:'admin'}],['other',{id:'other',name:'Other admin',role:'admin'}]]);
 const received:{client:Client;state:unknown}[]=[];
 const ctx={cfg:{dataDir:dir,port:0},accounts:{get:(id:string)=>accounts.get(id)},auth:{fromRequest:(req:any)=>req.headers['x-test-account']?{account:accounts.get(req.headers['x-test-account'])}:undefined},sendTo:(client:Client,message:any)=>received.push({client,state:message.state})} as unknown as Ctx;
 const config=(allow?:unknown)=>writeFileSync(path.join(dir,'config.json'),JSON.stringify({cadre:{ownerAllowlist:allow,fleetCommand:[process.execPath,'-e','console.log(JSON.stringify({teams:[],seats:[],needs:[],tasks:{}}))']}}));
 config([{id:'owner'}]);const server=createServer(requestHandler(ctx,[cadreWebRoute]));const port=await listen(server);const base=`http://127.0.0.1:${port}`;ctx.cfg.port=port;
 let stop=installFleet(ctx);
 try {
  for(const route of ['/api/cadre/web','/api/cadre/embed','/api/cadre/open','/api/cadre/health']){
   const options=route.endsWith('open')?{method:'POST'}:{};
   assert.equal((await fetch(base+route,{...options,headers:{'x-test-account':'other',Origin:base}})).status,403);
   assert.equal((await fetch(base+route,options)).status,401);
  }
  const owner={accountId:'owner'} as Client,other={accountId:'other'} as Client;
  subscribeFleet(ctx,other);subscribeFleet(ctx,owner);
  assert.equal(received.length,1);assert.equal(received[0].client,owner);
  assert.equal((await fetch(base+'/api/cadre/web',{headers:{'x-test-account':'owner'}})).status,200);
  assert.equal((await fetch(base+'/api/cadre/open',{method:'POST',headers:{'x-test-account':'owner',Origin:base}})).status,200);
  const audit=JSON.parse(readFileSync(path.join(dir,'cadre-audit.jsonl'),'utf8').trim());assert.equal(audit.accountId,'owner');assert.equal(audit.event,'panel.open');
  config();assert.equal(cadreOwner(ctx,'owner'),undefined);
  assert.equal((await fetch(base+'/api/cadre/web',{headers:{'x-test-account':'owner'}})).status,403);
  const count=received.length;subscribeFleet(ctx,other);subscribeFleet(ctx,owner);assert.equal(received.length,count);
  stop();stop=installFleet(ctx);subscribeFleet(ctx,owner);assert.equal(received.length,count);
  config([{name:'Synthetic owner'}]);assert.equal(cadreOwner(ctx,'owner'),undefined);assert.equal(cadreOwner(ctx,'other'),undefined);
 }finally{stop();await close(server);rmSync(dir,{recursive:true,force:true});}
});

test('gateway grants are owner-bound, keep upstream token private, audit actions and deny revocation',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cadre-gateway-'));const calls:string[]=[];const requests:{url:string;body:string}[]=[];
 const upstream=createServer((req,res)=>{calls.push(req.headers.authorization??'');let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>requests.push({url:req.url??'',body}));if(req.url==='/auth'){res.writeHead(req.headers.authorization==='Bearer upstream-private'?204:401).end();return;}res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true}));});
 const port=await listen(upstream);const account={id:'owner',name:'Synthetic owner',role:'admin'};
 const ctx={cfg:{dataDir:dir},accounts:{get:(id:string)=>id==='owner'?account:undefined}} as unknown as Ctx;
 const config=path.join(dir,'config.json');writeFileSync(config,JSON.stringify({cadre:{ownerAllowlist:[{id:'owner'}]}}));
 try{
  const gateway=await cadreGateway(ctx);const grant=gateway.issue({accountId:'owner',upstream:`http://127.0.0.1:${port}/`,token:'upstream-private',officeOrigin:'http://127.0.0.1:4632'});
  assert.notEqual(grant.token,'upstream-private');
  const base=`http://localhost:${gateway.port}`,headers={Host:`localhost:${gateway.port}`,Authorization:`Bearer ${grant.token}`};
  for(const route of ['/version','/api/fleet','/api/seats','/api/queue','/api/inbox','/api/audit','/api/ideas'])assert.equal((await fetch(base+route,{headers:{Host:headers.Host}})).status,403);
  assert.equal((await fetch(base+'/auth',{method:'POST',headers})).status,204);
  assert.equal((await fetch(base+'/api/say',{method:'POST',headers,body:JSON.stringify({seat:'synthetic@demo',text:'test'})})).status,200);
  const log=readFileSync(path.join(dir,'cadre-audit.jsonl'),'utf8');assert.ok(!log.includes(grant.token)&&!log.includes('upstream-private'));
  const rows=log.trim().split('\n').map(s=>JSON.parse(s));assert.deepEqual(rows.map(r=>r.event),['action.request','action.result']);assert.ok(rows.every(r=>r.accountId==='owner'&&r.target==='synthetic@demo'));
  assert.ok(calls.every(v=>v==='Bearer upstream-private'));
  for(const route of ['/version','/api/seats','/api/queue','/api/inbox','/api/audit','/api/ideas'])assert.equal((await fetch(base+route,{headers})).status,200);
  for(const route of ['/api/inbox/read','/api/team','/api/seat','/api/access'])assert.equal((await fetch(base+route,{method:'POST',headers,body:JSON.stringify({action:'synthetic',seat:'demo'})})).status,200);
  for(const route of ['/api/audit?team=synthetic%20team','/api/ideas?team=synthetic%20team']){
   assert.equal((await fetch(base+route,{headers})).status,200);
   assert.equal((await fetch(base+route,{headers})).status,200);
   assert.ok(requests.some(r=>r.url===route));
  }
  const tuning={seat:'build@synthetic',model:'synthetic-model',effort:'high',restart:false,ignored:'not-for-audit'};
  assert.equal((await fetch(base+'/api/tune',{method:'POST',body:JSON.stringify(tuning)})).status,403);
  assert.equal((await fetch(base+'/api/tune',{method:'POST',headers,body:JSON.stringify(tuning)})).status,200);
  assert.deepEqual(JSON.parse(requests.find(r=>r.url==='/api/tune')!.body),tuning);
  const auditRows=readFileSync(path.join(dir,'cadre-audit.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
  const tune=auditRows.filter(r=>r.action==='tune');assert.equal(tune.length,2);
  for(const row of tune){assert.equal(row.accountId,'owner');assert.equal(row.target,tuning.seat);assert.equal(row.model,tuning.model);assert.equal(row.effort,'high');assert.equal(row.restart,'false');}
  assert.ok(!JSON.stringify(auditRows).includes('not-for-audit'));
  for(const action of ['audit','ideas'])assert.equal(auditRows.filter(r=>r.action===action&&r.target==='synthetic team'&&r.event==='read.open').length,1);
  const actions=readFileSync(path.join(dir,'cadre-audit.jsonl'),'utf8');assert.ok(actions.includes('team:synthetic')&&actions.includes('access:synthetic'));
  // The owner reaches the engine's /api/* and its tab code; anything outside those is still refused.
  for(const p of ['/not-allowed','/views/../web.js','/etc/passwd','/api/x y'])assert.equal((await fetch(base+p,{method:'POST',headers,body:'{}'})).status,404,p);
  await fetch(base+'/api/capture?seat=alpha',{headers});await fetch(base+'/api/capture?seat=alpha',{headers});await fetch(base+'/api/capture?seat=beta',{headers});
  await fetch(base+'/api/capture?seat=alpha',{headers});await fetch(base+'/api/capture?seat=beta',{headers});
  const revoked=gateway.issue({accountId:'owner',upstream:`http://127.0.0.1:${port}/`,token:'upstream-private',officeOrigin:'http://127.0.0.1:4632'});
  assert.equal((await fetch(base+'/revoke',{method:'POST',headers:{Origin:'http://127.0.0.1:4632'},body:revoked.token})).status,204);
  assert.equal(gateway.grants.has(revoked.token),false);
  const screens=readFileSync(path.join(dir,'cadre-audit.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s)).filter(r=>r.event.startsWith('screen.'));
  assert.deepEqual(screens.map(r=>[r.event,r.target]),[['screen.open','alpha'],['screen.open','beta']]);
  const slow=gateway.issue({accountId:'owner',upstream:`http://127.0.0.1:${port}/`,token:'upstream-private',officeOrigin:'http://127.0.0.1:4632'});
  const beforeRevoked=calls.length;
  const revokedUpload=new Promise<number>(resolve=>{
   const req=request(base+'/api/say',{method:'POST',headers:{Authorization:`Bearer ${slow.token}`}},res=>{res.resume();resolve(res.statusCode!);});
   req.write('{');setTimeout(()=>{gateway.revoke(slow.token);req.end('}');},50);
  });
  assert.equal(await revokedUpload,403);assert.equal(calls.length,beforeRevoked);
  // Start an authorized request, revoke while its upload is incomplete, then finish it.
  const before=calls.length;
  const pending=new Promise<number>(resolve=>{
   const req=request(base+'/api/say',{method:'POST',headers},res=>{res.resume();resolve(res.statusCode!);});
   req.write('{');
   setTimeout(()=>{writeFileSync(config,JSON.stringify({cadre:{ownerAllowlist:[]}}));req.end('}');},50);
  });
  assert.equal(await pending,403);assert.equal(calls.length,before);
  writeFileSync(config,JSON.stringify({cadre:{ownerAllowlist:[]}}));
  assert.equal((await fetch(base+'/api/say',{method:'POST',headers,body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/fleet',{headers})).status,403);
 }finally{stopCadreGateway(ctx);await close(upstream);await new Promise(r=>setTimeout(r,20));rmSync(dir,{recursive:true,force:true});}
});

test('owner health probe reports unhealthy and stopped upstream without issuing grants',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cadre-health-'));let healthy=true;
 const upstream=createServer((req,res)=>res.writeHead(healthy&&req.headers.authorization==='Bearer synthetic-health'?200:503).end('{}'));
 const upstreamPort=await listen(upstream),account={id:'owner',name:'Synthetic owner',role:'admin'};
 const ctx={cfg:{dataDir:dir,port:0},accounts:{get:()=>account},auth:{fromRequest:()=>({account})}} as unknown as Ctx;
 writeFileSync(path.join(dir,'config.json'),JSON.stringify({cadre:{ownerAllowlist:[{id:'owner'}],webUrl:`http://127.0.0.1:${upstreamPort}`,webToken:'synthetic-health'}}));
 const office=createServer(requestHandler(ctx,[cadreWebRoute])),port=await listen(office);ctx.cfg.port=port;
 try{
  const probe=async()=>await (await fetch(`http://127.0.0.1:${port}/api/cadre/health`)).json();
  assert.equal((await probe()).available,true);healthy=false;assert.equal((await probe()).available,false);
  await close(upstream);assert.equal((await probe()).available,false);
  assert.equal((await cadreGateway(ctx)).grants.size,0);
 }finally{await close(office);stopCadreGateway(ctx);if(upstream.listening)await close(upstream);await new Promise(r=>setTimeout(r,20));rmSync(dir,{recursive:true,force:true});}
});

test('screen content is sent only to the allow-listed owner, including subsequent polls',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cadre-tail-access-'));
 const account={id:'owner',name:'Synthetic owner',role:'admin'},other={id:'other',name:'Other admin',role:'admin'};
 const raw={teams:[{rig:'demo'}],seats:[{session:'lead@demo',rig:'demo',member:'lead',status:'running',tail:['OWNER SCREEN ONLY']}],needs:[],tasks:{}};
 writeFileSync(path.join(dir,'config.json'),JSON.stringify({cadre:{ownerAllowlist:[{id:'owner'}],fleetCommand:[process.execPath,'-e',`console.log(${JSON.stringify(JSON.stringify(raw))})`]}}));
 const received:{id:string|undefined;message:unknown}[]=[];
 const ctx={cfg:{dataDir:dir},accounts:{get:(id:string)=>id==='owner'?account:other},sendTo:(c:Client,message:unknown)=>received.push({id:c.accountId,message})} as unknown as Ctx;
 const stop=installFleet(ctx);
 try{
  for(const id of ['owner','other',undefined])subscribeFleet(ctx,{accountId:id} as Client);
  for(let i=0;i<100&&!JSON.stringify(received).includes('OWNER SCREEN ONLY');i++)await new Promise(r=>setTimeout(r,20));
  assert.ok(JSON.stringify(received).includes('OWNER SCREEN ONLY'));assert.ok(received.every(r=>r.id==='owner'));
 }finally{stop();rmSync(dir,{recursive:true,force:true});}
});
