import { test } from 'node:test';
import assert from 'node:assert/strict';
import headless from '@xterm/headless';
import { screenOf, maskScreen } from '../src/server/fleet/screens.js';

const write = (t: InstanceType<typeof headless.Terminal>, s: string) => new Promise<void>((r) => t.write(s, r));

test('a seat screen keeps its colours as runs', async () => {
  const t = new headless.Terminal({ cols: 40, rows: 3, scrollback: 0, allowProposedApi: true });
  await write(t, '\x1b[32mgreen\x1b[0m plain \x1b[1;31mbold red\x1b[0m');
  const [line] = screenOf(t);
  assert.deepEqual(line.map((r) => r[0]).join(''), 'green plain bold red');
  assert.equal(line[0][1], 2);
  assert.equal(line.find((r) => r[0].includes('bold'))![3], 1);
});

test('a guest copy masks any line holding a secret, whole', async () => {
  const t = new headless.Terminal({ cols: 80, rows: 2, scrollback: 0, allowProposedApi: true });
  await write(t, 'key \x1b[33msk-ant-REDACTED\x1b[0m\x1b[34mabcdef1234567890\x1b[0m\r\nok \x1b[32mfine\x1b[0m');
  const [secret, fine] = maskScreen(screenOf(t));
  const text = secret.map((r) => r[0]).join('');
  assert.ok(!text.includes('sk-ant') && !text.includes('abcdef1234567890'), text);
  assert.equal(secret.length, 1);
  assert.equal(fine.map((r) => r[0]).join(''), 'ok fine');
  assert.ok(fine.length > 1, 'clean lines keep their colours');
});
