import { h, openModal, type Modal } from '../../ui/dom';
import '../../ui/floormenu.css';
import './ui.css';

export interface TravelRow { id:string; name:string; icon:string; sub:string; stats?:string; disabled?:boolean; here?:boolean; go():void }
export interface TravelSection { name:string; rows:TravelRow[] }
export function openTravel(sections:TravelSection[], onClose:()=>void):Modal {
  const buttons:HTMLButtonElement[]=[];
  let modal:Modal;
  const body=h('div.body');
  for(const section of sections){
    if(!section.rows.length)continue;
    body.append(h('div.floor-menu-head',{},section.name));
    for(const row of section.rows){
      const button=h('button.floor-item',{type:'button',disabled:row.disabled||row.here,class:row.here?'here':'','data-place':row.id},
        h('span.floor-no',{},row.icon),h('span.floor-text',{},h('span.floor-name',{},row.name),h('span.floor-sub',{},row.here?'you are here':row.sub)),h('span.floor-stats',{},row.stats??''));
      button.onclick=()=>{modal.close();row.go();}; buttons.push(button);body.append(button);
    }
  }
  const panel=h('div.modal.travel-panel',{role:'dialog','aria-label':'Go to'},h('header',{},h('h2',{},'Go to')),body,h('footer',{},'↑ ↓ Choose · Enter Go · 1–9 Shortcuts'));
  panel.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(/^[1-9]$/.test(e.key)){e.preventDefault();buttons[Number(e.key)-1]?.click();return;}
    if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
    e.preventDefault();const enabled=buttons.filter(b=>!b.disabled);if(!enabled.length)return;
    const current=enabled.indexOf(document.activeElement as HTMLButtonElement);
    enabled[(current+(e.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length].focus();
  });
  modal=openModal(panel,{onClose});buttons.find(b=>!b.disabled)?.focus();return modal;
}
