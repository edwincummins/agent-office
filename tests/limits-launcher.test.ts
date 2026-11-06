import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 11-06: a merge put node's spawn back in limits.ts; on Windows it can't start npm's claude.CMD, so the Claude limits
// card silently disappeared. The reader must use the Windows-safe launcher.
test('the Claude limits reader starts claude through cli-process', () => {
  const src = readFileSync(new URL('../src/server/limits.ts', import.meta.url), 'utf8');
  assert.match(src, /import \{ spawn \} from '\.\/cli-process\.js'/);
  assert.doesNotMatch(src, /from 'node:child_process'/);
});
