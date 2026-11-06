import * as THREE from 'three';
import {sharedToon} from '../toon';
import {NavGrid} from '../../../shared/nav';
import type {MapPlan} from '../../../shared/maps';
import {slotPoint} from '../../../shared/fixtures/transform';
import {NATIVE_SLOTS} from '../../../shared/fixtures/stock';
import type {SlotKind} from '../../../shared/fixtures';
import type {World} from '../world';
import type {Site,Fixture} from '../office/fixture';
import {tv,lounge} from '../office/room';
import {jukebox} from '../../features/jukebox/world';
import {cabinet} from '../../features/cabinet/world';
import {gong} from '../../features/gong/world';
import type {Collider,Interactable,OfficeHandles} from '../types';
import {setFixtures,type FixtureHandles} from './handles';
import {transformFixture} from './transform';
const registry:Partial<Record<SlotKind,Fixture<any>>>={tv,jukebox,arcade:cabinet,lounge,gong};
/** Decorate any map builder through the same registry; no architectural mesh enters picking. */
export function withFixtures(build:(plan:MapPlan)=>World):(plan:MapPlan)=>World{
 return plan=>{
  const world=build(plan),handles:FixtureHandles={},updates:((t:number,dt:number)=>void)[]=[],owned:THREE.Object3D[]=[],materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  if(Object.keys(plan.slots).length)world.pickables=world.pickables.flatMap(o=>o===world.group?[...o.children]:[o]);
  for(const [kind,factory] of Object.entries(registry)){
   const key=kind as Exclude<SlotKind,'mediaWall'>,slot=plan.slots[key];if(!slot)continue;
   if(key==='gong'&&world.gong)throw new Error('Use a gong fixture or legacy gong prop, not both');
   const group=new THREE.Group(),colliders:Collider[]=[],interactables:Interactable[]=[];
   const site={group,colliders,interactables,wall(){}} as unknown as Site;
   const built=factory!(site),given=built.handle as Partial<OfficeHandles>|undefined;
   if(built.group)group.add(built.group);if(built.colliders)colliders.push(...built.colliders);if(built.interactables)interactables.push(...built.interactables);
   const children=[...group.children];
   // Imported lounge geometry is cache-owned. Own only copies; shared toon materials stay shared.
   if(key==='lounge')for(const child of children)child.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry=o.geometry.clone();});
   for(const child of children)child.traverse(o=>{const material=(o as THREE.Mesh).material;for(const m of Array.isArray(material)?material:material?[material]:[]){if(sharedToon(m))continue;materials.add(m);const map=(m as THREE.MeshBasicMaterial).map;if(map)textures.add(map);}});
   transformFixture(NATIVE_SLOTS[key]!,slot,children,colliders,interactables);
   for(const child of children){world.group.add(child);owned.push(child);}
   world.colliders.push(...colliders);world.interactables.push(...interactables);
   // Pick one cheap box per fixture. Room geometry never participates.
   for(const it of interactables){
    const isSeat=it.kind==='seat';
    const proxy=new THREE.Mesh(new THREE.BoxGeometry(isSeat?1:slot.size.width,isSeat?.7:slot.size.height,isSeat?1:slot.size.depth),new THREE.MeshBasicMaterial({visible:false}));
    proxy.position.set(isSeat?it.x:slot.position.x,isSeat?(it.y??0)+.35:slot.position.y+(key==='tv'?0:slot.size.height/2),isSeat?it.z:slot.position.z);proxy.rotation.y=slot.rotY;
    materials.add(proxy.material);proxy.userData.interact=it;world.group.add(proxy);world.pickables.push(proxy);owned.push(proxy);
   }
   if(given?.tvScreen)handles.tv=given.tvScreen;
   if(given?.jukebox)handles.jukebox=given.jukebox;
   if(given?.cabinet)handles.arcade=given.cabinet;
   if(given?.gong){world.gong=given.gong;const p=slotPoint(NATIVE_SLOTS.gong!,slot,given.gong.top);given.gong.top.set(p.x,p.y,p.z);}
   if(built.update)updates.push(built.update);
  }
  setFixtures(world,handles);
  if(world.acoustics&&world.gong)world.acoustics.gong={x:world.gong.top.x,y:world.gong.top.y-1.8,z:world.gong.top.z};
  if(owned.length&&plan.obstacles)world.nav=(world.navigation??(obstacles=>new NavGrid(plan.bounds,obstacles)))({rects:[...plan.obstacles.rects,...world.colliders.filter(c=>!c.fence&&c.top>.3).map(c=>[c.minX,c.maxX,c.minZ,c.maxZ] as [number,number,number,number])],circles:plan.obstacles.circles});
  const update=world.update;world.update=(t,dt,people)=>{update(t,dt,people);for(const u of updates)u(t,dt);};
  const dispose=world.dispose;world.dispose=()=>{for(const o of owned){o.removeFromParent();o.traverse(node=>{if(node instanceof THREE.Mesh)node.geometry.dispose();});}for(const texture of textures)texture.dispose();for(const material of materials)material.dispose();dispose?.();};
  return world;
 };
}
