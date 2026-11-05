import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youTubeOf } from '../src/client/features/jukebox/youtube';

test('YouTube and YouTube Music links become a video or playlist; anything else is left to <audio>', () => {
  assert.deepEqual(youTubeOf('https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share'), { video: 'dQw4w9WgXcQ' });
  assert.deepEqual(youTubeOf('https://youtu.be/dQw4w9WgXcQ'), { video: 'dQw4w9WgXcQ' });
  assert.deepEqual(youTubeOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123456789'), { video: 'dQw4w9WgXcQ', list: 'PL123456789' });
  assert.deepEqual(youTubeOf('https://music.youtube.com/playlist?list=OLAK5uy_abcdef'), { list: 'OLAK5uy_abcdef' });
  assert.equal(youTubeOf('https://music.youtube.com/'), null);
  assert.equal(youTubeOf('https://example.com/radio.mp3'), null);
});

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Jukebox } from '../src/server/jukebox';

test('saved links survive a restart, rename on save again, and can be forgotten', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jb-'));
  const a = new Jukebox(dir);
  assert.equal(a.saveLink('Focus mix', 'https://music.youtube.com/playlist?list=OLAK5uy_abcdef'), undefined);
  a.saveLink('Radio', 'https://example.com/live.mp3');
  a.saveLink('Focus', 'https://music.youtube.com/playlist?list=OLAK5uy_abcdef');
  const b = new Jukebox(dir);
  assert.deepEqual(b.state().saved?.map((x) => x.name), ['Focus', 'Radio']);
  b.play({ url: 'https://example.com/live.mp3' }, 'Fetty');
  assert.equal(b.state().saved?.length, 2);
  assert.equal(b.forget('https://example.com/live.mp3'), true);
  assert.deepEqual(new Jukebox(dir).state().saved?.map((x) => x.name), ['Focus']);
});
