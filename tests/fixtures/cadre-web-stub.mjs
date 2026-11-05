/** Synthetic bridge probe only. It is not Cadre and cannot perform real sign-offs. */
import http from 'node:http';
const token=process.env.CADRE_STUB_TOKEN;
if(!token)throw Error('Set CADRE_STUB_TOKEN to a disposable test value');
const page=`<!doctype html><meta charset="utf-8"><title>Synthetic Cadre bridge probe</title>
<style>body{background:#08090a;color:#ece6d6;font:20px system-ui;padding:24px}button{padding:10px;border-radius:4px}</style>
<h1>Synthetic bridge probe</h1><p id="state">Waiting for authentication. This is not Cadre.</p><button hidden>Test action</button><p id="count"></p>
<script>
let origin='',sessionToken='',authenticated=false,count=0;
addEventListener('message',async event=>{
 if(event.source!==parent||event.data?.type!=='cadre.web.authenticate')return;
 const response=await fetch('/auth',{method:'POST',headers:{Authorization:'Bearer '+event.data.token}});
 if(!response.ok)return;
 origin=event.origin;sessionToken=event.data.token;authenticated=true;document.querySelector('#state').textContent='Authenticated synthetic probe — not Cadre';document.querySelector('button').hidden=false;
 parent.postMessage({type:'cadre.web.connected'},origin);
});
document.querySelector('button').onclick=()=>document.querySelector('#count').textContent='Synthetic actions: '+(++count);
addEventListener('keydown',event=>{if(event.key==='Escape'&&authenticated)parent.postMessage({type:'cadre.web.close'},origin);});
setInterval(async()=>{if(authenticated){try{const response=await fetch('/auth',{method:'POST',headers:{Authorization:'Bearer '+sessionToken}});if(response.ok)parent.postMessage({type:'cadre.web.heartbeat'},origin);}catch{}}else parent.postMessage({type:'cadre.web.ready'},'*');},1000);
</script>`;
http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/auth'){res.writeHead(req.headers.authorization===`Bearer ${token}`?204:401).end();return;}
 if(req.url!=='/'){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'no-referrer'}).end(page);
}).listen(Number(process.env.CADRE_STUB_PORT||4634),'127.0.0.1',()=>console.log('Synthetic Cadre bridge probe listening on loopback'));
