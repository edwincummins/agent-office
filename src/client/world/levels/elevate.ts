import type { Group } from 'three';
import type { Collider, Interactable } from '../types';
import type { MapPlan } from '../../../shared/maps';
import { seatFloor } from '../../../shared/levels/attach';

interface Kit {
  group: Group;
  still: Group;
  colliders: Collider[];
  interactables: Interactable[];
}
/** Elevate one assembly before its geometry is batched, along with its collision and use points. */
export function elevation(kit: Kit, y: number): () => void {
  const objects = new Set([...kit.group.children, ...kit.still.children]);
  const colliders = kit.colliders.length,
    interactables = kit.interactables.length;
  return () => {
    if (!y) return;
    for (const object of [...kit.group.children, ...kit.still.children]) if (!objects.has(object)) object.position.y += y;
    for (const c of kit.colliders.slice(colliders)) {
      c.bottom = (c.bottom ?? 0) + y;
      c.top += y;
    }
    for (const it of kit.interactables.slice(interactables)) it.y = (it.y ?? 0) + y;
  };
}
export function onLevel<T>(kit: Kit, y: number, build: () => T): T {
  const done = elevation(kit, y);
  const result = build();
  done();
  return result;
}
export function tableFloor(plan: MapPlan, name: string): number {
  const seat = [...plan.desks, ...plan.overflow].find((d) => d.label.startsWith(name + ', seat '));
  return seat ? seatFloor(plan, seat.id) : 0;
}
