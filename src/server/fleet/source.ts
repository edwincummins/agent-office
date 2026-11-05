import { execFile } from 'node:child_process';
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
    execFile(command[0],command.slice(1),{shell:false,windowsHide:true,timeout,killSignal:'SIGKILL',maxBuffer:1024*1024,signal,encoding:'utf8'},(error,stdout)=>{
      if(error)return reject(Error('Fleet command failed or timed out'));
      try{resolve(JSON.parse(stdout));}catch{reject(Error('Fleet command returned invalid JSON'));}
    });
  });
}
