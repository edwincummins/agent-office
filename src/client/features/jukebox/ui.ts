import './ui.css';
import { JUKEBOX_TUNES, STREAM, checkStreamUrl, trackTitle, tuneById } from '../../../shared/jukebox';
import type { Net } from '../../net';
import { store } from '../../state';
import { h, openModal, toast } from '../../ui/dom';

/**
 * Your own YouTube Music, signed in as you: private playlists, Liked Music and Premium play there, which YouTube never
 * allows inside an embedded player. A small window of your browser, reused if it's already open.
 */
const isYouTube = (u: string) => /^https://(music.|www.|m.)?youtube.com/|^https://youtu.be//i.test(u);
const openYouTubeMusic = (u: string) => window.open(u.replace(/^https://(www.|m.)?youtube.com//i, 'https://music.youtube.com/'), 'ytmusic', 'popup,width=520,height=760');

/** The jukebox: what's on, the tunes to pick from, skip and stop, and a box for a stream. */
export function openJukebox(net: Net, openVolume: () => void) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const now = h('div.jb-now');
  const list = h('ul.svc-list');
  const url = h('input', { type: 'text', placeholder: 'https://… a YouTube / YouTube Music song or playlist, internet radio, or an .mp3', 'aria-label': 'Stream or audio file link', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const playUrl = h('button.btn.primary', { type: 'button' }, '📻 Play');
  const name = h('input', { type: 'text', placeholder: 'Name it (optional)', 'aria-label': 'Name for the saved link', maxlength: '60', autocomplete: 'off', style: 'max-width:180px' }) as HTMLInputElement;
  const saveUrl = h('button.btn', { type: 'button', title: 'Keep this link on the jukebox: one click to put it on again, every session' }, '☆ Save');
  const savedList = h('ul.svc-list');
  const savedLabel = h('label', { style: 'margin-top:16px' }, 'Your saved');
  const volume = h('button.btn', { type: 'button' }, '🔈 Your volume');
  const el = h(
    'div.modal.jukebox',
    { role: 'dialog', 'aria-label': 'Jukebox' },
    h('header', {}, h('h2', {}, '🎵 Jukebox'), close),
    h(
      'div.body',
      {},
      now,
      savedLabel,
      savedList,
      h('label', { style: 'margin-top:16px' }, 'Put on a tune'),
      list,
      h('label', { style: 'margin-top:16px' }, 'Or play a stream'),
      h('div.webhook', {}, url, playUrl),
      h('div.webhook', { style: 'margin-top:6px' }, name, saveUrl, h('button.btn', { type: 'button', title: 'Open the link in YouTube Music, signed in as you', onclick: () => { if (isYouTube(url.value.trim())) openYouTubeMusic(url.value.trim()); else window.open('https://music.youtube.com/', 'ytmusic', 'popup,width=520,height=760'); } }, '↗ YouTube Music')),
      h('p.setting-note', {}, 'A YouTube or YouTube Music song or playlist, internet radio, or an audio file. It plays from the jukebox, for everyone on this floor.'),
    ),
    h('footer', {}, h('span.grow', {}, 'Everyone on this floor hears the same song, louder the closer they are to the lounge.'), volume),
  );

  const button = (label: string, title: string, send: () => void, primary = false) => h(primary ? 'button.btn.primary' : 'button.btn', { type: 'button', title, onclick: send }, label);

  const render = () => {
    const j = store.jukebox;
    const stream = j.track === STREAM;
    now.replaceChildren(
      h('span.jb-disc', { class: j.on ? 'spin' : '' }, stream ? '📻' : '💿'),
      h(
        'div.svc-main',
        {},
        h('div.svc-title', {}, j.on ? trackTitle(j) : 'The jukebox is off'),
        h('div.svc-meta', {}, j.on ? [stream ? 'a stream' : tuneById(j.track)?.mood, j.by && `put on by ${j.by}`].filter(Boolean).join(' · ') : j.by ? `${j.by} turned it off` : 'Pick a tune to put it on'),
      ),
      j.on ? button('⏭️ Skip', 'On to the next tune', () => net.send({ t: 'jukebox.skip' })) : button('▶️ Play', `Put ${trackTitle(j)} back on`, () => net.send({ t: 'jukebox.play' }), true),
      j.on ? button('⏹️ Stop', 'Turn the jukebox off', () => net.send({ t: 'jukebox.stop' })) : '',
      stream && j.url && isYouTube(j.url) ? button('↗ YouTube Music', 'Open it in YouTube Music, signed in as you', () => openYouTubeMusic(j.url!)) : '',
    );
    // Saved links (your YouTube Music playlists, stations): click to put on, × to forget.
    const saved = j.saved ?? [];
    savedLabel.hidden = savedList.hidden = !saved.length;
    savedList.replaceChildren(
      ...saved.map((x) => {
        const playing = j.on && j.track === STREAM && j.url === x.url;
        const own = isYouTube(x.url) ? h('button.btn', { type: 'button', title: 'Play it in YouTube Music, signed in as you (private playlists, Liked Music, Premium)', onclick: (e: Event) => { e.stopPropagation(); openYouTubeMusic(x.url); } }, '↗ YouTube Music') : '';
        const forget = h('button.btn', { type: 'button', title: `Forget ${x.name}`, 'aria-label': `Forget ${x.name}`, onclick: (e: Event) => { e.stopPropagation(); net.send({ t: 'jukebox.forget', url: x.url }); } }, '×');
        const li = h('li', { class: playing ? 'on' : '', tabindex: 0, role: 'button', title: playing ? 'Playing now' : `Put on ${x.name}` }, h('span.jb-icon', {}, playing ? '🔊' : '⭐'), h('div.svc-main', {}, h('div.svc-title', {}, x.name), h('div.svc-meta', {}, trackTitle({ track: STREAM, url: x.url }))), own, forget);
        const pick = () => { if (!playing) net.send({ t: 'jukebox.play', url: x.url }); };
        li.addEventListener('click', pick);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        return li;
      }),
    );
    list.replaceChildren(
      ...JUKEBOX_TUNES.map((t) => {
        const playing = j.on && j.track === t.id;
        const li = h(
          'li',
          { class: playing ? 'on' : '', tabindex: 0, role: 'button', 'aria-pressed': String(playing), title: playing ? 'Playing now' : `Put on ${t.title}` },
          h('span.jb-icon', {}, playing ? '🔊' : '🎵'),
          h('div.svc-main', {}, h('div.svc-title', {}, t.title), h('div.svc-meta', {}, t.mood)),
        );
        const pick = () => {
          if (!playing) net.send({ t: 'jukebox.play', track: t.id });
        };
        li.addEventListener('click', pick);
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick();
          }
        });
        return li;
      }),
    );
  };

  const play = () => {
    const u = checkStreamUrl(url.value);
    if ('error' in u) {
      toast(u.error, 'warn');
      return url.focus();
    }
    net.send({ t: 'jukebox.play', url: u.url });
    url.value = '';
  };
  playUrl.addEventListener('click', play);
  // Saves the link in the box, or what's playing now when the box is empty.
  saveUrl.addEventListener('click', () => {
    const j = store.jukebox;
    const raw = url.value.trim() || (j.track === STREAM ? j.url ?? '' : '');
    const u = checkStreamUrl(raw);
    if ('error' in u) {
      toast('Paste a link to save (a YouTube Music playlist, a station...)', 'warn');
      return url.focus();
    }
    net.send({ t: 'jukebox.save', name: name.value.trim() || undefined, url: u.url });
    name.value = '';
    toast('⭐ Saved on the jukebox');
  });
  url.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') play();
  });

  const modal = openModal(el, { doing: '🎵 at the jukebox', onClose: store.on('jukebox', render) });
  close.addEventListener('click', () => modal.close());
  volume.addEventListener('click', () => {
    modal.close();
    openVolume();
  });
  render();
}
