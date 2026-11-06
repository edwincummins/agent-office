import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedPosition, withBoundedMoves } from '../src/server/levels/moves.js';
import { planMap } from '../src/shared/maps/index.js';
import { TWO_LEVEL_MAP } from './fixtures/two-level-map.js';
const plan=planMap(TWO_LEVEL_MAP);
test('hostile finite, nonfinite and outside positions never reach the presence handler',()=>{
 let calls=0;const wrapped=withBoundedMoves({move(){calls++;}} as any);
 for(const axis of ['x','y','z','rotY'])for(const value of [NaN,Infinity,-Infinity,1e9,-1e9,1e308]){
  wrapped.move({maps:{plan:()=>plan}} as any,{} as any,{t:'move',x:0,y:0,z:0,rotY:0,moving:true,[axis]:value});
 }
 assert.equal(calls,0);
 wrapped.move({maps:{plan:()=>plan}} as any,{} as any,{t:'move',x:0,y:3,z:4,rotY:Math.PI,moving:true});
 assert.equal(calls,1);
 assert.equal(boundedPosition(plan,{x:0,y:-.1,z:0,rotY:0}),false);
 assert.equal(boundedPosition(plan,{x:plan.bounds.maxX+.1,y:0,z:0,rotY:0}),false);
});
