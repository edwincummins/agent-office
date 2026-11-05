import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Trusted server config only. Never invoke a shell or accept a command from a client. */
export function fleetCommand(dataDir:string,env=process.env.AGENT_OFFICE_FLEET_COMMAND):string[]|undefined {
  const file=path.join(dataDir,'config.json');
  const raw=env!==undefined?JSON.parse(env):existsSync(file)?JSON.parse(readFileSync(file,'utf8')).cadre?.fleetCommand:undefined;
  if(raw===undefined||raw===null)return undefined;
  if(!Array.isArray(raw)||!raw.length||raw.length>32||raw.some(v=>typeof v!=='string'||!v||v.length>4096||v.includes('\0')))throw Error('cadre.fleetCommand needs an executable/arguments array');
  return raw;
}

export function runFleet(command:readonly string[],signal:AbortSignal,timeout=4000):Promise<unknown> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(Error('Fleet command failed or timed out'));return;}
    let stopping=false,bytes=0;
    const chunks:Buffer[]=[];
    const child=spawn(command[0],command.slice(1),{shell:false,windowsHide:true,stdio:['ignore','pipe','ignore']});
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);};
    const stop=()=>{
      if(stopping)return;stopping=true;cleanup();
      const finish=(error?:Error|null)=>{
        child.kill('SIGKILL');
        reject(Error(error?'Fleet process-tree cleanup failed':'Fleet command failed or timed out'));
      };
      // Keep the parent alive until taskkill has found its descendants, including on output overflow.
      if(process.platform==='win32'&&child.pid){
        const killer=process.env.SystemRoot?path.join(process.env.SystemRoot,'System32','taskkill.exe'):'taskkill.exe';
        execFile(killer,['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:2000},finish);
      }else finish();
    };
    const timer=setTimeout(stop,timeout);
    signal.addEventListener('abort',stop,{once:true});
    child.stdout.on('data',(chunk:Buffer)=>{
      if(stopping)return;
      bytes+=chunk.length;
      if(bytes>1024*1024){stop();return;}
      chunks.push(chunk);
    });
    child.on('error',()=>{if(!stopping){cleanup();reject(Error('Fleet command failed or timed out'));}});
    child.on('close',code=>{
      if(stopping)return;cleanup();
      if(code!==0){reject(Error('Fleet command failed or timed out'));return;}
      try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('Fleet command returned invalid JSON'));}
    });
  });
}
