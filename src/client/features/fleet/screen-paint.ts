// Draws a seat's coloured screen (server fleet/screens.ts) into its tile: one span per coloured run, scaled so the
// terminal's full width fits the tile, like the live Cadre tiles on the PC.
import type { FleetRun, FleetScreen } from '../../../shared/protocol/fleet';

const BASE = ['#1e2621', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#d8d3c4',
  '#5c6370', '#ef7b84', '#a8d58b', '#f0d08b', '#74bdf5', '#d58ae8', '#6fd0dc', '#ffffff'];
const FG = '#d8d3c4', BG = '#1e2621';

function palette(i: number): string {
  if (i < 16) return BASE[i];
  if (i < 232) {
    const n = i - 16, v = [0, 95, 135, 175, 215, 255];
    return `rgb(${v[Math.floor(n / 36)]},${v[Math.floor(n / 6) % 6]},${v[n % 6]})`;
  }
  const g = 8 + (i - 232) * 10;
  return `rgb(${g},${g},${g})`;
}
const css = (c: number | string, fallback: string) => (typeof c === 'string' ? c : c === -1 ? '' : c === -2 ? FG : c === -3 ? BG : c >= 0 ? palette(c) : fallback);

export function paintScreen(pre: HTMLElement, screen: FleetScreen) {
  const frag = document.createDocumentFragment();
  screen.lines.forEach((runs: FleetRun[], i) => {
    for (const [text, fg, bg, bold] of runs) {
      if (!text) continue;
      const span = document.createElement('span');
      span.textContent = text;
      const f = css(fg, FG), b = css(bg, '');
      if (f) span.style.color = f;
      if (b) span.style.background = b;
      if (bold) span.style.fontWeight = '700';
      frag.append(span);
    }
    if (i < screen.lines.length - 1) frag.append('\n');
  });
  pre.replaceChildren(frag);
  pre.classList.add('cadre-screen');
  // Fit the terminal's width to the tile (monospace cells are ~0.6em wide).
  const width = pre.clientWidth || 600;
  pre.style.fontSize = `${Math.max(6, Math.min(16, (width - 8) / (Math.max(40, screen.cols) * 0.6)))}px`;
  pre.style.lineHeight = '1.15';
}
