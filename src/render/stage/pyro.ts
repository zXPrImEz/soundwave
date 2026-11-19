import type { FireworkSpec } from '../aurora/assets';

/**
 * The pyrotechnics as plain numbers: a particle simulation the GPU draws straight from its arrays
 * (see Particles.ts), and the show's devices that feed it: firework shells that climb on a trail
 * and burst in one of several patterns, comets, cold-spark fountains, CO2 jets, embers and smoke.
 * No three.js here, so it can be tested and runs without allocating per frame.
 */

/** A colour as three.js has it (THREE.Color fits), without needing three.js here. */
export interface Rgbish {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Twinkles as it burns out. */
export const GLITTER = 1;
/** Sheds a trail of sparks as it flies. */
export const TRAIL = 2;
/** A shell: bursts at the top of its climb (see Pyro). */
export const SHELL = 4;
/** A crossette star: splits in four after `aux` seconds. */
export const SPLIT = 8;

/** What a new particle starts as. One is filled in and handed over again and again. */
export class Spawn {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  r = 1;
  g = 1;
  b = 1;
  /** Width in metres, and how fast it grows (m/s). */
  size = 0.1;
  grow = 0;
  life = 1;
  drag = 0;
  alpha = 1;
  /** Share of the simulation's gravity it feels (negative: it rises). */
  gravity = 1;
  /** Height it bounces off (none by default). */
  floor = -1e9;
  flags = 0;
  aux = 0;
  /** Sparks: how long a streak it draws. Smoke: a number of its own (turn, which puff). */
  w = 1;
  /** Seconds it waits, unseen and still, before it starts. */
  wait = 0;

  reset(): this {
    this.x = this.y = this.z = this.vx = this.vy = this.vz = 0;
    this.r = this.g = this.b = 1;
    this.size = 0.1;
    this.grow = 0;
    this.life = 1;
    this.drag = 0;
    this.alpha = 1;
    this.gravity = 1;
    this.floor = -1e9;
    this.flags = 0;
    this.aux = 0;
    this.w = 1;
    this.wait = 0;
    return this;
  }
}

/** What a simulation calls back for its special particles (see the flags). */
export interface SimHooks {
  trail(sim: ParticleSim, i: number, dt: number): void;
  apex(sim: ParticleSim, i: number): void;
  split(sim: ParticleSim, i: number): void;
}

/**
 * Particles in flat arrays, four numbers each for the GPU: position and width, velocity and
 * opacity, colour and `w`. A ring buffer: when it is full a new particle takes the oldest one's place.
 */
export class ParticleSim {
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly col: Float32Array;
  readonly aux: Float32Array;
  readonly flags: Uint8Array;
  hooks: SimHooks | null = null;
  /** One past the highest slot ever used: the GPU draws that many. */
  used = 0;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly drag: Float32Array;
  private readonly grow: Float32Array;
  private readonly peak: Float32Array;
  private readonly grav: Float32Array;
  private readonly floor: Float32Array;
  private readonly wait: Float32Array;
  private cursor = 0;
  private live = 0;
  private born = 0;

  /**
   * `fadeIn`, `fadeOut`: how fast a particle comes up when born and how early it starts to fade
   * (as rates over its life: 12 is up in a twelfth of it).
   */
  constructor(
    readonly max: number,
    private readonly fadeIn: number,
    private readonly fadeOut: number,
    private readonly rng: () => number = Math.random,
  ) {
    this.pos = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 4);
    this.col = new Float32Array(max * 4);
    this.aux = new Float32Array(max);
    this.flags = new Uint8Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.peak = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.floor = new Float32Array(max);
    this.wait = new Float32Array(max);
  }

  /** How many particles are alive (or waiting to start). */
  get count(): number {
    let n = 0;
    for (let i = 0; i < this.used; i++) if (this.life[i] > 0) n++;
    return n;
  }

  /** Whether slot `i` holds a live particle. */
  alive(i: number): boolean {
    return this.life[i] > 0;
  }

  spawn(s: Spawn): number {
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    this.used = Math.max(this.used, i + 1);
    this.live++;
    this.born++;
    const o = i * 4;
    this.pos[o] = s.x;
    this.pos[o + 1] = s.y;
    this.pos[o + 2] = s.z;
    this.pos[o + 3] = s.size;
    this.vel[o] = s.vx;
    this.vel[o + 1] = s.vy;
    this.vel[o + 2] = s.vz;
    this.vel[o + 3] = 0;
    this.col[o] = s.r;
    this.col[o + 1] = s.g;
    this.col[o + 2] = s.b;
    this.col[o + 3] = s.w;
    this.life[i] = this.maxLife[i] = Math.max(1e-3, s.life);
    this.drag[i] = s.drag;
    this.grow[i] = s.grow;
    this.peak[i] = s.alpha;
    this.grav[i] = s.gravity;
    this.floor[i] = s.floor;
    this.wait[i] = s.wait;
    this.flags[i] = s.flags;
    this.aux[i] = s.aux;
    return i;
  }

  kill(i: number) {
    this.life[i] = 0;
    this.vel[i * 4 + 3] = 0;
  }

  /** Moves everything on by `dt`; false when nothing is alive (and nothing changed). */
  update(dt: number, gravity: number): boolean {
    if (!this.live) return false;
    const { pos, vel, life, maxLife } = this;
    const bornBefore = this.born;
    let live = 0;
    for (let i = 0; i < this.used; i++) {
      if (life[i] <= 0) continue;
      live++;
      if (this.wait[i] > 0) {
        this.wait[i] -= dt;
        continue;
      }
      life[i] -= dt;
      const o = i * 4;
      if (life[i] <= 0) {
        vel[o + 3] = 0;
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      vel[o] *= k;
      vel[o + 1] = vel[o + 1] * k + gravity * this.grav[i] * dt;
      vel[o + 2] *= k;
      pos[o] += vel[o] * dt;
      pos[o + 1] += vel[o + 1] * dt;
      pos[o + 2] += vel[o + 2] * dt;
      // Sparks that come down on the deck skip off it, slower each time.
      if (pos[o + 1] < this.floor[i]) {
        pos[o + 1] = this.floor[i];
        if (vel[o + 1] < 0) {
          vel[o + 1] *= -0.3;
          vel[o] *= 0.55;
          vel[o + 2] *= 0.55;
        }
      }
      pos[o + 3] += this.grow[i] * dt;
      const f = life[i] / maxLife[i];
      let a = this.peak[i] * Math.min(1, f * this.fadeOut) * Math.min(1, (1 - f) * this.fadeIn + 0.2);
      const flags = this.flags[i];
      if (flags) {
        if (flags & GLITTER && f < 0.5) a *= this.rng() < 0.45 ? 1.8 : 0.08;
        if (flags & TRAIL) this.hooks?.trail(this, i, dt);
        if (flags & SHELL && vel[o + 1] <= 0) {
          this.hooks?.apex(this, i);
          this.kill(i);
          continue;
        }
        if (flags & SPLIT && maxLife[i] - life[i] >= this.aux[i]) {
          this.hooks?.split(this, i);
          this.kill(i);
          continue;
        }
      }
      vel[o + 3] = a;
    }
    // Particles born during the pass (trails, bursts) may sit behind it: count them as alive.
    this.live = live + (this.born - bornBefore);
    return true;
  }
}

/** How much of each device the graphics settings allow. */
export interface PyroBudget {
  /** Stars in one shell's burst. */
  stars: number;
  /** Most shells one launcher fires. */
  shells: number;
  /** Comets per ray of a launcher's fan. */
  comets: number;
  /** Sparks a fountain throws per second, and a shell's trail sheds per second. */
  gerbRate: number;
  trailRate: number;
  /** Puffs a CO2 jet blows per second. */
  co2Rate: number;
  /** Embers per flame shot. */
  embers: number;
  /** Puffs of smoke a burst or a flame leaves. */
  puffs: number;
}

export const BURSTS = ['peony', 'willow', 'ring', 'crossette'] as const;
export type BurstKind = (typeof BURSTS)[number];

type JetKind = 'gerb' | 'co2' | 'ember';

/** A device that sprays for a while: a fountain, a CO2 jet, a flame that keeps burning. */
interface Jet {
  kind: JetKind;
  x: number;
  y: number;
  z: number;
  /** Fountain: height, spread and lean (degrees). CO2: strength. */
  height: number;
  spread: number;
  lean: number;
  r: number;
  g: number;
  b: number;
  rate: number;
  left: number;
  carry: number;
}

/** A shell in the air: what it bursts into. */
interface Payload {
  kind: BurstKind;
  radius: number;
  a: [number, number, number];
  b: [number, number, number];
  glitter: boolean;
}

const JETS = 64;
const PAYLOADS = 64;
const GOLD: Rgbish = { r: 1, g: 0.6, b: 0.2 };
const DEG = Math.PI / 180;

/** The fireworks, fountains, jets and smoke of the show (see the file's note). */
export class Pyro {
  /** Pull of gravity on the sparks (m/s², negative is down). */
  gravity = -9;
  /** Called as a shell bursts or a salvo goes up: where, its colour, and how bright (0..1). */
  onBurst: ((x: number, y: number, z: number, c: Rgbish, strength: number) => void) | null = null;
  private readonly s = new Spawn();
  private readonly jets: Jet[] = [];
  private readonly payloads: Payload[] = [];
  private payloadCursor = 0;
  private fogCarry = 0;
  /** Scratch colours: the burst's two, and a star's. */
  private readonly colA = { r: 0, g: 0, b: 0 };
  private readonly colB = { r: 0, g: 0, b: 0 };
  private readonly colStar = { r: 0, g: 0, b: 0 };

  constructor(
    readonly sparks: ParticleSim,
    readonly smoke: ParticleSim,
    readonly budget: PyroBudget,
    private readonly rng: () => number = Math.random,
  ) {
    sparks.hooks = this;
    for (let i = 0; i < JETS; i++)
      this.jets.push({ kind: 'gerb', x: 0, y: 0, z: 0, height: 0, spread: 0, lean: 0, r: 1, g: 1, b: 1, rate: 0, left: 0, carry: 0 });
    for (let i = 0; i < PAYLOADS; i++) this.payloads.push({ kind: 'peony', radius: 1, a: [1, 1, 1], b: [1, 1, 1], glitter: false });
  }

  /**
   * One firework device goes off: a narrow fan (a few degrees) is a cold-spark fountain; a wide one
   * a launcher, which throws a fan of comets and sends up shells that burst in the colours `a`
   * and `b`. `salvo` picks the bursts, so salvos one after another differ.
   */
  launch(f: FireworkSpec, a: Rgbish, b: Rgbish, salvo: number) {
    const [x, y, z] = f.origin;
    if (f.spread <= 15) {
      this.gerb(x, y, z, (f.length[0] + f.length[1]) / 2, f.spread, f.lean, a);
      return;
    }
    const bud = this.budget;
    const rng = this.rng;
    const s = this.s;
    const g = Math.max(1, Math.abs(this.gravity));
    // Comets: the fan of rays, each a bright star drawing a long streak.
    const comets = Math.round(f.n * bud.comets);
    for (let k = 0; k < comets; k++) {
      const ang = (-f.spread + (2 * f.spread * (k + 0.5)) / comets + (rng() - 0.5) * 8 + f.lean) * DEG;
      const len = f.length[0] + rng() * (f.length[1] - f.length[0]);
      const speed = len * 1.25;
      const n = Math.hypot(Math.sin(ang), Math.cos(ang), 0.25);
      s.reset();
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = (Math.sin(ang) / n) * speed;
      s.vy = (Math.cos(ang) / n) * speed;
      s.vz = (0.25 / n) * speed;
      mixWhite(s, k % 2 ? b : a, 0.3);
      s.size = 0.24;
      s.life = 1.3 + rng() * 0.5;
      s.drag = 1.25;
      s.gravity = 0.5;
      s.flags = GLITTER;
      s.w = 3;
      this.sparks.spawn(s);
    }
    // Shells: climb on a trail and burst at the top, spread across the fan.
    const shells = Math.min(bud.shells, Math.ceil(f.n / 6));
    for (let k = 0; k < shells; k++) {
      const share = shells > 1 ? k / (shells - 1) - 0.5 : 0;
      const ang = (f.lean + share * f.spread * 0.9 + (rng() - 0.5) * 10) * DEG;
      const len = f.length[0] + rng() * (f.length[1] - f.length[0]);
      const h = len * 0.6;
      // Climbs for about a second and a quarter, whatever the height: a burst should not keep the music waiting.
      const t = 1.15 + rng() * 0.3;
      const climb = (2 * h) / t;
      const p = this.payload();
      p.kind = BURSTS[(salvo + k) % BURSTS.length];
      p.radius = len * 0.3;
      setRgb(p.a, k % 2 ? b : a);
      setRgb(p.b, k % 2 ? a : b);
      p.glitter = (salvo + k) % 3 !== 1;
      s.reset();
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = Math.sin(ang) * climb;
      s.vy = Math.cos(ang) * climb;
      s.vz = climb * 0.12;
      s.r = 1;
      s.g = 0.72;
      s.b = 0.38;
      s.size = 0.32;
      s.life = t * 2;
      s.gravity = (2 * h) / (t * t) / g;
      s.flags = SHELL | TRAIL;
      s.aux = this.payloadCursor;
      s.w = 1.5;
      this.sparks.spawn(s);
    }
    if (comets || shells) {
      this.flash(x, y, z, a, 3, 0.2);
      this.onBurst?.(x, y, z, a, 0.6);
    }
  }

  /** A cold-spark fountain at x, y, z throwing sparks `height` metres up for a second and a half. */
  gerb(x: number, y: number, z: number, height: number, spread: number, lean: number, tint: Rgbish) {
    if (!this.budget.gerbRate) return;
    const jet = this.jet('gerb', x, y, z);
    jet.height = height;
    jet.spread = Math.max(3, spread);
    jet.lean = lean;
    jet.r = tint.r;
    jet.g = tint.g;
    jet.b = tint.b;
    jet.rate = this.budget.gerbRate;
    jet.left = 1.5;
    this.onBurst?.(x, y + height * 0.5, z, WARM, 0.35);
  }

  /** A CO2 jet at x, y, z: a fast white plume, `strength` 0..1, tinted by the light it stands in. */
  co2(x: number, y: number, z: number, strength: number, tint: Rgbish) {
    if (!this.budget.co2Rate) return;
    const jet = this.jet('co2', x, y, z);
    jet.height = Math.max(0.3, strength);
    jet.r = tint.r;
    jet.g = tint.g;
    jet.b = tint.b;
    jet.rate = this.budget.co2Rate;
    jet.left = 0.4 + 0.6 * jet.height;
  }

  /** A flame jet at x, y, z fired (`size` as its shot): embers fly up from it, and smoke rises after. */
  flame(x: number, y: number, z: number, size: number) {
    const n = Math.round(this.budget.embers * size);
    for (let k = 0; k < n; k++) this.ember(x, y, z, size);
    // A puff or so a shot: a row of jets firing on every beat must not build a wall of smoke.
    const puffs = Math.floor(this.budget.puffs * size * 0.4 + this.rng());
    for (let k = 0; k < puffs; k++) this.soot(x, y, z, size, 0.55 + this.rng() * 0.4);
  }

  /** A flame jet at x, y, z held burning for `seconds`: embers all the while. */
  burn(x: number, y: number, z: number, seconds: number) {
    if (!this.budget.embers) return;
    const jet = this.jet('ember', x, y, z);
    jet.rate = this.budget.embers * 1.5;
    jet.left = seconds;
  }

  /**
   * Low fog: puffs that roll out slowly from `points` and lie on the floor they come from, `rate`
   * a second. Called every frame; `rate` 0 lets what is there drift away.
   */
  drift(dt: number, points: readonly (readonly [number, number, number])[], rate: number, tint: Rgbish) {
    if (!points.length || !this.budget.co2Rate) return;
    this.fogCarry += rate * dt;
    const rng = this.rng;
    const s = this.s;
    while (this.fogCarry >= 1) {
      this.fogCarry -= 1;
      const [x, y, z] = points[Math.floor(rng() * points.length)];
      s.reset();
      s.x = x + (rng() - 0.5) * 3;
      s.y = y + 0.25;
      s.z = z + (rng() - 0.5) * 3;
      s.vx = (rng() - 0.5) * 1.4;
      s.vz = (rng() - 0.5) * 1.4;
      s.r = tint.r * 0.75;
      s.g = tint.g * 0.75;
      s.b = tint.b * 0.75;
      s.size = 2.5 + rng();
      s.grow = 0.8;
      s.life = 7 + rng() * 3;
      s.drag = 0.15;
      s.gravity = -0.05;
      s.floor = y + 0.2;
      s.alpha = 0.13;
      s.w = rng();
      this.smoke.spawn(s);
    }
  }

  update(dt: number) {
    for (const jet of this.jets) {
      if (jet.left <= 0) continue;
      jet.left -= dt;
      jet.carry += jet.rate * dt;
      while (jet.carry >= 1) {
        jet.carry -= 1;
        if (jet.kind === 'gerb') this.gerbSpark(jet);
        else if (jet.kind === 'co2') this.co2Puff(jet);
        else this.ember(jet.x, jet.y, jet.z, 1);
      }
      // The fountain's mouth burns white hot while it runs.
      if (jet.kind === 'gerb') this.flash(jet.x, jet.y + 0.15, jet.z, WARM, 0.55, 0.05);
      if (jet.left <= 0) jet.carry = 0;
    }
  }

  // ------------------------------------------------------------------ hooks (see ParticleSim)
  trail(sim: ParticleSim, i: number, dt: number) {
    const rng = this.rng;
    const want = this.budget.trailRate * dt;
    const n = Math.floor(want) + (rng() < want % 1 ? 1 : 0);
    const s = this.s;
    const o = i * 4;
    for (let k = 0; k < n; k++) {
      s.reset();
      s.x = sim.pos[o] + (rng() - 0.5) * 0.2;
      s.y = sim.pos[o + 1] + (rng() - 0.5) * 0.2;
      s.z = sim.pos[o + 2] + (rng() - 0.5) * 0.2;
      s.vx = sim.vel[o] * 0.08 + (rng() - 0.5) * 1.5;
      s.vy = sim.vel[o + 1] * 0.08 + (rng() - 0.5) * 1.5;
      s.vz = sim.vel[o + 2] * 0.08 + (rng() - 0.5) * 1.5;
      s.r = 1;
      s.g = 0.55 + rng() * 0.2;
      s.b = 0.2;
      s.size = 0.13;
      s.life = 0.45 + rng() * 0.45;
      s.drag = 2.5;
      s.gravity = 0.25;
      s.flags = GLITTER;
      this.sparks.spawn(s);
    }
  }

  apex(sim: ParticleSim, i: number) {
    const p = this.payloads[sim.aux[i]];
    const o = i * 4;
    this.burst(p, sim.pos[o], sim.pos[o + 1], sim.pos[o + 2]);
  }

  split(sim: ParticleSim, i: number) {
    const o = i * 4;
    const x = sim.pos[o];
    const y = sim.pos[o + 1];
    const z = sim.pos[o + 2];
    const vx = sim.vel[o];
    const vy = sim.vel[o + 1];
    const vz = sim.vel[o + 2];
    const speed = Math.max(7, Math.hypot(vx, vy, vz) * 1.8);
    // Two directions square to the star's flight, and the four children fly out along them.
    let ux = -vz;
    const uy = 0;
    let uz = vx;
    const n = Math.hypot(ux, uy, uz);
    if (n < 1e-4) {
      ux = 1;
      uz = 0;
    } else {
      ux /= n;
      uz /= n;
    }
    const m = Math.hypot(vx, vy, vz) || 1;
    const wx = (vy * uz - vz * uy) / m;
    const wy = (vz * ux - vx * uz) / m;
    const wz = (vx * uy - vy * ux) / m;
    const s = this.s;
    const tint = this.colStar;
    tint.r = sim.col[o];
    tint.g = sim.col[o + 1];
    tint.b = sim.col[o + 2];
    for (let k = 0; k < 4; k++) {
      const out = (k < 2 ? 1 : -1) * speed;
      const odd = k % 2 === 1;
      s.reset();
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = vx * 0.3 + (odd ? wx : ux) * out;
      s.vy = vy * 0.3 + (odd ? wy : uy) * out;
      s.vz = vz * 0.3 + (odd ? wz : uz) * out;
      mixWhite(s, tint, 0.2);
      s.size = 0.24;
      s.life = 0.8 + this.rng() * 0.4;
      s.drag = 1.6;
      s.gravity = 0.4;
      s.flags = GLITTER;
      s.w = 1.4;
      this.sparks.spawn(s);
    }
    this.flash(x, y, z, tint, 1.2, 0.1);
  }

  // ------------------------------------------------------------------ bursts
  /** A shell bursts at x, y, z. */
  private burst(p: Payload, x: number, y: number, z: number) {
    const rng = this.rng;
    const s = this.s;
    const n = this.budget.stars;
    const R = p.radius;
    const a = rgbOf(p.a, this.colA);
    const b = rgbOf(p.b, this.colB);
    const glitter = p.glitter ? GLITTER : 0;
    this.flash(x, y, z, a, R * 0.6, 0.22);
    this.onBurst?.(x, y, z, a, 1);
    const star = (dx: number, dy: number, dz: number, speed: number, c: Rgbish, drag: number) => {
      s.reset();
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = dx * speed;
      s.vy = dy * speed;
      s.vz = dz * speed;
      s.r = c.r;
      s.g = c.g;
      s.b = c.b;
      s.drag = drag;
    };
    const turn = rng() * Math.PI * 2;
    if (p.kind === 'peony') {
      // A sphere of stars in the first colour, and a smaller one inside in the second (the pistil).
      const inner = Math.floor(n / 4);
      for (let k = 0; k < n; k++) {
        const core = k < inner;
        sphere(k, n, turn, rng, DIR);
        star(DIR[0], DIR[1], DIR[2], R * 1.6 * (core ? 0.45 : 0.9 + 0.2 * rng()), core ? b : a, 1.6);
        s.size = 0.28;
        s.life = 1.4 + rng() * 0.6;
        s.gravity = 0.3;
        s.flags = glitter;
        s.w = 1.2;
        this.sparks.spawn(s);
      }
    } else if (p.kind === 'willow') {
      // Gold stars that droop and hang, drawing long trails.
      for (let k = 0; k < n; k++) {
        sphere(k, n, turn, rng, DIR);
        star(DIR[0], DIR[1], DIR[2], R * 2.2 * (0.85 + 0.25 * rng()), GOLD, 2.2);
        s.size = 0.2;
        s.life = 3 + rng();
        s.gravity = 0.55;
        s.flags = GLITTER;
        s.w = 4;
        this.sparks.spawn(s);
      }
    } else if (p.kind === 'ring') {
      // A flat ring, tipped toward the audience, around a small heart of the second colour.
      const tx = (rng() - 0.5) * 0.7;
      const ty = 0.3 + rng() * 0.5;
      const nn = Math.hypot(tx, ty, 1);
      const [nx, ny, nz] = [tx / nn, ty / nn, 1 / nn];
      // u, v: two directions in the ring's plane.
      const ul = Math.hypot(nz, nx) || 1;
      const [ux, uy, uz] = [nz / ul, 0, -nx / ul];
      const [vx, vy, vz] = [ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux];
      const heart = Math.floor(n / 6);
      for (let k = 0; k < n - heart; k++) {
        const t = turn + (k / (n - heart)) * Math.PI * 2;
        const c = Math.cos(t);
        const sn = Math.sin(t);
        star(ux * c + vx * sn, uy * c + vy * sn, uz * c + vz * sn, R * 1.7 * (0.97 + 0.06 * rng()), a, 1.7);
        s.size = 0.3;
        s.life = 1.5 + rng() * 0.3;
        s.gravity = 0.3;
        s.flags = glitter;
        s.w = 1.2;
        this.sparks.spawn(s);
      }
      for (let k = 0; k < heart; k++) {
        sphere(k, heart, turn, rng, DIR);
        star(DIR[0], DIR[1], DIR[2], R * 0.6, b, 1.7);
        s.size = 0.26;
        s.life = 1.2 + rng() * 0.3;
        s.gravity = 0.3;
        this.sparks.spawn(s);
      }
    } else {
      // Crossette: a few stars fly out and each splits in four.
      const m = Math.max(8, Math.round(n / 5));
      for (let k = 0; k < m; k++) {
        sphere(k, m, turn, rng, DIR);
        star(DIR[0], DIR[1], DIR[2], R * 0.75, a, 1.2);
        s.size = 0.32;
        s.life = 1.6;
        s.gravity = 0.3;
        s.flags = SPLIT;
        s.aux = 0.4 + rng() * 0.15;
        s.w = 1.5;
        this.sparks.spawn(s);
      }
    }
    // What is left when the stars are gone: smoke, lit by the burst and then by the stage.
    for (let k = 0; k < this.budget.puffs; k++) {
      s.reset();
      s.x = x + (rng() - 0.5) * R * 0.6;
      s.y = y + (rng() - 0.5) * R * 0.4;
      s.z = z + (rng() - 0.5) * R * 0.6;
      s.vx = (rng() - 0.5) * 1.5;
      s.vy = 0.4;
      s.r = s.g = s.b = 0.32;
      s.size = R * 0.5;
      s.grow = R * 0.12;
      s.life = 6 + rng() * 3;
      s.drag = 0.4;
      s.gravity = 0.1;
      s.alpha = 0.2;
      s.wait = 0.2;
      s.w = rng();
      this.smoke.spawn(s);
    }
  }

  // ------------------------------------------------------------------ devices
  private gerbSpark(j: Jet) {
    const rng = this.rng;
    const s = this.s;
    const tilt = j.spread * Math.sqrt(rng()) * DEG;
    const az = rng() * Math.PI * 2;
    const dx = Math.sin(tilt) * Math.cos(az);
    const dy = Math.cos(tilt);
    const dz = Math.sin(tilt) * Math.sin(az);
    const lean = j.lean * DEG;
    // Fast enough to reach the fountain's height against gravity and a little drag.
    const speed = Math.sqrt(2 * Math.max(1, Math.abs(this.gravity)) * j.height) * (0.75 + 0.4 * rng()) * 1.12;
    s.reset();
    s.x = j.x;
    s.y = j.y + 0.1;
    s.z = j.z;
    s.vx = (dx * Math.cos(lean) + dy * Math.sin(lean)) * speed;
    s.vy = (dy * Math.cos(lean) - dx * Math.sin(lean)) * speed;
    s.vz = dz * speed;
    // Cold sparks burn a warm white whatever the show's colours; a touch of them, no more.
    s.r = 1;
    s.g = 0.82 + 0.12 * rng();
    s.b = 0.5 + 0.3 * rng();
    s.r += (j.r - s.r) * 0.15;
    s.g += (j.g - s.g) * 0.15;
    s.b += (j.b - s.b) * 0.15;
    s.size = 0.07 + 0.05 * rng();
    s.life = 0.9 + 0.7 * rng();
    s.drag = 0.45;
    s.floor = j.y;
    s.flags = rng() < 0.35 ? GLITTER : 0;
    this.sparks.spawn(s);
  }

  private co2Puff(j: Jet) {
    const rng = this.rng;
    const s = this.s;
    const residue = rng() < 0.15;
    s.reset();
    s.x = j.x + (rng() - 0.5) * 0.3;
    s.y = j.y + 0.2;
    s.z = j.z + (rng() - 0.5) * 0.3;
    // CO2 is a dense white fog that throws back most of the light it stands in.
    const white = residue ? 1.1 : 1.7;
    s.r = j.r * white;
    s.g = j.g * white;
    s.b = j.b * white;
    s.w = rng();
    s.floor = j.y;
    if (residue) {
      // What hangs about once the jet has stopped: slow, wide and thin.
      s.y += 2 + rng() * 5 * j.height;
      s.vx = (rng() - 0.5) * 2;
      s.vy = 0.5;
      s.vz = (rng() - 0.5) * 2;
      s.size = 2.5;
      s.grow = 0.9;
      s.life = 4 + rng() * 2;
      s.drag = 0.8;
      s.gravity = -0.15;
      s.alpha = 0.16;
    } else {
      const speed = (20 + rng() * 8) * (0.6 + 0.4 * j.height);
      s.vx = (rng() - 0.5) * 0.18 * speed;
      s.vy = speed;
      s.vz = (rng() - 0.5) * 0.18 * speed;
      s.size = 0.5;
      s.grow = 3.5 + rng() * 2;
      s.life = 1.2 + rng() * 0.7;
      s.drag = 2.4;
      s.gravity = -0.4;
      s.alpha = 0.55;
    }
    this.smoke.spawn(s);
  }

  /** One ember from a flame jet at x, y, z: it flies up on the heat, flickers and goes out. */
  private ember(x: number, y: number, z: number, size: number) {
    const rng = this.rng;
    const s = this.s;
    s.reset();
    s.x = x + (rng() - 0.5) * 0.8;
    s.y = y + (1 + rng() * 6) * size;
    s.z = z + (rng() - 0.5) * 0.8;
    s.vx = (rng() - 0.5) * 3;
    s.vy = 2.5 + rng() * 4;
    s.vz = (rng() - 0.5) * 3;
    s.r = 1;
    s.g = 0.35 + rng() * 0.25;
    s.b = 0.08;
    s.size = 0.06 + 0.05 * rng();
    s.life = 1.2 + rng() * 1.3;
    s.drag = 1.1;
    // Buoyant: the hot air carries them up, against the pull that brings sparks down.
    s.gravity = -0.12;
    s.flags = GLITTER;
    this.sparks.spawn(s);
  }

  /** Smoke a flame leaves, rising from where its top was, `wait` seconds after the shot. */
  private soot(x: number, y: number, z: number, size: number, wait: number) {
    const rng = this.rng;
    const s = this.s;
    s.reset();
    s.x = x + (rng() - 0.5) * 1.2;
    s.y = y + (6 + rng() * 3) * size;
    s.z = z + (rng() - 0.5) * 1.2;
    s.vx = (rng() - 0.5) * 0.8;
    s.vy = 1.5 + rng();
    s.vz = (rng() - 0.5) * 0.8;
    s.r = s.g = s.b = 0.22;
    s.size = 2 * size;
    s.grow = 1.4;
    s.life = 4 + rng() * 2;
    s.drag = 0.35;
    s.gravity = 0.3;
    s.alpha = 0.25;
    s.wait = wait;
    s.w = rng();
    this.smoke.spawn(s);
  }

  /** A short bright glow (a burst's flash, a fountain's mouth): no streak, gone in `life` seconds. */
  private flash(x: number, y: number, z: number, c: Rgbish, size: number, life: number) {
    const s = this.s.reset();
    s.x = x;
    s.y = y;
    s.z = z;
    mixWhite(s, c, 0.5);
    s.size = size;
    s.life = life;
    s.gravity = 0;
    s.w = 0;
    this.sparks.spawn(s);
  }

  /** The jet already running at x, y, z of this kind, or a free one. */
  private jet(kind: JetKind, x: number, y: number, z: number): Jet {
    let free: Jet | undefined;
    for (const j of this.jets) {
      if (j.left > 0 && j.kind === kind && j.x === x && j.y === y && j.z === z) return j;
      if (!free && j.left <= 0) free = j;
    }
    // All busy: the one closest to finishing makes way.
    const jet = free ?? this.jets.reduce((m, j) => (j.left < m.left ? j : m));
    jet.kind = kind;
    jet.x = x;
    jet.y = y;
    jet.z = z;
    jet.carry = 0;
    return jet;
  }

  private payload(): Payload {
    this.payloadCursor = (this.payloadCursor + 1) % PAYLOADS;
    return this.payloads[this.payloadCursor];
  }
}

const WARM: Rgbish = { r: 1, g: 0.85, b: 0.6 };
const DIR: [number, number, number] = [0, 0, 0];

function setRgb(out: [number, number, number], c: Rgbish) {
  out[0] = c.r;
  out[1] = c.g;
  out[2] = c.b;
}

function rgbOf(c: readonly [number, number, number], out: { r: number; g: number; b: number }): Rgbish {
  out.r = c[0];
  out.g = c[1];
  out.b = c[2];
  return out;
}

function mixWhite(s: Spawn, c: Rgbish, k: number) {
  s.r = c.r + (1 - c.r) * k;
  s.g = c.g + (1 - c.g) * k;
  s.b = c.b + (1 - c.b) * k;
}

/** The k-th of n directions spread evenly over a sphere (a golden spiral), turned and jittered a little. */
export function sphere(k: number, n: number, turn: number, rng: () => number, out: [number, number, number]) {
  const y = 1 - (2 * (k + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = k * 2.399963 + turn + (rng() - 0.5) * 0.3;
  out[0] = Math.cos(phi) * r;
  out[1] = y;
  out[2] = Math.sin(phi) * r;
}
