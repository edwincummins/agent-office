import type { Ctx } from '../../core/context';
import { hintTitle, key, onE } from '../../core/hint';
import { liftViews, type LiftView } from '../../world/levels/lifts';
import { liftHeight, liftMoving } from '../../../shared/levels/lift';
import { store } from '../../state';

declare module '../../world/types' {
  interface InteractKinds {
    levellift: true;
  }
}
export function installLevels(ctx: Ctx) {
  let world = ctx.world(),
    ride: LiftView | undefined,
    syncAt = 0;
  const rig = (dt: number) => {
    if (ride) {
      ctx.player.pos.y = liftHeight(ride.motion, Date.now());
      ctx.player.vy = 0;
      ctx.player.grounded = true;
    }
  };
  const release = () => {
    if (ctx.player.rig === rig) ctx.player.rig = null;
    ride = undefined;
  };
  ctx.interactions.define('levellift', {
    reach: 2.5,
    hint: () => ({ k: '', parts: [hintTitle('Lift'), key('E', 'Call / ride')] }),
    use: onE((it) => {
      const v = liftViews.get(ctx.world())?.get(it.seatId ?? '');
      if (!v || liftMoving(v.motion, Date.now())) return;
      const p = ctx.player.pos,
        y = liftHeight(v.motion, Date.now()),
        levels = ctx.plan().levels!;
      const boarded = Math.abs(p.x - v.spec.x) < v.spec.width / 2 - 0.15 && Math.abs(p.z - v.spec.z) < v.spec.depth / 2 - 0.15 && Math.abs(p.y - y) < 0.4;
      const here = v.spec.stops.findIndex((s) => Math.abs(levels.floors.find((f) => f.id === s.level)!.y - p.y) < 0.4);
      if (here < 0) return;
      ctx.net.send({ t: 'levels.lift', id: v.spec.id, stop: boarded ? (here + 1) % v.spec.stops.length : here });
    }),
  });
  ctx.messages.on('levels.lifts', (msg) => {
    if (msg.map !== ctx.plan().id) return;
    for (const motion of msg.motions) {
      const v = liftViews.get(ctx.world())?.get(motion.id);
      if (v) {
        v.motion = motion;
        if (motion.riders.includes(store.you) && liftMoving(motion, Date.now())) {
          ctx.player.stand();
          ride = v;
          ctx.player.rig = rig;
        }
      }
    }
  });
  ctx.messages.on('welcome', () => ctx.net.send({ t: 'levels.sync' }));
  ctx.messages.on('floor.enter', () => {
    release();
    ctx.net.send({ t: 'levels.sync' });
  });
  ctx.net.onStatus((up) => {
    if (up) {
      syncAt = Date.now() + 600;
      return;
    }
    if (ride) {
      const stops = ride.spec.stops,
        levels = ctx.plan().levels!;
      const stop = stops.reduce((a, b) =>
        Math.abs(levels.floors.find((f) => f.id === a.level)!.y - ctx.player.pos.y) <
        Math.abs(levels.floors.find((f) => f.id === b.level)!.y - ctx.player.pos.y)
          ? a
          : b,
      );
      ctx.player.pos.set(stop.x, levels.floors.find((f) => f.id === stop.level)!.y, stop.z);
    }
    release();
  });
  ctx.ticks.add('pre', ({ dt }) => {
    if (ctx.world() !== world) {
      release();
      world = ctx.world();
      syncAt = Date.now() + 600;
    }
    if (syncAt && Date.now() >= syncAt) {
      syncAt = 0;
      ctx.net.send({ t: 'levels.sync' });
    }
    for (const v of liftViews.get(world)?.values() ?? []) {
      const y = liftHeight(v.motion, Date.now()),
        moving = liftMoving(v.motion, Date.now());
      v.car.position.y = y;
      v.control.y = y;
      v.floor.top = y;
      v.floor.bottom = y - 0.2;
      v.roof.bottom = y + 2.44;
      v.roof.top = y + 2.56;
      for (const gate of v.gates) {
        const open = !moving && Math.abs(gate.y - y) < 0.02;
        gate.open += (Number(open) - gate.open) * Math.min(1, dt * 8);
        gate.panels.forEach((panel, i) => (panel.position.x = v.spec.x + (i ? 1 : -1) * (v.spec.width / 4 + (gate.open * v.spec.width) / 2)));
        gate.solid.top = open && gate.open > 0.9 ? gate.y : gate.y + 2.4;
      }
      if (ride === v && !moving) {
        ctx.player.pos.y = y;
        release();
      }
    }
  });
}
