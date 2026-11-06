import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Accounts} from '../src/server/accounts.js';
import {handlers} from '../src/server/ws/handlers/index.js';
import {ownerHandlers,isOwner,visitorMessage} from '../src/server/owner-workers/access.js';
import {ownerRoute} from '../src/server/owner-workers/routes.js';
import {ownerSignIns,scrubOfficeSecrets} from '../src/server/owner-workers/credentials.js';
import {hookRequest,ownerHook} from '../src/server/owner-workers/hooks.js';
import {officeWorkers} from '../src/server/hooks/office-workers.js';
import {TaskQueue} from '../src/server/queue.js';
import {Auth} from '../src/server/auth.js';
import type {Ctx} from '../src/server/office/context.js';
const identities=['owner1','admin2','member3',undefined,'revoked'];
function fixture(){
 const dir=mkdtempSync(path.join(tmpdir(),'office-owner-test-'));
 const accounts=new Map([['owner1',{id:'owner1',role:'admin'}],['admin2',{id:'admin2',role:'admin'}],['member3',{id:'member3',role:'member'}]]);
 const ctx={cfg:{dataDir:dir},accounts:{get:(id:string)=>accounts.get(id)},warn:()=>{}} as unknown as Ctx;
 const config=(id:unknown)=>writeFileSync(path.join(dir,'config.json'),JSON.stringify({ownerAccountId:id}));config('owner1');
 return {ctx,dir,accounts,config,close:()=>rmSync(dir,{recursive:true,force:true})};
}
function response(){const r={statusCode:0,body:'',writeHead(code:number){r.statusCode=code;},end(body?:string){r.body=body??'';}};return r;}

test('owner is an explicit existing admin ID, not name or admin role; unset fails closed',()=>{
 const f=fixture();try{assert.equal(isOwner(f.ctx,'owner1'),true);for(const id of identities.slice(1))assert.equal(isOwner(f.ctx,id),false);
 for(const bad of [undefined,'',null,'admin','member3',[],{},123]){f.config(bad);assert.equal(isOwner(f.ctx,'owner1'),false);}
 f.config('owner1');f.accounts.delete('owner1');assert.equal(isOwner(f.ctx,'owner1'),false);
 }finally{f.close();}
});
test('first-run owner record survives account serialization and explicit config overrides it',async()=>{
 const f=fixture();try{rmSync(path.join(f.dir,'config.json'));const accounts=new Accounts(f.dir);const invite=accounts.invite('test','admin');assert.notEqual(typeof invite,'string');const a=await accounts.join((invite as any).token,'Synthetic Owner','test-password-only');assert.notEqual(typeof a,'string');const file=path.join(f.dir,'accounts.json');const data=JSON.parse(readFileSync(file,'utf8'));data.ownerAccountId=(a as any).id;writeFileSync(file,JSON.stringify(data));accounts.seen((a as any).id);assert.equal(JSON.parse(readFileSync(file,'utf8')).ownerAccountId,(a as any).id);f.ctx.accounts=accounts;assert.equal(isOwner(f.ctx,(a as any).id),true);f.config('');assert.equal(isOwner(f.ctx,(a as any).id),false);}finally{f.close();}
});
test('every registered control handler refuses other admins, members, shared and revoked sessions before effects',()=>{
 const f=fixture();let refused=0;f.ctx.warn=()=>{refused++;};try{
 const keys=Object.keys(handlers).filter(k=>!visitorMessage(k));assert.ok(keys.length>=50);
 assert.equal(visitorMessage('levels.sync'),true);
 assert.equal(visitorMessage('levels.lift'),true);
 assert.equal(visitorMessage('fleet.subscribe'),true);
 assert.equal(visitorMessage('fleet.screens'),true);
 assert.equal(visitorMessage('share.take'),false);
 for(const id of identities.slice(1))for(const key of keys){const before=refused;(handlers as any)[key](f.ctx,{accountId:id,admin:true},{t:key,accountId:'owner1',owner:true,workerId:['forged'],all:true});assert.equal(refused,before+1,key+' '+id);}
 f.config('');for(const key of keys){const before=refused;(handlers as any)[key](f.ctx,{accountId:'owner1',admin:true},{t:key});assert.equal(refused,before+1,key);}
 }finally{f.close();}
});
test('owner reaches control handlers and visitor social/read-only actions still dispatch',()=>{
 const f=fixture();try{for(const key of Object.keys(handlers)){let calls=0;const wrapped=ownerHandlers({[key]:()=>calls++} as any);(wrapped as any)[key](f.ctx,{accountId:'owner1'},{t:key});assert.equal(calls,1,key);if(visitorMessage(key)){(wrapped as any)[key](f.ctx,{}, {t:key});assert.equal(calls,2,key);}}}finally{f.close();}
});
test('HTTP owner gate refuses before reading bodies or writing files',async()=>{
 const f=fixture();let effects=0;const route=ownerRoute({path:'/api/term/drop',auth:'session',handle:()=>effects++}) as any;
 try{for(const id of identities.slice(1)){const res=response();await route.handle(f.ctx,{session:{account:{id}},res});assert.equal(res.statusCode,403);assert.equal(effects,0);}await route.handle(f.ctx,{session:{account:{id:'owner1'}},res:response()});assert.equal(effects,1);}finally{f.close();}
});
test('non-owner sign-in calls never load or launch provider credentials',async()=>{
 const f=fixture();let effects=0;const fake=new Proxy({},{get:()=>()=>{effects++;return true;}});const signins=ownerSignIns(f.ctx,fake as any);
 try{for(const id of ['admin2','member3','revoked']){assert.equal(signins.state(id).office,false);assert.equal(signins.claudeReady(id),false);assert.match(signins.start(id,'claude')!,/owner/);assert.match(await signins.token(id,'github','synthetic')??'',/owner/);assert.match(signins.useOffice(id,'github')??'',/owner/);await signins.look(id,true);assert.throws(()=>signins.apply(id,{}),/owner/);}assert.equal(effects,0);signins.state('owner1');assert.equal(effects,1);}finally{f.close();}
});
test('worker environment strips office, Cadre and Google secrets but keeps its own hook capability',()=>{
 const env=scrubOfficeSecrets({AGENT_OFFICE_SECRET:'x',agent_office_google_client_secret:'x',CADRE_WEB_TOKEN:'x',GOOGLE_CLIENT_SECRET:'x',SESSION_SECRET:'x',AGENT_OFFICE_WORKER_ID:'worker',AGENT_OFFICE_HOOK_TOKEN:'hook',PATH:'bin',CLAUDE_CONFIG_DIR:'owner-home'});
 assert.deepEqual(env,{AGENT_OFFICE_WORKER_ID:'worker',AGENT_OFFICE_HOOK_TOKEN:'hook',PATH:'bin',CLAUDE_CONFIG_DIR:'owner-home'});
});
test('worker hooks require a current owner worker secret and refuse browsers/rebinding',async()=>{
 const f=fixture();let effects=0;f.ctx.workerFloor=()=>({workers:{ownerOf:()=> 'admin2',authenticate:()=>({id:'worker',name:'test'}),list:()=>{effects++;return [];}}}) as any;
 try{assert.equal(ownerHook(f.ctx,'worker','secret'),false);for(const action of ['', '/home','/tell','/pr']){const res=response();await officeWorkers(f.ctx,{method:'POST',headers:{authorization:'Bearer secret'}} as any,res as any,new URL('http://localhost/office/workers'+action+'?worker=worker'));assert.equal(res.statusCode,403);}assert.equal(effects,0);
 const req={headers:{host:'127.0.0.1:1234'},socket:{localPort:1234,remoteAddress:'127.0.0.1'}};assert.equal(hookRequest(req as any),true);assert.equal(hookRequest({...req,headers:{...req.headers,origin:'http://evil.test'}} as any),false);assert.equal(hookRequest({...req,headers:{host:'evil.test:1234'}} as any),false);
 }finally{f.close();}
});
test('old non-owner queue rows never fetch, recycle or spawn workers',()=>{
 const f=fixture();let effects=0;const queue=new TaskQueue(f.dir,{defaultProvider:'claude',list:()=>[],deskOccupied:()=>false,fetchBase:()=>{effects++;return undefined;},spawn:()=>{effects++;return 'blocked';},kill:async()=>{effects++;return {};}} as any,true,{mayRun:id=>isOwner(f.ctx,id),update(){},toast(){},claimIssue:async()=>undefined,refreshGitHub(){},hiringPaused:()=>undefined,emptied(){}});
 try{queue.add('test','Visitor',undefined,undefined,undefined,undefined,undefined,'admin2');queue.pump();assert.equal(effects,0);assert.equal(queue.state().tasks[0].status,'queued');}finally{queue.shutdown();f.close();}
});

test('relay cookies must belong to the owner, never just any authenticated account',()=>{
 const f=fixture();try{const auth=new Auth(Buffer.alloc(32),Buffer.alloc(16),'synthetic',f.ctx.accounts as any);for(const id of ['owner1','admin2','member3']){const req={headers:{cookie:'ao_session_4600='+auth.issue(id)}} as any;assert.equal(auth.fromAnyCookie(req,s=>isOwner(f.ctx,s.account?.id)),id==='owner1');}}finally{f.close();}
});
