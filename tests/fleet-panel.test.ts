import test from 'node:test';
import assert from 'node:assert/strict';
import { openFleet } from '../src/client/features/fleet/panel.js';
import { store } from '../src/client/state/index.js';

// Minimal DOM boundary: exercise the real panel, config response and timers without a renderer.
class Element {
 className='';textContent='';children:Element[]=[];classList={add:()=>{}};
 constructor(readonly tag:string){}
 append(...children:unknown[]){for(const child of children)if(child instanceof Element)this.children.push(child);else this.textContent+=String(child);}
 setAttribute(){} addEventListener(){} remove(){} replaceChildren(){this.children=[];}
 querySelectorAll(){return [];}
 querySelector(selector:string):Element|null{return selector===':scope > header'?this.children.find(c=>c.tag==='header')??null:null;}
}
for(const reason of [undefined,'Open the office on 127.0.0.1 to isolate Cadre cookies.'])test(`unavailable config preserves fallback and never probes: ${reason??'unconfigured'}`,async t=>{
 const elements:Element[]=[];
 const saved=Object.fromEntries(['document','window','Node'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 Object.defineProperties(globalThis,{Node:{value:Element,configurable:true},document:{value:{createElement:(tag:string)=>{const e=new Element(tag);elements.push(e);return e;},getElementById:()=>new Element('root')},configurable:true},window:{value:new EventTarget(),configurable:true}});
 const account=store.me.account;store.me.account={name:'Synthetic owner',role:'admin'};
 t.after(()=>{store.me.account=account;for(const [key,descriptor] of Object.entries(saved))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);});
 t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:0});
 const requests:string[]=[];
 t.mock.method(globalThis,'fetch',async(url:unknown)=>{requests.push(String(url));return new Response(JSON.stringify({allowed:true,available:false,...(reason?{reason}:{})}),{headers:{'content-type':'application/json'}});});
 const modal=openFleet(()=>null,()=>{});
 try{
  for(let i=0;i<65;i++){await new Promise<void>(resolve=>setImmediate(resolve));t.mock.timers.tick(1000);}
  const notice=elements.find(e=>e.className==='cadre-notice')!;
  assert.equal(notice.textContent,reason?`Read-only preview. ${reason}`:'Read-only preview. Live Cadre is not connected yet (Cadre Web).');
  assert.deepEqual(requests,['/api/cadre/web']);assert.equal(elements.filter(e=>e.tag==='iframe').length,0);
 }finally{modal.close();}
});
