import {h,openModal} from '../../ui/dom';
import type {FleetSeat} from '../../../shared/protocol/fleet';
import {COLORS} from './layout';
export function crewCard(seat:FleetSeat,close:()=>void){
 const state=h('p',{},seat.state.replaceAll('-',' '));state.style.color=COLORS[seat.state];
 const body=h('div.modal.crew-card',{role:'dialog','aria-label':seat.name},h('header',{},h('h2',{},seat.name)),h('p',{},seat.rig),state);
 if(seat.reason){const reason=h('p',{},seat.reason);reason.style.color=COLORS[seat.state];body.append(reason);}
 body.append(h('p',{},seat.activity||'No activity reported'),h('p',{},seat.since?'Observed in this state since '+new Date(seat.since).toLocaleString():'State duration not reported by the feed'));
 return openModal(body,{onClose:close});
}
