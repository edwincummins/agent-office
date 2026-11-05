import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Jukebox } from '../src/server/jukebox';

test('saved links survive a restart, rename on save again, and can be forgotten', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jb-'));
  const a = new Jukebox(dir);
  assert.equal(a.saveLink('Lofi', 'https://example.com/lofi.mp3'), undefined);
  a.saveLink('Radio', 'https://example.com/live.mp3');
  a.saveLink('Lofi beats', 'https://example.com/lofi.mp3');
  const b = new Jukebox(dir);
  assert.deepEqual(b.state().saved?.map((x) => x.name), ['Lofi beats', 'Radio']);
  b.play({ url: 'https://example.com/live.mp3' }, 'Fetty');
  assert.equal(b.state().saved?.length, 2);
  assert.equal(b.forget('https://example.com/live.mp3'), true);
  assert.deepEqual(new Jukebox(dir).state().saved?.map((x) => x.name), ['Lofi beats']);
});
