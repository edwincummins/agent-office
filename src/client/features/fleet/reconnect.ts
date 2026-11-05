/** A single-flight backoff, owned by the open panel. No work survives close(). */
export function reconnect(probe:(signal:AbortSignal)=>Promise<boolean>,reload:()=>void,clock=Date.now){
 const delays=[1000,2000,5000,10000];let attempt=0,due=0,active=false,busy=false,closed=false,generation=0;
 const controller=new AbortController();
 return {
  waiting(){if(!active&&!closed){active=true;due=clock()+delays[attempt];}},
  connected(){active=false;attempt=0;generation++;},
  delay(){return closed||!active?null:Math.max(0,due-clock());},
  async tick(){
   if(closed||!active||busy||clock()<due)return;busy=true;const current=generation;
   try{if(await probe(controller.signal)){if(!closed&&active&&current===generation){active=false;reload();}return;}}catch{}
   finally{busy=false;}
   if(closed||!active||current!==generation)return;
   attempt=Math.min(attempt+1,delays.length-1);due=clock()+delays[attempt];
  },
  close(){closed=true;active=false;controller.abort();},
 };
}
