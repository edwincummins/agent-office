import type { MapPlan } from '../../shared/maps/index.js';
import type { PresenceClientMsg } from '../../shared/protocol.js';
import type { HandlerMap } from '../ws/handlers/types.js';

/** Reject hostile coordinates before they enter shared avatar interpolation. */
export function boundedPosition(plan: MapPlan, msg: { x: number; y: number; z: number; rotY: number }) {
  if (![msg.x, msg.y, msg.z, msg.rotY].every(Number.isFinite) || Math.abs(msg.rotY) > 10000) return false;
  if (!plan.levels) return [msg.x, msg.y, msg.z].every(v => Math.abs(v) <= 10000);
  const b = plan.bounds;
  return msg.x >= b.minX && msg.x <= b.maxX && msg.z >= b.minZ && msg.z <= b.maxZ && msg.y >= 0 && msg.y <= plan.config!.hall.height;
}

export function withBoundedMoves(handlers: HandlerMap<PresenceClientMsg>): HandlerMap<PresenceClientMsg> {
  return { ...handlers, move(ctx, client, msg) {
    if (!boundedPosition(ctx.maps.plan(), msg)) return;
    handlers.move(ctx, client, msg);
  } };
}
