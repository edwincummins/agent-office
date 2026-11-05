import { personalSettings } from '../../ui/settings-registry';
import type { Ctx } from '../../core/context';
import { h } from '../../ui/dom';
import { DEFAULT_SENSITIVITY, mouseSensitivity, setMouseSensitivity } from './value';

export function installMouseSensitivity(_ctx: Ctx) {
  personalSettings.push(() => {
    const slider = h('input', { type: 'range', min: 10, max: 200, step: 5, 'aria-label': 'Mouse sensitivity' });
    const value = h('output', { 'aria-live': 'polite' });
    const reset = h('button.btn', { type: 'button' }, 'Reset');
    const paint = () => {
      const percent = Math.round(mouseSensitivity() * 100);
      slider.value = String(percent);
      slider.style.setProperty('--fill', `${(percent - 10) / 190 * 100}%`);
      value.textContent = `${percent}%`;
    };
    slider.addEventListener('input', () => { setMouseSensitivity(Number(slider.value) / 100); paint(); });
    reset.addEventListener('click', () => { setMouseSensitivity(DEFAULT_SENSITIVITY); paint(); });
    paint();
    return h('div.setting', {}, h('div.setting-head', {}, h('h4', {}, 'Mouse sensitivity')),
      h('div.volume', {}, slider, value, reset),
      h('p.setting-note', {}, 'Lower is slower. Applies immediately in every map, including drag-to-look. Saved only in this browser. Default: 50%.'));
  });
}
