import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the same permission function Net.send uses, with only browser UI globals stubbed.
test('visitors can sync and ride lifts without gaining worker or arbitrary level actions', async () => {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const globals = {localStorage:{getItem:()=>null,setItem(){},removeItem(){}},Node:class {},document:{createElement:()=>({className:'',append(){},style:{},remove(){}}),getElementById:()=>({append(){}})},setTimeout:()=>0};
  for(const [key,value] of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
  try {
    const {store}=await import('../src/client/state/index.js');
    const {allowAction}=await import('../src/client/shared/owner-workers.js');
    const previous=store.me;
    try {
      store.me={...previous,owner:false};
      for(const key of ['levels.sync','levels.lift'])assert.equal(allowAction(key),true,key);
      for(const key of ['hire','worker.kill','share.take','levels.admin','levels.unknown'])assert.equal(allowAction(key),false,key);
      store.me={...previous,owner:true};
      for(const key of ['levels.sync','levels.lift','hire'])assert.equal(allowAction(key),true,key);
    } finally {store.me=previous;}
  } finally {
    for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
  }
});
