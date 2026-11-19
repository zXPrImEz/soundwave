import { describe, expect, it } from 'vitest';
import { ParticleSim, Pyro, Spawn, sphere, type PyroBudget } from '../src/render/stage/pyro';
import type { FireworkSpec } from '../src/render/aurora/assets';

/** A seeded random source, so every run plays out the same. */
function seeded(seed = 7) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUDGET: PyroBudget = { stars: 60, shells: 3, comets: 1, gerbRate: 100, trailRate: 40, co2Rate: 50, embers: 10, puffs: 2 };
const WHITE = { r: 1, g: 1, b: 1 };
const RED = { r: 1, g: 0.2, b: 0.1 };

function run(sim: ParticleSim, seconds: number, gravity: number, pyro?: Pyro) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    pyro?.update(1 / 60);
    sim.update(1 / 60, gravity);
  }
}

function setup(sparks = 20000, smoke = 4000) {
  const rng = seeded();
  const s = new ParticleSim(sparks, 12, 2.5, rng);
  const m = new ParticleSim(smoke, 6, 1.6, rng);
  const pyro = new Pyro(s, m, BUDGET, rng);
  return { s, m, pyro };
}

describe('particle simulation', () => {
  it('moves particles under gravity and drag, and lets them die', () => {
    const sim = new ParticleSim(8, 12, 2.5);
    const p = new Spawn().reset();
    p.vy = 10;
    p.life = 1;
    sim.spawn(p);
    run(sim, 0.5, -10);
    // Thrown up at 10 m/s against 10 m/s²: at the top after a second, 3.75 m up after half of it.
    expect(sim.pos[1]).toBeCloseTo(3.75, 0);
    expect(sim.vel[3]).toBeGreaterThan(0);
    run(sim, 0.6, -10);
    expect(sim.count).toBe(0);
    expect(sim.vel[3]).toBe(0);
    expect(sim.update(1 / 60, -10)).toBe(false);
  });

  it('bounces off its floor and stays above it', () => {
    const sim = new ParticleSim(4, 12, 2.5);
    const p = new Spawn().reset();
    p.y = 2;
    p.vy = -5;
    p.floor = 1;
    p.life = 3;
    sim.spawn(p);
    let lowest = Infinity;
    for (let t = 0; t < 2; t += 1 / 60) {
      sim.update(1 / 60, -9);
      lowest = Math.min(lowest, sim.pos[1]);
    }
    expect(lowest).toBeGreaterThanOrEqual(1);
  });

  it('replaces the oldest particle when full', () => {
    const sim = new ParticleSim(3, 12, 2.5);
    const p = new Spawn().reset();
    for (let k = 0; k < 5; k++) {
      p.x = k;
      sim.spawn(p);
    }
    expect(sim.used).toBe(3);
    expect([sim.pos[0], sim.pos[4], sim.pos[8]]).toEqual([3, 4, 2]);
  });

  it('keeps a waiting particle still and unseen until it starts', () => {
    const sim = new ParticleSim(2, 6, 1.6);
    const p = new Spawn().reset();
    p.vx = 5;
    p.wait = 0.5;
    p.life = 2;
    sim.spawn(p);
    run(sim, 0.3, 0);
    expect(sim.pos[0]).toBe(0);
    expect(sim.vel[3]).toBe(0);
    run(sim, 0.5, 0);
    expect(sim.pos[0]).toBeGreaterThan(0);
    expect(sim.vel[3]).toBeGreaterThan(0);
  });
});

describe('pyro', () => {
  const launcher: FireworkSpec = { origin: [0, 20, -30], n: 18, spread: 50, length: [26, 38], lean: 0 };
  const fountain: FireworkSpec = { origin: [3, 1.5, -8], n: 7, spread: 5, length: [5, 8], lean: 0 };

  it('sends shells up that burst at the top of their climb, and lights the room as they do', () => {
    const { s, m, pyro } = setup();
    const bursts: number[] = [];
    pyro.onBurst = (_x, y, _z, _c, strength) => {
      if (strength === 1) bursts.push(y);
    };
    pyro.launch(launcher, RED, WHITE, 0);
    // The fan of comets, three shells and the launch flash.
    expect(s.count).toBe(18 + 3 + 1);
    run(s, 2, -9, pyro);
    expect(bursts.length).toBe(3);
    // Each burst well above the launcher, below the fan's longest reach.
    for (const y of bursts) {
      expect(y).toBeGreaterThan(20 + 26 * 0.6 * 0.8);
      expect(y).toBeLessThan(20 + 38);
    }
    // Their stars are in the air, and smoke is left behind.
    expect(s.count).toBeGreaterThan(100);
    expect(m.count).toBe(3 * BUDGET.puffs);
  });

  it('bursts in a different pattern from one salvo to the next, crossettes splitting in four', () => {
    const splits = (salvo: number) => {
      const { s, pyro } = setup();
      const split = pyro.split.bind(pyro);
      let n = 0;
      pyro.split = (sim, i) => {
        n++;
        split(sim, i);
      };
      // One shell (n / 6): bursts in the pattern its salvo picks.
      pyro.launch({ ...launcher, n: 6 }, RED, WHITE, salvo);
      run(s, 3, -9, pyro);
      return n;
    };
    expect(splits(0)).toBe(0);
    expect(splits(3)).toBe(Math.max(8, Math.round(BUDGET.stars / 5)));
  });

  it('runs a fountain for a second and a half at its rate, sparks coming down on the deck', () => {
    const { s, pyro } = setup();
    pyro.launch(fountain, WHITE, WHITE, 0);
    let lowest = Infinity;
    for (let t = 0; t < 1.5; t += 1 / 60) {
      pyro.update(1 / 60);
      s.update(1 / 60, -9);
      for (let i = 0; i < s.used; i++) if (s.alive(i)) lowest = Math.min(lowest, s.pos[i * 4 + 1]);
    }
    expect(lowest).toBeGreaterThanOrEqual(1.5);
    const sparks = s.count;
    // 100 a second for 1.5 s, the oldest already burnt out, plus the glow at the mouth.
    expect(sparks).toBeGreaterThan(60);
    expect(sparks).toBeLessThan(160);
    run(s, 2, -9, pyro);
    expect(s.count).toBe(0);
  });

  it('blows CO2 plumes that climb fast and spread', () => {
    const { m, pyro } = setup();
    pyro.co2(0, 2, 0, 1, WHITE);
    run(m, 0.5, 1, pyro);
    let top = 0;
    let widest = 0;
    for (let i = 0; i < m.used; i++) {
      top = Math.max(top, m.pos[i * 4 + 1]);
      widest = Math.max(widest, m.pos[i * 4 + 3]);
    }
    expect(m.count).toBeGreaterThan(15);
    expect(top).toBeGreaterThan(6);
    expect(widest).toBeGreaterThan(1.5);
  });

  it('leaves embers and, a moment later, smoke after a flame', () => {
    const { s, m, pyro } = setup();
    for (let k = 0; k < 10; k++) pyro.flame(k * 3, 1, 0, 1);
    expect(s.count).toBe(10 * BUDGET.embers);
    // About a puff a shot (puffs × 0.4 on average), never a wall of it.
    expect(m.count).toBeGreaterThan(2);
    expect(m.count).toBeLessThanOrEqual(10 * Math.ceil(BUDGET.puffs * 0.4));
    // The smoke waits for the flame to burn out before it shows.
    run(m, 0.3, 1);
    for (let i = 0; i < m.used; i++) expect(m.vel[i * 4 + 3]).toBe(0);
  });

  it('does nothing on a budget of nothing', () => {
    const rng = seeded();
    const s = new ParticleSim(100, 12, 2.5, rng);
    const m = new ParticleSim(100, 6, 1.6, rng);
    const none: PyroBudget = { stars: 0, shells: 0, comets: 0, gerbRate: 0, trailRate: 0, co2Rate: 0, embers: 0, puffs: 0 };
    const pyro = new Pyro(s, m, none, rng);
    pyro.launch(launcher, RED, WHITE, 0);
    pyro.launch(fountain, RED, WHITE, 0);
    pyro.co2(0, 0, 0, 1, WHITE);
    pyro.flame(0, 0, 0, 1);
    pyro.drift(1, [[0, 0, 0]], 10, WHITE);
    run(s, 1, -9, pyro);
    expect(s.count + m.count).toBe(0);
  });

  it('spreads burst directions evenly over the sphere', () => {
    const out: [number, number, number] = [0, 0, 0];
    let sum = [0, 0, 0];
    for (let k = 0; k < 200; k++) {
      sphere(k, 200, 0, () => 0.5, out);
      expect(Math.hypot(...out)).toBeCloseTo(1, 5);
      sum = sum.map((v, i) => v + out[i]);
    }
    for (const v of sum) expect(Math.abs(v) / 200).toBeLessThan(0.05);
  });
});
