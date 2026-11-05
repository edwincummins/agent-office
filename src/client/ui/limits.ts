import type { PlanWindow } from '../../shared/protocol';
import { store } from '../state';
import { $, h } from './dom';
import { panelHide } from './menu';

/** Numbers older than this say when they were read. */
const STALE_MS = 10 * 60_000;

/** "in 12m", "in 2h 5m", or "Tue 5:00 AM" once it is more than a day out. */
export function fmtReset(at: number, now = Date.now()): string {
  const mins = Math.ceil((at - now) / 60_000);
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins}m`;
  if (mins < 24 * 60) return `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return new Date(at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

const level = (pct: number) => (pct >= 90 ? 'over' : pct >= 75 ? 'near' : '');

function windowRow(w: PlanWindow, now: number): HTMLElement[] {
  const pct = Math.round(w.pct);
  const when = w.resetsAt ? new Date(w.resetsAt).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' }) : '';
  const scope = w.label === 'Week' ? ' (all models)' : '';
  const title = `${w.label}${scope}: ${pct}% used${when ? `\nStarts over ${when}` : ''}`;
  return [
    h(
      'div.row',
      { title },
      h('span.what', {}, w.label),
      h('b', { class: level(w.pct) }, `${pct}%`),
      w.resetsAt ? h('span.reset', {}, `resets ${fmtReset(w.resetsAt, now)}`) : null,
    ),
    h('div.meter', { class: level(w.pct), title, role: 'progressbar', 'aria-label': w.label, 'aria-valuenow': pct }, h('div.fill', { style: `width:${w.pct}%` })),
  ];
}

/** Which provider's card is showing (remembered in this browser): Claude, Codex, and more as they're built in. */
let shown = (() => {
  try {
    return localStorage.getItem('agent-office.limitsProvider') ?? 'Claude';
  } catch {
    return 'Claude';
  }
})();

/**
 * Plan limits, one provider at a time so the panel never stacks up: Claude's 5-hour session and week, then Codex,
 * Gemini, Grok... as readers exist for them (server/provider-limits.ts). ‹ › step between them.
 */
export function renderLimits() {
  const s = store.limits;
  const el = $('limits');
  const cards = [
    ...(s.windows.length ? [{ provider: 'Claude', plan: s.plan, windows: s.windows, at: s.at }] : []),
    ...(s.providers ?? []).filter((p) => p.windows.length),
  ];
  el.classList.toggle('hidden', !cards.length);
  if (!cards.length) return;
  let i = Math.max(0, cards.findIndex((c) => c.provider === shown));
  const card = cards[i];
  const go = (step: number) => (e: Event) => {
    e.stopPropagation();
    i = (i + step + cards.length) % cards.length;
    shown = cards[i].provider;
    try {
      localStorage.setItem('agent-office.limitsProvider', shown);
    } catch {
      // storage blocked: it just won't be remembered
    }
    renderLimits();
  };
  const now = Date.now();
  const plan = card.plan ? card.plan.charAt(0).toUpperCase() + card.plan.slice(1) : '';
  const arrows = cards.length > 1;
  el.replaceChildren(
    h(
      'h3',
      {},
      arrows ? h('button.limits-arrow', { onclick: go(-1), title: 'Previous provider', 'aria-label': 'Previous provider' }, '‹') : null,
      `${card.provider} limits`,
      plan ? h('span.plan', {}, plan) : null,
      arrows ? h('button.limits-arrow', { onclick: go(1), title: `Next provider (${i + 1} of ${cards.length})`, 'aria-label': 'Next provider' }, '›') : null,
      panelHide('limits'),
    ),
    ...card.windows.flatMap((w) => windowRow(w, now)),
  );
  if (now - card.at > STALE_MS) el.append(h('div.row.muted', {}, `As of ${new Date(card.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`));
}
