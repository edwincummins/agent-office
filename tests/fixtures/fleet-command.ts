import { fleetStateFixture,fleetScreenFixture } from './fleet.js';
const count=process.argv.includes('--32')?32:process.argv.includes('--9')?9:process.argv.includes('--screens')?4:5;
const fixture=process.argv.includes('--screens')?fleetScreenFixture(count,Math.floor(Date.now()/5000)):fleetStateFixture(count);
if(count===32){
  fixture.teams=Array.from({length:4},(_,i)=>({rig:`demo-${i+1}`}));
  fixture.seats.forEach((seat,i)=>{seat.rig=`demo-${Math.floor(i/8)+1}`;});
  fixture.needs[0].rig='demo-1';
}
console.log(JSON.stringify(fixture));
