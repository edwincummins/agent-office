import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile as rawExecFile} from 'node:child_process';
import {execFile,spawn,spawnSync} from '../src/server/cli-process.js';
const windows=process.platform==='win32';
function fixture(){const dir=mkdtempSync(path.join(tmpdir(),'office shim ')),file=path.join(dir,'cli.CMD');writeFileSync(path.join(dir,'args.cjs'),'console.log(JSON.stringify(process.argv.slice(2)));');writeFileSync(file,`@echo off\r\n"${process.execPath}" "%~dp0args.cjs" %*\r\n`);return {dir,file};}
test('Windows native execFile reproduces npm CMD EINVAL twice',{skip:!windows},async()=>{
 const f=fixture();try{for(let i=0;i<2;i++)assert.throws(()=>rawExecFile(f.file,['auth','status','--json'],()=>{}),{code:'EINVAL'});}finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('Windows shim execFile preserves fixed, empty, JSON and hostile arguments without executing them',{skip:!windows},async()=>{
 const f=fixture(),marker=path.join(f.dir,'injected.txt');
 const args=['auth','status','--json','','space here','{"type":"object"}','trailing\\','中文','%PATH%','!PATH!','a&b','a|b','a^b',`" & echo injected > "${marker}" & rem "`];
 try{await new Promise<void>((resolve,reject)=>execFile(f.file,args,{encoding:'utf8',timeout:5000},(error,out)=>{if(error)return reject(error);try{assert.deepEqual(JSON.parse(out),args);assert.equal(existsSync(marker),false);resolve();}catch(e){reject(e);}}));}finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('spawn and spawnSync support PATH-resolved shims and stream stdin',{skip:!windows},async()=>{
 const f=fixture();try{
  const env={...process.env,PATH:f.dir+path.delimiter+process.env.PATH};
  const result=spawnSync('cli',['--tools',''],{env,encoding:'utf8'});assert.equal(result.status,0);assert.deepEqual(JSON.parse(result.stdout),['--tools','']);
  await new Promise<void>((resolve,reject)=>{const child=spawn(f.file,['models','list'],{stdio:'pipe'});let out='';child.stdout.on('data',d=>out+=d);child.on('error',reject);child.on('close',code=>{try{assert.equal(code,0);assert.deepEqual(JSON.parse(out),['models','list']);resolve();}catch(e){reject(e);}});child.stdin.end();});
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('native executables retain direct argv semantics',async()=>{
 const args=['%PATH%','a&b','"quote"','line\nbreak'];await new Promise<void>((resolve,reject)=>execFile(process.execPath,['-e','console.log(JSON.stringify(process.argv.slice(1)))',...args],{encoding:'utf8'},(e,out)=>{if(e)return reject(e);assert.deepEqual(JSON.parse(out),args);resolve();}));
});

import {PlanLimitsReader} from '../src/server/limits.js';
import {SignIns} from '../src/server/signins.js';
import {TaskNamer} from '../src/server/tasks.js';
import {ghText} from '../src/server/cli-text.js';
import {readFileSync,mkdirSync} from 'node:fs';

test('batch rejects line breaks and NUL before launch',{skip:!windows},()=>{
 const f=fixture();try{for(const arg of ['a\nb','a\rb','a\0b'])assert.throws(()=>spawn(f.file,[arg]),/line breaks or NUL/);}finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('relative shim lookup follows child cwd',{skip:!windows},()=>{
 const f=fixture();try{const r=spawnSync('./cli',['ok'],{cwd:f.dir,encoding:'utf8'});assert.equal(r.status,0);assert.deepEqual(JSON.parse(r.stdout),['ok']);}finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('Claude status and plan limits work through a Windows shim without real credentials',{skip:!windows},async()=>{
 const f=fixture();let reader:PlanLimitsReader|undefined;
 writeFileSync(path.join(f.dir,'args.cjs'),`if(process.argv[2]==='auth')console.log(JSON.stringify({loggedIn:true,email:'test@example.invalid',subscriptionType:'max'}));else {process.stdin.on('data',d=>{const q=JSON.parse(d);console.log(JSON.stringify({type:'control_response',response:{request_id:q.request_id,subtype:'success',response:{subscription_type:'max',rate_limits:{five_hour:{utilization:25}}}}}));});}`);
 const signins=new SignIns(path.join(f.dir,'data'),f.file,null,()=>({...process.env} as Record<string,string>),()=>true,()=>{});
 try{
  await signins.look('testaccount',true);assert.equal(signins.state('testaccount').claude.status,'ok');
  signins.useOffice('testaccount','claude');await signins.look('testaccount',true);assert.equal(signins.state('testaccount').claude.status,'ok');
  await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('limits timed out')),5000);reader=new PlanLimitsReader(f.file,process.env as Record<string,string>,()=>true,value=>{clearTimeout(timeout);try{assert.equal(value.plan,'max');assert.equal(value.windows[0].pct,25);resolve();}catch(e){reject(e);}});});
 }finally{reader?.close();signins.shutdown();rmSync(f.dir,{recursive:true,force:true});}
});
test('task naming passes multiline instructions by file and prompts over stdin, then cleans up',{skip:!windows},async()=>{
 const f=fixture(),record=path.join(f.dir,'record.json');
 writeFileSync(path.join(f.dir,'args.cjs'),`const fs=require('fs');const args=process.argv.slice(2),file=args[args.indexOf('--system-prompt-file')+1];let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(record)},JSON.stringify({file,system:fs.readFileSync(file,'utf8'),input,args}));console.log(JSON.stringify({structured_output:{name:'Test label',summary:'Test summary'}}));});`);
 try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('namer timed out')),5000);const namer=new TaskNamer(f.file,process.env as Record<string,string>,()=> 'line one\nline two',(_id,task)=>{clearTimeout(timer);try{assert.equal(task.name,'Test label');resolve();}catch(e){reject(e);}});namer.request('worker',{prompts:['hello\nworld'],tools:[],epoch:1});});const recordData=JSON.parse(readFileSync(record,'utf8'));assert.equal(recordData.system,'line one\nline two');assert.match(recordData.input,/oldest first:\n1. hello world/);assert.equal(existsSync(recordData.file),false);}finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('multiline GitHub bodies use files and are removed on success and failure',{skip:!windows},async()=>{
 for(const fail of [false,true]){let file='';try{await ghText(['api','-f','body=one\ntwo'],async args=>{assert.equal(args[1],'-F');file=args[2].slice(6);assert.equal(readFileSync(file,'utf8'),'one\ntwo');if(fail)throw Error('expected');return '';});}catch(e){assert.equal((e as Error).message,'expected');}assert.equal(existsSync(file),false);}
});
test('execFile timeout kills the shim CLI child too',{skip:!windows},async()=>{
 const f=fixture(),record=path.join(f.dir,'pid');writeFileSync(path.join(f.dir,'args.cjs'),`require('fs').writeFileSync(${JSON.stringify(record)},String(process.pid));setInterval(()=>{},1000);`);
 try{await new Promise<void>(resolve=>execFile(f.file,[],{timeout:1200},error=>{assert.ok(error);resolve();}));const pid=Number(readFileSync(record,'utf8'));assert.throws(()=>process.kill(pid,0));}finally{rmSync(f.dir,{recursive:true,force:true});}
});


test('batch path shell characters remain literal',{skip:!windows},()=>{
 const root=mkdtempSync(path.join(tmpdir(),'office-path-')),dir=path.join(root,'space & (x) %PATH% !wow!');
 try{mkdirSync(dir);const file=path.join(dir,'cli.bat');writeFileSync(path.join(dir,'args.cjs'),'console.log(JSON.stringify(process.argv.slice(2)))');writeFileSync(file,`@echo off\r\n"${process.execPath}" "%~dp0args.cjs" %*\r\n`);const r=spawnSync(file,['safe'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),['safe']);}finally{rmSync(root,{recursive:true,force:true});}
});
