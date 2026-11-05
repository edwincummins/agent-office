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
import {guessKey} from '../src/server/onboarding/limits.js';
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
    for(let i=0;i<10;i++){
      assert.equal((await h.post('/api/login',{name:'Owner',password:'wrong'})).status,401);
      assert.equal((await h.post('/api/login',{name:'Other',password:'password2'})).status,200);
    }
    assert.equal((await h.post('/api/login',{name:'Owner',password:'wrong'})).status,429);
  }finally{await h.close();}
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
