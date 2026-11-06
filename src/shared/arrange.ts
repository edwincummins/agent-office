/*
 * Arrange mode: the owner moves, turns and resizes things on a model map with a gizmo, and those
 * placements win over the map file's. They're kept apart from the map (.agent-office/arrange/<map>.json
 * on the server), so the team can rebuild the map's JSON and nothing the owner placed moves.
 */
import { DECOR_ID, DECOR_SCALE } from './maps/decor.js';

/** The fixtures the owner can move and turn (their size stays as the map says). */
export const ARRANGE_FIXTURES = ['tv', 'arcade', 'jukebox', 'gong'] as const;
export type ArrangeFixture = (typeof ARRANGE_FIXTURES)[number];
export type ArrangeKind = 'fixture' | 'decor';

export interface Point {
  x: number;
  y: number;
  z: number;
}
export interface FixturePlacement {
  position: Point;
  rotY: number;
}
export interface DecorPlacement extends FixturePlacement {
  scale: number;
}

/** The owner's placements on one map. Ids the map doesn't have (any more) are kept, and ignored. */
export interface Arrangement {
  fixtures: Partial<Record<ArrangeFixture, FixturePlacement>>;
  decor: Record<string, DecorPlacement>;
}

/** One thing moved, as `arrange.set` sends it. */
export interface ArrangeChange {
  kind: ArrangeKind;
  id: string;
  position: Point;
  rotY: number;
  /** Decor only. */
  scale?: number;
}
export interface ArrangeTarget {
  kind: ArrangeKind;
  id: string;
}

/** The most changes one save carries. */
export const MAX_ARRANGE_CHANGES = 100;

export const emptyArrangement = (): Arrangement => ({ fixtures: {}, decor: {} });
export const isArrangeFixture = (id: unknown): id is ArrangeFixture => typeof id === 'string' && (ARRANGE_FIXTURES as readonly string[]).includes(id);

const finite = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
/** An angle folded into -π..π, so saves stay tidy whatever the gizmo was spun to. */
const fold = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const round = (v: number, places = 3) => Math.round(v * 10 ** places) / 10 ** places;

/** One change as sent, checked: the change, or what's wrong with it in words. Positions are checked against the map later. */
export function sanitizeChange(v: unknown): ArrangeChange | string {
  if (!v || typeof v !== 'object') return 'A change must be an object';
  const c = v as Record<string, unknown>;
  if (c.kind !== 'fixture' && c.kind !== 'decor') return 'A change is for a fixture or a decor item';
  if (c.kind === 'fixture' ? !isArrangeFixture(c.id) : typeof c.id !== 'string' || !DECOR_ID.test(c.id)) return 'That isn’t something you can arrange';
  const p = c.position as Record<string, unknown> | undefined;
  if (!p || !finite(p.x, -1e4, 1e4) || !finite(p.y, -100, 1e4) || !finite(p.z, -1e4, 1e4)) return 'A position needs x, y and z';
  if (!finite(c.rotY, -1e4, 1e4)) return 'A turn needs a number';
  const out: ArrangeChange = { kind: c.kind, id: c.id as string, position: { x: round(p.x as number), y: round(p.y as number), z: round(p.z as number) }, rotY: round(fold(c.rotY as number), 4) };
  if (c.kind === 'decor') {
    if (!finite(c.scale ?? 1, DECOR_SCALE[0], DECOR_SCALE[1])) return `A size goes from ${DECOR_SCALE[0]} to ${DECOR_SCALE[1]}`;
    out.scale = round((c.scale as number | undefined) ?? 1);
  }
  return out;
}

/** The arrangement with these changes made and these placements dropped (back to the map's). */
export function withChanges(a: Arrangement | undefined, changes: readonly ArrangeChange[], reset: readonly ArrangeTarget[] = []): Arrangement {
  const next: Arrangement = { fixtures: { ...(a?.fixtures ?? {}) }, decor: { ...(a?.decor ?? {}) } };
  for (const t of reset) {
    if (t.kind === 'fixture' && isArrangeFixture(t.id)) delete next.fixtures[t.id];
    else if (t.kind === 'decor') delete next.decor[t.id];
  }
  for (const c of changes) {
    if (c.kind === 'fixture' && isArrangeFixture(c.id)) next.fixtures[c.id] = { position: c.position, rotY: c.rotY };
    else if (c.kind === 'decor') next.decor[c.id] = { position: c.position, rotY: c.rotY, scale: c.scale ?? 1 };
  }
  return next;
}

/** A map file's JSON with the owner's placements over it. Anything that isn't there is left alone. */
export function applyArrangement(raw: unknown, a: Arrangement | undefined): unknown {
  if (!a || !raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const map = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...map };
  const fixtures = map.fixtures;
  if (fixtures && typeof fixtures === 'object' && !Array.isArray(fixtures) && Object.keys(a.fixtures).length) {
    const f = { ...(fixtures as Record<string, unknown>) };
    for (const [id, p] of Object.entries(a.fixtures)) {
      const slot = f[id];
      if (p && slot && typeof slot === 'object' && !Array.isArray(slot)) f[id] = { ...(slot as Record<string, unknown>), position: p.position, rotY: p.rotY };
    }
    out.fixtures = f;
  }
  if (Array.isArray(map.decor) && Object.keys(a.decor).length) {
    out.decor = map.decor.map((item) => {
      const id = item && typeof item === 'object' ? (item as Record<string, unknown>).id : undefined;
      const p = typeof id === 'string' ? a.decor[id] : undefined;
      return p ? { ...(item as Record<string, unknown>), position: p.position, rotY: p.rotY, scale: p.scale } : item;
    });
  }
  return out;
}

/** An arrangement read from disk, keeping only what checks out. */
export function readArrangement(v: unknown): Arrangement {
  const a = emptyArrangement();
  if (!v || typeof v !== 'object') return a;
  const o = v as Record<string, unknown>;
  for (const [id, p] of Object.entries((o.fixtures as Record<string, unknown>) ?? {})) {
    const c = sanitizeChange({ kind: 'fixture', id, ...(p as object) });
    if (typeof c !== 'string' && isArrangeFixture(id)) a.fixtures[id] = { position: c.position, rotY: c.rotY };
  }
  for (const [id, p] of Object.entries((o.decor as Record<string, unknown>) ?? {})) {
    const c = sanitizeChange({ kind: 'decor', id, ...(p as object) });
    if (typeof c !== 'string') a.decor[id] = { position: c.position, rotY: c.rotY, scale: c.scale ?? 1 };
  }
  return a;
}
