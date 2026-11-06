// What guests may watch of Cadre (Fetty, 11-06): he chooses per team, and his privacy eye hides the live terminals
// and/or his gold cards. Everything here runs on his PC, so a hidden feed or a masked secret never leaves it.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FleetGuestSettings, FleetSnapshot } from '../../shared/protocol/fleet.js';

const FILE = 'cadre-guests.json';
/** He is the only tester for now and asked to see everything exposed; only the office team starts visible. */
export const DEFAULT_GUESTS: FleetGuestSettings = { terminals: true, cards: true, teams: { 'office-lab': true } };

export function loadGuests(dataDir: string): FleetGuestSettings {
  try {
    return sanitizeGuests(JSON.parse(readFileSync(path.join(dataDir, FILE), 'utf8')));
  } catch {
    return structuredClone(DEFAULT_GUESTS);
  }
}

export function saveGuests(dataDir: string, settings: FleetGuestSettings) {
  writeFileSync(path.join(dataDir, FILE), JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function sanitizeGuests(raw: unknown): FleetGuestSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const teams: Record<string, boolean> = {};
  if (r.teams && typeof r.teams === 'object') {
    for (const [k, v] of Object.entries(r.teams as Record<string, unknown>).slice(0, 64)) if (/^[\w.-]{1,64}$/.test(k)) teams[k] = v === true;
  }
  return { terminals: r.terminals !== false, cards: r.cards !== false, teams };
}

/** Paths, keys, tokens and emails, replaced before a guest's copy leaves the PC. */
export function maskText(text: string): string {
  return text
    .replace(/\b(Bearer|token|apikey|api_key|secret|password|passwd|pwd)(\s*[:=]\s*|\s+)("?)[^\s"']{4,}\3/gi, '$1$2‹hidden›')
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, '‹key›')
    .replace(/\b(ghp|gho|ghu|ghs|github_pat|xox[abprs]|AKIA|AIza|glpat)[A-Za-z0-9_-]{10,}/g, '‹key›')
    // Long key-like runs (with a digit, no slashes or dots): file paths and names stay readable.
    .replace(/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{32,}={0,2}/g, '‹key›')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '‹email›')
    .replace(/(?:\\\\\?\\)?[A-Za-z]:\\[^\s"'<>|]*/g, '‹path›')
    .replace(/(?:~|\/(?:home|Users|mnt|root))\/[^\s"'<>|]*/g, '‹path›');
}

/** A guest's copy of the fleet: only the teams he allows, terminals masked (or gone), his cards only if he shows them. */
export function guestView(state: FleetSnapshot, s: FleetGuestSettings): FleetSnapshot {
  const visible = (rig: string) => s.teams[rig] === true;
  return {
    status: state.status,
    teams: state.teams.filter(visible),
    seats: state.seats
      .filter((seat) => visible(seat.rig))
      .map(({ tail, reason, ...seat }) => ({
        ...seat,
        activity: maskText(seat.activity),
        ...(reason ? { reason: maskText(reason) } : {}),
        ...(s.terminals && tail ? { tail: tail.map(maskText) } : {}),
      })),
    needs: s.cards ? state.needs.filter((n) => visible(n.rig)).map((n) => ({ ...n, summary: maskText(n.summary) })) : [],
  };
}
