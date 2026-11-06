import { NavGrid, deskPoint, pathLength, type Bounds, type Obstacles, type Pt } from '../nav.js';
import type { DeskDef } from '../layout.js';
import type { Level, LevelsPlan, LevelSolid, Stair } from './types.js';
import { slabPortal } from './portals.js';
import { crossesRect } from './segment.js';

export type LevelPoint = Pt & { height?: number };
export function elevated(x: number, z: number, height: number): LevelPoint {
  return Object.assign([x, z] as Pt, { height });
}
const inside = (f: Bounds, x: number, z: number) => x >= f.minX - 0.001 && x <= f.maxX + 0.001 && z >= f.minZ - 0.001 && z <= f.maxZ + 0.001;
const length = (points: Pt[]) => pathLength(points);

/** One ordinary grid per floor; only authored stair links join the grids. */
export class LevelNav extends NavGrid {
  private grids = new Map<string, NavGrid>();
  private blocks = new Map<string, Obstacles>();
  private flightBlocks: readonly LevelSolid[];
  private solids: readonly LevelSolid[];
  constructor(
    bounds: Bounds,
    readonly levels: LevelsPlan,
    solids: readonly LevelSolid[],
    private readonly chairs: ReadonlyMap<string, { x: number; z: number; rotY: number }> = new Map(),
  ) {
    super(bounds, { rects: [], circles: [] });
    this.solids = solids;
    this.flightBlocks = solids.filter(
      (s) => !levels.solids.includes(s) || s.fence || levels.floors.some((f) => f.y === s.top && f.y - f.thickness === s.bottom),
    );
    for (const f of levels.floors) {
      const blocks: Obstacles = {
        rects: solids.filter((s) => s.top > f.y + 0.3 && s.bottom < f.y + 1.7).map((s) => [s.minX, s.maxX, s.minZ, s.maxZ]),
        circles: [],
      };
      for (const r of levels.rails) if (r.level === f.id) blocks.rects.push([r.minX, r.maxX, r.minZ, r.maxZ]);
      this.blocks.set(f.id, blocks);
      // Cell-centre clearance alone can cut a physical corner when paths are simplified.
      const gridBlocks: Obstacles = { rects: blocks.rects.map(([a, b, c, d]) => [a - 0.2, b + 0.2, c - 0.2, d + 0.2]), circles: [] };
      this.grids.set(f.id, new NavGrid(f, gridBlocks, (x, z) => inside(f, x, z), chairs.size ? 0.2 : undefined));
    }
  }
  private floor(p: LevelPoint): Level | undefined {
    return this.levels.floors.find((f) => Math.abs(f.y - (p.height ?? 0)) < 0.05 && inside(f, p[0], p[1]));
  }
  private local(f: Level, a: Pt, b: Pt): Pt[] {
    const grid = this.grids.get(f.id)!;
    if (!inside(f, ...a) || !inside(f, ...b)) return [];
    const snapped = grid.route(a, b);
    if (!snapped.length) return [];
    const route = [a, ...snapped, b];
    if (!route.every((p, i) => !i || this.segment(f, route[i - 1], p))) return [];
    return route.map(([x, z]) => elevated(x, z, f.y));
  }
  private segment(f: Level, a: Pt, b: Pt): boolean {
    if (!inside(f, ...a) || !inside(f, ...b)) return false;
    const blocks = this.blocks.get(f.id)!,
      n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.08);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0,
        x = a[0] + (b[0] - a[0]) * t,
        z = a[1] + (b[1] - a[1]) * t;
      if (blocks.rects.some(([x0, x1, z0, z1]) => x > x0 - 0.3 && x < x1 + 0.3 && z > z0 - 0.3 && z < z1 + 0.3)) return false;
    }
    return true;
  }
  override clearLine(a: LevelPoint, b: LevelPoint): boolean {
    const fa = this.floor(a),
      fb = this.floor(b);
    if (fa && fb && fa.id === fb.id) return this.segment(fa, a, b);
    return this.levels.stairs.some((s) => this.onStair(a, s) && this.onStair(b, s)) && this.flightClear(a, b);
  }
  private flightClear(a: LevelPoint, b: LevelPoint): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.08));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        x = a[0] + (b[0] - a[0]) * t,
        z = a[1] + (b[1] - a[1]) * t,
        y = (a.height ?? 0) + ((b.height ?? 0) - (a.height ?? 0)) * t;
      if (this.flightBlocks.some((s) => s.top > y + 0.3 && s.bottom < y + 1.7 && x > s.minX - 0.3 && x < s.maxX + 0.3 && z > s.minZ - 0.3 && z < s.maxZ + 0.3))
        return false;
    }
    return true;
  }
  private onStair(p: LevelPoint, s: Stair): boolean {
    const dx = s.to.x - s.from.x,
      dz = s.to.z - s.from.z,
      l = dx * dx + dz * dz,
      t = ((p[0] - s.from.x) * dx + (p[1] - s.from.z) * dz) / l;
    if (t < -0.001 || t > 1.001 || Math.hypot(p[0] - s.from.x - t * dx, p[1] - s.from.z - t * dz) > s.width / 2 - 0.3) return false;
    const a = this.levels.floors.find((f) => f.id === s.from.level)!.y,
      b = this.levels.floors.find((f) => f.id === s.to.level)!.y;
    return Math.abs((p.height ?? 0) - (a + (b - a) * t)) < 0.31;
  }
  override route(from: LevelPoint, to: LevelPoint): Pt[] {
    const start = this.floor(from),
      goal = this.floor(to);
    if (!start) {
      const stair = this.levels.stairs.find((s) => this.onStair(from, s));
      if (!stair) return [];
      const options = [stair.from, stair.to]
        .map((end) => {
          const y = this.levels.floors.find((f) => f.id === end.level)!.y;
          if (!this.flightClear(from, elevated(end.x, end.z, y))) return [];
          const remaining = this.route(elevated(end.x, end.z, y), to);
          return remaining.length ? [from, ...remaining] : [];
        })
        .filter((r) => r.length);
      return options.sort((a, b) => length(a) - length(b))[0] ?? [];
    }
    if (!goal) return [];
    const search = (f: Level, p: Pt, seen: Set<string>): Pt[] => {
      if (f.id === goal.id) return this.local(f, p, to);
      const candidates: Pt[][] = [];
      for (const next of this.levels.floors) {
        if (seen.has(next.id)) continue;
        const portal = slabPortal(f, next);
        if (!portal) continue;
        const before = this.local(f, p, portal);
        if (!before.length) continue;
        const after = search(next, portal, new Set([...seen, next.id]));
        if (after.length) candidates.push([...before, ...after]);
      }
      for (const s of this.levels.stairs) {
        const forward = s.from.level === f.id;
        if (!forward && s.to.level !== f.id) continue;
        const exit = forward ? s.from : s.to,
          entry = forward ? s.to : s.from;
        if (seen.has(entry.level)) continue;
        const next = this.levels.floors.find((f) => f.id === entry.level)!;
        const before = this.local(f, p, [exit.x, exit.z]);
        if (!before.length) continue;
        const after = search(next, [entry.x, entry.z], new Set([...seen, next.id]));
        if (!after.length) continue;
        const flight: Pt[] = [];
        for (let i = 0; i <= s.steps; i++) {
          const t = i / s.steps;
          flight.push(elevated(exit.x + (entry.x - exit.x) * t, exit.z + (entry.z - exit.z) * t, f.y + (next.y - f.y) * t));
        }
        if (flight.every((p, i) => !i || this.flightClear(flight[i - 1], p))) candidates.push([...before, ...flight, ...after]);
      }
      return candidates.sort((a, b) => length(a) - length(b))[0] ?? [];
    };
    return search(start, from, new Set([start.id]));
  }
  override wayTo(from: Pt, seat: DeskDef): Pt[] {
    const y = this.levels.floors.find((f) => f.id === this.levels.seats[seat.id])?.y ?? 0;
    const chair = this.chairs.get(seat.id);
    if (chair) {
      const paths: Pt[][] = [];
      for (const side of [-1, 1])
        for (const offset of [0.65, 0.75, 0.85])
          for (const back of [0, 0.3, -0.2]) {
            const target = elevated(
              chair.x + Math.cos(chair.rotY) * side * offset - Math.sin(chair.rotY) * back,
              chair.z - Math.sin(chair.rotY) * side * offset - Math.cos(chair.rotY) * back,
              y,
            );
            // The final sit hop must not cross a thin authored partition.
            const floor = this.floor(target);
            if (!floor) continue;
            if (this.solids.some((s) => s.seatId !== seat.id && s.top > y + 0.3 && s.bottom < y + 1.7 && crossesRect(target, [chair.x, chair.z], s))) continue;
            const path = this.route(from, target);
            if (path.length) paths.push(path);
          }
      return paths.sort((a, b) => length(a) - length(b))[0] ?? [];
    }
    const routes = [-1, 1]
      .map((side) => {
        const p = deskPoint(seat, side * 0.85, seat.station ? -1 : 1.6);
        return this.route(from, elevated(...p, y));
      })
      .filter((r) => r.length);
    return routes.sort((a, b) => length(a) - length(b))[0] ?? [];
  }
  override wayFrom(seat: DeskDef, to: Pt): Pt[] {
    if (this.chairs.has(seat.id)) return this.wayTo(to, seat).reverse();
    const y = this.levels.floors.find((f) => f.id === this.levels.seats[seat.id])?.y ?? 0;
    const routes = [-1, 1]
      .map((side) => {
        const p = deskPoint(seat, side * 0.85, seat.station ? -1 : 1.6);
        return this.route(elevated(...p, y), to);
      })
      .filter((r) => r.length);
    return routes.sort((a, b) => length(a) - length(b))[0] ?? [];
  }
}
