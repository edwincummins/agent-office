import {createHash} from 'node:crypto';
import {cleanName} from '../accounts.js';
/** Independent budgets: a good account cannot reset another account's failed guesses. */
export class AttemptLimits {
  private entries=new Map<string,{count:number;until:number}>();
  take(key:string,max=10): boolean {
    const now=Date.now();
    for(const [k,v] of this.entries) if(v.until<=now)this.entries.delete(k);
    let e=this.entries.get(key);
    if(!e){if(this.entries.size>=10000)return false; e={count:0,until:now+300000};this.entries.set(key,e);}
    return ++e.count<=max;
  }
  success(key:string){this.entries.delete(key);}
  /** Release only this successful in-flight attempt, preserving prior failures from the IP. */
  release(key:string){const e=this.entries.get(key);if(e){e.count=Math.max(0,e.count-1);if(!e.count)this.entries.delete(key);}}
}
const stores=new WeakMap<object,AttemptLimits>();
export function authLimits(ctx:object){let v=stores.get(ctx);if(!v){v=new AttemptLimits();stores.set(ctx,v);}return v;}
export function guessKey(route:string|undefined,name:unknown,token?:unknown){
  const pathname=decodeURIComponent(new URL(route??'/','http://office').pathname);
  const key=pathname==='/api/join'?createHash('sha256').update(typeof token==='string'?token:'').digest('hex'):cleanName(name).normalize('NFC').toLowerCase();
  return `${pathname}:${key}`;
}
