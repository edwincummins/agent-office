import test from 'node:test';
import assert from 'node:assert/strict';
import { FleetNormalizer,screenTail } from '../src/server/fleet/normalize.js';
import { FleetPoller } from '../src/server/fleet/poller.js';
import { boardSignature,screenGrid } from '../src/client/features/fleet/draw.js';
import { fleetScreenFixture } from './fixtures/fleet.js';

test('screen tails are bounded, sanitized, and preserve engine seat order',()=>{
 const raw=fleetScreenFixture(4),normalizer=new FleetNormalizer(),state=normalizer.parse(raw,0);
 assert.deepEqual(state.seats.map(s=>s.name),['lead','build','design','qa']);
 assert.equal(state.seats[0].tail?.at(-1),raw.seats[0].tail.at(-1));
 assert.deepEqual(screenTail(null),[]);assert.deepEqual(screenTail('not an array'),[]);
 const tail=screenTail([...Array.from({length:100},(_,i)=>String(i)), '\x1b[31mred\x1b[0m\x00','😀'.repeat(200)]);
 assert.equal(tail.length,24);assert.equal(tail.at(-2),'red ');assert.equal(Array.from(tail.at(-1)!).length,160);
 assert.deepEqual(screenTail([{},42,'<script>','\x1b]8;;https://example.invalid\x07label\x1b]8;;\x07']),['<script>','label']);
 raw.seats[0].status='stopped';raw.seats[0].tail=[];
 assert.deepEqual(normalizer.parse(raw,1).seats[0].tail,state.seats[0].tail);
 raw.seats[0].status='running';assert.deepEqual(normalizer.parse(raw,2).seats[0].tail,[]);
});
test('grid caps at nine without reordering and hidden changes do not upload the board',()=>{
 for(const [n,c,r,v] of [[0,2,2,0],[4,2,2,4],[5,3,2,5],[6,3,2,6],[7,3,3,7],[9,3,3,9],[32,3,3,9]])assert.deepEqual(screenGrid(n),{columns:c,rows:r,visible:v});
 const state=new FleetNormalizer().parse(fleetScreenFixture(32),0),key=boardSignature(state);
 state.seats[0].tail![0]='clipped old line';state.seats[0].activity='changed hidden activity';state.seats[0].since=1000;state.seats[20].tail=['hidden tail'];assert.equal(boardSignature(state),key);
 state.seats[0].tail=['new visible output'];assert.notEqual(boardSignature(state),key);
 const changed=boardSignature(state);state.seats[0].state='stuck';assert.notEqual(boardSignature(state),changed);
});
test('poller publishes a changed tail once, retains it during outage and suppresses identical polls',async()=>{
 let raw:unknown=fleetScreenFixture(4,1),changes=0;
 const poller=new FleetPoller(async()=>raw,()=>changes++);
 await poller.poll(0);await poller.poll(1);assert.equal(changes,1);
 raw=fleetScreenFixture(4,2);await poller.poll(2);assert.equal(changes,2);assert.match(poller.state.seats[0].tail!.at(-1)!,/result 2/);
 raw={};await poller.poll(3);assert.equal(poller.state.status,'stale');assert.match(poller.state.seats[0].tail!.at(-1)!,/result 2/);
 poller.stop();
});

test('screen tails remove bidi direction overrides and isolates',()=>{
 const controls=[0x202a,0x202b,0x202c,0x202d,0x202e,0x2066,0x2067,0x2068,0x2069];
 for(const code of controls)assert.deepEqual(screenTail([`before${String.fromCodePoint(code)}after`]),['beforeafter'],`U+${code.toString(16)}`);
});
test('screen tails remove C1 and Unicode line/paragraph separators',()=>{
 const controls=[...Array.from({length:32},(_,i)=>0x80+i),0x2028,0x2029];
 for(const code of controls){const tail=screenTail([`before${String.fromCodePoint(code)}after`]);assert.equal(tail.length,1);assert.ok(!/[\u0080-\u009f\u2028\u2029]/u.test(tail[0]),`U+${code.toString(16)}`);}
 assert.deepEqual(screenTail(['café 中文 😀']),['café 中文 😀']);
});

test('screen tails strip zero-width spaces, joiners and byte order marks',()=>{
 for(const code of [0x180e,0x200b,0x200c,0x200d,0x2060,0xfeff])assert.deepEqual(screenTail([`left${String.fromCodePoint(code)}right`]),['leftright']);
});
test('screen tails strip invisible formatting and direction marks',()=>{
 for(const code of [0x00ad,0x034f,0x061c,0x200e,0x200f,0x2061,0x2062,0x2063,0x2064,0x206a,0x206b,0x206c,0x206d,0x206e,0x206f])assert.deepEqual(screenTail([`left${String.fromCodePoint(code)}right`]),['leftright']);
});
