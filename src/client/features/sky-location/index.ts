import type { Ctx } from '../../core/context';
import type { Net } from '../../net';
import { store } from '../../state';
import { parseSkyLocation } from '../../../shared/sky-location';

let net: Net;
let watcher: number | undefined;
let epoch = 0;
let message = '';
let deviceId = '';
const listeners = new Set<() => void>();
const key = 'office-sky-device';

export function locationNotice() { return message; }
export function onLocationNotice(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function notice(text: string) { message = text; for (const fn of listeners) fn(); }
export function stopComputerLocation() {
  epoch++;
  if (watcher !== undefined) navigator.geolocation.clearWatch(watcher);
  watcher = undefined;
  notice('');
}

/** Only an explicit click may request the browser's location permission. */
export function followComputerLocation() {
  if (!store.me.owner) return;
  stopComputerLocation();
  if (!navigator.geolocation) return notice('Location is unavailable here. Choose a city below.');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    try { localStorage.setItem(key, deviceId); } catch { /* This tab can still follow. */ }
  }
  const generation = epoch;
  notice('Locating this computer…');
  watcher = navigator.geolocation.watchPosition((position) => {
    if (generation !== epoch || !store.me.owner) return;
    const location = parseSkyLocation({ kind: 'device', lat: position.coords.latitude, lon: position.coords.longitude, utcOffset: -new Date().getTimezoneOffset(), deviceId });
    if (!location) return notice('The computer returned an invalid location. Choose a city below.');
    if (JSON.stringify(location) !== JSON.stringify(store.sky?.location)) net.send({ t: 'sky.location', location });
    notice('Following this computer while this browser is open.');
  }, (error) => {
    if (generation !== epoch) return;
    if (error.code === 1) stopComputerLocation();
    notice(error.code === 1 ? 'Location permission was denied. Choose a city below.' : 'Location is unavailable. Keeping the last selection; you can choose a city below.');
  }, { enableHighAccuracy: false, maximumAge: 300_000, timeout: 15_000 });
}

export function installSkyLocation(ctx: Ctx) {
  net = ctx.net;
  try { deviceId = localStorage.getItem(key) ?? ''; } catch { /* Storage may be disabled. */ }
  ctx.messages.on('welcome', async () => {
    stopComputerLocation();
    const location = store.sky?.location;
    if (!store.me.owner || location?.kind !== 'device' || location.deviceId !== deviceId) return;
    const generation = epoch;
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (generation !== epoch) return;
      if (permission.state === 'granted') followComputerLocation();
      else notice('Use “Follow this computer” to allow location, or choose a city.');
    } catch { notice('Use “Follow this computer” to resume location updates.'); }
  });
  store.on('sky', () => {
    const location = store.sky?.location;
    if (watcher !== undefined && (location?.kind !== 'device' || location.deviceId !== deviceId)) stopComputerLocation();
  });
  window.addEventListener('pagehide', stopComputerLocation);
}
