// Your character follows your account (Fetty, 11-06): signed in on his Mac, the office showed a different look,
// because the look lived only in each browser. The latest look and colour an account picks is kept here, on the
// office's machine, and every browser signed in as that account starts from it.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sanitizeLook, type Look } from '../../shared/avatar.js';

export interface AccountProfile { color: string; look: Look }
const FILE = 'profiles.json';
const COLOR = /^#[0-9a-f]{6}$/i;

function readAll(dataDir: string): Record<string, AccountProfile> {
  try {
    const raw = JSON.parse(readFileSync(path.join(dataDir, FILE), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function accountProfile(dataDir: string, accountId: string | undefined): AccountProfile | undefined {
  if (!accountId) return;
  const p = readAll(dataDir)[accountId];
  if (!p || !COLOR.test(p.color) || !p.look) return;
  return { color: p.color, look: sanitizeLook(p.look, p.look) };
}

export function saveAccountProfile(dataDir: string, accountId: string, color: string, look: Look) {
  if (!COLOR.test(color)) return;
  const all = readAll(dataDir);
  const prev = all[accountId];
  if (prev && prev.color === color && JSON.stringify(prev.look) === JSON.stringify(look)) return;
  all[accountId] = { color, look };
  try {
    writeFileSync(path.join(dataDir, FILE), JSON.stringify(all, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch {
    console.warn('Account profiles could not be saved');
  }
}
