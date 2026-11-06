import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { accountProfile, saveAccountProfile } from '../src/server/office/account-profiles.js';

// Fetty, 11-06: his character must be the same on every browser he signs in from.
test('an account keeps its character across browsers', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'profiles-'));
  try {
    assert.equal(accountProfile(dir, 'a1'), undefined);
    saveAccountProfile(dir, 'a1', '#ef476f', { skin: 6, hair: 9, style: 6 } as never);
    assert.deepEqual(accountProfile(dir, 'a1')?.color, '#ef476f');
    saveAccountProfile(dir, 'a1', 'not-a-colour', { skin: 1, hair: 1, style: 1 } as never);
    assert.equal(accountProfile(dir, 'a1')?.color, '#ef476f');
    assert.equal(accountProfile(dir, undefined), undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
