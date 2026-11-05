import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSensitivity, mouseSensitivity, setMouseSensitivity, SENSITIVITY_KEY } from '../src/client/features/mouse-sensitivity/value';

test('sensitivity defaults safely and bounds zero, negative and excessive values', () => {
  for (const value of [undefined, null, '', 'bad', NaN, Infinity]) assert.equal(normalizeSensitivity(value), .5);
  assert.equal(normalizeSensitivity(0), .1);
  assert.equal(normalizeSensitivity(-2), .1);
  assert.equal(normalizeSensitivity(10), 2);
  assert.equal(normalizeSensitivity(.75), .75);
});

test('browser preference loads, saves and applies even when persistence is unavailable', () => {
  const data = new Map([[SENSITIVITY_KEY, '.25']]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  } });
  assert.equal(mouseSensitivity(), .25);
  setMouseSensitivity(.5);
  assert.equal(data.get(SENSITIVITY_KEY), '0.5');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw Error('blocked'); } });
  assert.equal(setMouseSensitivity(.1), .1);
  assert.equal(mouseSensitivity(), .1);
  Reflect.deleteProperty(globalThis, 'localStorage');
});
