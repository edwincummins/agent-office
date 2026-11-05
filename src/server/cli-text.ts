import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

/** gh's file forms preserve multiline text without putting it through cmd.exe. */
export async function ghText<T>(args:string[],run:(args:string[])=>Promise<T>):Promise<T>{
  if(process.platform!=='win32')return run(args);
  let dir:string|undefined;
  try{
    const next=[...args];
    for(let i=0;i<next.length-1;i++){
      const flag=next[i],value=next[i+1];
      if(!/[\r\n]/.test(value))continue;
      if(flag!=='--body'&&!(flag==='-f'&&value.startsWith('body=')))continue;
      dir??=await mkdtemp(path.join(tmpdir(),'office-gh-'));
      const file=path.join(dir,`${i}.txt`);
      await writeFile(file,flag==='-f'?value.slice(5):value,{mode:0o600});
      next[i]=flag==='-f'?'-F':'--body-file';next[++i]=flag==='-f'?`body=@${file}`:file;
    }
    return await run(next);
  }finally{if(dir)await rm(dir,{recursive:true,force:true});}
}
