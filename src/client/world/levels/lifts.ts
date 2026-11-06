import * as THREE from 'three';
import type { Lift } from '../../../shared/levels/types';
import type { LiftMotion } from '../../../shared/protocol/levels';
import type { Collider, Interactable } from '../types';
import type { World } from '../world';
export interface LiftView {
  spec: Lift;
  car: THREE.Group;
  floor: Collider;
  roof: Collider;
  control: Interactable;
  gates: { y: number; panels: THREE.Mesh[]; solid: Collider; open: number }[];
  motion: LiftMotion;
}
export const liftViews = new WeakMap<World, Map<string, LiftView>>();
export function buildLifts(w: World) {
  const levels = w.plan.levels!;
  const views = new Map<string, LiftView>();
  liftViews.set(w, views);
  const metal = new THREE.MeshStandardMaterial({ color: '#3e454c', roughness: 0.5, metalness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: '#c0d1d3', transparent: true, opacity: 0.18, depthWrite: false, roughness: 0.12 });
  const button = new THREE.MeshBasicMaterial({ color: '#d9b766' });
  const box = (g: THREE.Group, x: number, y: number, z: number, sx: number, sy: number, sz: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    mesh.position.set(x, y, z);
    mesh.userData.outlineParameters = { visible: false };
    g.add(mesh);
    return mesh;
  };
  for (const spec of levels.lifts) {
    const heights = spec.stops.map((s) => levels.floors.find((f) => f.id === s.level)!.y),
      max = Math.max(...heights),
      min = Math.min(...heights);
    const group = new THREE.Group();
    group.name = 'level-lift-' + spec.id;
    w.group.add(group);
    w.pickables.push(group);
    const car = new THREE.Group();
    car.position.set(spec.x, heights[0], spec.z);
    group.add(car);
    box(car, 0, -0.1, 0, spec.width, 0.2, spec.depth, metal);
    box(car, 0, 2.5, 0, spec.width, 0.12, spec.depth, metal);
    const carControl: Interactable = { kind: 'levellift', x: spec.x, z: spec.z, y: heights[0], radius: Math.min(spec.width, spec.depth) / 2, seatId: spec.id };
    w.interactables.push(carControl);
    box(car, spec.width / 2 - 0.12, 1.2, spec.depth / 2 - 0.25, 0.12, 0.3, 0.2, button).userData.interact = carControl;
    const floor: Collider = {
      minX: spec.x - spec.width / 2,
      maxX: spec.x + spec.width / 2,
      minZ: spec.z - spec.depth / 2,
      maxZ: spec.z + spec.depth / 2,
      bottom: heights[0] - 0.2,
      top: heights[0],
    };
    w.colliders.push(floor);
    const roof: Collider = { ...floor, bottom: heights[0] + 2.44, top: heights[0] + 2.56, levelSurface: true };
    w.colliders.push(roof);
    for (const side of [-1, 1]) {
      box(group, spec.x + side * (spec.width / 2 + 0.07), (max + 2.7 + min) / 2, spec.z, 0.14, max + 2.7 - min, spec.depth, glass);
      w.colliders.push({
        minX: spec.x + side * (spec.width / 2 + 0.07) - 0.07,
        maxX: spec.x + side * (spec.width / 2 + 0.07) + 0.07,
        minZ: floor.minZ,
        maxZ: floor.maxZ,
        bottom: min,
        top: max + 2.7,
        fence: true,
        levelSurface: true,
      });
    }
    box(group, spec.x, (max + 2.7 + min) / 2, floor.minZ - 0.07, spec.width, 0.0 + max + 2.7 - min, 0.14, glass);
    w.colliders.push({
      minX: floor.minX,
      maxX: floor.maxX,
      minZ: floor.minZ - 0.14,
      maxZ: floor.minZ,
      bottom: min,
      top: max + 2.7,
      fence: true,
      levelSurface: true,
    });
    const gates: LiftView['gates'] = [];
    for (const [i, y] of heights.entries()) {
      const stop = spec.stops[i],
        front = floor.maxZ;
      const bridge = stop.z - front;
      if (bridge > 0.05) {
        box(group, spec.x, y - 0.1, front + bridge / 2, spec.width, 0.2, bridge, metal);
        w.colliders.push({ minX: floor.minX, maxX: floor.maxX, minZ: front, maxZ: stop.z, bottom: y - 0.2, top: y });
      }
      const panels = [-1, 1].map((side) => box(group, spec.x + (side * spec.width) / 4, y + 1.2, front, spec.width / 2, 2.4, 0.08, metal));
      const solid: Collider = {
        minX: floor.minX,
        maxX: floor.maxX,
        minZ: front - 0.06,
        maxZ: front + 0.06,
        bottom: y,
        top: y + 2.4,
        fence: true,
        levelSurface: true,
      };
      w.colliders.push(solid);
      gates.push({ y, panels, solid, open: 0 });
      const it = { kind: 'levellift' as const, x: stop.x, z: stop.z, y, radius: 2, seatId: spec.id };
      w.interactables.push(it);
      const control = box(group, spec.x + spec.width / 2 + 0.2, y + 1.2, front, 0.2, 0.3, 0.12, button);
      control.userData.interact = it;
    }
    views.set(spec.id, {
      spec,
      car,
      floor,
      roof,
      control: carControl,
      gates,
      motion: { id: spec.id, from: heights[0], to: heights[0], started: 0, duration: 0, riders: [] },
    });
  }
}
