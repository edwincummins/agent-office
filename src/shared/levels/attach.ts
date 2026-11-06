import type { MapPlan } from '../maps/types.js';
import { MapError } from '../maps/check.js';
import { checkLevels } from './plan.js';
import type { LevelsConfig, LevelsPlan } from './types.js';

declare module '../maps/types.js' {
  interface MapConfig {
    levels?: LevelsConfig;
  }
  interface MapPlan {
    levels?: LevelsPlan;
  }
}

export function attachLevels(plan: MapPlan): MapPlan {
  const levels = checkLevels(plan.config?.levels, plan.bounds, plan.height, [...plan.byId.keys()]);
  if (!levels) return plan;
  plan.levels = levels;
  for (const table of plan.tables) {
    const seats = [...plan.desks, ...plan.overflow].filter((d) => d.label.startsWith(table.name + ', seat '));
    if (new Set(seats.map((d) => seatFloor(plan, d.id))).size > 1) throw new MapError('Every seat at one table must use the same level');
  }
  if (new Set(plan.meeting.map((d) => seatFloor(plan, d.id))).size > 1) throw new MapError('All council seats must use the same level');
  for (const [id, level] of Object.entries(levels.seats)) {
    const seat = plan.byId.get(id)!,
      floor = levels.floors.find((f) => f.id === level)!;
    if (seat.x < floor.minX + 0.5 || seat.x > floor.maxX - 0.5 || seat.z < floor.minZ + 0.5 || seat.z > floor.maxZ - 0.5)
      throw new MapError(`${id} must fit inside its assigned level`);
    for (const p of plan.seating.filter((p) => p.id === id)) p.y += floor.y;
  }
  if (levels.spawn) {
    const f = levels.floors.find((f) => f.id === levels.spawn)!;
    if (plan.spawn.x < f.minX || plan.spawn.x > f.maxX || plan.spawn.z < f.minZ || plan.spawn.z > f.maxZ) throw new MapError('spawn is outside its level');
    plan.spawn.y = f.y;
  }
  return plan;
}

export function seatFloor(plan: MapPlan, id: string): number {
  return plan.levels?.floors.find((f) => f.id === plan.levels!.seats[id])?.y ?? 0;
}
