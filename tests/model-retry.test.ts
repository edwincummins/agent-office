import test from 'node:test';
import assert from 'node:assert/strict';
import {retryModelLoad,retryDelay,abortableDelay} from '../src/client/world/model/retry.js';
const limited=(header='1')=>Object.assign(new Error('HTTP 429'),{response:new Response(null,{status:429,headers:{'retry-after':header}})});
for(let repeat=0;repeat<2;repeat++)test(`a busy join retries and recovers without reload (${repeat+1})`,async()=>{
 let calls=0;const delays:number[]=[];
 const result=await retryModelLoad(async()=>{if(++calls<3)throw limited('3');return 'room';},new AbortController().signal,async ms=>{delays.push(ms);});
 assert.equal(result,'room');assert.equal(calls,3);assert.deepEqual(delays,[3000,3000]);
});
test('bounded retries stop after five attempts and preserve permanent errors',async()=>{
 let calls=0;const delays:number[]=[];
 await assert.rejects(retryModelLoad(async()=>{calls++;throw limited();},new AbortController().signal,async ms=>{delays.push(ms);}),/429/);
 assert.equal(calls,5);assert.deepEqual(delays,[1000,2000,4000,8000]);
 for(const status of [401,403,404,500]){calls=0;await assert.rejects(retryModelLoad(async()=>{calls++;throw {response:new Response(null,{status})};},new AbortController().signal));assert.equal(calls,1);}
});
test('Retry-After dates and numbers are honoured; malformed/past values use backoff',()=>{
 assert.equal(retryDelay('5',0),5000);assert.equal(retryDelay('Thu, 01 Jan 1970 00:00:10 GMT',0,0),10000);
 assert.equal(retryDelay('bad',2),4000);assert.equal(retryDelay('0',1),2000);
});
test('leaving a map cancels the retry wait and makes no additional request',async()=>{
 const controller=new AbortController();let calls=0;
 const result=retryModelLoad(async()=>{calls++;throw limited();},controller.signal,async(ms,signal)=>{const waiting=abortableDelay(ms,signal);controller.abort();await waiting;});
 await assert.rejects(result,{name:'AbortError'});assert.equal(calls,1);
});
