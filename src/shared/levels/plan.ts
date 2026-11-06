import { isObj, MapError, num, str } from '../maps/check.js';
import type { Bounds } from '../nav.js';
import type { Landing, Level, LevelsPlan, LevelSolid, Lift, Rail, Stair } from './types.js';
import { slabPortal } from './portals.js';

const MAX_STEP = 0.3;
const at = (r: Bounds, x: number, z: number, margin = 0) => x >= r.minX + margin && x <= r.maxX - margin && z >= r.minZ + margin && z <= r.maxZ - margin;
export function checkLevels(raw: unknown, bounds: Bounds, roof: number, seatIds: readonly string[]): LevelsPlan | undefined {
  if (raw === undefined) return;
  if (!isObj(raw)) throw new MapError('levels must be an object');
  const keys = (v: Record<string, unknown>, allowed: string[], what: string) => {
    for (const k of Object.keys(v)) if (!allowed.includes(k)) throw new MapError(`${what}.${k} is not supported`);
  };
  keys(raw, ['floors', 'stairs', 'rails', 'lifts', 'seats', 'spawn'], 'levels');
  const list = (v: unknown, what: string, max: number, required = false): Record<string, unknown>[] => {
    if (v === undefined && !required) return [];
    if (!Array.isArray(v) || v.length > max || (required && !v.length) || v.some((x) => !isObj(x)))
      throw new MapError(`${what} must be a bounded list of objects`);
    return v;
  };
  const ids = new Set<string>();
  const id = (v: unknown, what: string) => {
    const s = str(v, what, 40);
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(s) || ids.has(s)) throw new MapError(`${what} must be a unique lowercase id`);
    ids.add(s);
    return s;
  };
  const rect = (v: Record<string, unknown>, what: string): Bounds => {
    const r = { minX: num(v.minX, `${what}.minX`), maxX: num(v.maxX, `${what}.maxX`), minZ: num(v.minZ, `${what}.minZ`), maxZ: num(v.maxZ, `${what}.maxZ`) };
    if (r.maxX - r.minX < 0.1 || r.maxZ - r.minZ < 0.1 || !at(bounds, r.minX, r.minZ) || !at(bounds, r.maxX, r.maxZ))
      throw new MapError(`${what} must have positive area inside the hall`);
    return r;
  };
  const floors: Level[] = list(raw.floors, 'levels.floors', 16, true).map((v, i) => {
    const what = `levels.floors[${i}]`;
    keys(v, ['id', 'y', 'thickness', 'minX', 'maxX', 'minZ', 'maxZ'], what);
    const y = num(v.y, `${what}.y`, 0, roof - 2.2),
      thickness = num(v.thickness, `${what}.thickness`, 0.05, 0.6);
    if (y > 0 && y - thickness < 2.2 - 1e-8) throw new MapError(`${what} needs 2.2 m clearance underneath`);
    return { ...rect(v, what), id: id(v.id, `${what}.id`), y, thickness };
  });
  if (floors.filter((f) => f.y === 0).length !== 1) throw new MapError('levels needs exactly one ground floor at y=0');
  for (let i = 0; i < floors.length; i++)
    for (let j = i + 1; j < floors.length; j++) {
      const a = floors[i],
        b = floors[j];
      if (Math.min(a.maxX, b.maxX) > Math.max(a.minX, b.minX) && Math.min(a.maxZ, b.maxZ) > Math.max(a.minZ, b.minZ)) {
        const low = a.y < b.y ? a : b,
          high = low === a ? b : a;
        if (high.y - high.thickness - low.y < 2.2) throw new MapError('overlapping levels need 2.2 m clear headroom');
      }
    }
  const floor = (value: unknown): Level => {
    const f = floors.find((f) => f.id === value);
    if (!f) throw new MapError(`unknown level ${String(value)}`);
    return f;
  };
  const landing = (v: unknown, what: string): Landing => {
    if (!isObj(v)) throw new MapError(`${what} must be {x,z,level}`);
    keys(v, ['x', 'z', 'level'], what);
    const f = floor(v.level),
      x = num(v.x, `${what}.x`),
      z = num(v.z, `${what}.z`);
    if (!at(f, x, z)) throw new MapError(`${what} is outside its level`);
    return { x, z, level: f.id };
  };
  const stairs: Stair[] = list(raw.stairs, 'levels.stairs', 32).map((v, i) => {
    const what = `levels.stairs[${i}]`;
    keys(v, ['id', 'from', 'to', 'width', 'steps'], what);
    const from = landing(v.from, `${what}.from`),
      to = landing(v.to, `${what}.to`),
      width = num(v.width, `${what}.width`, 1, 8),
      steps = num(v.steps, `${what}.steps`, 1, 128);
    const rise = floor(to.level).y - floor(from.level).y,
      run = Math.hypot(to.x - from.x, to.z - from.z);
    if (!Number.isInteger(steps) || rise <= 0 || rise / steps > MAX_STEP + 1e-9) throw new MapError(`${what} needs ascending steps no higher than 0.30 m`);
    if ((from.x !== to.x && from.z !== to.z) || run / steps < 0.32) throw new MapError(`${what} must be axis aligned with treads at least 0.32 m deep`);
    const r = stairBounds({ from, to, width });
    if (!at(bounds, r.minX, r.minZ) || !at(bounds, r.maxX, r.maxZ)) throw new MapError(`${what} extends outside the hall`);
    // A slab may meet the top landing but must not cover the ascending flight.
    for (let n = 1; n < steps; n++) {
      const t = n / steps,
        x = from.x + (to.x - from.x) * t,
        z = from.z + (to.z - from.z) * t,
        y = floor(from.level).y + rise * t;
      for (const f of floors)
        if (f.y > y + 0.01 && at(f, x, z) && f.y - f.thickness - y < 2.2) throw new MapError(`${what} has insufficient headroom below ${f.id}`);
    }
    return { id: id(v.id, `${what}.id`), from, to, width, steps };
  });
  const rails: Rail[] = list(raw.rails, 'levels.rails', 128).map((v, i) => {
    const what = `levels.rails[${i}]`;
    keys(v, ['level', 'height', 'minX', 'maxX', 'minZ', 'maxZ'], what);
    const f = floor(v.level),
      r = rect(v, what),
      height = num(v.height, `${what}.height`, 1.1, 3);
    if (f.y + height > roof) throw new MapError(`${what} exceeds the roof`);
    return { ...r, level: f.id, height };
  });
  const lifts: Lift[] = list(raw.lifts, 'levels.lifts', 4).map((v, i) => {
    const what = `levels.lifts[${i}]`;
    keys(v, ['id', 'x', 'z', 'width', 'depth', 'stops'], what);
    const x = num(v.x, `${what}.x`),
      z = num(v.z, `${what}.z`),
      width = num(v.width, `${what}.width`, 1.4, 5),
      depth = num(v.depth, `${what}.depth`, 1.4, 5);
    if (!at(bounds, x - width / 2, z - depth / 2) || !at(bounds, x + width / 2, z + depth / 2)) throw new MapError(`${what} is outside the hall`);
    const stops = list(v.stops, `${what}.stops`, 16, true).map((s, j) => landing(s, `${what}.stops[${j}]`));
    if (stops.length < 2 || new Set(stops.map((s) => s.level)).size !== stops.length) throw new MapError(`${what} needs at least two distinct stops`);
    if (floor(stops[0].level).y !== 0 || stops.some((s, i) => i > 0 && floor(s.level).y <= floor(stops[i - 1].level).y))
      throw new MapError(`${what} stops must start at ground and ascend`);
    for (const s of stops) {
      if (Math.abs(s.x - x) > 0.01 || s.z < z + depth / 2 + 0.35 || s.z > z + depth / 2 + 1.5)
        throw new MapError(`${what} stops must face the car's +z doors, 0.35 to 1.5 m in front`);
    }
    const top = Math.max(...stops.map((s) => floor(s.level).y));
    if (top + 2.7 > roof) throw new MapError(`${what} needs 2.7 m car clearance above its highest stop`);
    for (const f of floors)
      if (
        f.y > 0 &&
        f.y <= top &&
        Math.min(f.maxX, x + width / 2) > Math.max(f.minX, x - width / 2) &&
        Math.min(f.maxZ, z + depth / 2) > Math.max(f.minZ, z - depth / 2)
      )
        throw new MapError(`${what} shaft intersects slab ${f.id}`);
    return { id: id(v.id, `${what}.id`), x, z, width, depth, stops };
  });
  const seats: Record<string, string> = {};
  if (raw.seats !== undefined) {
    if (!isObj(raw.seats)) throw new MapError('levels.seats must map seat ids to levels');
    for (const [key, value] of Object.entries(raw.seats)) {
      if (!seatIds.includes(key)) throw new MapError(`levels.seats has unknown seat ${key}`);
      seats[key] = floor(value).id;
    }
  }
  const ground = floors.find((f) => f.y === 0)!;
  const connected = new Set([ground.id]);
  for (let n = 0; n < floors.length; n++) {
    for (const s of stairs) if (connected.has(s.from.level)) connected.add(s.to.level);
    for (const a of floors) for (const b of floors) if (connected.has(a.id) && slabPortal(a, b)) connected.add(b.id);
  }
  for (const f of floors) if (!connected.has(f.id)) throw new MapError(`${f.id} needs a walkable stair route from ground`);
  const solids: LevelSolid[] = floors.filter((f) => f.y > 0).map((f) => ({ ...f, bottom: f.y - f.thickness, top: f.y }));
  for (const s of stairs) solids.push(...stairSolids(s, floor(s.from.level).y, floor(s.to.level).y));
  for (const r of rails) solids.push({ ...r, bottom: floor(r.level).y, top: floor(r.level).y + r.height, fence: true });
  return { floors, stairs, rails, lifts, seats, solids, ...(raw.spawn === undefined ? {} : { spawn: floor(raw.spawn).id }) };
}

export function stairBounds(s: Pick<Stair, 'from' | 'to' | 'width'>): Bounds {
  const x = s.from.x === s.to.x;
  return {
    minX: Math.min(s.from.x, s.to.x) - (x ? s.width / 2 : 0),
    maxX: Math.max(s.from.x, s.to.x) + (x ? s.width / 2 : 0),
    minZ: Math.min(s.from.z, s.to.z) - (x ? 0 : s.width / 2),
    maxZ: Math.max(s.from.z, s.to.z) + (x ? 0 : s.width / 2),
  };
}
export function stairSolids(s: Stair, fromY: number, toY: number): LevelSolid[] {
  const b = stairBounds(s),
    out: LevelSolid[] = [];
  for (let n = 0; n < s.steps; n++) {
    const t0 = n / s.steps,
      t1 = (n + 1) / s.steps,
      x0 = s.from.x + (s.to.x - s.from.x) * t0,
      x1 = s.from.x + (s.to.x - s.from.x) * t1,
      z0 = s.from.z + (s.to.z - s.from.z) * t0,
      z1 = s.from.z + (s.to.z - s.from.z) * t1;
    out.push({
      ...b,
      ...(s.from.x === s.to.x ? { minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) } : { minX: Math.min(x0, x1), maxX: Math.max(x0, x1) }),
      bottom: fromY,
      top: fromY + (toY - fromY) * t1,
    });
  }
  return out;
}
