import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runFleet } from '../src/server/fleet/source.js';

for(const mode of ['timeout','abort','overflow'] as const)test(`Windows fleet ${mode} kills the command and its child`,{skip:process.platform!=='win32'},async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'fleet-tree-')),file=path.join(dir,'pids.json');
  const script=`const {spawn}=require('node:child_process');const fs=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});fs.writeFileSync(process.argv[1],JSON.stringify([process.pid,c.pid]));if(process.argv[2]==='overflow')setTimeout(()=>process.stdout.write('x'.repeat(2*1024*1024)),100);setInterval(()=>{},1000);`;
  const abort=new AbortController();
  const started=Date.now();
  const pending=assert.rejects(runFleet([process.execPath,'-e',script,file,mode],abort.signal,mode==='timeout'?1500:10000),/failed or timed out/);
  let pids:number[]=[];
  try {
    const until=Date.now()+5000;
    while(!existsSync(file)&&Date.now()<until)await new Promise(r=>setTimeout(r,20));
    assert.ok(existsSync(file),'fixture must spawn before timeout');
    pids=JSON.parse(readFileSync(file,'utf8'));
    if(mode==='abort')abort.abort();
    await pending;
    assert.ok(Date.now()-started<5000,'overflow/abort must finish before the command timeout');
    for(const pid of pids)assert.throws(()=>process.kill(pid,0),{code:'ESRCH'},`process ${pid} must be gone`);
  }finally{
    abort.abort();
    try{await pending;}finally{
      for(const pid of pids)try{process.kill(pid,'SIGKILL');}catch{}
      rmSync(dir,{recursive:true,force:true});
    }
  }
});

