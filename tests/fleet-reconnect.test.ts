import test from 'node:test';
import assert from 'node:assert/strict';
import { reconnect } from '../src/client/features/fleet/reconnect.js';

test('reconnect probes at 1, 2, 5, then 10 seconds and resets after a connection',async()=>{
 let now=0,healthy=false,reloads=0;const calls:number[]=[];
 const recovery=reconnect(async()=>{calls.push(now);return healthy;},()=>reloads++,()=>now);
 recovery.waiting();
 for(const due of [1000,3000,8000,18000,28000]){
  now=due-1;await recovery.tick();const count=calls.length;
  now=due;await recovery.tick();assert.equal(calls.length,count+1);recovery.waiting();
 }
 assert.deepEqual(calls,[1000,3000,8000,18000,28000]);
 healthy=true;now=38000;await recovery.tick();assert.equal(reloads,1);
 now=50000;await recovery.tick();assert.equal(calls.length,6);
 recovery.connected();recovery.waiting();now=51000;await recovery.tick();assert.equal(reloads,2);recovery.close();
});
test('reconnect is single-flight and close aborts a pending probe without reloading',async()=>{
 let now=0,calls=0,reloads=0,signal:AbortSignal|undefined;let finish!:(value:boolean)=>void;
 const recovery=reconnect(s=>{calls++;signal=s;return new Promise(resolve=>finish=resolve);},()=>reloads++,()=>now);
 recovery.waiting();now=1000;const pending=recovery.tick();await recovery.tick();assert.equal(calls,1);
 recovery.close();assert.equal(signal?.aborted,true);finish(true);await pending;assert.equal(reloads,0);
 now=100000;recovery.waiting();await recovery.tick();assert.equal(calls,1);
});
test('rejected health requests back off and a late result cannot reload a connected panel',async()=>{
 let now=0,calls=0,reloads=0;let finish!:(value:boolean)=>void;
 const recovery=reconnect(async()=>{if(++calls===1)throw Error('offline');return new Promise(resolve=>finish=resolve);},()=>reloads++,()=>now);
 recovery.waiting();now=1000;await recovery.tick();now=2999;await recovery.tick();assert.equal(calls,1);
 now=3000;const pending=recovery.tick();recovery.connected();finish(true);await pending;assert.equal(reloads,0);recovery.close();
});

test('a late failed probe cannot advance the next outage backoff',async()=>{
 let now=0,calls=0;let finish!:(value:boolean)=>void;
 const recovery=reconnect(()=>{calls++;return new Promise(resolve=>finish=resolve);},()=>{},()=>now);
 recovery.waiting();now=1000;const pending=recovery.tick();recovery.connected();finish(false);await pending;
 recovery.waiting();now=1999;await recovery.tick();assert.equal(calls,1);
 now=2000;const next=recovery.tick();assert.equal(calls,2);finish(false);await next;recovery.close();
});
