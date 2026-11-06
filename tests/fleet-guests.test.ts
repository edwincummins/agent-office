import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestView, maskText, sanitizeGuests, DEFAULT_GUESTS } from '../src/server/fleet/guests.js';
import { visitorMessage } from '../src/server/owner-workers/access.js';
import type { FleetSnapshot } from '../src/shared/protocol/fleet.js';

const snap: FleetSnapshot = {
  status: 'ready', teams: ['office-lab', 'psp-ops'],
  seats: [
    { session: 'dev-build@office-lab', rig: 'office-lab', name: 'dev-build', state: 'working', activity: String.raw`editing C:\Users\Trade\rigs\x.ts`, tail: ['token=abc123secretvalue', 'ok line', 'key sk-ant-REDACTED-1234567890abcdef', 'mail fetty@example.com', '/home/kairos/secret'] },
    { session: 'lead@psp-ops', rig: 'psp-ops', name: 'lead', state: 'idle', activity: 'payouts', tail: ['account 12345'] },
  ],
  needs: [{ id: '1', rig: 'office-lab', seat: 'orch-lead', summary: 'SHIP PR #16' }, { id: '2', rig: 'psp-ops', seat: 'lead', summary: 'payout' }],
};

test('guests see only the teams he allows', () => {
  const v = guestView(snap, DEFAULT_GUESTS);
  assert.deepEqual(v.teams, ['office-lab']);
  assert.deepEqual(v.seats.map((s) => s.rig), ['office-lab']);
  assert.deepEqual(v.needs.map((n) => n.rig), ['office-lab']);
});

test('terminal text is masked before it leaves the PC', () => {
  const tail = guestView(snap, DEFAULT_GUESTS).seats[0].tail!.join('\n');
  for (const secret of ['abc123secretvalue', 'sk-ant-REDACTED', 'fetty@example.com', 'C:\Users', '/home/kairos']) assert.ok(!tail.includes(secret), secret);
  assert.match(tail, /ok line/);
  assert.ok(!guestView(snap, DEFAULT_GUESTS).seats[0].activity.includes('C:\Users'));
});

test('the eye hides terminals and gold cards entirely', () => {
  const v = guestView(snap, { ...DEFAULT_GUESTS, terminals: false, cards: false });
  assert.equal(v.seats[0].tail, undefined);
  assert.deepEqual(v.needs, []);
});

test('unknown or bad settings fail closed for teams', () => {
  const s = sanitizeGuests({ teams: { 'office-lab': 'yes', 'bad name!': true }, terminals: false });
  assert.deepEqual(s.teams, { 'office-lab': false });
  assert.equal(s.terminals, false);
  assert.equal(s.cards, true);
  assert.equal(maskText('plain words'), 'plain words');
});

test('guests may subscribe, only the owner may change what they see', () => {
  assert.equal(visitorMessage('fleet.subscribe'), true);
  assert.equal(visitorMessage('fleet.guests'), false);
});
