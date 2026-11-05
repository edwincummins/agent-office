/** npm shims need cmd.exe; keep native executables and POSIX argv out of a shell. */
import {execFile as nativeExecFile,spawn as nativeSpawn,spawnSync as nativeSpawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

function command(file:string,env:NodeJS.ProcessEnv=process.env,cwd=process.cwd()):string{
  if(path.extname(file))return file;
  const get=(name:string)=>env[Object.keys(env).sort().find(key=>key.toLowerCase()===name.toLowerCase())??''];
  const dirs=file.includes('/')||file.includes('\\')?['']:(get('PATH')??'').split(path.delimiter);
  for(const dir of dirs)for(const ext of (get('PATHEXT')??'.COM;.EXE;.BAT;.CMD').split(';')){
    const candidate=path.resolve(cwd,dir,file+ext);if(existsSync(candidate))return candidate;
  }
  return file;
}
const meta=/([()\][%!^"`<>&|;, *?])/g;
const escape=(text:string)=>text.replace(meta,'^$1');
/** Quote CRT argv, then escape both cmd's parse and the batch shim's %* expansion. */
function argument(text:string):string{
  let quoted='"',slashes=0;
  for(const c of text){if(c==='\\'){slashes++;continue;}quoted+='\\'.repeat(c==='"'?slashes*2+1:slashes)+c;slashes=0;}
  quoted+='\\'.repeat(slashes*2)+'"';
  return escape(escape(quoted));
}
export function cliCommand(file:string,args:string[],options:any={}){
  if(process.platform!=='win32')return {file,args,options};
  const resolved=command(file,options.env,options.cwd);
  if(!/\.(cmd|bat)$/i.test(resolved))return {file,args,options};
  if([resolved,...args].some(s=>/[\r\n\0]/.test(s)))throw Error('Windows batch arguments cannot contain line breaks or NUL; use stdin or a file');
  const line=[escape(path.normalize(resolved)),...args.map(argument)].join(' ');
  return {file:process.env.ComSpec||'cmd.exe',args:['/d','/s','/v:off','/c',`"${line}"`],options:{...options,shell:false,windowsHide:true,windowsVerbatimArguments:true}};
}
function tree<T extends ReturnType<typeof nativeSpawn>>(child:T,wrapped:boolean):T{
  if(wrapped){const kill=child.kill.bind(child);child.kill=(signal)=>{
    if(child.pid&&child.exitCode===null)nativeSpawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:5000,stdio:'ignore'});
    return kill(signal);
  };}return child;
}
export const spawn:typeof nativeSpawn=((file:string,args:string[]=[],options:any={})=>{const c=cliCommand(file,args,options);return tree(nativeSpawn(c.file,c.args,c.options),c.file!==file);}) as typeof nativeSpawn;
export const spawnSync:typeof nativeSpawnSync=((file:string,args:string[]=[],options:any={})=>{const c=cliCommand(file,args,options);return nativeSpawnSync(c.file,c.args,c.options);}) as typeof nativeSpawnSync;
export const execFile:typeof nativeExecFile=((file:string,args:string[],options:any,callback:any)=>{const c=cliCommand(file,args,options);return tree(nativeExecFile(c.file,c.args,c.options,callback),c.file!==file);}) as typeof nativeExecFile;
export type {ChildProcessWithoutNullStreams} from 'node:child_process';
