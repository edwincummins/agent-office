import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSlots} from '../src/shared/fixtures/index.js';
import {STOCK_SLOTS} from '../src/shared/fixtures/stock.js';
import {loungeSeats} from '../src/shared/fixtures/seating.js';
import {slotPoint} from '../src/shared/fixtures/transform.js';
import {TV,JUKEBOX,CABINET,SEATING} from '../src/shared/layout.js';
const bounds={minX:-18,maxX:18,minZ:-13,maxZ:13};
const tv={position:{x:0,y:2,z:-10},size:{width:4,height:2,depth:.2},rotY:0};
test('slot validation fails closed and omission stays absent',()=>{
 assert.deepEqual(resolveSlots(undefined,bounds,6),{slots:{},slotWarnings:[]});
 for(const raw of [null,[],{unknown:tv},{tv:null},{tv:{...tv,size:{...tv.size,width:0}}},{tv:{...tv,rotY:NaN}},{tv:{...tv,position:{...tv.position,x:18}}}])assert.throws(()=>resolveSlots(raw,bounds,6));
});
test('mediaWall owns one matched pair and warns when standalone TV is ignored',()=>{
 const result=resolveSlots({mediaWall:{...tv,size:{width:8.4,height:2,depth:.2},gap:.4,boardSide:'left'},tv},bounds,6);
 assert.deepEqual(result.slotWarnings,['mediaWall-overrides-tv']);assert.equal(result.slots.tv!.size.width,4);assert.equal(result.slots.services!.size.width,4);
 assert.equal(result.slots.services!.position.x,-2.2);assert.equal(result.slots.tv!.position.x,2.2);
 assert.deepEqual(result.slots.mediaWall!.position,tv.position);assert.equal(result.slots.tv!.position.y,result.slots.services!.position.y);
 assert.throws(()=>resolveSlots({mediaWall:tv,tv:null},bounds,6));
});
test('unequal aspect ratios and mount offsets reproduce a level media wall',()=>{
 const {slots}=resolveSlots({mediaWall:{position:{x:17.84,y:2.4,z:-4.01},size:{width:14.78,height:3.8,depth:.2},rotY:-Math.PI/2,gap:.42,boardSide:'left',panels:{board:{width:7.6,mountDepth:0},tv:{width:6.76,mountDepth:.04}}}},bounds,6.8);
 assert.ok(Math.abs(slots.services!.position.z+7.6)<1e-12);assert.ok(Math.abs(slots.tv!.position.z)<1e-12);assert.ok(Math.abs(slots.tv!.position.x-17.8)<1e-12);assert.equal(slots.tv!.size.height,3.8);
});
test('stock slot roots retain exact existing source expressions',()=>{
 assert.deepEqual(STOCK_SLOTS.tv!.position,{x:TV.x-.1,y:TV.y,z:TV.z});
 assert.deepEqual(STOCK_SLOTS.jukebox!.position,{x:JUKEBOX.x,y:0,z:JUKEBOX.z});
 assert.deepEqual(STOCK_SLOTS.arcade!.position,{x:CABINET.x,y:0,z:CABINET.z});assert.equal(STOCK_SLOTS.mediaWall,undefined);
});
test('lounge transforms social places only and keeps stable ids',()=>{
 const slot={position:{x:0,y:0,z:0},size:{width:7,height:1.2,depth:7},rotY:0};const seats=loungeSeats(slot);
 assert.deepEqual(seats.map(s=>s.id),['couch','lounge-beanbag-1','lounge-beanbag-2']);
 const couch=SEATING.find(s=>s.id==='couch')!;assert.deepEqual({x:seats[0].x,y:seats[0].y,z:seats[0].z},slotPoint(STOCK_SLOTS.lounge!,slot,couch));
 assert.equal(seats[0].rotY,0);assert.deepEqual(seats[0].places,couch.places);assert.equal(seats.some(s=>s.id==='beanbag-1'),false);
});

import {readFileSync} from 'node:fs';
import {checkCustomMaps,planOf} from '../src/shared/maps/index.js';
test('documented synthetic slot map resolves through the real map loader',()=>{
 const json=JSON.parse(readFileSync(new URL('../docs/maps/fixture-demo.json',import.meta.url),'utf8'));
 const maps=checkCustomMaps([{file:'fixture-demo.json',json}]);assert.equal(maps[0].error,undefined);
 const plan=planOf('fixture-demo',maps);assert.ok(plan.slots.tv);assert.ok(plan.slots.arcade);assert.ok(plan.seatingById.has('couch'));assert.equal(plan.byId.size,plan.desks.length+plan.overflow.length+plan.stations.length+plan.meeting.length);
 assert.equal(plan.boards.services.width,4);
});
