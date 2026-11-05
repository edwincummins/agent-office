import { fleetStateFixture } from './fleet.js';
const count=process.argv.includes('--32')?32:5;
const fixture=fleetStateFixture(count);
if(count===32){
  fixture.teams=Array.from({length:4},(_,i)=>({rig:`demo-${i+1}`}));
  fixture.seats.forEach((seat,i)=>{seat.rig=`demo-${Math.floor(i/8)+1}`;});
  fixture.needs[0].rig='demo-1';
}
console.log(JSON.stringify(fixture));
