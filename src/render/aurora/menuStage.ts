import type { GraphicsSettings } from '../../game/graphics';
import type { VenueId } from '../venues/catalog';
import { StageView } from '../stage/StageView';

/**
 * The menus' stage, kept alive across remounts.
 *
 * The menu background can be unmounted and mounted again in quick succession: moving between
 * screens that each carry it, a settings change that leaves the graphics as they were, React
 * re-running effects, a hot update during development. Building a stage takes a moment and its
 * canvas fades in from nothing, so tearing it down every time shows as the menu going black. Here
 * one stage is held for as long as something uses it and a little longer; a new user with the same
 * graphics settings and venue simply takes its canvas over.
 */
interface Held {
  key: string;
  stage: StageView;
  users: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** How long an unused stage is kept before its GPU memory is freed, ms. */
const LINGER = 1500;
let held: Held | null = null;

function drop(h: Held) {
  if (h.timer) clearTimeout(h.timer);
  h.stage.dispose();
}

/** The menu stage for these settings, shown in `host`. Pair every call with `releaseMenuStage`. */
export function acquireMenuStage(host: HTMLElement, g: GraphicsSettings, venue: VenueId): StageView {
  const key = JSON.stringify([g, venue]);
  if (held && held.key !== key) {
    drop(held);
    held = null;
  }
  if (!held) {
    const mine: Held = { key, users: 0, timer: null, stage: new StageView(host, g, { mode: 'menu', venue }) };
    mine.stage.ready.catch(() => {
      if (held === mine) held = null;
    });
    held = mine;
  }
  const h = held;
  if (h.timer) {
    clearTimeout(h.timer);
    h.timer = null;
  }
  h.users++;
  h.stage.attach(host);
  return h.stage;
}

export function releaseMenuStage() {
  const h = held;
  if (!h) return;
  h.users = Math.max(0, h.users - 1);
  if (h.users > 0 || h.timer) return;
  h.timer = setTimeout(() => {
    h.timer = null;
    if (held !== h || h.users > 0) return;
    held = null;
    drop(h);
  }, LINGER);
}
