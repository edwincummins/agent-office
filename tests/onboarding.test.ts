import {PassThrough} from 'node:stream';
import {watchSession} from '../src/server/onboarding/socket-session.js';
import {people} from '../src/server/office/people.js';
import {newClient} from '../src/server/office/client.js';
import {startTimers} from '../src/server/office/timers.js';
import {spawn} from 'node:child_process';
import {request} from 'node:http';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {recoverPassword} from '../src/server/onboarding/password-cli.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {Accounts} from '../src/server/accounts.js';
import {Auth} from '../src/server/auth.js';
import {requestHandler} from '../src/server/http/router.js';
import {onboardingRoutes} from '../src/server/onboarding/routes.js';
import {authRoutes} from '../src/server/http/routes/auth.js';
import type {Ctx} from '../src/server/office/context.js';
import {generateKeyPair,SignJWT,createLocalJWKSet,exportJWK} from 'jose';
import {verifyIdToken} from '../src/server/onboarding/oidc.js';
import {guessKey,AttemptLimits} from '../src/server/onboarding/limits.js';
async function harness(){
  const dir=mkdtempSync(path.join(tmpdir(),'office-onboarding-')),accounts=new Accounts(dir),auth=new Auth(Buffer.alloc(32),Buffer.alloc(16),'synthetic',accounts);
  const ctx={accounts,auth,cfg:{dataDir:dir,host:'127.0.0.1',port:0,trustProxy:false},services:{lookup:()=>undefined},accountsChanged:()=>{}} as unknown as Ctx;
  let exchanges=0;
  const provider={authorize:'https://fake.invalid/authorize',async exchange(){exchanges++;return {issuer:'https://fake.invalid',subject:'one',email:'one@example.test',name:'Google Owner'};}};
  const server=createServer(requestHandler(ctx,[...onboardingRoutes(provider),...Object.values(authRoutes)]));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));ctx.cfg.port=(server.address() as any).port;
  const base=`http://127.0.0.1:${ctx.cfg.port}`;
  const post=(url:string,body:unknown)=>fetch(base+url,{method:'POST',headers:{Origin:base,'content-type':'application/json'},body:JSON.stringify(body),redirect:'manual'});
  return {ctx,dir,base,post,exchanges:()=>exchanges,async close(){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true});}};
}
test('first owner creation races once, persists owner id, closes signup, refuses network exposure',async()=>{
  const h=await harness();try{
    h.ctx.cfg.host='0.0.0.0';assert.equal((await h.post('/api/signup',{name:'Owner',password:'password1',confirm:'password1'})).status,403);h.ctx.cfg.host='127.0.0.1';
    assert.equal((await fetch(h.base+'/api/signup',{method:'POST',headers:{Host:`evil.test:${h.ctx.cfg.port}`,Origin:`http://evil.test:${h.ctx.cfg.port}`},body:'{}'})).status,403);
    const body={name:'Owner',password:'password1',confirm:'password1'};
    const results=await Promise.all([h.post('/api/signup',body),h.post('/api/signup',body)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const a=h.ctx.accounts.byName('Owner')!;assert.equal(a.role,'admin');assert.equal(new Accounts(h.dir).ownerAccountId,a.id);assert.equal(h.ctx.accounts.sharedPassword,false);
    assert.equal((await h.post('/api/signup',body)).status,403);
    assert.equal((await h.post('/api/login',{name:'Owner',password:'password1'})).status,200);
  }finally{await h.close();}
});
test('canonical budgets ignore query/encoding/name aliases and isolate invite tokens',()=>{
  assert.equal(guessKey('/api/login?a=1',' A\u200bda  Lovelace '),guessKey('/api/%6cogin?a=2','ada lovelace'));
  assert.notEqual(guessKey('/api/join',undefined,'one'),guessKey('/api/join',undefined,'two'));
});
test('a failed first account save leaves no in-memory owner',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'office-save-'));try{
    const a=new Accounts(dir);mkdirSync(path.join(dir,`accounts.json.${process.pid}.tmp`));
    await assert.rejects(a.createFirst('Owner','password1'));assert.equal(a.any,false);assert.equal(a.ownerAccountId,undefined);assert.equal(await a.check('Owner','password1'),undefined);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('another valid login cannot reset the victim name budget',async()=>{
  const h=await harness();try{
    await h.ctx.accounts.createFirst('Owner','password1');const invite=h.ctx.accounts.invite('Owner','member','Other');assert.notEqual(typeof invite,'string');await h.ctx.accounts.join((invite as any).token,'Other','password2');
    for(let i=0;i<9;i++){
      assert.equal((await h.post('/api/login',{name:'Owner',password:'wrong'})).status,401);
      assert.equal((await h.post('/api/login',{name:'Other',password:'password2'})).status,200);
    }
    assert.equal((await h.post('/api/login',{name:'Owner',password:'wrong'})).status,401);
    assert.equal((await h.post('/api/login',{name:'Owner',password:'wrong'})).status,429);
  }finally{await h.close();}
});
test('successful attempts release their IP reservation without erasing another name failure',()=>{
  const limits=new AttemptLimits();
  for(let i=0;i<9;i++){assert.ok(limits.take('ip'));assert.ok(limits.take('victim'));assert.ok(limits.take('ip'));assert.ok(limits.take('other'));limits.success('other');limits.release('ip');}
  assert.ok(limits.take('ip'));assert.equal(limits.take('ip'),false);
  assert.ok(limits.take('victim'));assert.equal(limits.take('victim'),false);
  const successful=new AttemptLimits();for(let i=0;i<50;i++){assert.ok(successful.take('ip'));successful.release('ip');}
});
test('Google off by default; bound state is single-use and redirects are fixed',async()=>{
  const h=await harness();try{
    assert.equal((await h.post('/auth/google/start',{})).status,404);
    writeFileSync(path.join(h.dir,'config.json'),JSON.stringify({google:{clientId:'test',clientSecret:'secret',redirectUri:h.base+'/auth/google/callback'}}));
    const start=await h.post('/auth/google/start',{}),cookie=start.headers.get('set-cookie')!.split(';')[0],u=new URL((await start.json() as any).url);
    assert.equal(u.searchParams.get('redirect_uri'),h.base+'/auth/google/callback');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.ok(!u.searchParams.has('client_secret'));
    const callback=h.base+'/auth/google/callback?state='+u.searchParams.get('state')+'&code=test';
    assert.match((await fetch(callback,{redirect:'manual'})).headers.get('location')!,/authError/);assert.equal(h.exchanges(),0);
    const done=await fetch(callback,{headers:{Cookie:cookie},redirect:'manual'});assert.equal(done.headers.get('location'),'/');assert.ok(done.headers.get('set-cookie')!.includes('ao_session_'));
    await fetch(callback,{headers:{Cookie:cookie},redirect:'manual'});assert.equal(h.exchanges(),1);assert.equal(h.ctx.accounts.byName('Google Owner')?.role,'admin');
  }finally{await h.close();}
});
test('Google cannot take an existing password account by name; an invite assigns its own role',async()=>{
  const h=await harness();try{
    await h.ctx.accounts.createFirst('Google Owner','password1');
    writeFileSync(path.join(h.dir,'config.json'),JSON.stringify({google:{clientId:'test',clientSecret:'secret',redirectUri:h.base+'/auth/google/callback'}}));
    const flow=async(body:object)=>{const r=await h.post('/auth/google/start',body),cookie=r.headers.get('set-cookie')!.split(';')[0],u=new URL((await r.json() as any).url);return fetch(h.base+'/auth/google/callback?state='+u.searchParams.get('state')+'&code=test',{headers:{Cookie:cookie},redirect:'manual'});};
    assert.match((await flow({})).headers.get('location')!,/authError=invite/);
    assert.equal(h.ctx.accounts.state(new Set()).accounts.length,1);
    const invite=h.ctx.accounts.invite('Owner','member','Invited Person') as any;
    const done=await flow({invite:invite.token,role:'admin'});assert.equal(done.headers.get('location'),'/');
    assert.equal(h.ctx.accounts.byName('Invited Person')?.role,'member');assert.equal(h.ctx.accounts.findInvite(invite.token),undefined);
    assert.equal(h.ctx.accounts.byName('Google Owner')?.identity,undefined);
  }finally{await h.close();}
});
test('logout revokes the current session in the running office',async()=>{
  const h=await harness();try{
    const a=await h.ctx.accounts.createFirst('Owner','password1') as any;
    const token=h.ctx.auth.issue(a.id),cookie=`ao_session_${h.ctx.cfg.port}=${token}`;
    const r=await fetch(h.base+'/api/logout',{method:'POST',headers:{Origin:h.base,Cookie:cookie}});assert.equal(r.status,200);assert.equal(h.ctx.auth.verify(token),undefined);
  }finally{await h.close();}
});
test('verified tokens reject bad claim types, identity, time and algorithm',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='test';const jwks=createLocalJWKSet({keys:[jwk]});
  const now=Math.floor(Date.now()/1000),claims={iss:'https://issuer.test',sub:'subject',aud:'client',email:'a@example.test',email_verified:true,nonce:'nonce',iat:now,exp:now+300};
  const sign=(p:any)=>new SignJWT(p).setProtectedHeader({alg:'RS256',kid:'test'}).sign(privateKey);
  const verify=(token:string)=>verifyIdToken(token,{issuer:'https://issuer.test',jwks,clientId:'client',nonce:'nonce'});
  assert.equal((await verify(await sign(claims))).subject,'subject');
  for(const change of [{iss:'bad'},{aud:'bad'},{sub:''},{email_verified:'false'},{email_verified:false},{email:''},{nonce:'bad'},{exp:now-60},{iat:now+120},{azp:'bad'}])await assert.rejects(verify(await sign({...claims,...change})));
  const missing={...claims} as any;delete missing.nonce;await assert.rejects(verify(await sign(missing)));
  await assert.rejects(verify('x'.repeat(17000)));
  await assert.rejects(verify(await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'unknown'}).sign(privateKey)));
  const other=await generateKeyPair('RS256');await assert.rejects(verify(await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test'}).sign(other.privateKey)));
  await assert.rejects(verify(Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.'));
});

test('first-run password and Google admission refuse all proxy headers',async()=>{
 for(const header of ['X-Forwarded-For','X-Forwarded-Host','X-Forwarded-Anything','Forwarded','X-Real-IP','Via']){
  const h=await harness();try{
   writeFileSync(path.join(h.dir,'config.json'),JSON.stringify({google:{clientId:'test',clientSecret:'secret',redirectUri:h.base+'/auth/google/callback'}}));
   for(const route of ['/api/signup','/auth/google/start']){
    const r=await fetch(h.base+route,{method:'POST',headers:{Origin:h.base,[header]:'proxy','content-type':'application/json'},body:JSON.stringify({name:'Owner',password:'password1',confirm:'password1'})});
    assert.equal(r.status,403,header+' '+route);assert.equal(h.ctx.accounts.any,false);
   }
  }finally{await h.close();}
 }
});

test('Google first password is self-only, single-use and survives local recovery',async()=>{
 const h=await harness();try{
  const owner=await h.ctx.accounts.createFirst('Owner','unusable-random',{issuer:'test',subject:'owner',email:'owner@example.test'}) as any;
  const invite=h.ctx.accounts.invite('Owner','member','Guest') as any;
  const guest=await h.ctx.accounts.join(invite.token,'Ignored','another-random',{issuer:'test',subject:'guest',email:'guest@example.test'}) as any;
  const cookie=(id:string)=>`ao_session_${h.ctx.cfg.port}=${h.ctx.auth.issue(id)}`;
  const set=(cookieValue:string,body:unknown,origin=h.base)=>fetch(h.base+'/api/account/password',{method:'POST',headers:{Origin:origin,Cookie:cookieValue,'content-type':'application/json'},body:JSON.stringify(body)});
  const body={password:'new-password',confirm:'new-password',accountId:owner.id};
  assert.equal((await set('',body)).status,401);
  assert.equal((await set(cookie(guest.id),body,'https://foreign.test')).status,403);
  assert.equal((await set(cookie(guest.id),body)).status,200);
  assert.equal(await h.ctx.accounts.check('Owner','new-password'),undefined);
  assert.equal((await h.ctx.accounts.check('Guest','new-password'))?.id,guest.id);
  assert.equal((await set(cookie(guest.id),body)).status,403);
  assert.equal(await recoverPassword(h.ctx.accounts,['Owner','no-argument-secret'],Readable.from(['reset-password\n'])),2);
  assert.equal(await recoverPassword(h.ctx.accounts,['Owner'],Readable.from(['short\n'])),1);
  assert.equal(await recoverPassword(h.ctx.accounts,['Owner'],Readable.from(['reset-password\n'])),0);
  const reloaded=new Accounts(h.dir);assert.equal((await reloaded.check('Owner','reset-password'))?.id,owner.id);
  assert.equal(reloaded.ownerAccountId,owner.id);assert.equal(reloaded.get(owner.id)?.identity?.subject,'owner');assert.equal(reloaded.get(owner.id)?.passwordUnset,undefined);
 }finally{await h.close();}
});
test('a proxy header on the Google first-run callback cannot create an owner',async()=>{
 const h=await harness();try{
  writeFileSync(path.join(h.dir,'config.json'),JSON.stringify({google:{clientId:'test',clientSecret:'secret',redirectUri:h.base+'/auth/google/callback'}}));
  const r=await h.post('/auth/google/start',{}),cookie=r.headers.get('set-cookie')!.split(';')[0],u=new URL((await r.json() as any).url);
  const done=await fetch(h.base+'/auth/google/callback?state='+u.searchParams.get('state')+'&code=test',{headers:{Cookie:cookie,Via:'local-proxy'},redirect:'manual'});
  assert.match(done.headers.get('location')!,/authError/);assert.equal(h.ctx.accounts.any,false);
 }finally{await h.close();}
});

test('local CLI recovery reads stdin and refuses ambiguous on/off names',async()=>{
 const h=await harness();try{
  await h.ctx.accounts.createFirst('on','old-password',{issuer:'test',subject:'one',email:'one@example.test'});
  const parent=path.dirname(h.dir),home=path.join(parent,path.basename(h.dir)+'-cli');mkdirSync(home);mkdirSync(path.join(home,'.agent-office'));
  const {readFileSync}=await import('node:fs');writeFileSync(path.join(home,'.agent-office/accounts.json'),readFileSync(path.join(h.dir,'accounts.json')));
  const run=(args:string[],input:string)=>new Promise<{code:number|null;out:string}>(resolve=>{
   const c=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./fixtures/accounts-command.ts',import.meta.url)),...args,'--dir',home],{stdio:['pipe','pipe','pipe'],windowsHide:true});let out='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>out+=d);c.on('close',code=>resolve({code,out}));c.stdin.end(input);
  });
  try{
   const refused=await run(['password','on'],'new-password\n');assert.equal(refused.code,2);assert.equal(new Accounts(path.join(home,'.agent-office')).sharedPassword,false);
   const reset=await run(['password','--account','on'],'new-password\n');assert.equal(reset.code,0);assert.ok(await new Accounts(path.join(home,'.agent-office')).check('on','new-password'));assert.ok(!reset.out.includes('new-password'));
  }finally{rmSync(home,{recursive:true,force:true});}
 }finally{await h.close();}
});
test('logout while a password request body is pending prevents recovery',async()=>{
 const h=await harness();try{
  const a=await h.ctx.accounts.createFirst('Owner','old-random',{issuer:'test',subject:'one',email:'one@example.test'}) as any;
  const token=h.ctx.auth.issue(a.id),cookie=`ao_session_${h.ctx.cfg.port}=${token}`,body=JSON.stringify({password:'new-password',confirm:'new-password'});
  let finish!:()=>void;
  const response=new Promise<number>(resolve=>{
   const req=request(h.base+'/api/account/password',{method:'POST',headers:{Origin:h.base,Cookie:cookie,'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!));});
   req.write(body.slice(0,1));finish=()=>req.end(body.slice(1));
  });
  await new Promise(r=>setTimeout(r,30));await fetch(h.base+'/api/logout',{method:'POST',headers:{Origin:h.base,Cookie:cookie}});finish();
  assert.equal(await response,400);assert.equal(await h.ctx.accounts.check('Owner','new-password'),undefined);
 }finally{await h.close();}
});

test('local password reset rejects all previously issued account cookies',async()=>{
 const h=await harness();try{
  const a=await h.ctx.accounts.createFirst('Owner','old-password') as any;
  const old=h.ctx.auth.issue(a.id);assert.ok(h.ctx.auth.verify(old));
  await h.ctx.accounts.setPassword(a.id,'new-password');assert.equal(h.ctx.auth.verify(old),undefined);assert.equal(h.ctx.auth.verify(h.ctx.auth.issue(a.id,0)),undefined);
 }finally{await h.close();}
});

test('profile password renews its session, closes other account sockets and leaves other accounts alone',async()=>{
 const h=await harness();try{
  const a=await h.ctx.accounts.createFirst('Owner','old-random',{issuer:'test',subject:'one',email:'one@example.test'}) as any;
  const invite=h.ctx.accounts.invite('Owner','member','Guest') as any,guest=await h.ctx.accounts.join(invite.token,'Guest','password1') as any;
  const caller=h.ctx.auth.issue(a.id),other=h.ctx.auth.issue(a.id),guestCookie=h.ctx.auth.issue(guest.id);const closed:string[]=[];
  h.ctx.clients=new Map();h.ctx.sendTo=()=>{};Object.assign(h.ctx,people(h.ctx));
  const connect=(id:string,token:string)=>{const session=h.ctx.auth.verify(token)!;const c=newClient(id,{close:()=>closed.push(id)} as any,{accountId:session.account!.id,admin:true,sessionEpoch:session.sessionEpoch,sessionId:session.sessionId},{} as any);h.ctx.clients.set(id,c);return c;};
  const callerSocket=connect('caller',caller);connect('other',other);connect('guest',guestCookie);
  const r=await fetch(h.base+'/api/account/password',{method:'POST',headers:{Origin:h.base,Cookie:`ao_session_${h.ctx.cfg.port}=${caller}`,'content-type':'application/json'},body:JSON.stringify({password:'new-password',confirm:'new-password'})});
  assert.equal(r.status,200);const renewed=r.headers.get('set-cookie')!.split(';')[0].split('=')[1];assert.ok(h.ctx.auth.verify(renewed));
  assert.equal(h.ctx.auth.verify(caller),undefined);assert.equal(h.ctx.auth.verify(other),undefined);assert.ok(h.ctx.auth.verify(guestCookie));assert.deepEqual(closed,['other']);assert.ok(h.ctx.stillIn(callerSocket));
  const restoredAuth=new Auth(Buffer.alloc(32),Buffer.alloc(16),'synthetic',new Accounts(h.dir));assert.equal(restoredAuth.verify(other),undefined);assert.ok(restoredAuth.verify(renewed));
  h.ctx.accounts.revoke(a.id);h.ctx.accountsChanged();assert.equal(h.ctx.auth.verify(renewed),undefined);assert.ok(closed.includes('caller'));
 }finally{await h.close();}
});
test('external CLI-style password reset closes an idle websocket on the next poll',async()=>{
 const h=await harness();let stop:undefined|(()=>void);try{
  const a=await h.ctx.accounts.createFirst('Owner','old-password') as any;const token=h.ctx.auth.issue(a.id),session=h.ctx.auth.verify(token)!;let closed=false;
  h.ctx.clients=new Map();h.ctx.sendTo=()=>{};Object.assign(h.ctx,people(h.ctx));const c=newClient('idle',{close:()=>{closed=true;}} as any,{accountId:a.id,admin:true,sessionEpoch:session.sessionEpoch,sessionId:session.sessionId},{} as any);h.ctx.clients.set(c.id,c);
  stop=startTimers(h.ctx);await new Accounts(h.dir).setPassword(a.id,'new-password');await new Promise(r=>setTimeout(r,1100));assert.equal(closed,true);assert.equal(c.out,true);assert.equal(h.ctx.auth.verify(token),undefined);
 }finally{stop?.();await h.close();}
});

test('service tunnel socket closes when its original session is no longer valid',async()=>{
 const socket=new PassThrough();let valid=true;watchSession(socket,()=>valid);assert.equal(socket.destroyed,false);valid=false;await new Promise(r=>setTimeout(r,1100));assert.equal(socket.destroyed,true);
});

test('a pending old-password check cannot mint a fresh session after external recovery',async()=>{
 const h=await harness();try{
  const {readFileSync}=await import('node:fs'),file=path.join(h.dir,'accounts.json');
  const a=await h.ctx.accounts.createFirst('Owner','old-password') as any,old=readFileSync(file,'utf8');
  await new Accounts(h.dir).setPassword(a.id,'new-password');const renewed=readFileSync(file,'utf8');writeFileSync(file,old);
  const pending=h.ctx.accounts.check('Owner','old-password');writeFileSync(file,renewed);
  assert.equal(await pending,undefined);assert.ok(await h.ctx.accounts.check('Owner','new-password'));
 }finally{await h.close();}
});
