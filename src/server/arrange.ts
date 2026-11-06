import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readArrangement, type Arrangement } from '../shared/arrange.js';

/**
 * The owner's Arrange-mode placements, one file per map in .agent-office/arrange/<map id>.json (see
 * shared/arrange.ts). Kept apart from the map files, so a team rebuilding a map never moves them.
 */
export class Arrangements {
  private dir: string;
  private cache = new Map<string, Arrangement>();

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'arrange');
  }

  private file(id: string) {
    return path.join(this.dir, `${id.replace(/[^a-z0-9-]/g, '')}.json`);
  }

  /** The placements on a map, or undefined when the owner hasn't placed anything there. */
  get(id: string): Arrangement | undefined {
    if (!this.cache.has(id)) {
      try {
        this.cache.set(id, readArrangement(JSON.parse(readFileSync(this.file(id), 'utf8'))));
      } catch {
        return undefined;
      }
    }
    const a = this.cache.get(id)!;
    return Object.keys(a.fixtures).length || Object.keys(a.decor).length ? a : undefined;
  }

  set(id: string, a: Arrangement) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(id), JSON.stringify(a, null, 2), { mode: 0o600 });
    this.cache.set(id, a);
  }

  /** What the folder looks like (each file's name and mtime), for the maps' read-again check. */
  stamp(): string {
    try {
      return readdirSync(this.dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => `${f}:${statSync(path.join(this.dir, f)).mtimeMs}`)
        .join('|');
    } catch {
      return '';
    }
  }

  /** Forget what was read, so an edit made by hand is picked up. */
  forget() {
    this.cache.clear();
  }
}
