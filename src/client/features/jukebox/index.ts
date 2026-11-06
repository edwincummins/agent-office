import {fixturesOf} from '../../world/fixtures/handles';
import { trackTitle } from '../../../shared/jukebox';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { clip } from '../../ui/dom';
import { openJukebox } from './ui';
import type { SettingsPane } from '../../ui/settings';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    jukebox: true;
  }
}

export interface JukeboxDeps {
  /** Settings, open at `pane` (the music's volume is under Sound). */
  showSettings(pane?: SettingsPane): void;
}

/** The jukebox on your floor, the office's own: what's on, and E to put a song on. */
export function installJukebox(ctx: Ctx, deps: JukeboxDeps) {
  // The jukebox on your floor: everyone there hears it from the same bar, and its lights say what's on.
  // It's the office's: on a map of its own there's none to hear.
  function playJukebox() {
    const j = store.jukebox;
    ctx.sound.setJukebox(j.on && !!fixturesOf(ctx.world()).jukebox ? { track: j.track, url: j.url, startedAt: j.startedAt, since: j.since } : null);
    fixturesOf(ctx.world()).jukebox?.show(j.on, trackTitle(j));
    const slot=ctx.plan().slots.jukebox;if(slot)ctx.sound.setJukeboxPosition({...slot.position,y:slot.position.y+slot.size.height*.75/1.85});
  }
  store.on('jukebox', playJukebox);
  let active=ctx.world();
  ctx.ticks.add('play',({t,dt})=>{if(active!==ctx.world()){active=ctx.world();playJukebox();}if(!ctx.inOffice())fixturesOf(active).jukebox?.update(t,dt,ctx.sound.beat());});
  ctx.interactions.define('jukebox', {
    // Anywhere in the lounge, beanbags and sofa included (Fetty, 11-05: 4 m meant walking over every time).
    reach: 14,
    hint: () => {
      const j = store.jukebox;
      const what = j.on ? trackTitle(j) : '';
      return { k: `${j.on}|${what}`, parts: [hintTitle('🎵 Jukebox'), aside(j.on ? `♪ ${clip(what, 40)}` : 'off'), key('E', j.on ? 'Change the song' : 'Put on a song')] };
    },
    use: onE(() => showJukebox()),
  });

  function showJukebox() {
    openJukebox(ctx.net, () => deps.showSettings('sound'));
  }

  return { playJukebox };
}
