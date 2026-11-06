import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visitorMessage } from '../src/server/owner-workers/access.js';

// Fetty, 11-06: the owner can stop anyone's screen share and put his up; a guest can't do that to him.
test('only the owner may take the screen', () => {
  assert.equal(visitorMessage('share.take'), false);
  assert.equal(visitorMessage('voice'), true);
});

test('a share carries its sound, played apart from proximity voice', () => {
  const src = readFileSync(new URL('../src/client/voice.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /audio: false/);
  assert.match(src, /shareAudioSender = c\.pc\.addTrack\(sound, this\.screen\)/);
  assert.match(src, /c\.shareAudio\.srcObject = stream/);
});
