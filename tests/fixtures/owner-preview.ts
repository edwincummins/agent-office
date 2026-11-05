// Throwaway-data-only QA harness. No real provider homes or credentials are inherited.
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const [root,port='4640']=process.argv.slice(2);
if(!root||!path.isAbsolute(root)||['4600','4610','4620','4632','4690'].includes(port))throw Error('Pass an absolute throwaway directory and isolated test port');
const marker=path.join(root,'.owner-test-only');
if(existsSync(root)&&!existsSync(marker))throw Error('Refusing an existing directory without the test marker');
mkdirSync(root,{recursive:true});writeFileSync(marker,'Synthetic owner-only QA');
const system=process.env.SystemRoot!;
for(const key of Object.keys(process.env))if(!['SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'].includes(key.toUpperCase()))delete process.env[key];
process.env.PATH=[path.dirname(process.execPath),path.join(system,'System32')].join(path.delimiter);
for(const name of ['HOME','USERPROFILE','APPDATA','LOCALAPPDATA','CLAUDE_CONFIG_DIR','CODEX_HOME','GH_CONFIG_DIR']){process.env[name]=path.join(root,'isolated',name);mkdirSync(process.env[name],{recursive:true});}
const {loadConfig}=await import('../../src/server/config.js');
const {Accounts}=await import('../../src/server/accounts.js');
const {startServer}=await import('../../src/server/server.js');
const agent=path.join(root,'synthetic-agent.cjs');writeFileSync(agent,"console.log('Synthetic worker ready');process.stdin.on('data',d=>console.log('Received: '+d));setInterval(()=>{},1000);");
const cfg=loadConfig(['--home',root,root,'--host','127.0.0.1','--port',port,'--no-open','--password','synthetic-shared-only','--agent',process.execPath,'--agent-args',JSON.stringify(agent)]);
const accounts=new Accounts(cfg.dataDir);
for(const [name,role] of [['Test Owner','admin'],['Other Admin','admin'],['Test Member','member']] as const){if(accounts.byName(name))continue;const invite=accounts.invite('test harness',role);if(typeof invite==='string')throw Error(invite);const joined=await accounts.join(invite.token,name,'synthetic-password-only');if(typeof joined==='string')throw Error(joined);}
writeFileSync(path.join(cfg.dataDir,'config.json'),JSON.stringify({ownerAccountId:accounts.byName('Test Owner')!.id}));
const office=await startServer(cfg);
for(const event of ['SIGINT','SIGTERM'] as const)process.on(event,()=>{office.shutdown();setTimeout(()=>process.exit(0),1000).unref();});
console.log(`Synthetic owner-only preview http://127.0.0.1:${port}; Test Owner owns it. Password synthetic-password-only; shared synthetic-shared-only.`);
