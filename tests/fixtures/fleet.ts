/** Entirely synthetic: no live fleet output, credentials or host paths. */
export function fleetFixture(count=5) {
  return {at:0,teams:[{rig:'demo'}],seats:Array.from({length:count},(_,i)=>({
    session:`seat-${i}@demo`,rig:'demo',member:`Seat ${i+1}`,status:i===4?'stopped':'running',
    work:i===3?0:1,activity:{msg:i===2?'Waiting for a build':'Reviewing the sample',state:i===3?'idle':'working'},
  })),needs:[{id:'sample-card',rig:'demo',seat:'seat-1@demo',summary:'Choose the sample layout'}],tasks:{}};
}

export function fleetStateFixture(count=5) {
  const raw=fleetFixture(count);
  return {...raw,seats:raw.seats.map((seat,i)=>({...seat,state:i===2?{key:'stuck',why:'approval menu'}:i===3?{key:'waiting',why:'on demo-review'}:i===1?{key:'you'}:i===4?{key:'stopped'}:{key:'working'}}))};
}

export function fleetScreenFixture(count=4,tick=0){
 const raw=fleetStateFixture(count),names=['lead','build','design','qa'];
 return {...raw,seats:raw.seats.map((seat,i)=>({...seat,member:names[i]??`seat-${i+1}`,session:`${names[i]??`seat-${i+1}`}@demo`,tail:Array.from({length:20},(_,line)=>line===19?`Latest result ${tick}: synthetic check passed`:`${String(line+1).padStart(2,'0')}  ${names[i]??'seat'}  sample output — bounded screen text`)}))};
}
