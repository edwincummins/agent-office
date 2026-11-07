import type { Net } from '../net';
import { store } from '../state';
import { h } from './dom';
import { followComputerLocation, stopComputerLocation, locationNotice, onLocationNotice } from '../features/sky-location';
import { describeWeatherReport } from '../../shared/weather-report';

export function skyLocationSetting(net: Net) {
  const status = h('p.setting-note', { role: 'status' });
  const notice = h('p.setting-note', { role: 'status' });
  const city = h('input', { type: 'text', placeholder: 'City, region or country', 'aria-label': 'Weather city', maxlength: 120 });
  const follow = h('button.btn', { type: 'button', onclick: followComputerLocation }, 'Follow this computer');
  const choose = h('button.btn', { type: 'submit' }, 'Use city');
  const reset = h('button.btn', { type: 'button', onclick: () => {
    stopComputerLocation(); net.send({ t: 'sky.location', location: null });
  } }, 'Use server default');
  const form = h('form', { onsubmit: (event) => {
    event.preventDefault();
    if (!city.value.trim() || !store.me.owner) return;
    stopComputerLocation();
    net.send({ t: 'sky.location', location: { kind: 'city', city: city.value.trim() } });
  } }, city, choose);
  const paint = () => {
    status.textContent = describeWeatherReport(store.sky?.weatherReport);
    notice.textContent = locationNotice();
    for (const control of [city, follow, choose, reset]) control.disabled = !store.me.owner;
  };
  const section = h('div', {}, status, follow, form, reset,
    h('p.setting-note', {}, 'The owner selects the sky for everyone. Computer location uses browser permission and approximate coordinates, shared with this office and its weather provider. Selection uses real time; the server keeps the last location when this browser closes.'), notice);
  const offSky = store.on('sky', paint);
  const offMe = store.on('me', paint);
  const offNotice = onLocationNotice(paint);
  const timer = window.setInterval(paint, 60_000);
  paint();
  return { section, off() { offSky(); offMe(); offNotice(); clearInterval(timer); } };
}
