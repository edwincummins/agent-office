import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Account } from '../accounts.js';
import type { Ctx } from '../office/context.js';

export function ownerAllowlist(dataDir:string):{id?:string;name?:string}[] {
  try {
    const list=JSON.parse(readFileSync(path.join(dataDir,'config.json'),'utf8')).cadre?.ownerAllowlist;
    if(!Array.isArray(list))return [];
    return list.filter(x=>x&&typeof x==='object'&&(typeof x.id==='string'&&x.id.length>0||typeof x.name==='string'&&x.name.length>0));
  }catch{return [];}
}
export function cadreOwner(ctx:Pick<Ctx,'cfg'|'accounts'>,id:string|undefined):Account|undefined {
  if(!id)return;
  const account=ctx.accounts.get(id);
  if(account?.role!=='admin')return;
  return ownerAllowlist(ctx.cfg.dataDir).some(entry=>(entry.id===undefined||entry.id===account.id)&&(entry.name===undefined||entry.name===account.name))?account:undefined;
}
/** Audit before consequential work; an unwritable log fails closed. No tokens, message bodies or screen text. */
export function auditCadre(dataDir:string,account:Pick<Account,'id'|'name'>,event:string,detail:Record<string,string|number>={}) {
  appendFileSync(path.join(dataDir,'cadre-audit.jsonl'),JSON.stringify({at:new Date().toISOString(),accountId:account.id,accountName:account.name,event,...detail})+'\n',{encoding:'utf8',mode:0o600});
}
