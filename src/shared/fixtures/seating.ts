import {SEATING,type SeatDef} from '../layout.js';
import {NATIVE_SLOTS} from './stock.js';
import {slotPoint} from './transform.js';
import type {Slot} from './index.js';
export function loungeSeats(slot:Slot):SeatDef[]{
 const from=NATIVE_SLOTS.lounge!;
 const scale=slot.size.width/from.size.width,vertical=slot.size.height/from.size.height,depth=slot.size.depth/from.size.depth;
 return SEATING.filter(s=>s.id==='couch'||s.id.startsWith('lounge-beanbag-')).map(s=>({...s,...slotPoint(from,slot,s),rotY:s.rotY+slot.rotY-from.rotY,places:s.places.map(p=>p*scale),hips:s.hips*vertical,depth:s.depth*depth,out:s.out*depth}));
}
