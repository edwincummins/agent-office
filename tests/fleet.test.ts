import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FleetNormalizer, STUCK_AFTER_MS } from '../src/server/fleet/normalize.js';
import { FleetPoller } from '../src/server/fleet/poller.js';
import { fleetCommand, runFleet } from '../src/server/fleet/source.js';
import { maySeeFleet,installFleet,subscribeFleet,leaveFleet } from '../src/server/fleet/index.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';
import { embedPage } from '../src/server/fleet/embed.js';
import { Accounts } from '../src/server/accounts.js';
import { fitText } from '../src/client/features/fleet/draw.js';
import { fleetFixture } from './fixtures/fleet.js';
import { cadreWeb } from '../src/server/fleet/web.js';
import { boardKey,readMode,writeMode,BOARD_MODE_KEY } from '../src/client/features/fleet/memory.js';

test('states honor stopped, needs-you, stuck, working and idle precedence',()=>{
  const normalize=new FleetNormalizer(),raw=fleetFixture();
  assert.deepEqual(normalize.parse(raw,0).seats.map(s=>s.state),['working','needs-you','working','idle','stopped']);
  assert.equal(normalize.parse(raw,STUCK_AFTER_MS-1).seats[2].state,'working');
  raw.seats[0].activity.msg='New activity';
  assert.deepEqual(normalize.parse(raw,STUCK_AFTER_MS).seats.map(s=>s.state),['working','needs-you','stuck','idle','stopped']);
  raw.seats[4].status='running';
  assert.equal(normalize.parse(raw,STUCK_AFTER_MS+1).seats[4].state,'working');
  raw.needs[0].seat='';
  assert.ok(normalize.parse(raw,STUCK_AFTER_MS+2).seats.every(s=>s.state==='needs-you'));
});

test('normalization validates, bounds and strips raw-only data; empty and 32-seat fleets work',()=>{
  const normalize=new FleetNormalizer();
  assert.throws(()=>normalize.parse({},0));
  const raw=fleetFixture(32);
  assert.equal(normalize.parse({...raw,inbox:['private'],access:{secret:'private'}},0).seats.length,32);
  assert.ok(!JSON.stringify(normalize.parse(raw,1)).includes('tasks'));
  assert.deepEqual(normalize.parse({teams:[],seats:[],needs:[],tasks:{}},2),{status:'ready',teams:[],seats:[],needs:[]});
  raw.seats[1].session=raw.seats[0].session;
  assert.throws(()=>normalize.parse(raw,3));
});

test('poller suppresses timestamps/unchanged data and retains last good data on failure',async()=>{
  let raw:unknown=fleetFixture(),calls=0;
  const poller=new FleetPoller(async()=>raw,()=>calls++);
  await poller.poll(0);assert.equal(calls,1);
  raw={...fleetFixture(),at:999};await poller.poll(1);assert.equal(calls,1);
  raw={};await poller.poll(2);assert.equal(calls,2);assert.equal(poller.state.status,'stale');assert.equal(poller.state.seats.length,5);
  await poller.poll(3);assert.equal(calls,2);
  raw=fleetFixture();await poller.poll(4);assert.equal(calls,3);assert.equal(poller.state.status,'ready');
  poller.stop();await poller.poll(5);assert.equal(calls,3);
});

test('poller never overlaps and does not publish after shutdown',async()=>{
  let finish!:(v:unknown)=>void,runs=0,published=0;
  const poller=new FleetPoller(()=>{runs++;return new Promise(resolve=>finish=resolve);},()=>published++);
  const pending=poller.poll(0);await poller.poll(1);assert.equal(runs,1);
  poller.stop();finish(fleetFixture());await pending;assert.equal(published,0);
});

test('fleet command is opt-in argv configuration; malformed commands fail closed',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'fleet-config-'));
  try {
    assert.equal(fleetCommand(dir,undefined),undefined);
    writeFileSync(path.join(dir,'config.json'),JSON.stringify({cadre:{fleetCommand:['node','fleet.mjs']}}));
    assert.deepEqual(fleetCommand(dir,undefined),['node','fleet.mjs']);
    assert.deepEqual(fleetCommand(dir,'["node","fixture.mjs"]'),['node','fixture.mjs']);
    assert.throws(()=>fleetCommand(dir,'"node fleet.mjs"'));
    assert.throws(()=>fleetCommand(dir,'[]'));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('executor parses JSON, rejects malformed output and terminates slow commands',async()=>{
  const signal=new AbortController().signal;
  assert.deepEqual(await runFleet([process.execPath,'-e','console.log(JSON.stringify({seats:[]}))'],signal),{seats:[]});
  await assert.rejects(runFleet([process.execPath,'-e','console.log("no JSON")'],signal),/invalid JSON/);
  const start=Date.now();
  await assert.rejects(runFleet([process.execPath,'-e','setInterval(()=>{},1000)'],signal,150),/timed out/);
  assert.ok(Date.now()-start<3000);
});

test('only current named admins qualify; shared guests, members and signed-out clients do not',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'fleet-accounts-'));
  try {
    const accounts=new Accounts(dir),invite=accounts.invite('test','admin');
    assert.notEqual(typeof invite,'string');if(typeof invite==='string')throw Error(invite);
    const admin=await accounts.join(invite.token,'Demo admin','sample-password');
    assert.notEqual(typeof admin,'string');if(typeof admin==='string')throw Error(admin);
    writeFileSync(path.join(dir,'config.json'),JSON.stringify({cadre:{ownerAllowlist:[{id:admin.id}]}}));
    assert.equal(maySeeFleet({accounts,cfg:{dataDir:dir} as Ctx['cfg']},{accountId:admin.id}),true);
    assert.equal(maySeeFleet({accounts,cfg:{dataDir:dir} as Ctx['cfg']},{}),false);
    assert.equal(maySeeFleet({accounts,cfg:{dataDir:dir} as Ctx['cfg']},{accountId:admin.id,out:true}),false);
    admin.role='member';assert.equal(maySeeFleet({accounts,cfg:{dataDir:dir} as Ctx['cfg']},{accountId:admin.id}),false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('canvas text clips long input without splitting emoji or interpreting markup',()=>{
  const ctx={measureText:(s:string)=>({width:Array.from(s).length*10}) as TextMetrics};
  assert.equal(fitText(ctx,'abcdef',40),'abc…');
  assert.equal(fitText(ctx,'😀😀😀',20),'😀…');
  assert.equal(fitText(ctx,'<script>\n',200),'<script> ');
  assert.equal(fitText(ctx,'',0),'');
});

test('board choices are isolated by floor and environment and tolerate corrupt storage',()=>{
  let saved='';const storage={getItem:()=>saved,setItem:(key:string,value:string)=>{assert.equal(key,BOARD_MODE_KEY);saved=value;}};
  const first=boardKey('one','office'),second=boardKey('two','office'),other=boardKey('one','castle');
  writeMode(storage,first,true);assert.equal(readMode(storage,first),true);assert.equal(readMode(storage,second),false);assert.equal(readMode(storage,other),false);
  writeMode(storage,other,true);writeMode(storage,first,false);assert.equal(readMode(storage,other),true);assert.equal(readMode(storage,first),false);
  saved='{broken';assert.equal(readMode(storage,first),false);
  assert.doesNotThrow(()=>writeMode({getItem:()=>{throw Error('blocked');},setItem:()=>{}},first,true));
});

test('Cadre Web allows only configured loopback URLs without URL credentials or tokens',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'cadre-web-'));
  try {
    assert.equal(cadreWeb(dir,{}),null);
    assert.deepEqual(cadreWeb(dir,{AGENT_OFFICE_CADRE_WEB_URL:'http://localhost:9999/',AGENT_OFFICE_CADRE_WEB_TOKEN:'synthetic-test-token'}),{url:'http://localhost:9999/',token:'synthetic-test-token'});
    for(const url of ['https://example.com','file:///tmp/app','http://localhost.evil.test','http://user@localhost','http://localhost/?token=secret','http://localhost/#token']){
      assert.throws(()=>cadreWeb(dir,{AGENT_OFFICE_CADRE_WEB_URL:url,AGENT_OFFICE_CADRE_WEB_TOKEN:'synthetic-test-token'}));
    }
    assert.throws(()=>cadreWeb(dir,{AGENT_OFFICE_CADRE_WEB_URL:'http://localhost:9999/'}));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('installed feed denies guests, removes demoted subscribers, and can resubscribe after close',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'fleet-hub-'));
  let stop=()=>{};
  try{
    const accounts=new Accounts(dir),invite=accounts.invite('test','admin');if(typeof invite==='string')throw Error(invite);
    const account=await accounts.join(invite.token,'Hub demo','sample-password');if(typeof account==='string')throw Error(account);
    writeFileSync(path.join(dir,'config.json'),JSON.stringify({cadre:{ownerAllowlist:[{id:account.id}],fleetCommand:[process.execPath,'-e',`console.log(${JSON.stringify(JSON.stringify(fleetFixture()))})`]}}));
    const received:{client:Client;state:unknown}[]=[];
    const ctx={cfg:{dataDir:dir},accounts,sendTo:(client:Client,message:{state:unknown})=>received.push({client,state:message.state})} as unknown as Ctx;
    stop=installFleet(ctx);
    const admin={accountId:account.id} as Client,guest={admin:true} as Client;
    subscribeFleet(ctx,guest);subscribeFleet(ctx,admin);
    const deadline=Date.now()+5000;
    while(received.length<2&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
    assert.ok(received.length>=2);assert.ok(received.every(r=>r.client===admin));
    const count=received.length;subscribeFleet(ctx,admin);assert.equal(received.length,count);
    account.role='member';await new Promise(resolve=>setTimeout(resolve,1100));assert.equal(received.at(-1)?.state,null);
    account.role='admin';subscribeFleet(ctx,admin);assert.notEqual(received.at(-1)?.state,null);
    leaveFleet(ctx,admin);const before=received.length;subscribeFleet(ctx,admin);assert.equal(received.length,before+1);
  }finally{stop();rmSync(dir,{recursive:true,force:true});}
});

test('embed wrapper confines frame origin and escapes script-ending token content',()=>{
  const page=embedPage('http://localhost:9999/','</script><script>bad()</script>','http://127.0.0.1:9998');
  assert.match(page.csp,/frame-src http:\/\/localhost:9999;/);
  assert.match(page.csp,/frame-ancestors 'self'/);
  assert.ok(!page.html.includes('</script><script>bad'));
  assert.ok(!page.html.includes('allow-top-navigation'));
  assert.match(page.html,/event.source!==frame.contentWindow/);
});

test('engine state wins over inferred work and needs; reasons and observed since remain stable',()=>{
  const normalizer=new FleetNormalizer();
  const raw={...fleetFixture(),seats:fleetFixture().seats.map((seat,i)=>({...seat,state:i===0?{key:'idle'}:i===1?{key:'working'}:i===2?{key:'stuck',why:'approval menu'}:i===3?{key:'waiting',why:'on review'}:{key:'working'}}))};
  const first=normalizer.parse(raw,100);
  assert.deepEqual(first.seats.map(s=>s.state),['idle','working','stuck','waiting','stopped']);
  assert.equal(first.seats[2].reason,'approval menu');assert.equal(first.seats[3].reason,'on review');
  assert.equal(normalizer.parse(raw,200).seats[2].since,100);
  raw.seats[2].state.why='usage limit';assert.equal(normalizer.parse(raw,300).seats[2].since,300);
  raw.seats[2].state.key='future-state';assert.equal(normalizer.parse(raw,400).seats[2].state,'unknown');
});

test('unknown engine states stay local to the seat while other live seats continue updating',async()=>{
  for(const state of [{key:'future-state'},'future-state',null,{},42,{key:'__proto__'}]){
    let raw:unknown={...fleetFixture(),seats:fleetFixture().seats.map((seat,i)=>i===0?{...seat,state}:seat)};
    const poller=new FleetPoller(async()=>raw,()=>{});
    await poller.poll(0);
    assert.equal(poller.state.status,'ready');
    assert.equal(poller.state.seats[0].state,'unknown');
    assert.equal(poller.state.seats[1].state,'needs-you');
    const next=fleetFixture();next.seats[2].activity.msg='Fresh activity';
    raw={...next,seats:next.seats.map((seat,i)=>i===0?{...seat,state}:seat)};
    await poller.poll(1);
    assert.equal(poller.state.status,'ready');
    assert.equal(poller.state.seats[2].activity,'Fresh activity');
    raw={...next,seats:next.seats.map((seat,i)=>i===0?{...seat,state:{key:'working'}}:seat)};
    await poller.poll(2);assert.equal(poller.state.status,'ready');assert.equal(poller.state.seats[0].state,'working');
    raw=next;await poller.poll(3);assert.equal(poller.state.seats[0].state,'working');poller.stop();
  }
});

test('an open need wins over unknown state on that seat',()=>{
 const raw=fleetFixture();const source={...raw,seats:raw.seats.map(seat=>({...seat,state:{key:'future'}}))};
 const parsed=new FleetNormalizer().parse(source,0);
 assert.equal(parsed.seats[1].state,'needs-you');assert.equal(parsed.seats[0].state,'unknown');assert.equal(parsed.seats[4].state,'stopped');
});
