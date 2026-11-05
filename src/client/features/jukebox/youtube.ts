// YouTube and YouTube Music on the jukebox. Those links are pages, not audio files, so an <audio> element can't play
// them ("can't play that stream in your browser"). YouTube's own IFrame player can: a hidden 1×1 player plays the
// video's sound, everyone starts at the same point (the jukebox's clock), and it fades with distance like a stream.
// No keys and no account; a playlist link plays the playlist.

/** The video or playlist in a youtube.com / music.youtube.com / youtu.be link, or null for anything else. */
export function youTubeOf(url: string): { video?: string; list?: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const id = (s: string | null | undefined) => (s && /^[\w-]{6,64}$/.test(s) ? s : undefined);
  let video: string | undefined;
  if (host === 'youtu.be') video = id(u.pathname.slice(1));
  else if (host === 'youtube.com' || host === 'music.youtube.com') {
    video = id(u.searchParams.get('v')) ?? id(u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1]);
  } else return null;
  const list = id(u.searchParams.get('list'));
  return video || list ? { ...(video ? { video } : {}), ...(list ? { list } : {}) } : null;
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  nextVideo(): void;
  seekTo(s: number, allow: boolean): void;
  setVolume(v: number): void;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: { ENDED: number; PLAYING: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  api ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      api = null;
      reject(new Error('YouTube player could not load'));
    };
    document.head.append(s);
  });
  return api;
}

/** A stream-shaped YouTube player: the jukebox uses `paused`, `volume`, `play()` and `stop()` as with <audio>. */
export class YouTubeStream {
  paused = true;
  private player: YTPlayer | null = null;
  private host: HTMLDivElement;
  private vol = 0.5;
  private stopped = false;
  private skips = 0;
  private unfocus: () => void = () => {};

  constructor(
    link: { video?: string; list?: string },
    private readonly at: () => number,
    onError: (text: string) => void,
  ) {
    this.host = document.createElement('div');
    this.host.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;opacity:0;pointer-events:none';
    // Inert: the browser never gives it focus or clicks, so it can't take your movement keys.
    this.host.inert = true;
    const slot = document.createElement('div');
    this.host.append(slot);
    document.body.append(this.host);
    // The hidden player must never hold the keyboard (11-05: it took focus on start and WASD stopped moving you).
    this.unfocus = () => setTimeout(() => {
      const f = this.host.querySelector('iframe');
      if (f && document.activeElement === f) {
        f.blur();
        window.focus();
      }
    }, 0);
    window.addEventListener('blur', this.unfocus);
    loadApi()
      .then(() => {
        if (this.stopped || !window.YT) return;
        this.player = new window.YT.Player(slot, {
          width: 1,
          height: 1,
          ...(link.video ? { videoId: link.video } : {}),
          playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, loop: 1, ...(link.list ? { listType: 'playlist', list: link.list } : link.video ? { playlist: link.video } : {}) },
          events: {
            onReady: () => {
              const f = this.host.querySelector('iframe');
              if (f) {
                f.tabIndex = -1;
                f.setAttribute('aria-hidden', 'true');
              }
              this.unfocus();
              this.setVolume(this.vol);
              this.sync();
              this.player?.playVideo();
            },
            onStateChange: (e: { data: number }) => {
              this.paused = e.data !== window.YT?.PlayerState.PLAYING;
            },
            onError: (e: { data: number }) => {
              // In a playlist, a song its owner keeps on YouTube is skipped rather than stopping the music.
              if (link.list && link.list !== 'LM' && link.list !== 'LL' && (e.data === 101 || e.data === 150) && ++this.skips < 25) return this.player?.nextVideo();
              onError(link.list === 'LM' || link.list === 'LL' ? '📻 Your Liked Music list is private to YouTube. Make a playlist from it and set it to Unlisted' : e.data === 100 ? "📻 YouTube can't find that one (deleted or private). Private playlists don't play outside YouTube; set it to Unlisted" : e.data === 101 || e.data === 150 ? "📻 That song's owner doesn't allow it outside YouTube. Try another song, or a playlist (it skips ahead)" : '📻 YouTube didn’t understand that link. Use Share → Copy link on the song or playlist');
            },
          },
        });
      })
      .catch(() => onError('📻 The YouTube player could not load'));
  }

  /** Lines up with everyone else: the jukebox's time into the track, wrapped by the video's length. */
  sync() {
    const d = this.player?.getDuration() ?? 0;
    if (d > 0) this.player?.seekTo(this.at() % d, true);
  }

  play(): Promise<void> {
    this.player?.playVideo();
    return Promise.resolve();
  }

  get volume() {
    return this.vol;
  }
  set volume(v: number) {
    this.setVolume(v);
  }
  private setVolume(v: number) {
    this.vol = Math.max(0, Math.min(1, v));
    this.player?.setVolume(Math.round(this.vol * 100));
  }

  stop() {
    this.stopped = true;
    window.removeEventListener('blur', this.unfocus);
    try {
      this.player?.stopVideo();
      this.player?.destroy();
    } catch {
      // already gone
    }
    this.host.remove();
  }
}
