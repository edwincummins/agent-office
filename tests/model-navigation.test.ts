import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelNav, segmentClear } from '../src/client/world/model/navigation';
import type { DeskDef } from '../src/shared/layout';
const seat={id:'meeting-1',x:1.35,z:0,rotY:Math.PI/2,room:true} as DeskDef;
const bounds={minX:-4,maxX:4,minZ:-4,maxZ:4};
test('source chair paths stay clear in both directions and use a clear side',()=>{
 const nav=new ModelNav(bounds,{rects:[[1.4,2,-2,2]],circles:[]},new Map([[seat.id,{x:.5,z:0,y:0,rotY:-Math.PI/2}]]));
 const inbound=nav.wayTo([-2,0],seat);
 assert.ok(inbound.length>1);
 assert.ok(inbound.every((p,i)=>nav.walkable(...p)&&(!i||nav.clearLine(inbound[i-1],p))));
 assert.deepEqual(nav.wayFrom(seat,[-2,0]),[...inbound].reverse());
});
test('an inaccessible source chair never gets a fabricated wall-crossing route',()=>{
 const nav=new ModelNav(bounds,{rects:[[-4,4,-4,4]],circles:[]},new Map([[seat.id,{x:.5,z:0,y:0,rotY:0}]]));
 assert.deepEqual(nav.wayTo([-2,0],seat),[]);
 assert.deepEqual(nav.wayFrom(seat,[-2,0]),[]);
});

test('a clear route cannot finish with a hop through a partition',()=>{
 const nav=new ModelNav(bounds,{rects:[[-.45,-.4,-4,4],[.4,.45,-4,4]],circles:[]},new Map([[seat.id,{x:0,z:0,y:0,rotY:0}]]));
 assert.deepEqual(nav.wayTo([-2,0],seat),[]);
});

test('continuous hop clearance catches sub-centimetre walls and tiny circle blockers',()=>{
 assert.equal(segmentClear([.65,0],[0,0],{rects:[[.28,.29,-1,1]],circles:[]}),false);
 assert.equal(segmentClear([.65,0],[0,0],{rects:[],circles:[[.28,0,.001]]}),false);
 assert.equal(segmentClear([.65,0],[0,0],{rects:[],circles:[[0,0,.28]]},0,[0,0]),true);
 assert.equal(segmentClear([.65,0],[0,0],{rects:[[.28,.29,1,2]],circles:[]}),true);
});
