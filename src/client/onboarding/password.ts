import {h,openModal} from '../ui/dom';
/** The signed-in Google account can add its first recovery password, never change another account. */
export function passwordOption(leaveProfile:()=>void):HTMLElement{
 const button=h('button.btn',{type:'button',style:'display:none'},'Set a password') as HTMLButtonElement;
 void fetch('/api/account/password',{cache:'no-store'}).then(async r=>{if(r.ok&&(await r.json()).canSet)button.style.display='';}).catch(()=>{});
 button.onclick=()=>{
  leaveProfile();
  const close=h('button.btn.close',{type:'button','aria-label':'Close'},'✕');
  const password=h('input',{type:'password',autocomplete:'new-password',minlength:8,maxlength:512,required:true,'aria-label':'New password'}) as HTMLInputElement;
  const confirm=h('input',{type:'password',autocomplete:'new-password',minlength:8,maxlength:512,required:true,'aria-label':'Confirm password'}) as HTMLInputElement;
  const status=h('p.note',{role:'status'}),save=h('button.btn.primary',{type:'submit'},'Set password') as HTMLButtonElement;
  const form=h('form.modal',{role:'dialog','aria-label':'Set a password',style:'width:min(420px,100%)'},h('header',{},h('h2',{},'Set a password'),close),h('div.body',{},h('p',{},'Keep a way into your account if Google is unavailable.'),h('label',{},'New password',password),h('label',{},'Once more',confirm),status),h('footer',{},save)) as HTMLFormElement;
  const modal=openModal(form);close.onclick=()=>modal.close();
  form.onsubmit=async e=>{
   e.preventDefault();if(password.value!==confirm.value){status.textContent='Those passwords do not match.';return;}
   save.disabled=true;
   try{const r=await fetch('/api/account/password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:password.value,confirm:confirm.value})});const body=await r.json();if(!r.ok)throw Error(body.error||'Could not set password');button.style.display='none';password.value='';confirm.value='';modal.close();}catch(err){status.textContent=(err as Error).message;}finally{save.disabled=false;}
  };
 };
 return button;
}
