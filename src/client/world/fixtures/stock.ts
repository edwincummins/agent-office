import type {Fixture} from '../office/fixture';
import type {SlotKind} from '../../../shared/fixtures';
import {NATIVE_SLOTS,STOCK_SLOTS} from '../../../shared/fixtures/stock';
import {transformFixture} from './transform';
/** Retain the stock factory's exact insertion order and resources when its slot is unchanged. */
export function stockFixture<F extends Fixture<any>>(kind:Exclude<SlotKind,'mediaWall'>,factory:F):F{
 return ((site:Parameters<F>[0])=>{
  const before=new Set(site.group.children),ci=site.colliders.length,ii=site.interactables.length;
  const built=factory(site),from=NATIVE_SLOTS[kind]!,to=STOCK_SLOTS[kind]!;
  if(JSON.stringify(from)!==JSON.stringify(to)){
   const objects=site.group.children.filter(c=>!before.has(c));if(built.group)objects.push(built.group);
   transformFixture(from,to,objects,[...site.colliders.slice(ci),...(built.colliders??[])],[...site.interactables.slice(ii),...(built.interactables??[])]);
  }
  return built;
 }) as F;
}
