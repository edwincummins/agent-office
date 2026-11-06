import {fleetStateFixture} from './fleet.js';
const count=Number(process.argv[2]??32);
const fixture=fleetStateFixture(Math.max(0,Math.min(64,count)));
fixture.teams=Array.from({length:4},(_,i)=>({rig:`team-${i+1}`}));
fixture.seats.forEach((seat,i)=>{seat.rig=`team-${Math.floor(i/8)%4+1}`;seat.status='running';if(i===4)seat.state={key:'idle'};});
fixture.needs=[];
console.log(JSON.stringify(fixture));
