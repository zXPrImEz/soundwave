import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import type { Fixture } from '../aurora/assets';
import { makeBand } from '../aurora/figures';
import { shared } from '../aurora/shared';
import type { Vec3 } from '../stage/Director';
import { Builder, disposeTree } from './kit/build';
import { dj, fillCrowd } from './kit/crowd';
import { Lasers, fan } from './kit/lasers';
import { bandShots, shot } from './kit/shots';
import { StrobeGate } from './kit/strobe';
import { glow, surface } from './kit/surface';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

const HALF = 8;
const HEIGHT = 3.3;
/** The DJ's table in the middle of the room. */
const BOOTH: Vec3 = [0, 0, 0];
/** Low platforms for the band round the edge. */
const PLATFORMS: { at: Vec3; size: [number, number] }[] = [
  { at: [-4.6, 0.3, -3], size: [2.2, 2] },
  { at: [4.6, 0.3, -3], size: [2.2, 2] },
  { at: [3.6, 0.3, -5.6], size: [3, 2.4] },
];

/**
 * Basement: a low concrete cellar, a DJ at a table in the middle with the crowd packed all round,
 * the band on low platforms at the edge, red tubes on the ceiling, a neon wave on the back wall,
 * thick haze, and a camera held by hand, wide and close, grain and all.
 */
export function buildBasement(ctx: VenueContext): Venue {
  const { g, menu } = ctx;
  const b = new Builder();
  const floor = surface({ pattern: 'concrete', color: 0x3a3836, color2: 0x1a1918, rough: 0.55, scale: 1 });
  const wallBrick = surface({ pattern: 'brick', color: 0x5a3426, color2: 0x2a2622, rough: 0.95, scale: 0.4 });
  const wallConcrete = surface({ pattern: 'concrete', color: 0x403e3c, color2: 0x252322, rough: 0.9, scale: 1.2 });
  const ceiling = surface({ pattern: 'concrete', color: 0x2c2a29, color2: 0x181716, rough: 0.95, scale: 1.4 });
  const black = surface({ color: 0x0c0c0e, rough: 0.6 });
  const metal = surface({ pattern: 'metal', color: 0x4a4844, rough: 0.4, metal: 0.8, scale: 0.5 });
  const lamp = glow(0xffb070, 3);

  b.panel(floor, HALF * 2, HALF * 2, [0, 0, 0], 0, -Math.PI / 2);
  b.panel(ceiling, HALF * 2, HALF * 2, [0, HEIGHT, 0], 0, Math.PI / 2);
  b.panel(wallBrick, HALF * 2, HEIGHT, [0, HEIGHT / 2, -HALF], 0);
  b.panel(wallConcrete, HALF * 2, HEIGHT, [0, HEIGHT / 2, HALF], Math.PI);
  b.panel(wallBrick, HALF * 2, HEIGHT, [-HALF, HEIGHT / 2, 0], Math.PI / 2);
  b.panel(wallConcrete, HALF * 2, HEIGHT, [HALF, HEIGHT / 2, 0], -Math.PI / 2);
  // Beams across the ceiling, pipes and a cable tray.
  for (const z of [-5, 0, 5]) b.box(wallConcrete, [HALF * 2, 0.35, 0.4], [0, HEIGHT - 0.17, z]);
  b.rod(metal, [-HALF, HEIGHT - 0.5, -2.2], [HALF, HEIGHT - 0.5, -2.2], 0.07, 8);
  b.rod(metal, [-HALF, HEIGHT - 0.6, -2.0], [HALF, HEIGHT - 0.6, -2.0], 0.045, 8);
  b.box(metal, [0.4, 0.05, HALF * 2], [5.5, HEIGHT - 0.45, 0]);
  // The DJ's table with two decks, a mixer and a lamp.
  b.box(black, [2.4, 0.9, 0.9], [BOOTH[0], 0.45, BOOTH[2]]);
  for (const x of [-0.8, 0.8]) b.drum(metal, 0.17, 0.04, [x, 0.9, BOOTH[2] - 0.05], 24);
  b.box(black, [0.36, 0.08, 0.42], [0, 0.94, BOOTH[2] - 0.05]);
  b.rod(metal, [1.05, 0.9, -0.3], [1.0, 1.3, -0.1], 0.008, 4);
  b.box(lamp, [0.08, 0.04, 0.08], [1.0, 1.3, -0.08]);
  // Speakers stacked in the corners, the band's platforms.
  for (const [x, z] of [
    [-7.2, -7.2],
    [7.2, -7.2],
    [-7.2, 7.2],
    [7.2, 7.2],
  ])
    b.box(black, [0.9, 1.8, 0.8], [x, 0.9, z], Math.atan2(-x, -z));
  for (const p of PLATFORMS) b.box(black, [p.size[0], p.at[1], p.size[1]], [p.at[0], p.at[1] / 2, p.at[2]]);
  const root = b.build('basement');
  const owned: { dispose(): void }[] = [{ dispose: () => disposeTree(root) }];

  // Red tubes on the ceiling.
  const tubeMat = glow(0xffffff, 1, true);
  const tubeSpots: Vec3[] = [];
  for (const z of [-6.5, -2.5, 2.5, 6.5]) for (const x of [-5, 0, 5]) tubeSpots.push([x, HEIGHT - 0.06, z]);
  const tubes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6).rotateZ(Math.PI / 2), tubeMat, tubeSpots.length);
  const m4 = new THREE.Matrix4();
  tubeSpots.forEach((p, i) => {
    tubes.setMatrixAt(i, m4.makeTranslation(...p));
    tubes.setColorAt(i, new THREE.Color(0, 0, 0));
  });
  root.add(tubes);

  // A neon waveform across the back wall.
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 80; k++) {
    const u = k / 80;
    const env = Math.sin(u * Math.PI);
    pts.push(new THREE.Vector3(-3.6 + u * 7.2, 1.85 + Math.sin(u * Math.PI * 9) * 0.42 * env * env, -HALF + 0.06));
  }
  const waveMat = glow(0xff2a3a, 3);
  const wave = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.025, 6), waveMat);
  root.add(wave);

  const lasers = new Lasers(g.effects === 'off' ? 0 : 60);
  root.add(lasers.mesh);

  const fixtures: Fixture[] = [];
  for (const x of [-2.4, 2.4])
    fixtures.push({ group: 'Back', pos: [x, HEIGHT - 0.3, -HALF + 0.4], dir: [-x * 0.08, -0.35, 1], length: 13, spread: 0.12 });
  for (const [x, z] of [
    [-4, -4],
    [4, -4],
    [-4, 4],
    [4, 4],
  ])
    fixtures.push({ group: 'Ceiling', pos: [x, HEIGHT - 0.2, z], dir: [-x * 0.08, -1, -z * 0.08], length: 4.5, spread: 0.1 });

  const band: Record<string, Vec3> = { lead: [-4.6, 0.3, -3], bass: [4.6, 0.3, -3], drums: [3.6, 0.3, -5.6], vox: [-2.4, 0, 0.7] };
  const players = makeBand({ band }, ctx.cast.band.data.band ?? {}, ctx.focus);
  for (const p of players) p.yaw = Math.atan2(-p.pos[0], 4 - p.pos[2]) * 0.7;

  const shots = [
    shot('front', [0.2, 1.95, 3.9], [0, 1.3, -1.6], 88, 'truck', 0.8, 'all', 3),
    shot('hero', [2.8, 2.6, 4.6], [0, 0.9, -1], 86, 'orbit', 0.25, 'all', 2),
    shot('crowd', [-3.2, 1.6, 3.8], [0, 1.4, 0], 92, 'truck', 0.8, 'busy', 2),
    shot('close', [0.7, 1.5, 1.45], [0, 1.35, -0.6], 78, 'pull', 0.4, 'busy', 1.8),
    shot('aerial', [-6.5, 3.05, 6.5], [0, 0.4, -1], 96, 'push', 1.2, 'all', 1),
    shot('behind', [0.5, 1.8, -2.4], [0, 1.1, 4], 94, 'truck', 0.6, 'peak', 1.4),
    shot('decks', [0.25, 1.75, 0.95], [0, 0.85, -0.05], 70, 'orbit', 0.3, 'peak', 1),
    ...bandShots(band, ctx.part, (p) => [0, p[1], 3], 2.4, 70),
  ];

  const share = Math.max(0.55, LEVEL_SHARE[g.crowd]);
  const audience = fillCrowd(
    {
      bounds: [-HALF + 0.5, -HALF + 0.5, HALF - 0.5, HALF - 0.5],
      step: 0.64,
      density: (x, z) => {
        if (Math.abs(x) < 1.6 && Math.abs(z) < 1.1) return 0;
        if (PLATFORMS.some((p) => Math.abs(x - p.at[0]) < p.size[0] / 2 + 0.3 && Math.abs(z - p.at[2]) < p.size[1] / 2 + 0.3)) return 0;
        if (Math.hypot(x - band.vox[0], z - band.vox[2]) < 0.9) return 0;
        if (Math.abs(Math.abs(x) - 7.2) < 0.8 && Math.abs(Math.abs(z) - 7.2) < 0.8) return 0;
        return Math.max(0.45, 1.1 - Math.hypot(x, z) / 12);
      },
      face: () => [0, 0],
      wander: 0.8,
    },
    ctx.characters,
    share,
    shots.map((s) => s.pos),
    ctx.cast.crowd.data.sync,
    67,
  );
  audience.push(dj(ctx.characters, [0, 0, -0.75], 0));

  const L = shared.uLight.value;
  const LC = shared.uLightCol.value;
  const red = new THREE.Color(1, 0.08, 0.06);
  const c = new THREE.Color();
  const corners = [new THREE.Vector3(-HALF + 0.3, HEIGHT - 0.3, -HALF + 0.3), new THREE.Vector3(HALF - 0.3, HEIGHT - 0.3, -HALF + 0.3)];
  let strobe = 0;
  let lastSub = -1;
  const gate = new StrobeGate();

  const bind = () => {
    shared.uGlowPos.value.set(0, 1.4, -HALF + 0.5);
    shared.uHazeFar.value.setRGB(0.02, 0.008, 0.008);
    shared.uHazeDensity.value = g.lights === 'low' ? 0.05 : 0.065;
    shared.uAmbient.value.setRGB(0.03, 0.016, 0.014);
    shared.uGlowLight.value.set(0.4, 4);
    shared.uGlowFall.value = 0.08;
    shared.uBall.value.w = 0;
    L[0].set(1, 1.25, -0.1, 1.3);
    LC[0].setRGB(1, 0.6, 0.3).multiplyScalar(1.4);
  };

  const update = (f: VenueFrame) => {
    const s = f.show;
    const busy = Math.min(1, Math.max(0, (f.energy - 0.25) / 0.6));
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    // The tubes: steady red, pumping with the kick, flicking to white on the strobe.
    // The strobe catches some of the beats in a peak, never more often than the gate allows.
    const sub = Math.floor(f.clock * 2);
    if (sub !== lastSub) {
      lastSub = sub;
      if (peak && !menu && Math.random() < 0.45 + 0.3 * s.overdrive && gate.fire(f.time)) strobe = 1;
    }
    strobe *= Math.exp(-f.dt * 30);
    tubeSpots.forEach((_, i) => {
      const k = 1.2 + 1.6 * f.pulse * (0.4 + 0.6 * busy) * ((i + f.beats) % 3 === 0 ? 1 : 0.5);
      tubes.setColorAt(
        i,
        c
          .copy(red)
          .lerp(f.key, 0.25)
          .multiplyScalar(k)
          .lerp(WHITE_HOT, strobe * 0.9),
      );
    });
    tubes.instanceColor!.needsUpdate = true;
    waveMat.uniforms.uLevel.value = 2.2 + 2.4 * f.low + 1.5 * f.pulse;
    waveMat.uniforms.uColor.value.copy(f.key).lerp(red, 0.4);
    // Room light from the tubes, the wave on the wall and the strobe.
    [-4, 0, 4].forEach((z, i) => {
      L[1 + i].set(0, HEIGHT - 0.3, z * 1.2, 4.5);
      LC[1 + i]
        .copy(red)
        .lerp(f.key, 0.3)
        .multiplyScalar(0.55 + 0.5 * f.pulse);
    });
    L[4].set(0, 1.9, -HALF + 0.8, 4);
    LC[4].copy(waveMat.uniforms.uColor.value).multiplyScalar(0.5);
    L[5].set(0, HEIGHT - 0.3, 0, 7);
    LC[5].setScalar(strobe * 2.5);
    for (let i = 6; i < 8; i++) LC[i].setRGB(0, 0, 0);
    shared.uFlash.value = strobe * 0.25;

    // Two lasers in the back corners fan a thin sheet over the heads when it gets going.
    lasers.begin();
    if (s.level !== 'calm') {
      const lv = 0.5 * (0.3 + 0.7 * busy);
      const col = c.setRGB(0.1, 1, 0.25);
      corners.forEach((src, k) =>
        fan(
          lasers,
          src,
          11,
          (k ? -1 : 1) * 0.75,
          -0.12 + 0.04 * Math.sin(f.time * 0.8 + k),
          1.0,
          18,
          col,
          lv,
          Math.sin(f.time * 0.5) * 0.06,
        ),
      );
    }
    lasers.end(f.height);
  };

  const beam = (group: string, i: number, f: VenueFrame): BeamPose | undefined => {
    const s = f.show;
    if (group === 'Back')
      return { pan: Math.sin(s.time * 0.3 + i * 2) * 0.12, tilt: 0, level: 0.55 + 0.35 * f.barPulse + 0.4 * s.blinder, color: 'key' };
    if (group === 'Ceiling')
      return {
        pan: Math.sin(s.time * 0.5 + i) * 0.4,
        tilt: Math.cos(s.time * 0.4 + i * 2) * 0.3,
        level: s.beamLevel * 0.7 * (0.5 + 0.5 * f.pulse),
        color: i % 2 ? 'accent' : 'key',
      };
    return undefined;
  };

  return {
    root,
    shots,
    band,
    audience,
    players,
    fixtures,
    fireworks: [],
    co2: [],
    confetti: [-1, 1].map((side) => ({ pos: [side * 1.4, 1, -0.6] as Vec3, dir: [side * 0.3, 1, 0.3] as Vec3 })),
    looks: [
      { key: [1, 0.12, 0.08], accent: [1, 0.55, 0.2], wash: [0.6, 0.04, 0.03] },
      { key: [1, 0.4, 0.15], accent: [1, 0.9, 0.8], wash: [0.5, 0.1, 0.04] },
      { key: [0.9, 0.1, 0.5], accent: [0.25, 0.4, 1], wash: [0.4, 0.04, 0.3] },
      { key: [1, 0.6, 0.2], accent: [0.2, 0.9, 1], wash: [0.5, 0.2, 0.05] },
    ],
    exposure: 1.05,
    bloom: [0.32, 0.55, 0.9],
    hazeNear: [0.07, 0.025, 0.02],
    background: [0.01, 0.005, 0.004],
    handheld: 0.9,
    bind,
    update,
    beam,
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

const WHITE_HOT = new THREE.Color(4, 4, 4);
