import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Accounts} from '../src/server/accounts.js';
import {Auth} from '../src/server/auth.js';
import {requestHandler} from '../src/server/http/router.js';
import {ownerRoute} from '../src/server/owner-workers/routes.js';
import {isOwner} from '../src/server/owner-workers/access.js';
import {people} from '../src/server/office/people.js';
import type {Ctx} from '../src/server/office/context.js';

test('stacked owner controls reject valid non-owners and stale owner sessions',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'office-stacked-auth-'));
 const accounts=new Accounts(dir),auth=new Auth(Buffer.alloc(32),Buffer.alloc(16),'synthetic',accounts);
 const owner=await accounts.createFirst('Owner','password-one');assert.notEqual(typeof owner,'string');if(typeof owner==='string')throw Error(owner);
 const invite=accounts.invite('Owner','admin');assert.notEqual(typeof invite,'string');if(typeof invite==='string')throw Error(invite);
 const other=await accounts.join(invite.token,'Other admin','password-two');assert.notEqual(typeof other,'string');if(typeof other==='string')throw Error(other);
 const ctx={accounts,auth,cfg:{dataDir:dir,port:0},services:{lookup:()=>undefined}} as unknown as Ctx;
 let effects=0;
 const server=createServer(requestHandler(ctx,[ownerRoute({path:'/api/control-probe',method:'POST',auth:'session',handle:(_ctx,{res})=>{effects++;res.writeHead(200).end();}})]));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));ctx.cfg.port=(server.address() as any).port;
 const ownerToken=auth.issue(owner.id),otherToken=auth.issue(other.id);
 const probe=(token:string)=>fetch(`http://127.0.0.1:${ctx.cfg.port}/api/control-probe`,{method:'POST',headers:{Cookie:`ao_session_${ctx.cfg.port}=${token}`}});
 const req=(tokens:string[])=>({headers:{cookie:tokens.map((t,i)=>`ao_session_${5000+i}=${t}`).join('; ')}} as any);
 try{
  assert.ok(auth.verify(otherToken));assert.equal((await probe(otherToken)).status,403);assert.equal(effects,0);
  assert.equal((await probe(ownerToken)).status,200);assert.equal(effects,1);
  assert.equal(auth.sessionFromAnyCookie(req([otherToken,ownerToken]),s=>isOwner(ctx,s.account?.id))?.account?.id,owner.id);
  await accounts.setPassword(owner.id,'password-three');
  assert.equal((await probe(ownerToken)).status,401);assert.equal(effects,1);
  assert.equal(auth.sessionFromAnyCookie(req([ownerToken,otherToken]),s=>isOwner(ctx,s.account?.id)),undefined);
  assert.equal(people(ctx).stillIn({accountId:owner.id,sessionEpoch:0} as any),false);
  const fresh=auth.issue(owner.id);assert.equal((await probe(fresh)).status,200);assert.equal(effects,2);
  assert.equal((await probe(otherToken)).status,403);assert.equal(effects,2);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true});}
});
