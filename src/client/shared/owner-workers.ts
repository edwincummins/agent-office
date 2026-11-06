import {store} from '../state';
import {toast,h,openModal} from '../ui/dom';
export const ownerName=()=>store.me.ownerName||'the office owner';
export const canWork=()=>store.me.owner===true;
export function requireOwner(){if(canWork())return true;toast('Only the office owner can run workers or tools. You can walk, chat and watch.','warn');return false;}

export function visitorTools(){const close=h('button.btn.close',{'aria-label':'Close'},'✕');const el=h('div.modal',{role:'dialog','aria-label':'Your sign-ins'},h('header',{},h('h2',{},'Your sign-ins'),close),h('div.body',{},h('p',{},`You don't need sign-ins here: only ${ownerName()} runs workers.`),h('p.note',{},'You can explore, chat and watch the terminals. No tool credentials are needed.')));const modal=openModal(el);close.addEventListener('click',()=>modal.close());}
export function allowAction(key:string){
 if(canWork()||new Set(['move','act','emote','sit','carry','profile','voice','rtc','chat','doing','ping','golf','toss','gong','horn','floor.go','levels.sync','levels.lift','worker.attach','worker.detach']).has(key)||/^(ball|car|cabinet|dog|jukebox|wb|decor)\./.test(key))return true;
 return requireOwner();
}
export function syncVisitorControls(){
 const button=document.getElementById('btn-new');if(button)button.style.display=canWork()?'':'none';
}

let tipPending=false;
export function offerVisitorTip(){
 if(canWork()||tipPending)return;
 const key=`office-visitor-tip:${store.me.account?.name??'shared'}`;
 try{if(localStorage.getItem(key))return;}catch{}
 tipPending=true;
 const show=()=>{
  if(canWork()){tipPending=false;return;}
  if(!document.getElementById('modal-root')||document.querySelector('[role="dialog"]')){setTimeout(show,500);return;}
  const close=h('button.btn.close',{'aria-label':'Close'},'✕');
  const card=h('div.modal.panel',{role:'dialog','aria-label':'Welcome, visitor',style:'width:min(420px,100%)'},h('header',{},h('h2',{},"You're a visitor here"),close),h('div.body',{},h('p',{},`Walk around, chat and watch the work. Only ${ownerName()} runs the workers.`)));
  const modal=openModal(card,{onClose:()=>{try{localStorage.setItem(key,'1');}catch{}tipPending=false;}});
  close.addEventListener('click',()=>modal.close());
 };
 setTimeout(show,500);
}
