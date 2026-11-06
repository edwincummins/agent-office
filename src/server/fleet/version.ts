/** Plumbing only: Cadre's anonymous version check is answered through the owner's office session. */
export function versionBridge(officeOrigin:string){
 const origin=JSON.stringify(officeOrigin).replace(/</g,'\\u003c');
 return `<script>(()=>{
 const office=${origin},original=window.fetch.bind(window),pending=new Map();
 addEventListener('message',e=>{if(e.source!==parent||e.origin!==office||e.data?.type!=='cadre.web.version.result')return;const finish=pending.get(e.data.id);if(finish)finish(e.data);});
 window.fetch=(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==location.origin||url.pathname!=='/version')return original(request);
  return new Promise((resolve,reject)=>{
   if(request.signal.aborted)return reject(new DOMException('Aborted','AbortError'));
   if(pending.size>=4)return reject(new Error('Version check busy'));
   const id=crypto.randomUUID();let timer;
   const cleanup=()=>{clearTimeout(timer);pending.delete(id);request.signal.removeEventListener('abort',abort);};
   const abort=()=>{cleanup();reject(new DOMException('Aborted','AbortError'));};
   pending.set(id,data=>{cleanup();resolve(new Response(JSON.stringify(data.value),{status:data.status,headers:{'Content-Type':'application/json'}}));});
   request.signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{cleanup();reject(new Error('Version check unavailable'));},4000);
   parent.postMessage({type:'cadre.web.version',id},office);
  });
 };
})();</script>`;
}
export function withVersionBridge(html:string,officeOrigin:string){
 const bridge=versionBridge(officeOrigin),doctype=/<!doctype[^>]*>/i;
 return doctype.test(html)?html.replace(doctype,match=>match+bridge):bridge+html;
}
