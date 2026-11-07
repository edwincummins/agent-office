import { readFileSync, writeFileSync } from 'node:fs';
import { parseSkyLocation, type SkyLocation } from '../shared/sky-location.js';

export function readSkyLocation(file?: string): SkyLocation | null {
  try { return file ? parseSkyLocation(JSON.parse(readFileSync(file, 'utf8'))) ?? null : null; }
  catch { return null; }
}

export function saveSkyLocation(file: string | undefined, location: SkyLocation | null): boolean {
  if (!file) return true;
  try { writeFileSync(file, JSON.stringify(location)); return true; }
  catch { return false; }
}
