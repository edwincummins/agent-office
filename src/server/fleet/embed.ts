import { randomBytes } from 'node:crypto';
/** Trusted office wrapper: its CSP confines the nested app without restricting Services' own frames. */
export function embedPage(url:string,token:string,officeOrigin:string) {
  const nonce=randomBytes(18).toString('base64');
  const json=(value:string)=>JSON.stringify(value).replace(/</g,'\\u003c');
  const origin=new URL(url).origin;
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Cadre connection</title>
<style nonce="${nonce}">html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#08090a}iframe{display:block}</style></head><body>
<script nonce="${nonce}">
const origin=${json(origin)},office=${json(officeOrigin)},token=${json(token)};
const frame=document.createElement('iframe');frame.title='Cadre Web';frame.sandbox='allow-scripts allow-same-origin allow-forms';frame.referrerPolicy='no-referrer';frame.src=${json(url)};
addEventListener('message',event=>{
 if(event.source!==frame.contentWindow||event.origin!==origin)return;
 if(event.data?.type==='cadre.web.ready')frame.contentWindow.postMessage({type:'cadre.web.authenticate',token},origin);
 if(['cadre.web.connected','cadre.web.heartbeat','cadre.web.close'].includes(event.data?.type))parent.postMessage({type:event.data.type},office);
});
addEventListener('keydown',event=>{if(event.key==='Escape')parent.postMessage({type:'cadre.web.close'},office);});
addEventListener('pagehide',()=>{navigator.sendBeacon(origin+'/revoke',token);},{once:true});
document.body.append(frame);
</script></body></html>`;
  return {html,csp:`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; frame-src ${origin}; connect-src ${origin}; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`};
}
