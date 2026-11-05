/** Entirely synthetic: no live fleet output, credentials or host paths. */
export function fleetFixture(count=5) {
  return {at:0,teams:[{rig:'demo'}],seats:Array.from({length:count},(_,i)=>({
    session:`seat-${i}@demo`,rig:'demo',member:`Seat ${i+1}`,status:i===4?'stopped':'running',
    work:i===3?0:1,activity:{msg:i===2?'Waiting for a build':'Reviewing the sample',state:i===3?'idle':'working'},
  })),needs:[{id:'sample-card',rig:'demo',seat:'seat-1@demo',summary:'Choose the sample layout'}],tasks:{}};
}
