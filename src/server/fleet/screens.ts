// Colour terminals for the Cadre watch view (Fetty, 11-06): off the PC (his Mac, guests) Cadre showed only plain text
// tails. While someone has the watch view open, the office follows each seat's live stream from the engine
// (/api/stream, watch-only) through a headless xterm here on the PC, and about once a second sends the coloured screen
// of the seats that changed. Small text, not images; nothing runs while nobody is watching. Guests get a copy masked
// line by line (a line holding a secret keeps its masked text and loses its colours, so nothing slips through split
// across colour changes).
import headless from '@xterm/headless';
import type { FleetRun, FleetScreen } from '../../shared/protocol/fleet.js';
import { maskText } from './guests.js';

type Term = InstanceType<typeof headless.Terminal>;
interface Watch { seat: string; term?: Term; abort: AbortController; dirty: boolean; cols: number; rows: number; retry?: ReturnType<typeof setTimeout> }

type Cell = NonNullable<ReturnType<NonNullable<ReturnType<Term['buffer']['active']['getLine']>>['getCell']>>;
const colour = (mode: 'fg' | 'bg', cell: Cell): number | string => {
  const rgb = mode === 'fg' ? cell.isFgRGB() : cell.isBgRGB();
  const pal = mode === 'fg' ? cell.isFgPalette() : cell.isBgPalette();
  const v = mode === 'fg' ? cell.getFgColor() : cell.getBgColor();
  if (rgb) return '#' + v.toString(16).padStart(6, '0');
  if (pal) return v;
  return -1;
};

/** The visible screen as coloured runs per line: [text, fg, bg, bold]. */
export function screenOf(term: Term): FleetRun[][] {
  const buf = term.buffer.active, out: FleetRun[][] = [];
  for (let y = 0; y < term.rows; y++) {
    const line = buf.getLine(buf.viewportY + y), runs: FleetRun[] = [];
    if (!line) { out.push(runs); continue; }
    let cur: FleetRun | null = null;
    for (let x = 0; x < term.cols; x++) {
      const cell = line.getCell(x);
      if (!cell || cell.getWidth() === 0) continue;
      let fg = colour('fg', cell), bg = colour('bg', cell);
      if (cell.isInverse()) [fg, bg] = [bg === -1 ? -2 : bg, fg === -1 ? -3 : fg];
      const bold = cell.isBold() ? 1 : 0, ch = cell.getChars() || ' ';
      if (cur && cur[1] === fg && cur[2] === bg && cur[3] === bold) cur[0] += ch;
      else { cur = [ch, fg, bg, bold]; runs.push(cur); }
    }
    if (cur) cur[0] = cur[0].replace(/\s+$/, '');
    while (runs.length && !runs[runs.length - 1][0] && runs[runs.length - 1][2] === -1) runs.pop();
    out.push(runs);
  }
  return out;
}

/** A guest's copy: any line that masking changes becomes one plain run of its masked text. */
export function maskScreen(lines: FleetRun[][]): FleetRun[][] {
  return lines.map((runs) => {
    const text = runs.map((r) => r[0]).join('');
    const masked = maskText(text);
    return masked === text ? runs : [[masked, -1, -1, 0] as FleetRun];
  });
}

export class ScreenWatcher {
  private watches = new Map<string, Watch>();
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private engine: () => { url: string; token: string } | null, private emit: (screens: Record<string, FleetScreen>) => void) {}

  /** Follow exactly these seats (empty: stop everything). */
  follow(seats: string[]) {
    const want = new Set(seats.slice(0, 12));
    for (const [seat, w] of this.watches) if (!want.has(seat)) this.drop(seat, w);
    for (const seat of want) if (!this.watches.has(seat)) this.open(seat);
    if (want.size && !this.timer) this.timer = setInterval(() => this.flush(), 1000);
    if (!want.size && this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  /** Every followed seat's current screen, for someone who just opened the view. */
  all(): Record<string, FleetScreen> {
    const out: Record<string, FleetScreen> = {};
    for (const [seat, w] of this.watches) if (w.term) out[seat] = { cols: w.cols, lines: screenOf(w.term) };
    return out;
  }

  close() { this.follow([]); }

  private flush() {
    const out: Record<string, FleetScreen> = {};
    for (const [seat, w] of this.watches) if (w.dirty && w.term) { w.dirty = false; out[seat] = { cols: w.cols, lines: screenOf(w.term) }; }
    if (Object.keys(out).length) this.emit(out);
  }

  private drop(seat: string, w: Watch) {
    clearTimeout(w.retry);
    w.abort.abort();
    w.term?.dispose();
    this.watches.delete(seat);
  }

  private open(seat: string) {
    const w: Watch = { seat, abort: new AbortController(), dirty: false, cols: 0, rows: 0 };
    this.watches.set(seat, w);
    void this.run(w);
  }

  private async run(w: Watch) {
    const engine = this.engine();
    if (!engine) return;
    try {
      const res = await fetch(new URL(`/api/stream?seat=${encodeURIComponent(w.seat)}`, engine.url), { headers: { Authorization: `Bearer ${engine.token}` }, signal: w.abort.signal });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      w.cols = Math.min(400, Number(res.headers.get('x-cols')) || 120);
      w.rows = Math.min(120, Number(res.headers.get('x-rows')) || 40);
      w.term?.dispose();
      w.term = new headless.Terminal({ cols: w.cols, rows: w.rows, scrollback: 0, allowProposedApi: true });
      const term = w.term;
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        if (this.watches.get(w.seat) !== w) return;
        term.write(chunk, () => { w.dirty = true; });
      }
    } catch {
      if (w.abort.signal.aborted) return;
    }
    // The stream ended (seat restarted, engine reloaded): follow it again shortly while it's still wanted.
    if (this.watches.get(w.seat) === w) w.retry = setTimeout(() => { if (this.watches.get(w.seat) === w) void this.run(w); }, 5000);
  }
}
