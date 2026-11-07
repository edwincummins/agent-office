import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Sky } from '../src/server/sky.js';
import { parseSkyLocation } from '../src/shared/sky-location.js';
import { describeWeatherReport } from '../src/shared/weather-report.js';
import { visitorMessage } from '../src/server/owner-workers/access.js';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const device = { kind: 'device' as const, lat: 37.775, lon: -122.419, utcOffset: -480, deviceId: 'test-browser' };
const reply = (code: number) => Response.json({ current: { weather_code: code, temperature_2m: 12 }, utc_offset_seconds: -28800 });

test('location accepts bounded coordinates and city names, and rounds computer location', () => {
  assert.deepEqual(parseSkyLocation(device), { ...device, lat: 37.78, lon: -122.42 });
  assert.deepEqual(parseSkyLocation({ kind: 'city', city: ' Paris, France ' }), { kind: 'city', city: 'Paris, France' });
  assert.equal(parseSkyLocation(null), null);
  for (const bad of [{ ...device, lat: 91 }, { ...device, lon: Infinity }, { ...device, lat: '37' }, { ...device, deviceId: '<script>' }, { kind: 'city', city: '' }, { kind: 'city', city: 'x'.repeat(121) }, undefined])
    assert.equal(parseSkyLocation(bad), undefined);
  assert.equal(visitorMessage('sky.location'), false);
});

test('selected computer survives restart, selects real time, and default restores configured city', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'sky-location-'));
  t.after(() => { assert.ok(root.startsWith(path.join(tmpdir(), 'sky-location-'))); rmSync(root, { recursive: true, force: true }); });
  const opts = { city: '10,20', locationFile: path.join(root, 'location.json'), clockFile: path.join(root, 'clock.json') };
  const fetch = t.mock.method(globalThis, 'fetch', async () => reply(61));
  const sky = new Sky(opts, () => {});
  assert.equal(sky.setLocation(device), undefined);
  assert.equal(sky.state.realTime, true);
  assert.equal(sky.state.utcOffset, -480);
  const restarted = new Sky(opts, () => {});
  t.after(() => restarted.stop());
  assert.deepEqual(restarted.state.location, parseSkyLocation(device));
  assert.equal(restarted.state.realTime, true);
  restarted.start();
  await settle();
  assert.equal(restarted.state.city, 'Selected computer');
  assert.match(String(fetch.mock.calls[0].arguments[0]), /latitude=37.78&longitude=-122.42/);
  restarted.setLocation(null);
  await settle();
  assert.equal(restarted.state.location, undefined);
  assert.equal(restarted.state.lat, 10);
  assert.equal(restarted.state.lon, 20);
});

test('a forecast from an old location cannot overwrite the newer location', async (t) => {
  let finish!: (response: Response) => void;
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => ++count === 1 ? new Promise<Response>((resolve) => { finish = resolve; }) : reply(71));
  const sky = new Sky({ city: '1,2' }, () => {});
  t.after(() => sky.stop());
  sky.start();
  await settle();
  sky.setLocation(device);
  await settle();
  assert.equal(sky.state.weather, 'snow');
  finish(reply(61));
  await settle();
  assert.equal(sky.state.weather, 'snow');
  assert.equal(sky.state.lat, 37.78);
});

test('failed persistence and invalid location preserve the previous choice', () => {
  const sky = new Sky({ locationFile: path.join(tmpdir(), 'nonexistent-sky-directory', 'location.json') }, () => {});
  const before = structuredClone(sky.state);
  assert.match(sky.setLocation(device)!, /could not be saved/);
  assert.deepEqual(sky.state, before);
  assert.match(sky.setLocation({ ...device, lat: NaN })!, /valid/);
  assert.deepEqual(sky.state, before);
});

test('weather wording distinguishes placeholders, old receipts and explicit overrides', () => {
  assert.match(describeWeatherReport(), /unavailable/);
  assert.match(describeWeatherReport({ source: 'forecast', status: 'unavailable' }), /placeholder/);
  assert.match(describeWeatherReport({ source: 'forecast', status: 'current', fetchedAt: 0 }, 31 * 60_000), /overdue/);
  assert.match(describeWeatherReport({ source: 'forecast', status: 'stale', fetchedAt: 0 }, 60_000), /failed/);
  assert.match(describeWeatherReport({ source: 'pinned' }), /pinned/);
});
