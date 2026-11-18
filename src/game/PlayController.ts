import type { Chart } from '../chart/types';
import { AudioEngine } from '../audio/AudioEngine';
import { BandMeter } from '../audio/bands';
import { Highway } from '../render/Highway';
import { StageView } from '../render/stage/StageView';
import { barAt, barIntensity } from '../render/stage/LightShow';
import { resolveGraphics } from './graphics';
import { GameSession, type Results } from './GameSession';
import { Rumbler } from '../input/rumble';
import { barsLeft, findBreaks, type Break } from './breaks';
import { GamepadInput, KeyboardInput, TouchInput, type InputHandlers } from './input';
import { WINDOWS } from './judge';
import { GOLD_STARS, MAX_MULTIPLIER, multiplierFor, STREAK_PER_MULTIPLIER } from './scoring';
import { highwaySpeed, type Settings } from './settings';
import { resolveVenue, type VenueChoice, type VenueId } from '../render/venues/catalog';

export interface HudRefs {
  score: HTMLElement;
  multiplier: HTMLElement;
  /** The five stars' container; each child is one star. */
  stars: HTMLElement;
  /** The song's timeline (takes --song-p and --segments) and the time left beside it. */
  timeline: HTMLElement;
  remaining: HTMLElement;
  /** The tag that says how the last note was hit, the word on it, and the streak above it. */
  feedback: HTMLElement;
  feedbackWord: HTMLElement;
  feedbackStreak: HTMLElement;
  root: HTMLElement;
  /** One label per lane, positioned under its strike pad. */
  keys: HTMLElement[];
  /** The layer that takes touches for the lanes. */
  touchLayer: HTMLElement;
  /** The overdrive meter, which is also the button that starts overdrive. */
  overdriveButton: HTMLElement;
  /** Countdown shown during long breaks: the root, its number and its ring. */
  breakTimer: HTMLElement;
  breakNumber: HTMLElement;
  breakRing: SVGCircleElement;
}

export type PlayPhase = 'countdown' | 'playing' | 'paused' | 'finished';

const LEAD_IN = 3;

/** The venue the last song played in at random: the next one goes somewhere else. */
let lastRandom: VenueId | undefined;
function pickVenue(choice: VenueChoice): VenueId {
  if (choice !== 'random') return choice;
  return (lastRandom = resolveVenue(choice, Math.random() * 1e4, lastRandom));
}
/** How long the stage celebrates after the last note before the result comes up, seconds. */
export const FINALE_SECONDS = 4;

/**
 * Drives one play-through: audio, input, session and both renderers. Lives outside React
 * so the frame loop never triggers re-renders; React only sees phase changes and results.
 */
export class PlayController {
  readonly session: GameSession;
  private readonly highway: Highway;
  /** How loud the song is in the bass, middle and treble: for the highway's glow and the stage. */
  private readonly meter = new BandMeter();
  private meterAt = performance.now();
  /**
   * The 3D stage, drawn in a worker of its own (see StageView): the highway and the input never wait
   * for it. The highway stands before the plain night until it is built.
   */
  private stage: StageView | null = null;
  /** The stage on screen; while a rebuilt one (new graphics settings) is still being built, the old one. */
  private shownStage: StageView | null = null;
  private stageHost: HTMLElement | null = null;
  /** The graphics the newest stage was built with, as JSON. */
  private graphicsKey = '';
  /** The venue as chosen in the settings, and the one this song is played in. */
  private venueChoice: VenueChoice = 'moonrise';
  private venue: VenueId;
  private readonly barLevels: number[];
  private readonly input: KeyboardInput;
  private readonly padInput: GamepadInput;
  private readonly touchInput: TouchInput;
  private readonly observer: ResizeObserver;
  private readonly rumble: Rumbler;
  private raf = 0;
  private phase: PlayPhase = 'countdown';
  private lastBeat = -1;
  /** When the latest beat landed (performance.now ms), for the highway's swell of light. */
  private beatAt = -Infinity;
  private hudCache = { score: -1, mult: -1, streak: -1, od: -1, stars: -1, starP: -1, odActive: false, breakSec: -1, songP: -1, left: -1 };
  private readonly breaks: Break[];
  /** A beat fell in the frame being drawn, and how much bass there is right now (0..1). */
  private readonly barTimes: number[];
  private feedbackTimer = 0;
  private disposed = false;
  private lastCount = -1;
  private readonly downbeats: Set<number>;
  /** Song time the run starts at (0 unless a chart is test-played from the middle of the song). */
  private startAt = 0;
  /** Overdrive meter when overdrive was activated, for the progressive rumble. */
  private odMeterAtStart = 1;

  /** Keeps the song paused whatever is pressed (while the settings are open over the pause menu). */
  holdPause = false;
  private isFrozen = false;
  private frozenFrame = 0;

  /**
   * All but stops drawing the stage and the highway while the song is paused (the settings are open
   * over it): the picture stays on screen and the screen on top gets the machine to itself. A frame
   * is still drawn now and then, so a resized window is not left blank.
   */
  get frozen() {
    return this.isFrozen;
  }
  set frozen(on: boolean) {
    if (on === this.isFrozen) return;
    this.isFrozen = on;
    this.stage?.setRate(on ? 'frozen' : 'full');
    if (this.shownStage !== this.stage) this.shownStage?.setRate(on ? 'frozen' : 'full');
  }

  /** Seconds until the song is over, at the speed it plays (the lead-in counted). */
  get songLeft() {
    return Math.max(0, this.chart.duration - this.engine.time()) / this.engine.playbackRate;
  }

  onPhase: (p: PlayPhase, countdown?: number) => void = () => {};
  onFinish: (r: Results) => void = () => {};

  constructor(
    private readonly engine: AudioEngine,
    buffer: AudioBuffer,
    private readonly chart: Chart,
    settings: Settings,
    highwayCanvas: HTMLCanvasElement,
    private readonly hud: HudRefs,
    stageHost?: HTMLElement,
  ) {
    engine.load(buffer);
    engine.offset = settings.offsetMs / 1000;
    engine.volume = settings.volume;
    engine.onEnded = () => this.finish();

    this.downbeats = new Set(chart.downbeats);
    this.session = new GameSession(chart);
    // In development the running game can be reached from the console (to start overdrive, say).
    if (import.meta.env.DEV) (window as unknown as { __play?: PlayController }).__play = this;
    this.highway = new Highway(highwayCanvas, chart);
    this.highway.speed = highwaySpeed(settings.trackSpeed);
    this.breaks = findBreaks(chart);
    this.barTimes = chart.downbeats.map((i) => chart.beats[i]).filter((x) => x !== undefined);
    this.highway.attach(this.session);
    this.meter.setAnalyser(engine.analyser);
    this.barLevels = barIntensity(chart);
    this.graphicsKey = JSON.stringify(resolveGraphics(settings.graphics));
    this.venueChoice = settings.venue;
    this.venue = pickVenue(settings.venue);
    if (stageHost) {
      // Built once the highway is ready to draw: both compile their shaders in the same GPU process,
      // and the highway, which the player needs first, should not queue behind the stage's.
      void this.highway.ready.then(() => {
        if (this.disposed) return;
        this.stageHost = stageHost;
        this.buildStage();
      });
    }

    const padBindings = chart.lanes === 5 ? settings.pad5 : settings.pad4;
    this.rumble = new Rumbler(settings, chart.lanes, padBindings);
    this.session.on((e) => {
      if (e.type === 'hit') {
        this.flashFeedback(e.grade.toUpperCase(), e.grade, e.delta);
        this.rumble.hit(e.lane, e.grade);
        if (chart.notes[e.noteIndex].dur > 0) this.rumble.sustainStart(e.lane);
      } else if (e.type === 'miss') {
        this.flashFeedback('MISS', 'miss');
        this.rumble.miss(e.lane);
      } else if (e.type === 'release') {
        this.flashFeedback(e.grade.toUpperCase(), e.grade, e.delta);
        this.rumble.hit(e.lane, e.grade);
      } else if (e.type === 'release-miss') {
        this.flashFeedback(e.early ? 'TOO EARLY' : 'LET GO!', 'miss');
        this.rumble.miss(e.lane);
      } else if (e.type === 'sustain-end') this.rumble.sustainEnd(e.lane);
      else if (e.type === 'overdrive-start') {
        this.stage?.overdriveStart();
        this.odMeterAtStart = Math.max(this.session.overdrive, 0.01);
        this.rumble.overdrive();
      } else if (e.type === 'overdrive-end') this.rumble.overdriveEnd();
      else if (e.type === 'phrase-complete') {
        this.flashFeedback('CHARGED', 'od');
        this.rumble.phraseComplete();
      }
    });

    const keys = chart.lanes === 5 ? settings.keys5 : settings.keys4;
    const handlers: InputHandlers = {
      press: (lane, ts) => {
        if (this.phase !== 'playing') return;
        this.session.press(lane, this.engine.time(ts));
      },
      release: (lane, ts) => {
        if (this.phase !== 'playing') return;
        this.session.release(lane, this.engine.time(ts));
      },
      overdrive: () => {
        if (this.phase === 'playing') this.session.activateOverdrive();
      },
      pause: () => {
        // With the settings open over the pause menu, Esc and the pause button belong to them.
        if (this.holdPause) return;
        void (this.phase === 'paused' ? this.resume() : this.pause());
      },
    };
    this.input = new KeyboardInput(keys, settings.overdriveKey, handlers);
    // Controllers drive the menus while paused, so only take their input during play.
    this.padInput = new GamepadInput(
      padBindings,
      settings.padOverdrive,
      handlers,
      () => this.phase === 'playing' || this.phase === 'countdown',
    );

    // Touch: a finger anywhere in a lane's column plays that lane (the highway lights the lane).
    const vibrate = settings.touchHaptics && typeof navigator.vibrate === 'function';
    this.touchInput = new TouchInput(
      hud.touchLayer,
      (x, y) => this.highway.laneAt(x, y),
      handlers,
      (_lane, down) => {
        if (down && vibrate && this.phase === 'playing') navigator.vibrate(8);
      },
    );
    hud.overdriveButton.addEventListener('pointerdown', this.overdrivePress);

    // The canvas changes size with the window and when the touch pads take the bottom of the screen.
    this.drawTimeline();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(highwayCanvas);
    window.addEventListener('resize', this.resize);
    this.placeKeys();
  }

  private readonly resize = () => {
    this.highway.resize();
    this.placeKeys();
  };

  private readonly overdrivePress = (e: Event) => {
    e.preventDefault();
    if (this.phase === 'playing') this.session.activateOverdrive();
  };

  /** Lays the highway out again after the layout changed without the canvas changing size (another input in use). */
  relayout() {
    this.resize();
  }

  /**
   * The timeline's shape: thick where there are notes to play, a thin line through every longer
   * stretch without any (the intro, a break, the fade-out).
   */
  private drawTimeline() {
    const d = this.chart.duration;
    if (!(d > 0)) return;
    const min = Math.max(4, d * 0.02);
    const pct = (t: number) => `${((Math.min(d, Math.max(0, t)) / d) * 100).toFixed(2)}%`;
    let css = 'linear-gradient(to right';
    let free = 0;
    let from = 0;
    const quiet = (a: number, b: number) => {
      if (b - a < min) return;
      css += `, #000 ${pct(from)} ${pct(a)}, transparent ${pct(a)} ${pct(b)}`;
      from = b;
    };
    for (const n of this.chart.notes) {
      quiet(free, n.t);
      free = Math.max(free, n.t + n.dur);
    }
    quiet(free, d);
    this.hud.timeline.style.setProperty('--segments', `${css}, #000 ${pct(from)} 100%)`);
  }

  /** Puts the lane labels on the deck under their lanes and tells the HUD where the highway is. */
  private placeKeys() {
    const pos = this.highway.padScreenPositions();
    if (!pos.length) return;
    // The labels stand at the foot of the screen; the dial sits between them and the strike line.
    const foot = this.highway.footRow(Math.max(24, Math.min(46, window.innerHeight * 0.034)));
    foot.forEach((p, i) => {
      const key = this.hud.keys[i];
      if (key) key.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    });
    const first = pos[0];
    const last = pos[pos.length - 1];
    const laneW = pos.length > 1 ? (last.x - first.x) / (pos.length - 1) : 90;
    // On the play screen itself, so the highway canvas can read them as well as the HUD.
    const root = (this.hud.root.parentElement ?? this.hud.root).style;
    root.setProperty('--hw-x', `${((first.x + last.x) / 2).toFixed(1)}px`);
    root.setProperty('--hw-y', `${first.y.toFixed(1)}px`);
    root.setProperty('--hw-foot', `${(foot[0]?.y ?? first.y + 120).toFixed(1)}px`);
    root.setProperty('--lane-w', `${laneW.toFixed(1)}px`);
    root.setProperty('--hw-w', `${(laneW * pos.length).toFixed(1)}px`);
  }

  /**
   * Takes over the settings that can change in the middle of a song: volume, audio offset, note
   * speed, rumble and the stage's graphics. Bindings are read when a song starts.
   */
  applySettings(s: Settings) {
    this.engine.offset = s.offsetMs / 1000;
    this.engine.volume = s.volume;
    this.highway.speed = highwaySpeed(s.trackSpeed);
    this.rumble.update(s);
    const key = JSON.stringify(resolveGraphics(s.graphics));
    if (key === this.graphicsKey && s.venue === this.venueChoice) return;
    if (s.venue !== this.venueChoice) {
      this.venueChoice = s.venue;
      this.venue = pickVenue(s.venue);
    }
    this.graphicsKey = key;
    if (this.stageHost) this.buildStage();
  }

  /**
   * Builds the stage with the newest graphics settings. A stage already on screen stays there until
   * the new one has drawn, so changing the graphics in the middle of a song never shows a black
   * frame; a new one still being built when the settings change again is dropped for the next.
   */
  private buildStage() {
    const pending = this.stage !== this.shownStage ? this.stage : null;
    pending?.dispose();
    const stage = new StageView(this.stageHost!, JSON.parse(this.graphicsKey), { mode: 'play', part: this.chart.part, venue: this.venue });
    if (this.isFrozen) stage.setRate('frozen');
    this.stage = stage;
    stage.ready.then(
      () => {
        if (this.stage !== stage) return;
        if (this.shownStage !== stage) this.shownStage?.dispose();
        this.shownStage = stage;
      },
      (err) => {
        console.warn('3D stage unavailable', err);
        if (this.stage !== stage) return;
        stage.dispose();
        this.stage = this.shownStage;
      },
    );
  }

  /** Starts the run with its countdown. `from`: song time of its first moment, for a chart tested from the middle. */
  async start(from = 0) {
    this.startAt = Math.max(0, from);
    this.lastBeat = -1;
    while (this.lastBeat + 1 < this.chart.beats.length && this.chart.beats[this.lastBeat + 1] <= this.startAt - LEAD_IN) this.lastBeat++;
    this.setPhase('countdown');
    await this.engine.play(this.startAt - LEAD_IN, 0.05);
    this.loop();
  }

  pause() {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return;
    this.engine.pause();
    for (let l = 0; l < this.chart.lanes; l++) this.rumble.sustainEnd(l);
    this.rumble.overdriveEnd(true);
    this.setPhase('paused');
  }

  async resume() {
    if (this.phase !== 'paused') return;
    // Rewind slightly so the player can re-enter the groove.
    const at = Math.max(this.startAt - LEAD_IN, this.engine.time() - 1.5);
    this.session.dropHolds();
    await this.engine.play(at, 0.05);
    this.highway.reset();
    this.lastCount = -1;
    this.lastBeat = -1;
    while (this.lastBeat + 1 < this.chart.beats.length && this.chart.beats[this.lastBeat + 1] <= at) this.lastBeat++;
    this.setPhase(at < this.startAt ? 'countdown' : 'playing');
  }

  private setPhase(p: PlayPhase, countdown?: number) {
    this.phase = p;
    this.onPhase(p, countdown);
  }

  private finish() {
    if (this.phase === 'finished') return;
    this.session.update(Number.POSITIVE_INFINITY);
    this.setPhase('finished');
    this.stage?.finale(FINALE_SECONDS);
    this.onFinish(this.session.results());
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.frozen && this.phase === 'paused') {
      const now = performance.now();
      if (now - this.frozenFrame < 500) return;
      this.frozenFrame = now;
    }
    const t = this.engine.time();

    if (this.phase === 'countdown') {
      const n = Math.ceil(this.startAt - t);
      if (t >= this.startAt) this.setPhase('playing');
      else if (n !== this.lastCount) {
        this.lastCount = n;
        this.onPhase('countdown', n);
      }
    }
    if (this.phase === 'playing') {
      this.session.update(t);
      if (t > this.chart.duration + 0.5 && t > this.engine.duration) this.finish();
    }

    // Beat accents for the track glow and background.
    const beats = this.chart.beats;
    let beat: 'none' | 'beat' | 'downbeat' = 'none';
    while (this.lastBeat + 1 < beats.length && beats[this.lastBeat + 1] <= t) {
      this.lastBeat++;
      this.beatAt = performance.now();
      beat = this.downbeats.has(this.lastBeat) ? 'downbeat' : 'beat';
    }
    const stage = this.stage;
    if (this.phase === 'playing' && this.session.overdriveActive)
      this.rumble.overdriveTick(this.session.overdrive / this.odMeterAtStart, beat);
    const now = performance.now();
    // Each beat swells the highway's light in quickly and lets it ebb away softly: a rise of a few
    // hundredths of a second and a long fall, on the clock, so it is the same at any frame rate and
    // dies away during a pause. The curve peaks at 1, about 0.05 s after the beat.
    const since = (now - this.beatAt) / 1000;
    const beatPulse = since >= 0 && since < 1.5 ? ((1 - Math.exp(-since / 0.02)) * Math.exp(-since / 0.2)) / 0.715 : 0;
    const bands = this.meter.update(Math.min(0.1, (now - this.meterAt) / 1000));
    this.meterAt = now;
    const low = bands.low;
    if (stage) {
      const bar = barAt(this.barTimes, t);
      const busy = bar >= 0 ? (this.barLevels[bar] ?? 0.3) : 0.15;
      if (beat !== 'none') stage.beat(beat);
      stage.input({
        intensity: busy * 0.75 + low * 0.25,
        overdrive: this.session.overdriveActive,
        barSeconds: this.chart.secondsPerBeat * 4,
        bands,
      });
    }
    this.highway.render(t, this.session, beatPulse * 0.5 + low * 0.5);
    this.updateHud(t, beat);
  };

  /**
   * Shows how the last note went on the tag beside the strike line. `delta` (seconds, negative =
   * early) moves the bar in the tag's little target above or below its middle.
   */
  private flashFeedback(text: string, kind: string, delta?: number) {
    const el = this.hud.feedback;
    this.hud.feedbackWord.textContent = text;
    el.dataset.kind = kind;
    if (delta === undefined) delete el.dataset.timing;
    else {
      // A perfect hit sits dead centre. Anything else is shown clearly off it, further the later or
      // earlier it was, so early and late can be told apart at a glance.
      const on = kind === 'perfect';
      el.dataset.timing = on ? 'on' : delta < 0 ? 'early' : 'late';
      const off = on ? 0 : Math.sign(delta || 1) * Math.min(1, 0.45 + 0.55 * (Math.abs(delta) / WINDOWS.good));
      el.style.setProperty('--off', off.toFixed(2));
    }
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = window.setTimeout(() => el.classList.remove('pop'), 1150);
  }

  private updateHud(t: number, beat: 'none' | 'beat' | 'downbeat' = 'none') {
    const s = this.session;
    const c = this.hudCache;
    const score = Math.round(s.score);
    if (score !== c.score) this.hud.score.textContent = score.toLocaleString();
    const mult = s.multiplier;
    if (mult !== c.mult) {
      this.hud.multiplier.textContent = `×${mult}`;
      // The dial's colour follows the streak's own step; overdrive recolours it (see .hud.overdrive).
      this.hud.multiplier.dataset.level = String(multiplierFor(s.streak));
    }
    if (s.streak !== c.streak) {
      // The dial's ring: how far the streak is toward the next multiplier step (full at the top one).
      const top = multiplierFor(s.streak) >= MAX_MULTIPLIER;
      this.hud.root.style.setProperty('--streak-p', top ? '1' : ((s.streak % STREAK_PER_MULTIPLIER) / STREAK_PER_MULTIPLIER).toFixed(2));
      // The streak stands above the tag once it is worth showing, and burns at the top multiplier.
      this.hud.feedbackStreak.textContent = s.streak >= 5 ? String(s.streak) : '';
      this.hud.feedbackStreak.toggleAttribute('data-hot', top);
    }
    const od = Math.round(s.overdrive * 100);
    if (od !== c.od) {
      // (--od itself is the overdrive colour.)
      this.hud.root.style.setProperty('--od-level', (od / 100).toFixed(2));
      this.hud.root.classList.toggle('od-ready', od >= 25 && !s.overdriveActive);
    }
    if (s.overdriveActive !== c.odActive) this.hud.root.classList.toggle('overdrive', s.overdriveActive);
    const stars = s.progressStars;
    if (stars !== c.stars) {
      this.hud.stars.dataset.count = String(stars);
      Array.from(this.hud.stars.children).forEach((el, i) => {
        (el as HTMLElement).dataset.state = stars >= GOLD_STARS ? 'gold' : i < stars ? 'on' : i === stars ? 'next' : 'off';
      });
    }
    const starP = Math.round(s.nextStarProgress * 50) / 50;
    if (starP !== c.starP) this.hud.stars.style.setProperty('--star-p', String(starP));
    const songP = Math.round(Math.max(0, Math.min(1, t / this.chart.duration)) * 1000) / 1000;
    if (songP !== c.songP) this.hud.timeline.style.setProperty('--song-p', String(songP));
    const left = Math.max(0, Math.ceil(this.chart.duration - Math.max(0, t)));
    if (left !== c.left) this.hud.remaining.textContent = `-${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    this.updateBreak(t, beat);
    Object.assign(c, { score, mult, streak: s.streak, od, stars, starP, odActive: s.overdriveActive, songP, left });
  }

  /**
   * The break countdown: bars left until the next note, with a ring that drains until the note is
   * due. It holds still; on every beat its ring breathes a little, the same each time; on every bar line the new number rolls up into place
   * as the old one rolls away, and a ripple runs out from the ring. It takes its last two beats to
   * leave, gone just before the notes kick in.
   */
  private updateBreak(t: number, beat: 'none' | 'beat' | 'downbeat') {
    const b = this.phase === 'playing' || this.phase === 'paused' ? this.breaks.find((x) => t >= x.from && t < x.to) : undefined;
    const el = this.hud.breakTimer;
    const c = this.hudCache;
    if (!b) {
      if (c.breakSec !== -1) {
        el.classList.remove('on', 'final', 'leaving');
        c.breakSec = -1;
      }
      return;
    }
    this.hud.breakRing.style.strokeDashoffset = String(1 - Math.max(0, Math.min(1, (b.to - t) / (b.to - b.from))));
    // The last two beats of the countdown are spent going, within reason.
    const fade = Math.max(0.7, Math.min(1.5, this.chart.secondsPerBeat * 2));
    const leaving = t >= b.to - fade;
    if (leaving && !el.classList.contains('leaving')) el.style.setProperty('--break-fade', `${fade.toFixed(2)}s`);
    el.classList.toggle('leaving', leaving);
    const moving = !leaving && !reducedMotion();
    // Without a bar grid, fall back to seconds.
    const bars = this.barTimes.length > 1 ? barsLeft(t, b.next, this.barTimes) : Math.max(1, Math.ceil(b.next - t));
    if (bars === c.breakSec) {
      if (beat !== 'none' && moving) breakBeat(this.hud.breakRing);
      return;
    }
    const first = c.breakSec === -1;
    const was = this.hud.breakNumber.textContent ?? '';
    c.breakSec = bars;
    this.hud.breakNumber.textContent = String(bars);
    el.classList.add('on');
    el.classList.toggle('final', bars <= 1);
    if (!first && moving) breakBar(el, this.hud.breakNumber, this.hud.breakRing, was);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.feedbackTimer);
    window.removeEventListener('resize', this.resize);
    this.observer.disconnect();
    this.hud.overdriveButton.removeEventListener('pointerdown', this.overdrivePress);
    this.touchInput.dispose();
    this.input.dispose();
    this.padInput.dispose();
    this.rumble.dispose();
    this.engine.stop();
    this.engine.onEnded = null;
    this.highway.dispose();
    this.stage?.dispose();
    this.shownStage?.dispose();
  }
}

function reducedMotion(): boolean {
  const m = document.documentElement.dataset.motion;
  return m === 'reduced' || (m !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/**
 * A beat in a break: the ring breathes out a little and brightens, then eases back. The same on
 * every beat, loud or quiet, and on the ring alone (`scale`, apart from the ring's own turn), so it
 * never pulls at the timer's place or its number.
 */
function breakBeat(fill: SVGCircleElement) {
  fill.ownerSVGElement?.animate(
    [
      { scale: 1, opacity: 1 },
      { scale: 1.03, opacity: 1, offset: 0.18 },
      { scale: 1, opacity: 1 },
    ],
    { duration: 480, easing: 'cubic-bezier(0.25, 0.6, 0.35, 1)' },
  );
  fill.animate(
    [
      { filter: 'drop-shadow(0 0 8px currentColor) brightness(1)' },
      { filter: 'drop-shadow(0 0 14px currentColor) brightness(1.25)', offset: 0.18 },
      { filter: 'drop-shadow(0 0 8px currentColor) brightness(1)' },
    ],
    { duration: 480, easing: 'ease-out' },
  );
}

/**
 * A bar line in a break: like a counter, the old number rolls up out of the ring's window as the
 * new one rolls up in after it (together, one number's height apart, so they never overlap); the
 * ring lights up and a thin ripple runs out from it.
 */
function breakBar(timer: HTMLElement, num: HTMLElement, fill: SVGCircleElement, was: string) {
  // Far enough that the next number waits wholly out of sight below the window.
  const step = '125%';
  const roll = { duration: 460, easing: 'cubic-bezier(0.6, 0, 0.2, 1)' };
  num.animate([{ transform: `translateY(${step})` }, { transform: 'none' }], roll);
  if (was) {
    const ghost = num.cloneNode() as HTMLElement;
    ghost.textContent = was;
    ghost.classList.add('ghost');
    ghost.setAttribute('aria-hidden', 'true');
    num.after(ghost);
    // It fades as it goes, so its tail does not linger at the top edge as the roll eases out.
    ghost
      .animate(
        [
          { transform: 'none', opacity: 1 },
          { opacity: 1, offset: 0.45 },
          { transform: `translateY(-${step})`, opacity: 0 },
        ],
        { ...roll, fill: 'forwards' },
      )
      .finished.then(
        () => ghost.remove(),
        () => ghost.remove(),
      );
  }
  fill.animate(
    [
      { filter: 'drop-shadow(0 0 8px currentColor) brightness(1)' },
      { filter: 'drop-shadow(0 0 20px currentColor) brightness(1.5)', offset: 0.2 },
      { filter: 'drop-shadow(0 0 8px currentColor) brightness(1)' },
    ],
    { duration: 700, easing: 'ease-out' },
  );
  timer.animate(
    [
      { transform: 'scale(1)', opacity: 0.7 },
      { transform: 'scale(1.28)', opacity: 0 },
    ],
    { duration: 800, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)', pseudoElement: '::before' },
  );
}
