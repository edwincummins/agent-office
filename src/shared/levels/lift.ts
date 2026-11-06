import type { LiftMotion } from '../protocol/levels.js';
/** Same eased motion on every client; no per-frame network stream for the car. */
export function liftHeight(m: LiftMotion, now: number): number {
  const t = m.duration ? Math.max(0, Math.min(1, (now - m.started) / m.duration)) : 1;
  const ease = t * t * (3 - 2 * t);
  return m.from + (m.to - m.from) * ease;
}
export function liftMoving(m: LiftMotion, now: number): boolean {
  return now < m.started + m.duration;
}
