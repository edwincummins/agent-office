import * as THREE from 'three';
import { LevelNav } from '../../../shared/levels/navigation';
import type { LevelSolid } from '../../../shared/levels/types';
import type { MapPlan } from '../../../shared/maps';
import type { World } from '../world';
import { mergeByMaterial } from '../toon';
import { buildLifts } from './lifts';

/** Optional layer over any world builder; maps without levels return unchanged. */
export function withLevels(build: (plan: MapPlan) => World): (plan: MapPlan) => World {
  return (plan) => {
    const w = build(plan),
      levels = plan.levels;
    if (!levels) return w;
    const staticSolids: LevelSolid[] = w.colliders.map((c) => ({ ...c, bottom: c.bottom ?? 0 }));
    const group = new THREE.Group();
    group.name = 'map-levels';
    const concrete = new THREE.MeshStandardMaterial({ color: '#777c82', roughness: 0.8 });
    const stair = new THREE.MeshStandardMaterial({ color: '#8b9096', roughness: 0.7 });
    const glass = new THREE.MeshStandardMaterial({ color: '#a9bdc1', transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.15 });
    for (const c of levels.solids) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(c.maxX - c.minX, c.top - c.bottom, c.maxZ - c.minZ),
        c.fence ? glass : levels.floors.some((f) => f.y === c.top) ? concrete : stair,
      );
      mesh.position.set((c.minX + c.maxX) / 2, (c.top + c.bottom) / 2, (c.minZ + c.maxZ) / 2);
      mesh.userData.outlineParameters = { visible: false };
      group.add(mesh);
      w.colliders.push({ ...c, levelSurface: true });
    }
    const merged = mergeByMaterial(group);
    w.group.add(merged);
    w.pickables.push(merged);
    w.nav = new LevelNav(plan.bounds, levels, [
      ...staticSolids,
      ...levels.solids,
      ...levels.lifts.map((l) => ({
        minX: l.x - l.width / 2,
        maxX: l.x + l.width / 2,
        minZ: l.z - l.depth / 2,
        maxZ: l.z + l.depth / 2,
        bottom: 0,
        top: plan.height,
      })),
    ]);
    w.ways = {
      in: (seat) => w.nav.wayTo([plan.door.x, plan.door.z], seat),
      home: (seat, from) => ({ way: from ? w.nav.route(from, [plan.door.x, plan.door.z]) : w.nav.wayFrom(seat, [plan.door.x, plan.door.z]), chute: false }),
    };
    buildLifts(w);
    w.group.updateMatrixWorld(true);
    return w;
  };
}
