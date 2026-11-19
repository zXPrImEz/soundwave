import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import { shared } from '../aurora/shared';
import type { Vec3 } from '../stage/Director';
import { bandOn, busyOf, clearOf } from './kit/common';
import { dj, fillCrowd } from './kit/crowd';
import { Lasers, fan } from './kit/lasers';
import { LedScreen } from './kit/led';
import { dressModel, instances, loadModel, type ModelData } from './kit/model';
import { gearRoles } from './kit/roles';
import { bandShots, shot } from './kit/shots';
import { StrobeGate } from './kit/strobe';
import { glow, modelSurface } from './kit/surface';
import { loadScans } from './kit/textures';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

interface BasementData extends ModelData {
  room: { half: number; z0: number; z1: number; h: number };
  keep_clear: number[][];
}

/**
 * Basement: a raw concrete cellar, modelled in Blender (tools/stage/venues/basement.py). The band
 * plays in front of the booth with the crowd packed all round, the DJ at the decks behind them,
 * stacks of speakers in every bay. Red tubes on the ceiling pump with the kick, a neon wave burns
 * on the back wall, lasers skim the heads, the haze is thick, and the camera is held by hand,
 * wide and close, grain and all.
 */
export async function buildBasement(ctx: VenueContext): Promise<Venue> {
  const { g, menu } = ctx;
  const model = await loadModel('basement');
  const data = model.data as BasementData;
  const scans = await loadScans(['concrete_floor', 'concrete_wall', 'brick', 'steel_rust', 'carpet'], g, ctx.anisotropy);
  const gear = gearRoles();
  const signGlow = glow(0xff2a3a, 3);
  const tubeGlow = glow(0xffffff, 1, true);
  const strobeGlow = glow(0xffffff, 1, true);
  const dressed = dressModel(model, {
    ...gear.roles,
    Floor: modelSurface({
      pattern: 'concrete',
      color: 0x3a3836,
      color2: 0x1a1918,
      rough: 0.5,
      scale: 1,
      mirror: true,
      wet: 0.35,
      scan: scans.concrete_floor,
      scanScale: 3,
      tint: 0x8a8884,
      scanRough: 0.6,
    }),
    Concrete: modelSurface({
      pattern: 'concrete',
      color: 0x403e3c,
      color2: 0x252322,
      rough: 0.9,
      scale: 1.2,
      scan: scans.concrete_wall,
      scanScale: 3,
      tint: 0xa8a49e,
      bump: 1.2,
    }),
    Brick: modelSurface({
      pattern: 'brick',
      color: 0x5a3426,
      color2: 0x2a2622,
      rough: 0.95,
      scale: 0.4,
      scan: scans.brick,
      scanScale: 2,
      tint: 0xb8a8a0,
    }),
    Rust: modelSurface({ pattern: 'metal', color: 0x4a3a30, rough: 0.7, metal: 0.4, scale: 0.5, scan: scans.steel_rust, scanScale: 1.2 }),
    Cloth: modelSurface({ pattern: 'fabric', color: 0x26242a, rough: 1, scale: 0.3, scan: scans.carpet, scanScale: 1, tint: 0x4a484e }),
    Hazard: modelSurface({ pattern: 'hazard', color: 0xe8b400, color2: 0x111111, rough: 0.6, scale: 0.5 }),
    'Glow.Sign': signGlow,
    'Glow.Exit': glow(0x20ff70, 1.6),
    'Glow.Cage': glow(0xffa040, 1.6),
  });
  const root = dressed.root;
  const owned: { dispose(): void }[] = [dressed, tubeGlow, strobeGlow];

  const booth = new LedScreen([64, 16], ['bars', 'stripes', 'grid', 'glyph'], 2, 14);
  for (const mesh of dressed.screens.get('booth') ?? []) mesh.material = booth.material;
  owned.push(booth);

  const tubeSpots = data.instances.tube ?? [];
  const tubes = instances(dressed.protos.get('tube')!, tubeSpots, tubeGlow);
  const strobes = instances(dressed.protos.get('strobe')!, data.instances.strobe ?? [], strobeGlow);
  root.add(tubes, strobes);

  const lasers = new Lasers(g.effects === 'off' ? 0 : 60);
  root.add(lasers.mesh);
  const corners = (data.sources.laser ?? []).map((p) => new THREE.Vector3(...p));

  const { band, players } = bandOn(data, ctx.cast, ctx.focus, (p) => [p[0] * 0.6, p[2] + 6]);
  const djAt = data.marks.dj;
  const shots = [
    shot('front', [0.2, 1.95, 6.6], [0, 1.3, 0.5], 86, 'truck', 0.8, 'all', 3),
    shot('hero', [5.0, 3.5, 9.2], [-1.5, 1.2, -3], 84, 'orbit', 0.2, 'all', 2),
    shot('crowd', [-3.4, 1.65, 6.2], [0, 1.4, 1], 90, 'truck', 0.8, 'busy', 2),
    shot('close', [1.2, 1.6, 5.2], [0, 1.4, 2.2], 72, 'pull', 0.5, 'busy', 1.8),
    shot('aerial', [-6.6, 4.2, 8.6], [0, 0.4, 0], 94, 'push', 1.2, 'all', 1),
    shot('behind', [0.6, 2.3, -3.6], [0, 1.0, 3], 84, 'truck', 0.6, 'peak', 1.2),
    shot('dj', [1.9, 1.9, 2.7], [0, 1.4, -0.4], 62, 'truck', 0.5, 'busy', 1.2),
    ...bandShots(band, ctx.part, (p) => [p[0] * 0.3, p[1], p[2] + 6], 2.6, 66),
  ];

  const R = data.room;
  const clear = clearOf(data.keep_clear, 0.25);
  const audience = fillCrowd(
    {
      bounds: [-R.half + 0.6, R.z0 + 0.6, R.half - 0.6, R.z1 - 0.6],
      step: 0.58,
      density: (x, z) => {
        if (!clear(x, z)) return 0;
        if (Object.values(band).some((p) => Math.hypot(x - p[0], z - p[2]) < 1)) return 0;
        // A lane before the band stays open, so they are seen.
        if (Math.abs(x) < 4.2 && z > 0.6 && z < 3.6) return 0;
        return Math.max(0.7, 1.15 - Math.hypot(x, z) / 18);
      },
      face: () => [0, 1.5],
      wander: 0.8,
    },
    ctx.characters,
    Math.max(0.55, LEVEL_SHARE[g.crowd]),
    shots.map((s) => s.pos),
    ctx.cast.crowd.data.sync,
    67,
  );
  if (djAt) audience.push(dj(ctx.characters, djAt, 0));

  const L = shared.uLight.value;
  const LC = shared.uLightCol.value;
  const red = new THREE.Color(1, 0.08, 0.06);
  const c = new THREE.Color();
  const gate = new StrobeGate();
  let strobe = 0;
  let lastSub = -1;

  const bind = () => {
    shared.uGlowPos.value.set(0, 2.8, R.z0 + 0.5);
    shared.uHazeFar.value.setRGB(0.02, 0.008, 0.008);
    shared.uHazeDensity.value = g.lights === 'low' ? 0.04 : 0.052;
    shared.uAmbient.value.setRGB(0.03, 0.017, 0.015);
    shared.uGlowLight.value.set(0.5, 5);
    shared.uGlowFall.value = 0.06;
    shared.uBall.value.w = 0;
  };

  const update = (f: VenueFrame) => {
    const s = f.show;
    const busy = busyOf(f.energy);
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    if (f.beat === 'downbeat' && s.bar % 4 === 0) booth.next(s.bar / 4);
    booth.update(f.dt);
    gear.jog.uniforms.uLevel.value = 1.4 + 2 * f.pulse;
    gear.jog.uniforms.uColor.value.copy(f.accent);
    gear.meter.uniforms.uLevel.value = 1 + 2.5 * f.low;

    // The strobe catches some of the beats in a peak, never more often than the gate allows.
    const sub = Math.floor(f.clock * 2);
    if (sub !== lastSub) {
      lastSub = sub;
      if (peak && !menu && Math.random() < 0.45 + 0.3 * s.overdrive && gate.fire(f.time)) strobe = 1;
    }
    strobe *= Math.exp(-f.dt * 30);
    for (let i = 0; i < strobes.count; i++) strobes.setColorAt(i, c.setScalar(0.05 + strobe * 9));
    if (strobes.instanceColor) strobes.instanceColor.needsUpdate = true;
    // The tubes: steady red, pumping with the kick in rows, white for an instant on the strobe.
    tubeSpots.forEach((p, i) => {
      const row = Math.round(p[2] / 3.5);
      const k = 1.1 + 1.8 * f.pulse * (0.4 + 0.6 * busy) * ((row + f.beats) % 3 === 0 ? 1 : 0.45);
      tubes.setColorAt(
        i,
        c
          .copy(red)
          .lerp(f.key, 0.25)
          .multiplyScalar(k)
          .lerp(WHITE_HOT, strobe * 0.9),
      );
    });
    if (tubes.instanceColor) tubes.instanceColor.needsUpdate = true;
    signGlow.uniforms.uLevel.value = 2.2 + 2.4 * f.low + 1.5 * f.pulse;
    signGlow.uniforms.uColor.value.copy(f.key).lerp(red, 0.4);

    // Room light from the tubes, the sign and the strobe, and the lamp on the decks.
    [-6, 0, 6].forEach((z, i) => {
      L[i].set(0, R.h - 0.4, z, 5.5);
      LC[i]
        .copy(red)
        .lerp(f.key, 0.3)
        .multiplyScalar(0.6 + 0.5 * f.pulse);
    });
    L[3].set(0, 2.9, R.z0 + 1, 5);
    LC[3].copy(signGlow.uniforms.uColor.value).multiplyScalar(0.6);
    L[4].set(0, R.h - 0.6, 0, 8);
    LC[4].setScalar(strobe * 2.5);
    L[5].set(0, 1.6, 0.2, 1.6);
    LC[5].setRGB(1, 0.6, 0.3).multiplyScalar(1.2);
    // A warm key on the band from the truss.
    L[6].set(0, 3.4, 4.2, 4);
    LC[6].setRGB(1, 0.8, 0.6).multiplyScalar(0.9 + 0.3 * f.barPulse);
    LC[7].setRGB(0, 0, 0);
    shared.uFlash.value = strobe * 0.25;

    lasers.begin();
    if (s.level !== 'calm') {
      const lv = 0.5 * (0.3 + 0.7 * busy);
      const col = c.setRGB(0.1, 1, 0.25);
      corners.forEach((p, k) =>
        fan(lasers, p, 11, (k ? -1 : 1) * 0.42, -0.1 + 0.03 * Math.sin(f.time * 0.8 + k), 0.8, 23, col, lv, Math.sin(f.time * 0.5) * 0.05),
      );
    }
    lasers.end(f.height);
  };

  const beam = (group: string, i: number, f: VenueFrame): BeamPose | undefined => {
    const s = f.show;
    if (group === 'Back')
      return { pan: Math.sin(s.time * 0.3 + i * 2) * 0.12, tilt: 0, level: 0.5 + 0.35 * f.barPulse + 0.4 * s.blinder, color: 'key' };
    if (group === 'Truss')
      return {
        pan: Math.sin(s.time * 0.5 + i) * 0.4,
        tilt: Math.cos(s.time * 0.4 + i * 2) * 0.3,
        level: 0.25 + s.beamLevel * 0.6 * (0.5 + 0.5 * f.pulse),
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
    fixtures: data.fixtures,
    fireworks: [],
    co2: [],
    confetti: (data.sources.confetti ?? []).map((pos) => ({ pos, dir: [Math.sign(pos[0]) * 0.3, 1, 0.3] as Vec3 })),
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
    mirror: { level: 0 },
    pools: 1.6,
    handheld: 0.9,
    grade: { contrast: 1.12, saturation: 1.05, vignette: 0.2 },
    bind,
    update,
    beam,
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

const WHITE_HOT = new THREE.Color(4, 4, 4);
