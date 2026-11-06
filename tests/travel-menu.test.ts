import test from 'node:test';
import assert from 'node:assert/strict';
import { atPlace, namedPlaces, nearbyArrival } from '../src/client/features/travel-menu/destinations.js';
import { checkTravel } from '../src/shared/travel/config.js';
import { planMap } from '../src/shared/maps/index.js';
import { CASTLE } from '../src/shared/maps/castle.js';
import type { MapPlan } from '../src/shared/maps.js';
const owner={x:2,y:0,z:3,rotY:0},visitor={x:1,y:0,z:1,rotY:0};
const place={id:'library',name:'Library',at:{x:-2,y:0,z:2,rotY:0}};
const plan={bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},height:9} as MapPlan;
const travel={home:owner,visitorHome:visitor,places:[place]};
test('active-map data supplies destinations and map rename without identity matching',()=>{
 const p={...plan,id:'custom-building',name:'Reading Hall',travel};
 assert.deepEqual(namedPlaces(p,true).map(p=>p.id),['home','library']);
 assert.deepEqual(namedPlaces(p,true)[0].at,owner);
 assert.deepEqual(namedPlaces(p,false)[0].at,visitor);
 assert.equal(namedPlaces({...p,name:'New name'},true)[0].name,'New name');
 assert.deepEqual(namedPlaces({...p,travel:{home:owner}},false),[]);
});
test('maps without travel preserve config serialization and have no destinations',()=>{
 const original=JSON.stringify(CASTLE),p=planMap(CASTLE);
 assert.equal(JSON.stringify(p.config),original);
 assert.equal(Object.hasOwn(p,'travel'),false);
 assert.deepEqual(namedPlaces(p,true),[]);
 assert.deepEqual(namedPlaces(p,false),[]);
});
test('travel survives normal map parsing and validates on that boundary',()=>{
 const p=planMap({...CASTLE,travel});
 assert.deepEqual(p.travel,travel);assert.deepEqual(p.config?.travel,travel);
 assert.throws(()=>planMap({...CASTLE,travel:{home:{...owner,x:1e6}}}),/travel.home.x/);
});
test('finite bounds and supported heights are mandatory',()=>{
 for(const at of [{...owner,x:NaN},{...owner,z:Infinity},{...owner,y:-1},{...owner,y:8},{...owner,x:9.9},{...owner,rotY:7},{...owner,y:2}])assert.throws(()=>checkTravel({home:at},plan));
 const levels={floors:[{id:'upper',minX:-4,maxX:4,minZ:-4,maxZ:4,y:2,thickness:.2}],stairs:[],rails:[],lifts:[],seats:{},solids:[]};
 assert.equal(checkTravel({home:{...owner,y:2}},{...plan,levels})?.home?.y,2);
 assert.throws(()=>checkTravel({home:{...owner,x:5,y:2}},{...plan,levels}),/declared level/);
});
test('unknown keys, seat capabilities, duplicate or reserved IDs and oversized lists are rejected',()=>{
 for(const raw of [null,[],{secret:true},{home:{...owner,seat:'throne'}},{places:[{...place,owner:true}]},{places:[place,place]},{places:[{...place,id:'home'}]},{places:[{...place,id:'UPPER'}]},{places:Array.from({length:33},(_,i)=>({...place,id:'room-'+i}))}])assert.throws(()=>checkTravel(raw,plan));
});
test('destination text has hard caps and rejects empty or control characters',()=>{
 for(const [key,value] of [['name',''],['name','x'.repeat(61)],['name','bad\nname'],['group','x'.repeat(61)],['description','x'.repeat(161)],['icon','x'.repeat(9)],['id','x'.repeat(41)]])assert.throws(()=>checkTravel({places:[{...place,[key]:value}]},plan));
});
test('nearby recovery is bounded and keeps the requested floor and facing',()=>{
 const at={x:2,y:2,z:3,rotY:1};
 assert.equal(nearbyArrival(at,()=>false),undefined);
 const found=nearbyArrival(at,p=>p.x>2.5)!;
 assert.ok(Math.hypot(found.x-at.x,found.z-at.z)<=1.5);assert.equal(found.y,2);assert.equal(found.rotY,1);
 assert.equal(atPlace({...at,x:2.1},at),true);assert.equal(atPlace({...at,y:0},at),false);
});
