import {store} from '../state';
import {toast,h,openModal} from '../ui/dom';
export const canWork=()=>store.me.owner===true;
export function requireOwner(){if(canWork())return true;toast('Only the office owner can run workers or tools. You can walk, chat and watch.','warn');return false;}

export function visitorTools(){const close=h('button.btn.close',{'aria-label':'Close'},'✕');const el=h('div.modal',{role:'dialog','aria-label':'Your sign-ins'},h('header',{},h('h2',{},'Your sign-ins'),close),h('div.body',{},h('p',{},'Only the office owner can sign in tools.'),h('p.note',{},'You can explore, chat and watch the terminals. No tool credentials are needed.')));const modal=openModal(el);close.addEventListener('click',()=>modal.close());}
export function allowAction(key:string){
 if(canWork()||new Set(['move','act','emote','sit','carry','profile','voice','rtc','chat','doing','ping','golf','toss','gong','horn','floor.go','worker.attach','worker.detach']).has(key)||/^(ball|car|cabinet|dog|jukebox|wb|decor)\./.test(key))return true;
 return requireOwner();
}
export function syncVisitorControls(){
 const button=document.getElementById('btn-new');if(button)button.style.display=canWork()?'':'none';
}
