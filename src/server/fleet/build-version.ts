/** Anonymous build metadata only: bounded JSON, no bearer, one upstream request per three seconds. */
export class BuildVersion {
  private upstream='';
  private until=0;
  private pending?:Promise<{status:number;body:{v:number}|{error:string}}>;
  configure(upstream:string){if(upstream!==this.upstream){this.upstream=upstream;this.until=0;this.pending=undefined;}}
  read(){
    if(this.pending&&Date.now()<this.until)return this.pending;
    this.until=Date.now()+3000;
    const upstream=this.upstream;
    this.pending=(async()=>{
      try{
        if(!upstream)throw Error();
        const r=await fetch(new URL('/version',upstream),{redirect:'error',signal:AbortSignal.timeout(2000)});
        if(!r.ok||!r.body)throw Error();
        const reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0;
        try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096)throw Error();chunks.push(value);}}finally{await reader.cancel();}
        const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(typeof parsed?.v!=='number'||!Number.isFinite(parsed.v))throw Error();
        return {status:200,body:{v:parsed.v}};
      }catch{return {status:502,body:{error:'Version unavailable'}};}
    })();
    return this.pending;
  }
}
