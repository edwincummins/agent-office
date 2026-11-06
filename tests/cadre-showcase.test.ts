import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ansiFrame, forGuest } from '../src/server/fleet/showcase.js';

// Fetty, 11-06: guests see the real Cadre, read-only, cut to the teams he allows and masked.
const fleet = { teams: [{ rig: 'office-lab' }, { rig: 'psp-ops' }], seats: [{ session: 'a@office-lab', rig: 'office-lab', tail: ['token=supersecretvalue1'] }, { session: 'b@psp-ops', rig: 'psp-ops', tail: ['payout'] }], needs: [{ rig: 'office-lab', summary: 'SHIP it' }] };
const visible = (t: string) => t === 'office-lab';

test('a guest sees only allowed teams, masked', () => {
  const g = forGuest(fleet, visible, true, true) as typeof fleet;
  assert.deepEqual(g.teams.map((t) => t.rig), ['office-lab']);
  assert.deepEqual(g.seats.map((s) => s.rig), ['office-lab']);
  assert.ok(!JSON.stringify(g).includes('supersecretvalue1'));
});

test('the eye removes cards and terminal text for guests', () => {
  const g = forGuest(fleet, visible, false, false) as any;
  assert.deepEqual(g.needs, []);
  assert.equal(g.seats[0].tail, undefined);
});

test('a colour screen becomes a terminal redraw', () => {
  const f = ansiFrame({ cols: 20, rows: 2, lines: [[['hi', 2, -1, 1]], [['there', '#ff0000', -1, 0]]] });
  assert.match(f, /\x1b\[0;1;38;5;2;49mhi/);
  assert.match(f, /38;2;255;0;0/);
});
