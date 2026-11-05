// Plan limits of the other agent providers, shown beside Claude's in the limits panel (one provider at a time, with
// arrows). Codex: read from what Codex itself writes on this machine, the newest session file under ~/.codex/sessions,
// whose token_count events carry the account's rate_limits. No login is read and nothing is asked of OpenAI.
// Gemini, Grok and the rest join here as readers are built for them.
import { closeSync, existsSync, fstatSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PlanLimits, PlanWindow } from '../shared/protocol.js';

export interface ProviderLimits {
  /** Shown as the panel's title: 'Codex'. */
  provider: string;
  plan?: string;
  windows: PlanWindow[];
  at: number;
}

const TAIL = 2 * 1024 * 1024;

function newestRollout(root: string): { p: string; m: number } | null {
  let best: { p: string; m: number } | null = null;
  for (let d = 0; d < 8; d++) {
    const t = new Date(Date.now() - d * 864e5);
    const dir = path.join(root, String(t.getFullYear()), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0'));
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const p = path.join(dir, f);
      const m = statSync(p).mtimeMs;
      if (!best || m > best.m) best = { p, m };
    }
  }
  return best;
}

function tail(file: string): string {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const n = Math.min(size, TAIL);
    const buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, size - n);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

const label = (min: number) => (min >= 10000 ? 'Week' : min >= 290 && min <= 310 ? '5h session' : `${Math.round(min / 60)}h`);

export function codexLimits(root = path.join(os.homedir(), '.codex', 'sessions')): ProviderLimits | null {
  try {
    const f = newestRollout(root);
    if (!f) return null;
    const lines = tail(f.p).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"rate_limits"')) continue;
      let j: any;
      try {
        j = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      const rl = j?.payload?.rate_limits ?? j?.rate_limits ?? j?.payload?.info?.rate_limits;
      if (!rl) continue;
      // The 5-hour window first, then the week, as Claude's panel orders them.
      const windows = (['primary', 'secondary'] as const)
        .map((k) => rl[k])
        .filter(Boolean)
        .map((w: any): PlanWindow => ({ label: label(Number(w.window_minutes) || 0), pct: Math.max(0, Math.min(100, Number(w.used_percent) || 0)), ...(w.resets_at ? { resetsAt: w.resets_at * 1000 } : {}) }))
        .sort((a, b) => (a.label === 'Week' ? 1 : 0) - (b.label === 'Week' ? 1 : 0));
      return { provider: 'Codex', ...(rl.plan_type ? { plan: String(rl.plan_type) } : {}), windows, at: f.m };
    }
  } catch {
    // no Codex here, or a format it doesn't know: no card
  }
  return null;
}

/** Every provider card there is to show right now (Claude's comes from the PlanLimits it's added to). */
export function providerLimits(): ProviderLimits[] {
  return [codexLimits()].filter((p): p is ProviderLimits => !!p && p.windows.length > 0);
}

export const withProviders = (state: PlanLimits): PlanLimits => ({ ...state, providers: providerLimits() });
