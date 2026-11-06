import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {Ctx} from '../office/context.js';
import type {Client} from '../office/client.js';
import type {HandlerMap} from '../ws/handlers/types.js';
import type {ClientMsg} from '../../shared/protocol.js';

export const OWNER_ONLY='Only the office owner can run workers, shells or tool actions. You can walk, chat and watch.';
type OwnerContext=Pick<Ctx,'cfg'|'accounts'>;
/** Explicit config overrides the first-run record, including an empty value (fail closed). */
export function ownerId(ctx:OwnerContext):string|undefined{
 try{
  let config:Record<string,unknown>={};
  try{config=JSON.parse(readFileSync(path.join(ctx.cfg.dataDir,'config.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')return;}
  const id=Object.hasOwn(config,'ownerAccountId')?config.ownerAccountId:JSON.parse(readFileSync(path.join(ctx.cfg.dataDir,'accounts.json'),'utf8')).ownerAccountId;
  return typeof id==='string'&&ctx.accounts.get(id)?.role==='admin'?id:undefined;
 }catch{return;}
}
export const isOwner=(ctx:OwnerContext,id:string|undefined)=>!!id&&ownerId(ctx)===id;
const social=new Set(['move','act','emote','sit','carry','profile','voice','rtc','chat','doing','ping','golf','toss','gong','horn','floor.go','worker.attach','worker.detach','fleet.subscribe']);
/** Only social/read-only handlers bypass the owner gate. New control handlers default to denied. */
export const visitorMessage=(key:string)=>social.has(key)||/^(ball|car|cabinet|dog|jukebox|wb|decor)\./.test(key);
export function ownerHandlers(handlers:HandlerMap<ClientMsg>):HandlerMap<ClientMsg>{
 return Object.fromEntries(Object.entries(handlers).map(([key,handler])=>[key,(ctx:Ctx,c:Client,msg:ClientMsg)=>{
  if(!visitorMessage(key)&&!isOwner(ctx,c.accountId))return ctx.warn(c,OWNER_ONLY);
  if(typeof (msg as any).workerId==='string'&&!['worker.attach','worker.detach','worker.kill'].includes(key)&&!visitorMessage(key)){const floor=ctx.workerFloor((msg as any).workerId);if(floor&&floor.workers.ownerOf((msg as any).workerId)!==c.accountId)return ctx.warn(c,'Legacy worker is read-only; hire a new worker as the owner');}
  return (handler as (ctx:Ctx,c:Client,msg:ClientMsg)=>void)(ctx,c,msg);
 }])) as HandlerMap<ClientMsg>;
}
