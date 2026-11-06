import type { LiftMotion, LevelsClientMsg } from '../../../shared/protocol/levels.js';
import { liftHeight, liftMoving } from '../../../shared/levels/lift.js';
import type { MapPlan } from '../../../shared/maps/index.js';
import type { Ctx } from '../../office/context.js';
import { throttle } from '../../office/client.js';
import type { HandlerMap } from './types.js';

const states = new WeakMap<Ctx, { plan: MapPlan; floors: Map<string, Map<string, LiftMotion>> }>();
function current(ctx: Ctx, floor: string) {
  const plan = ctx.maps.plan();
  let state = states.get(ctx);
  if (!state || state.plan !== plan) {
    state = { plan, floors: new Map() };
    states.set(ctx, state);
  }
  let motions = state.floors.get(floor);
  if (!motions) {
    motions = new Map();
    state.floors.set(floor, motions);
  }
  for (const l of plan.levels?.lifts ?? [])
    if (!motions.has(l.id)) {
      const y = plan.levels!.floors.find((f) => f.id === l.stops[0].level)!.y;
      motions.set(l.id, { id: l.id, from: y, to: y, started: 0, duration: 0, riders: [] });
    }
  return { plan, motions };
}
export const levelsHandlers = {
  'levels.sync'(ctx, c) {
    const floor = ctx.floorOf(c);
    if (!floor || !throttle(c, 'levels.sync', 500)) return;
    const { plan, motions } = current(ctx, floor.id);
    ctx.sendTo(c, { t: 'levels.lifts', map: plan.id, motions: [...motions.values()] });
  },
  'levels.lift'(ctx, c, msg) {
    const floor = ctx.floorOf(c);
    if (!floor || !throttle(c, 'levels.lift', 500)) return;
    const { plan, motions } = current(ctx, floor.id),
      levels = plan.levels,
      lift = levels?.lifts.find((l) => l.id === msg.id);
    if (!levels || !lift || !Number.isInteger(msg.stop) || msg.stop < 0 || msg.stop >= lift.stops.length) return;
    const state = motions.get(lift.id)!,
      now = Date.now(),
      y = liftHeight(state, now);
    if (liftMoving(state, now)) return;
    const p = c.peer;
    const boarded = Math.abs(p.x - lift.x) < lift.width / 2 - 0.15 && Math.abs(p.z - lift.z) < lift.depth / 2 - 0.15 && Math.abs(p.y - y) < 0.4;
    const landing = lift.stops.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < 2.5 && Math.abs(p.y - levels.floors.find((f) => f.id === s.level)!.y) < 0.4);
    if (!boarded && !landing) return;
    const target = levels.floors.find((f) => f.id === lift.stops[msg.stop].level)!.y;
    // Calling from a landing can only bring the car to that landing.
    if (!boarded && Math.abs(p.y - target) > 0.4) return;
    if (Math.abs(target - y) < 0.01) return;
    const riders = [...ctx.clients.values()]
      .filter(
        (other) =>
          other.peer.floor === floor.id &&
          Math.abs(other.peer.x - lift.x) < lift.width / 2 - 0.15 &&
          Math.abs(other.peer.z - lift.z) < lift.depth / 2 - 0.15 &&
          Math.abs(other.peer.y - y) < 0.4,
      )
      .map((c) => c.id);
    // Hold still while the doors close, then ease the same journey on every client.
    const motion: LiftMotion = { id: lift.id, from: y, to: target, started: now + 600, duration: Math.max(1800, Math.abs(target - y) * 1300), riders };
    motions.set(lift.id, motion);
    ctx.toFloor(floor, { t: 'levels.lifts', map: plan.id, motions: [...motions.values()] });
  },
} satisfies HandlerMap<LevelsClientMsg>;
