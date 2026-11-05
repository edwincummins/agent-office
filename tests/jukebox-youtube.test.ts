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
