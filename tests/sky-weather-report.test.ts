import test from 'node:test';
import assert from 'node:assert/strict';
import { Sky } from '../src/server/sky.js';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const forecast = (code = 61) => Response.json({ current: { weather_code: code, temperature_2m: 12 }, utc_offset_seconds: 0 });

test('simulated and pinned conditions never claim to be a live forecast', () => {
  assert.deepEqual(new Sky({}, () => {}).state.weatherReport, { source: 'simulated' });
  assert.deepEqual(new Sky({ city: '1,2', weather: 'snow' }, () => {}).state.weatherReport, { source: 'pinned' });
});

test('forecast receipt, missed refresh and recovery preserve conditions and provenance', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fail = false;
  t.mock.method(globalThis, 'fetch', async () => {
    if (fail) throw new Error('offline');
    return forecast();
  });
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'log', () => {});
  const sky = new Sky({ city: '1,2', realTime: true }, () => {});
  t.after(() => sky.stop());
  assert.deepEqual(sky.state.weatherReport, { source: 'forecast', status: 'pending' });
  sky.start();
  await settle();
  const received = sky.state.weatherReport;
  assert.equal(received?.source, 'forecast');
  assert.ok(received && 'fetchedAt' in received && Number.isFinite(received.fetchedAt));
  assert.equal(sky.state.weather, 'rain');
  assert.equal(sky.state.realTime, true);
  fail = true;
  t.mock.timers.tick(15 * 60_000);
  await settle();
  assert.deepEqual(sky.state.weatherReport, { ...received, status: 'stale' });
  assert.equal(sky.state.weather, 'rain');
  fail = false;
  t.mock.timers.tick(15_000);
  await settle();
  assert.equal(sky.state.weatherReport?.source === 'forecast' && sky.state.weatherReport.status, 'current');
});

test('first failure is unavailable and unresolved cities fall back explicitly to simulation', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  const sky = new Sky({ city: '1,2' }, () => {});
  t.after(() => sky.stop());
  sky.start();
  await settle();
  assert.deepEqual(sky.state.weatherReport, { source: 'forecast', status: 'unavailable' });
  fetch.mock.mockImplementation(async () => Response.json({ results: [] }));
  const missing = new Sky({ city: 'Not a city' }, () => {});
  t.after(() => missing.stop());
  missing.start();
  await settle();
  assert.deepEqual(missing.state.weatherReport, { source: 'simulated' });
});

test('pinned weather remains pinned when its city forecast fails', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  const sky = new Sky({ city: '1,2', weather: 'snow' }, () => {});
  t.after(() => sky.stop());
  sky.start();
  await settle();
  assert.equal(sky.state.weather, 'snow');
  assert.deepEqual(sky.state.weatherReport, { source: 'pinned' });
});

test('stopped forecast cannot broadcast or reschedule after its request finishes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish!: (response: Response) => void;
  const fetch = t.mock.method(globalThis, 'fetch', () => new Promise<Response>((resolve) => { finish = resolve; }));
  let broadcasts = 0;
  const sky = new Sky({ city: '1,2' }, () => broadcasts++);
  t.after(() => sky.stop());
  sky.start();
  sky.start();
  await settle();
  assert.equal(fetch.mock.callCount(), 1);
  sky.stop();
  finish(forecast());
  await settle();
  t.mock.timers.tick(60 * 60_000);
  await settle();
  assert.equal(broadcasts, 0);
  assert.equal(fetch.mock.callCount(), 1);
});
