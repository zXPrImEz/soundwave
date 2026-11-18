import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { BandLevels } from '../../audio/bands';
import type { Part } from '../../chart/types';
import type { GraphicsSettings, Level } from '../../game/graphics';
import { loadCast, type Cast } from '../aurora/assets';
import { Figures } from '../aurora/figures';
import { Flames } from '../aurora/flames';
import { Beams } from '../aurora/beams';
import { shared } from '../aurora/shared';
import { DEFAULT_VENUE, type VenueId } from '../venues/catalog';
import { buildVenue } from '../venues';
import { Confetti } from '../venues/kit/confetti';
import { HANDHELD_SHADER } from '../venues/kit/handheld';
import type { Look, Venue, VenueFrame } from '../venues/types';
import { Director } from './Director';
import { LightShow, PALETTES, type ShowState } from './LightShow';
import { Particles } from './Particles';

export interface StageOptions {
  mode: 'play' | 'menu';
  /** The part being played: that band member gets the close-ups. */
  part?: Part;
  /** Where the show takes place (Moonrise when not given). */
  venue?: VenueId;
}

export interface StageFrame {
  beat: 'none' | 'beat' | 'downbeat';
  /** How busy the music is, 0..1. */
  intensity: number;
  overdrive: boolean;
  /** Seconds per bar, for pacing camera moves. */
  barSeconds: number;
}

/** Share of the moving heads lit, and particle budgets, per level. */
const BEAM_SHARE: Record<Level, number> = { off: 0, low: 0.34, medium: 0.67, high: 1 };
const SPARKS: Record<Level, number> = { off: 0, low: 1500, medium: 4000, high: 9000 };
const SPARKS_PER_RAY: Record<Level, number> = { off: 0, low: 6, medium: 12, high: 22 };
const SMOKE: Record<Level, number> = { off: 0, low: 250, medium: 700, high: 1400 };
const CO2_PER_JET: Record<Level, number> = { off: 0, low: 6, medium: 14, high: 24 };
const CONFETTI: Record<Level, number> = { off: 0, low: 900, medium: 2400, high: 5000 };
const EXPOSURE = 0.86;

/** A pulse `age` seconds old: it swells to full strength over `attack` seconds, then rings out. */
function swell(age: number, attack: number, decay: number): number {
  const x = Math.min(1, age / attack);
  return x * x * (3 - 2 * x) * Math.exp(-Math.max(0, age - attack) * decay);
}

/**
 * The 3D stage in real time: a venue (see venues/), and in it a band and a crowd that move with the
 * beat, moving-head beams, sparks, smoke, flames and confetti, a light show that follows the music
 * and a camera director that cuts to it. The venue brings the place; everything here is shared.
 */
export class Stage {
  /**
   * Builds the stage on `canvas`: a page's own canvas, or one handed to a worker (see stageHost),
   * where it runs beside the page instead of in it. Nothing here touches the page.
   */
  static async create(canvas: HTMLCanvasElement | OffscreenCanvas, g: GraphicsSettings, opts: StageOptions): Promise<Stage> {
    const cast = await loadCast();
    const focus = opts.part === 'vocals' ? 'vox' : opts.part;
    const venue = await buildVenue(opts.venue ?? DEFAULT_VENUE, {
      g,
      menu: opts.mode === 'menu',
      part: opts.part,
      focus,
      cast,
      characters: Object.keys(cast.crowd.data.characters),
    });
    return new Stage(canvas, venue, cast, g, opts);
  }

  readonly director: Director;
  /** Bass, middle and treble as the page meters them (see BandMeter). */
  private readonly bandsIn: BandLevels = { low: 0.25, mid: 0.25, high: 0.2 };
  /** The canvas's size on the page, in CSS pixels, and the screen's pixel ratio. */
  private size = { width: 1280, height: 720, dpr: 1 };
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.3, 4000);
  private composer: EffectComposer | null = null;
  private handheld: ShaderPass | null = null;
  private readonly show: LightShow;
  private readonly beams: Beams;
  private readonly crowd: Figures;
  private readonly band: Figures;
  /** A level surface's mirror image (see Venue.mirror): the scene drawn once more from below it. */
  private mirror: THREE.WebGLRenderTarget | null = null;
  private readonly mirrorCamera = new THREE.PerspectiveCamera();
  private readonly flames: Flames | null = null;
  private readonly confetti: Confetti | null = null;
  /** Seconds of finale left, the time to its next salvo, and how many it has fired. */
  private finaleLeft = 0;
  private finaleNext = 0;
  private finaleShot = 0;
  private readonly sparks: Particles;
  private readonly smoke: Particles;
  private readonly owned: { dispose(): void }[] = [];
  private readonly looks: Look[];
  private readonly key = new THREE.Color();
  private readonly accent = new THREE.Color();
  private readonly wash = new THREE.Color();
  private readonly frame: VenueFrame;
  private lastFrame = performance.now();
  private lastRender = 0;
  private frameAvg = 16;
  private dynScale = 1;
  private sinceResize = 0;
  private beatPeriod = 0.5;
  private lastBeatAt = 0;
  private beats = 0;
  private energy = 0.3;
  /** Beat and bar pulses, bass and beats as the scene sees them: eased, never stepping. */
  private pulse = 0;
  private barPulse = 0;
  private low = 0;
  private mid = 0;
  private high = 0;
  /** Seconds since the last beat and bar, and what was left of the pulse before them. */
  private beatAge = 9;
  private barAge = 9;
  private pulseTail = 0;
  private barTail = 0;
  private beatClock = 0;
  /** How far the clock is from the beat last heard, still to be made up. */
  private beatDrift = 0;
  private pendingBeat: StageFrame['beat'] = 'none';
  private disposed = false;
  /** The band member picked out (the part being played). */
  private readonly focus?: string;

  private constructor(
    private readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly venue: Venue,
    cast: Cast,
    private g: GraphicsSettings,
    opts: StageOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: g.antialias, powerPreference: 'high-performance', alpha: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = venue.exposure ?? EXPOSURE;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (venue.background) this.renderer.setClearColor(new THREE.Color(...venue.background));
    // A graphics context can be taken away (driver reset, GPU under pressure). Asking to keep it
    // lets the browser hand it back, and the renderer rebuilds what it needs.
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored as EventListener);
    const menu = opts.mode === 'menu';
    this.show = new LightShow(menu);
    this.director = new Director(venue.shots, menu ? 'calm' : 'auto', 7, menu);
    this.looks = venue.looks;
    this.owned.push(venue);
    this.scene.add(venue.root);

    this.crowd = new Figures(cast.crowd);
    this.crowd.add(venue.audience);
    this.band = new Figures(cast.band);
    this.band.add(venue.players, true);
    this.focus = opts.part === 'vocals' ? 'vox' : opts.part;
    this.scene.add(this.crowd.group, this.band.group);
    this.owned.push(this.crowd, this.band);

    // Lighter settings keep an even share of the moving heads.
    const share = BEAM_SHARE[g.beams];
    this.beams = new Beams(venue.fixtures.filter((_, i) => Math.floor((i + 1) * share) > Math.floor(i * share)));
    this.scene.add(this.beams.group);
    this.owned.push(this.beams);

    if (SPARKS[g.effects] && !menu && venue.flames?.length) {
      this.flames = new Flames(venue.flames);
      this.scene.add(this.flames.mesh);
      this.owned.push(this.flames);
    }
    if (CONFETTI[g.effects] && !menu && venue.confetti?.length) {
      this.confetti = new Confetti(CONFETTI[g.effects]);
      this.scene.add(this.confetti.points);
      this.owned.push(this.confetti);
    }
    this.sparks = new Particles(SPARKS[g.effects] || 1, THREE.AdditiveBlending);
    this.smoke = new Particles(SMOKE[g.effects] || 1, THREE.NormalBlending);
    this.scene.add(this.sparks.points, this.smoke.points);
    this.owned.push(this.sparks, this.smoke);

    if (venue.mirror && (g.lights === 'medium' || g.lights === 'high')) {
      this.mirror = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
      this.owned.push(this.mirror);
    }

    this.setLook(this.looks[0], 1);
    this.frame = {
      dt: 0,
      time: 0,
      beat: 'none',
      clock: 0,
      beats: 0,
      pulse: 0,
      barPulse: 0,
      low: 0,
      mid: 0,
      high: 0,
      energy: 0.3,
      show: this.show.state,
      key: this.key,
      accent: this.accent,
      wash: this.wash,
      finale: 0,
      camera: this.camera,
      band: this.band,
      shot: this.director.shot.name,
    };
    if (g.glow || venue.handheld) this.buildComposer();
    this.applySize();
  }

  /**
   * Compiles every shader the stage uses, in parallel where the browser can, so the first frame does
   * not stop for them. A shader the first frame had to compile itself would hold up the whole GPU
   * process for the time it takes, and with it every other picture on the page (the menus, the
   * loading screen), not only this worker.
   *
   * Shaders are compiled for where they draw: with glow on, the scene is drawn into the glow's
   * buffer rather than the screen (no tone mapping there, linear colour: different shaders), and the
   * mirror into a buffer of its own. The glow's passes are compiled too.
   */
  async prepare(): Promise<void> {
    const r = this.renderer;
    this.bind();
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const jobs: Promise<unknown>[] = [];
    const compile = (scene: THREE.Object3D, camera: THREE.Camera, target: THREE.WebGLRenderTarget | null) => {
      r.setRenderTarget(target);
      jobs.push(r.compileAsync(scene, camera));
    };
    compile(this.scene, this.camera, this.composer ? this.composer.renderTarget1 : null);
    if (this.mirror) compile(this.scene, this.camera, this.mirror);
    for (const o of hidden) o.visible = false;
    if (this.composer) {
      // Each pass draws a full-screen quad: into the glow's buffers, and the last one onto the screen.
      const quad = new THREE.PlaneGeometry(2, 2);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const intoBuffers = new THREE.Scene();
      const ontoScreen = new THREE.Scene();
      for (const pass of this.composer.passes)
        for (const material of passMaterials(pass))
          (pass instanceof OutputPass ? ontoScreen : intoBuffers).add(new THREE.Mesh(quad, material));
      compile(intoBuffers, camera, this.composer.renderTarget1);
      compile(ontoScreen, camera, null);
      jobs.push(Promise.all(jobs).finally(() => quad.dispose()));
    }
    r.setRenderTarget(null);
    await Promise.all(jobs).catch(() => undefined);
  }

  /** The latest levels of whatever is playing (see BandMeter). */
  setBands(b: Readonly<BandLevels>) {
    this.bandsIn.low = b.low;
    this.bandsIn.mid = b.mid;
    this.bandsIn.high = b.high;
  }

  overdriveStart() {
    this.show.overdriveStart();
  }

  /**
   * The song is over: for `seconds` the flame jets burn in one long burst, the fireworks go off
   * one salvo after another, confetti flies and the crowd applauds.
   */
  finale(seconds = 4) {
    this.show.finale();
    this.finaleLeft = seconds;
    this.finaleNext = 0.35;
    this.finaleShot = 0;
  }

  private readonly onContextLost = (e: Event) => e.preventDefault();
  private readonly onContextRestored = () => this.applySize();

  /** The canvas's size on the page (CSS pixels) and the screen's pixel ratio. */
  setSize(width: number, height: number, dpr: number) {
    if (width === this.size.width && height === this.size.height && dpr === this.size.dpr) return;
    this.size = { width: Math.max(1, width), height: Math.max(1, height), dpr: dpr || 1 };
    this.applySize();
  }

  private applySize() {
    const { width: w, height: h, dpr } = this.size;
    const ratio = Math.min(2, dpr) * this.g.resolution * this.dynScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(ratio);
    this.composer?.setSize(w, h);
    if (this.handheld) this.handheld.uniforms.uAspect.value = w / Math.max(1, h);
    this.mirror?.setSize(Math.max(1, Math.round((w * ratio) / 2)), Math.max(1, Math.round((h * ratio) / 2)));
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** One frame. Respects the frame-rate cap and adapts the resolution when frames run long. */
  render(f: StageFrame) {
    if (this.disposed) return;
    const now = performance.now();
    this.frameAvg += (Math.min(100, now - this.lastFrame) - this.frameAvg) * 0.05;
    this.lastFrame = now;
    if (f.beat !== 'none') {
      const t = now / 1000;
      if (this.lastBeatAt && t - this.lastBeatAt < 1.5) this.beatPeriod += (t - this.lastBeatAt - this.beatPeriod) * 0.3;
      this.lastBeatAt = t;
    }
    // Beats and bars must reach the show even on frames the cap skips.
    this.pendingBeat =
      f.beat === 'downbeat' || this.pendingBeat === 'downbeat'
        ? 'downbeat'
        : f.beat === 'beat' || this.pendingBeat === 'beat'
          ? 'beat'
          : 'none';
    if (this.g.fpsCap && now - this.lastRender < 1000 / this.g.fpsCap - 2) return;
    const dt = Math.min(0.1, (now - (this.lastRender || now)) / 1000) || 1 / 60;
    this.lastRender = now;
    this.adaptResolution(dt);
    const beat = this.pendingBeat;
    this.pendingBeat = 'none';
    // The clock everything moves to runs by itself at the music's tempo and is drawn toward each
    // beat as it is heard, so it keeps going through silence, menus and passages where the beats
    // come unevenly or not at all, and never jumps or stands still.
    const step = dt / Math.max(0.2, this.beatPeriod);
    if (beat !== 'none') this.beatDrift = Math.round(this.beatClock) - this.beatClock;
    const advance = Math.max(step * 0.4, step + this.beatDrift * Math.min(1, dt * 8));
    this.beatDrift -= advance - step;
    this.beatClock += advance;
    this.beats = Math.floor(this.beatClock);
    const bands = this.bandsIn;
    for (const e of this.show.update({ dt, beat, intensity: f.intensity, bands, overdrive: f.overdrive })) {
      if (e.type === 'fireworks') {
        this.fireworks(e.which);
        if (e.which === 'all') this.confetti?.burst(this.venue.confetti!, this.key, this.accent, 1);
      } else this.co2(e.strength);
    }
    // In overdrive the jets keep time: all of them on the bar, every other one on the beats between.
    if (this.flames && this.finaleLeft <= 0 && this.show.state.overdrive > 0.5 && beat !== 'none') {
      const turn = this.beats;
      if (beat === 'downbeat') this.flames.fire(this.show.state.time, undefined, 0.9);
      else this.flames.fire(this.show.state.time, (i) => (i + turn) % 2 === 0, 0.55);
    }
    // The finale: salvos in turn (the middle, the sides, the lot), with smoke on every third.
    if (this.finaleLeft > 0) {
      this.finaleLeft -= dt;
      this.finaleNext -= dt;
      if (this.finaleNext <= 0) {
        this.finaleNext = 0.42;
        this.fireworks((['center', 'sides', 'all'] as const)[this.finaleShot % 3]);
        if (this.finaleShot % 3 === 2) this.co2(0.8);
        if (this.finaleShot % 3 === 0) this.confetti?.burst(this.venue.confetti!, this.key, this.accent, 0.7);
        this.finaleShot++;
      }
    }
    this.crowd.clap.value = this.finaleLeft > 0 ? 1 : 0;
    // Through the finale the jets burn without a break, and are let go as it ends.
    this.flames?.hold(this.show.state.time, this.finaleLeft > 0);
    shared.uFire.value = this.flames?.glow(this.show.state.time) ?? 0;
    this.sparks.update(dt, this.venue.sparkGravity ?? -9);
    this.smoke.update(dt, 0.4);
    this.confetti?.update(dt);
    shared.uBurst.value.w *= Math.exp(-dt * 1.6);
    this.director.update(dt, beat === 'downbeat', this.show.state.level, f.barSeconds);
    this.energy += (f.intensity - this.energy) * Math.min(1, dt * 1.2);
    this.beatAge += dt;
    this.barAge += dt;
    if (beat !== 'none') {
      this.beatAge = 0;
      this.pulseTail = this.pulse;
    }
    if (beat === 'downbeat') {
      this.barAge = 0;
      this.barTail = this.barPulse;
    }
    this.bind();
    this.applyShow(this.show.state, bands, dt);
    const fr = this.frame;
    Object.assign(fr, {
      dt,
      time: this.show.state.time,
      beat,
      clock: this.beatClock,
      beats: this.beats,
      pulse: this.pulse,
      barPulse: this.barPulse,
      low: this.low,
      mid: this.mid,
      high: this.high,
      energy: this.energy,
      finale: Math.max(0, this.finaleLeft),
      shot: this.director.shot.name,
    });
    this.venue.update(fr);

    const pose = this.director.pose();
    const raised = this.venue.cameraLift?.(this.director.shot.name) ?? 0;
    pose.pos[1] += raised;
    pose.target[1] += raised;
    const hand = this.venue.handheld ?? 0;
    if (hand) {
      // A camera operator's hands: slow drift, a little sway with the beat, never still.
      const t = this.show.state.time;
      const sway = (a: number, b: number) => Math.sin(t * a + b) * 0.6 + Math.sin(t * a * 2.3 + b * 1.7) * 0.4;
      pose.pos[0] += hand * (0.09 * sway(0.7, 1) + 0.025 * this.pulse);
      pose.pos[1] += hand * (0.07 * sway(0.9, 2) - 0.04 * this.pulse);
      pose.target[0] += hand * 0.35 * sway(0.5, 3);
      pose.target[1] += hand * 0.25 * sway(0.6, 4);
    }
    this.camera.position.set(...pose.pos);
    this.camera.lookAt(...pose.target);
    if (hand) this.camera.rotateZ(hand * 0.02 * Math.sin(this.show.state.time * 0.45));
    const vfov = (2 * Math.atan(Math.tan((pose.hfov * Math.PI) / 360) / this.camera.aspect) * 180) / Math.PI;
    if (Math.abs(vfov - this.camera.fov) > 0.01) {
      this.camera.fov = vfov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    if (this.handheld) {
      this.handheld.uniforms.uTime.value = this.show.state.time;
      this.handheld.uniforms.uAmount.value = hand;
    }
    this.crowd.focus(this.camera.position);
    const scale = this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.beams.update(this.camera, scale);
    this.sparks.setScale(scale);
    this.smoke.setScale(scale);
    this.confetti?.setScale(scale);
    this.renderMirror();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /**
   * Draws what a level surface mirrors (a lake, a wet floor) as seen from the camera's own
   * reflection under it (the audience, the band and the beams are left out: they are costly and
   * hardly show). The surface then looks each of its points up in that picture.
   */
  private renderMirror() {
    const mirror = this.mirror;
    shared.uMirrorOn.value = mirror ? 1 : 0;
    if (!mirror || !this.venue.mirror) return;
    const level = this.venue.mirror.level;
    shared.uWaterLevel.value = level;
    const cam = this.mirrorCamera;
    const main = this.camera;
    cam.fov = main.fov;
    cam.aspect = main.aspect;
    cam.near = main.near;
    cam.far = main.far;
    cam.updateProjectionMatrix();
    const pos = main.position;
    const ahead = TMP_V.set(0, 0, -1).applyQuaternion(main.quaternion).add(pos);
    cam.position.set(pos.x, 2 * level - pos.y, pos.z);
    cam.up.set(0, -1, 0);
    cam.lookAt(ahead.x, 2 * level - ahead.y, ahead.z);
    cam.updateMatrixWorld();
    shared.uMirrorMatrix.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix)
      .multiply(cam.matrixWorldInverse);
    const left = [this.crowd.group, this.band.group, this.beams.group, ...(this.venue.mirror.hide ?? [])].filter((o) => o.visible);
    for (const o of left) o.visible = false;
    this.renderer.setRenderTarget(mirror);
    this.renderer.render(this.scene, cam);
    this.renderer.setRenderTarget(null);
    for (const o of left) o.visible = true;
    shared.uMirrorMap.value = mirror.texture;
  }

  /** Dev diagnostics. */
  debugInfo() {
    return {
      frameMs: +this.frameAvg.toFixed(1),
      people: this.crowd.count,
      detailed: this.crowd.detailed,
      peopleTriangles: Math.round(this.crowd.triangles + this.band.triangles),
      shot: this.director.shot.name,
      level: this.show.state.level,
      scale: this.dynScale,
      size: [this.renderer.domElement.width, this.renderer.domElement.height],
      calls: this.renderer.info.render.calls,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored as EventListener);
    for (const o of this.owned) o.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  /**
   * The shared uniforms that hold still for this stage: where the players stand, who is picked out,
   * and the venue's own. Set every frame, since two stages (the menus' and a song's) can be up at
   * once while one hands over to the other.
   */
  private bind() {
    ['lead', 'vox', 'bass', 'drums'].forEach((key, i) => {
      shared.uBand.value[i].set(...(this.venue.band[key] ?? [0, -100, 0]));
      shared.uFeature.value[i] = !this.focus ? 0.6 : key === this.focus ? 1 : 0.4;
    });
    this.venue.bind();
  }

  // ------------------------------------------------------------------ show → scene
  private setLook(look: Look, k: number) {
    this.key.lerp(TMP_C.setRGB(...look.key), k);
    this.accent.lerp(TMP_C.setRGB(...look.accent), k);
    this.wash.lerp(TMP_C.setRGB(...look.wash), k);
  }

  private applyShow(s: ShowState, bands: Readonly<BandLevels>, dt: number) {
    const t = s.time;
    const index = PALETTES.indexOf(s.palette);
    const looks = this.looks;
    // Overdrive hands over a rainbow palette of its own: take its colours as they are.
    const ease = (rate: number) => Math.min(1, dt * rate);
    this.setLook(
      index >= 0 ? looks[index % looks.length] : { key: s.palette.key, accent: looks[0].accent, wash: s.palette.wash },
      ease(1.1),
    );
    // Everything reaches the scene at full strength but never as a step: a beat swells to its peak
    // over a few frames and rings out, picking up from whatever was left of the one before; the
    // bass, middle and treble are followed closely on the way up and let go more slowly; and
    // (below) every beam eases to its level, colour and angle.
    this.pulse = Math.max(this.pulseTail * Math.exp(-this.beatAge * 9), swell(this.beatAge, 0.07, 4.5));
    this.barPulse = Math.max(this.barTail * Math.exp(-this.barAge * 5), swell(this.barAge, 0.09, 1.7));
    this.low += (bands.low - this.low) * ease(bands.low > this.low ? 20 : 5);
    this.mid += (bands.mid - this.mid) * ease(bands.mid > this.mid ? 20 : 5);
    this.high += (bands.high - this.high) * ease(bands.high > this.high ? 20 : 6);
    const washLevel = 0.55 + 0.25 * this.low + 0.2 * this.barPulse + 0.2 * s.overdrive;
    shared.uTime.value = t;
    shared.uBeat.value = this.beatClock;
    shared.uPulse.value = this.pulse;
    shared.uBarPulse.value = this.barPulse;
    shared.uEnergy.value = Math.min(1, this.energy + 0.4 * s.overdrive);
    shared.uLow.value = this.low;
    shared.uMid.value = this.mid;
    shared.uHigh.value = this.high;
    shared.uKey.value.copy(this.key);
    shared.uAccent.value.copy(this.accent);
    shared.uWash.value.copy(this.wash);
    shared.uScreenLevel.value = 0.62 + 0.16 * washLevel + 0.18 * this.barPulse;
    shared.uFlash.value = 0;
    shared.uHazeNear.value
      .setRGB(...(this.venue.hazeNear ?? HAZE_NEAR))
      .lerp(this.wash, 0.14)
      .multiplyScalar(0.6 + 0.35 * s.beamLevel);

    const frame = this.frame;
    for (let i = 0; i < this.beams.states.length; i++) {
      const b = this.beams.states[i];
      const group = this.beams.fixtures[i].group;
      const own = this.venue.beam?.(group, i, frame);
      let level = s.beamLevel;
      let pan = 0;
      let tilt = 0;
      let color = i % 3 === 0 ? this.accent : this.key;
      if (own) {
        ({ pan, tilt, level } = own);
        if (own.color) color = own.color === 'white' ? WHITE : own.color === 'accent' ? this.accent : this.key;
      } else {
        if (s.beamMode === 'sweep') {
          pan = Math.sin(t * 0.6 + i * 0.45) * 0.36;
          tilt = Math.sin(t * 0.45 + i) * 0.14;
        } else if (s.beamMode === 'fan') {
          pan = (i % 2 ? 1 : -1) * (0.1 + 0.22 * Math.sin(t * 1.0)) * (1 + this.pulse * 0.4);
          tilt = Math.cos(t * 0.8) * 0.08;
        } else if (s.beamMode === 'chase') {
          // A swell that travels along the row with the beat, not lamps switching on and off.
          level *= (this.beats + i) % 4 === 0 ? 1 : 0.12;
          pan = Math.sin(t * 0.4 + i) * 0.1;
        } else {
          tilt = Math.sin(t * 0.3 + i) * 0.04;
        }
        level *= (0.7 + 0.3 * this.pulse) * (i % 2 ? 1 : 0.55);
      }
      b.pan += (pan - b.pan) * ease(4);
      b.tilt += (tilt - b.tilt) * ease(4);
      b.level += (level - b.level) * ease(level > b.level ? 16 : 5);
      b.color.lerp(color, ease(3));
    }
  }

  // ------------------------------------------------------------------ effects
  private fireworks(which: 'all' | 'center' | 'sides') {
    // The flame jets go off with them: the middle ones, the outer ones, or the lot. (Not while they
    // are held burning through the finale: a new shot would start each flame again from its foot.)
    const jets = this.venue.flames?.length ?? 0;
    const [from, to] = this.venue.flameMiddle ?? [Math.floor(jets * 0.3), Math.ceil(jets * 0.7) - 1];
    const mid = (i: number) => i >= from && i <= to;
    if (!this.flames?.holding) this.flames?.fire(this.show.state.time, (i) => which === 'all' || (which === 'center') === mid(i));
    const perRay = SPARKS_PER_RAY[this.g.effects];
    if (!perRay) return;
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    this.venue.fireworks.forEach((f, index) => {
      if (index === 0 || which === 'sides') shared.uBurst.value.set(f.origin[0], f.origin[1] + 14, f.origin[2], 1);
      const side = f.side ?? Math.abs(f.origin[0]) >= 40;
      const x = Math.abs(f.origin[0]);
      if (which === 'center' && (f.side ?? x > 35)) return;
      if (which === 'sides' && !side) return;
      origin.set(...f.origin);
      const c = (index % 2 ? this.accent : this.key).clone().lerp(WHITE, 0.45);
      this.sparks.spawn(origin, ZERO, [1, 0.95, 1], 4.5, 0.4, 0, 0, 0.6);
      for (let k = 0; k < f.n; k++) {
        const ang = ((-f.spread + (2 * f.spread * k) / Math.max(1, f.n - 1) + (Math.random() - 0.5) * 8 + f.lean) * Math.PI) / 180;
        dir.set(Math.sin(ang), Math.cos(ang), 0.25).normalize();
        const len = f.length[0] + Math.random() * (f.length[1] - f.length[0]);
        for (let j = 0; j < perRay; j++) {
          const speed = (len / 1.3) * (0.25 + 0.85 * (j / perRay)) * (0.95 + Math.random() * 0.1);
          this.sparks.spawn(
            origin,
            TMP_V.copy(dir).multiplyScalar(speed),
            [c.r, c.g, c.b],
            0.55 + Math.random() * 0.35,
            1.6 + Math.random() * 0.9,
            0.9,
            0,
          );
        }
      }
    });
  }

  private co2(strength: number) {
    const per = Math.round(strength * CO2_PER_JET[this.g.effects]);
    const origin = new THREE.Vector3();
    const tint = this.wash.clone().lerp(WHITE, 0.75);
    for (const c of this.venue.co2) {
      origin.set(...c);
      for (let k = 0; k < per; k++) {
        TMP_V.set((Math.random() - 0.5) * 2.2, 9 + Math.random() * 7, (Math.random() - 0.5) * 2.2 + 0.8);
        this.smoke.spawn(
          origin,
          TMP_V,
          [tint.r * 0.8, tint.g * 0.8, tint.b * 0.85],
          1.5 + Math.random() * 1.5,
          2.2 + Math.random() * 1.3,
          1.6,
          4.0,
          0.16,
        );
      }
    }
  }

  private adaptResolution(dt: number) {
    this.sinceResize += dt;
    if (!this.g.dynamicResolution || this.sinceResize < 1.5) return;
    const budget = this.g.fpsCap ? 1000 / this.g.fpsCap : 1000 / 60;
    let next = this.dynScale;
    if (this.frameAvg > budget * 1.15) next = Math.max(0.5, this.dynScale - 0.1);
    else if (this.frameAvg < budget * 1.02 && this.dynScale < 1) next = Math.min(1, this.dynScale + 0.05);
    if (next !== this.dynScale) {
      this.dynScale = next;
      this.sinceResize = 0;
      this.applySize();
    }
  }

  private buildComposer() {
    // The composer renders into its own buffer; give it MSAA so edges stay smooth with glow on.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.g.antialias ? 4 : 0 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.g.glow) {
      const [strength, radius, threshold] = this.venue.bloom ?? [0.2, 0.45, 1.0];
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), strength, radius, threshold));
    }
    if (this.venue.handheld) {
      this.handheld = new ShaderPass(HANDHELD_SHADER);
      composer.addPass(this.handheld);
    }
    composer.addPass(new OutputPass());
    this.composer = composer;
  }
}

/** The materials a post-processing pass draws with (its own fields, and arrays of them). */
function passMaterials(pass: object): THREE.Material[] {
  return Object.values(pass).flatMap((v: unknown) =>
    v instanceof THREE.Material ? [v] : Array.isArray(v) ? v.filter((m): m is THREE.Material => m instanceof THREE.Material) : [],
  );
}

const TMP_C = new THREE.Color();
const TMP_V = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);
const HAZE_NEAR: [number, number, number] = [0.03, 0.035, 0.15];
