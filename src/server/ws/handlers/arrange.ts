// Arrange mode (see shared/arrange.ts): the owner saving where things go on the map everyone's on.
import { MAX_ARRANGE_CHANGES, applyArrangement, sanitizeChange, withChanges, type ArrangeChange, type ArrangeTarget } from '../../../shared/arrange.js';
import { checkCustomMaps } from '../../../shared/maps/index.js';
import type { ArrangeClientMsg } from '../../../shared/protocol.js';
import { isOwner } from '../../owner-workers/access.js';
import { str } from '../../office/input.js';
import { mapNews } from './settings.js';
import type { HandlerMap } from './types.js';

export const OWNER_ARRANGES = 'Only the office’s owner can arrange things';

export const arrangeHandlers = {
  'arrange.set'(ctx, c, msg) {
    // The owner gate (owner-workers/access.ts) stops anyone else first; this says so again, in case it's ever loosened.
    if (!isOwner(ctx, c.accountId)) return ctx.warn(c, OWNER_ARRANGES);
    const id = str(msg.map, 64);
    if (id !== ctx.maps.pick()) return ctx.warn(c, 'That isn’t the map everyone’s on any more');
    const raw = ctx.maps.raw(id);
    if (raw === undefined) return ctx.warn(c, 'Only a map of your own can be arranged');
    const sent = Array.isArray(msg.changes) ? msg.changes.slice(0, MAX_ARRANGE_CHANGES) : [];
    const changes: ArrangeChange[] = [];
    for (const v of sent) {
      const change = sanitizeChange(v);
      if (typeof change === 'string') return ctx.warn(c, change);
      changes.push(change);
    }
    const reset: ArrangeTarget[] = (Array.isArray(msg.reset) ? msg.reset.slice(0, MAX_ARRANGE_CHANGES) : []).filter(
      (t): t is ArrangeTarget => !!t && (t.kind === 'fixture' || t.kind === 'decor') && typeof t.id === 'string',
    );
    if (!changes.length && !reset.length) return;
    const next = withChanges(ctx.maps.arranged.get(id), changes, reset);
    // The map has to still load with things where they're going: a spot outside the hall, or into a wall, is refused.
    const [checked] = checkCustomMaps([{ file: `${id}.json`, json: applyArrangement(raw, next) }]);
    if (!checked || checked.error) return ctx.warn(c, `That spot won’t work: ${checked?.error ?? 'the map won’t load'}`);
    const was = ctx.maps.pick();
    ctx.maps.arranged.set(id, next);
    // One save, one rebuild for everyone: never one per drag.
    if (ctx.maps.rearranged()) mapNews(ctx, was);
    const n = changes.length + reset.length;
    ctx.sendTo(c, { t: 'toast', text: `📐 Saved ${n} placement${n === 1 ? '' : 's'}: they stay where you put them`, level: 'info' });
  },
} satisfies HandlerMap<ArrangeClientMsg>;
