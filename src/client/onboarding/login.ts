import {googleButton} from './google.js';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const form=el<HTMLFormElement>('form'),name=el<HTMLInputElement>('name'),password=el<HTMLInputElement>('password'),error=el('error'),submit=el<HTMLButtonElement>('submit');
const next=new URLSearchParams(location.search).get('next')==='/lite'?'/lite':'/';
const again=document.createElement('input');again.type='password';again.autocomplete='new-password';again.id='confirm';
let first=false;
const messages:Record<string,string>={invalid:'Google sign-in could not be verified. Please try again.',invite:"This Google account isn't invited to this office. Ask the owner for an invite link.",link:'Sign in with your password to link Google. An existing Google link cannot be replaced here.',limited:'Too many tries. Try again in 300 s.'};
const code=new URLSearchParams(location.search).get('authError');if(code){error.textContent=messages[code]??messages.invalid;history.replaceState(null,'',location.pathname);}
async function start(){
  try{
    const r=await fetch('/api/onboarding',{cache:'no-store'});if(!r.ok)throw Error();const o=await r.json();first=o.first;
    el('name-row').hidden=false;name.required=first||!o.shared;el('name-note').hidden=first||!o.shared;
    el('sub').textContent=first?"You're the first one here, so this account owns the office.":'Sign in to your desk.';
    document.querySelector('h1')!.textContent=first?'Create your office':'Agent Office';
    if(first){
      password.parentElement!.firstChild!.textContent='Pick a password';
      submit.textContent='Create my account';password.autocomplete='new-password';password.minLength=8;password.maxLength=512;again.required=true;again.minLength=8;again.maxLength=512;
      const label=document.createElement('label');label.className='confirm-row';label.textContent='Once more';label.append(again);submit.before(label);
      const note=document.createElement('p');note.className='note';note.textContent="At least 8 characters. It's yours alone: nobody else in the office ever sees it.";submit.before(note);
      if(!o.local){submit.disabled=true;error.textContent='Open the office on its own computer to create the first account.';}
    }else{
      const hint=document.createElement('div');hint.className='invite-hint';
      for(const [title,text] of [["Don't have an account?",' Ask the office owner for an invite link.'],['Have an invite link?',' Open it to set up your account.']]){const row=document.createElement('p'),lead=document.createElement('strong');lead.textContent=title;row.append(lead,text);hint.append(row);}form.after(hint);
    }
    if(o.google&&(!first||o.local)){
      const box=document.createElement('div');box.className='google-option';form.before(box);
      await googleButton(box,{signup:first,link:!first&&o.canLink},error);
      const divider=document.createElement('p');divider.className='auth-divider';divider.textContent=first?'or':'or with your password';box.append(divider);
    }
    const key=new URLSearchParams(location.hash.slice(1)).get('key');
    if(key&&!first){history.replaceState(null,'',location.pathname);const r=await fetch('/api/link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key})});if(r.ok)location.replace(next);}
    name.focus();
  }catch{error.textContent='Could not load sign-in options. Reload to try again.';submit.disabled=true;}
}
form.addEventListener('submit',async e=>{
  e.preventDefault();error.textContent='';if(first&&password.value!==again.value){error.textContent="Those passwords don't match";return;}
  submit.disabled=true;
  try{
    const r=await fetch(first?'/api/signup':'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name.value.trim(),password:password.value,confirm:again.value})}),b=await r.json();
    if(!r.ok){error.textContent=b.error??'Could not sign in';return;}
    location.assign(next);
  }catch{error.textContent='Server unreachable';}finally{submit.disabled=false;}
});
void start();
