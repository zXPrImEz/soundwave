import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import { shared } from '../aurora/shared';
import type { Vec3 } from '../stage/Director';
import { bandOn, busyOf, clearOf, fountains } from './kit/common';
import { fillCrowd } from './kit/crowd';
import { dressModel, instances, loadModel, type ModelData } from './kit/model';
import { gearRoles } from './kit/roles';
import { bandShots, shot } from './kit/shots';
import { glow, modelSurface } from './kit/surface';
import { loadScans } from './kit/textures';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

interface BarData extends ModelData {
  room: { half: number; z0: number; z1: number; h: number };
  counter: { x: number; z0: number; z1: number };
  ball: Vec3;
  keep_clear: number[][];
}

/**
 * Bar: a small live-music bar, warm and lived-in, modelled in Blender (tools/stage/venues/bar.py).
 * Old brick, a wooden floor, a velvet curtain behind the band, a counter of backlit bottles,
 * booths along the wall. Bulbs strung across the ceiling chase with the beat, neon hums on the
 * walls, and when it kicks off the mirror ball throws its spots round the room.
 */
export async function buildBar(ctx: VenueContext): Promise<Venue> {
  const { g } = ctx;
  const model = await loadModel('bar');
  const data = model.data as BarData;
  const scans = await loadScans(['wood_floor', 'planks', 'brick', 'plaster', 'carpet', 'velvet', 'leather'], g, ctx.anisotropy);
  const gear = gearRoles();
  const neon = [glow(0xff2a8a, 2.6), glow(0xffcc40, 2.4), glow(0x30e8ff, 2.6)];
  const bulbGlow = glow(0xffffff, 1, true);
  const bottleGlow = glow(0xffffff, 1, true);
  const dressed = dressModel(model, {
    ...gear.roles,
    WoodFloor: modelSurface({
      pattern: 'wood',
      color: 0x4a2c18,
      color2: 0x24140a,
      rough: 0.45,
      scale: 1.6,
      scan: scans.wood_floor,
      scanScale: 2.2,
      tint: 0xb89878,
      scanRough: 0.7,
    }),
    Wood: modelSurface({
      pattern: 'wood',
      color: 0x2a170c,
      color2: 0x120904,
      rough: 0.35,
      scale: 1.2,
      scan: scans.planks,
      scanScale: 1.8,
      tint: 0x8a5a3a,
      scanRough: 0.6,
    }),
    Brick: modelSurface({
      pattern: 'brick',
      color: 0x7a3b28,
      color2: 0x3a3029,
      rough: 0.9,
      scale: 0.42,
      scan: scans.brick,
      scanScale: 2,
      tint: 0xe0c8bc,
    }),
    Plaster: modelSurface({
      pattern: 'concrete',
      color: 0x1d1a22,
      color2: 0x120f14,
      rough: 0.9,
      scale: 2,
      scan: scans.plaster,
      scanScale: 2.5,
      tint: 0x4a4250,
    }),
    Ceiling: modelSurface({ color: 0x100e12, rough: 0.9, scan: scans.plaster, scanScale: 2, tint: 0x2a262c }),
    Carpet: modelSurface({ pattern: 'fabric', color: 0x2a0c12, rough: 1, scale: 0.4, scan: scans.carpet, scanScale: 1.2, tint: 0x8a3a48 }),
    Velvet: modelSurface({ pattern: 'fabric', color: 0x5a0a16, rough: 0.95, scale: 0.3, scan: scans.velvet, scanScale: 1, tint: 0xb01a30 }),
    Leather: modelSurface({ color: 0x3a1410, rough: 0.5, scan: scans.leather, scanScale: 0.8, tint: 0x9a4030, scanRough: 0.8 }),
    Brass: modelSurface({ pattern: 'metal', color: 0xc89838, rough: 0.25, metal: 1, scale: 0.3 }),
    Mirror: modelSurface({ pattern: 'metal', color: 0xc8ccd4, rough: 0.08, metal: 1, scale: 0.2 }),
    Glass: modelSurface({ pattern: 'glass', color: 0x101418, rough: 0.06, emissive: 0x040608 }),
    Poster: modelSurface({ color: 0xb8a078, rough: 0.8 }),
    'Glow.Counter': glow(0xff7a30, 1.8),
    'Glow.Shelf': glow(0xffa860, 1.3),
    'Glow.Bulb': glow(0xffc070, 2.2),
    'Glow.NeonA': neon[0],
    'Glow.NeonB': neon[1],
    'Glow.NeonC': neon[2],
    'Glow.Candle': glow(0xff9a40, 2.4),
    'Glow.Exit': glow(0x20ff70, 1.6),
  });
  const root = dressed.root;
  const owned: { dispose(): void }[] = [dressed, bulbGlow, bottleGlow];
  // The signs the game drives get glows of their own (the fixed neon keeps the shared ones).
  const signs = [0, 1, 2].map((i) => {
    const material = neon[i].clone();
    const part = dressed.moving.get(`neon_${i}`) as THREE.Mesh | undefined;
    if (part) part.material = material;
    owned.push(material);
    return material;
  });

  const bulbSpots = data.instances.bulb ?? [];
  const bulbs = instances(dressed.protos.get('bulb')!, bulbSpots, bulbGlow);
  const bottles = instances(dressed.protos.get('bottle')!, data.instances.bottle ?? [], bottleGlow);
  const tints = [0x6b3a10, 0x1f4a1a, 0x8a7a60, 0x3a1010, 0x6a5020, 0x204060].map((c) => new THREE.Color(c).multiplyScalar(1.5));
  for (let i = 0; i < bottles.count; i++) bottles.setColorAt(i, tints[(i * 7) % tints.length]);
  root.add(bulbs, bottles);

  const { band, players } = bandOn(data, ctx.cast, ctx.focus, (p) => [p[0] * 0.7, p[2] + 6]);
  const R = data.room;
  const C = data.counter;
  const stageFront = -3.5;
  const shots = [
    shot('front', [0, 1.9, 9.2], [0, 1.9, -5], 70, 'push', 2.5, 'all', 3),
    shot('hero', [-6.8, 3.3, 8.6], [3, 1.2, -2], 78, 'orbit', 0.15, 'all', 2),
    shot('crowd', [2.2, 1.6, 2.6], [0, 1.9, -5], 80, 'truck', 1.4, 'busy', 2),
    shot('close', [0.8, 1.7, -0.6], [0, 1.6, -5.5], 66, 'pull', 1, 'busy', 1.6),
    shot('aerial', [0.5, 4.1, 9.5], [0, 0.6, -2], 76, 'push', 2, 'all', 1),
    shot('bar', [7.5, 1.7, 7.9], [3, 1.4, -2], 82, 'truck', 1.2, 'all', 1.2),
    shot('wide-left', [-8.2, 2.2, 5.2], [2, 1.5, -4], 74, 'truck', 2, 'all', 1.2),
    shot('ball', [1.6, 2.4, 5.6], [data.ball[0], data.ball[1] - 0.15, data.ball[2]], 52, 'orbit', 0.4, 'peak', 1.2),
    shot('band', [0, 1.9, 1.2], [0, 1.6, -5], 70, 'truck', 1.6, 'busy', 1.4),
    ...bandShots(band, ctx.part, (p) => [p[0], p[1], p[2] + 6], 2.8, 50),
  ];
  const low = shots.filter((s) => s.pos[1] < 5).map((s) => s.pos);

  // A small crowd, packed at the front; a few at the counter, turned to it.
  const clear = clearOf(data.keep_clear, 0.2);
  const audience = fillCrowd(
    {
      bounds: [-R.half + 0.8, stageFront + 0.9, C.x - 0.6, R.z1 - 0.8],
      step: 0.78,
      density: (x, z) => {
        if (!clear(x, z)) return 0;
        if (x > C.x - 1.4) return z > C.z0 + 0.5 && z < C.z1 - 0.5 ? 0.45 : 0;
        return Math.max(0.18, 0.95 - (z - stageFront) * 0.085);
      },
      face: (x, z) => (x > C.x - 1.4 ? [R.half, z] : [x * 0.4, -5]),
      wander: 0.7,
    },
    ctx.characters,
    Math.max(0.6, LEVEL_SHARE[g.crowd]),
    low,
    ctx.cast.crowd.data.sync,
    23,
  );

  const L = shared.uLight.value;
  const LC = shared.uLightCol.value;
  const warm = new THREE.Color(1, 0.62, 0.3);
  const c = new THREE.Color();
  let ballLevel = 0;
  let turn = 0;
  let flicker = 1;

  const bind = () => {
    shared.uGlowPos.value.set(0, 2.2, -5);
    shared.uHazeFar.value.setRGB(0.012, 0.008, 0.007);
    shared.uHazeDensity.value = g.lights === 'low' ? 0.025 : 0.034;
    shared.uAmbient.value.setRGB(0.034, 0.025, 0.022);
    shared.uGlowLight.value.set(0.7, 5);
    shared.uGlowFall.value = 0.05;
    shared.uBall.value.set(...data.ball, ballLevel);
    shared.uBallTurn.value = turn;
    L[1].set(R.half - 0.6, 2, (C.z0 + C.z1) / 2, 4.5);
    LC[1].copy(warm).multiplyScalar(0.9);
    [1, 4, 7].forEach((z, i) => {
      L[2 + i].set(C.x + 0.4, 2.3, z, 2.4);
      LC[2 + i].copy(warm).multiplyScalar(0.8);
    });
    L[5].set(-R.half + 0.5, 2.6, 2.6, 3.2);
    L[6].set(7.2, 2.6, R.z0 + 0.6, 3.2);
  };

  const update = (f: VenueFrame) => {
    const s = f.show;
    const busy = busyOf(f.energy);
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    // The ball turns all night; its spots come up in a peak.
    turn += f.dt * (0.18 + 0.25 * busy);
    ballLevel += ((peak ? 1 : s.level === 'groove' ? 0.35 : 0.12) - ballLevel) * Math.min(1, f.dt * 1.5);
    // The bulbs: warm and steady, a gentle wave on the bar, chasing in a peak.
    for (let i = 0; i < bulbSpots.length; i++) {
      const chase = peak ? Math.pow(Math.max(0, Math.cos((f.clock * 0.5 - i * 0.09) * Math.PI)), 8) : 0;
      bulbs.setColorAt(i, c.setRGB(1, 0.62, 0.28).multiplyScalar(1.6 + 0.6 * f.barPulse * Math.sin(i * 0.7 + f.time) + 4 * chase));
    }
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    // Neon hums, now and then stutters; it breathes with the beat.
    flicker = Math.random() < f.dt * 0.25 ? 0.25 : Math.min(1, flicker + f.dt * 3);
    signs.forEach((m, i) => {
      m.uniforms.uLevel.value = 2.6 * (i === 1 ? flicker : 1) * (0.85 + 0.3 * f.pulse);
    });
    LC[5].setRGB(1, 0.16, 0.55).multiplyScalar(0.4);
    LC[6].setRGB(1, 0.7, 0.2).multiplyScalar(0.35 * flicker);
    // The stage wash and a flash for the blinder.
    L[0].set(0, 3, -3, 6);
    LC[0]
      .copy(f.key)
      .lerp(warm, 0.3)
      .multiplyScalar(1.1 + 0.6 * f.barPulse);
    L[7].set(0, 3.6, stageFront, 7);
    LC[7].setScalar(s.blinder * 2.5);
    shared.uFlash.value = s.blinder * 0.2;
  };

  const beam = (group: string, i: number, f: VenueFrame): BeamPose | undefined => {
    const s = f.show;
    const t = s.time;
    if (group === 'Pin') return { pan: 0, tilt: 0, level: 0.3 + 0.6 * ballLevel, color: 'white' };
    if (group === 'Par') {
      const chase = s.level === 'peak' ? ((f.beats + i) % 3 === 0 ? 1 : 0.25) : 0.6 + 0.3 * f.pulse;
      return { pan: 0, tilt: 0, level: (0.55 + 0.45 * s.beamLevel) * chase, color: i % 2 ? 'accent' : 'key' };
    }
    if (group === 'Floor')
      return { pan: Math.sin(t * 0.8 + i * 3) * 0.4, tilt: Math.cos(t * 0.6 + i) * 0.25, level: s.beamLevel * 0.8, color: 'accent' };
    return undefined;
  };

  return {
    root,
    shots,
    band,
    audience,
    players,
    fixtures: data.fixtures,
    fireworks: fountains(data.sources.sparks, [1.6, 2.6]),
    co2: [],
    confetti: (data.sources.confetti ?? []).map((pos) => ({ pos, dir: [-Math.sign(pos[0]) * 0.2, 1, 0.45] as Vec3 })),
    looks: [
      { key: [1, 0.5, 0.15], accent: [1, 0.18, 0.5], wash: [0.6, 0.12, 0.05] },
      { key: [1, 0.25, 0.12], accent: [1, 0.8, 0.35], wash: [0.5, 0.05, 0.08] },
      { key: [0.2, 0.85, 0.9], accent: [1, 0.55, 0.2], wash: [0.05, 0.3, 0.35] },
      { key: [0.75, 0.3, 1], accent: [1, 0.35, 0.7], wash: [0.3, 0.08, 0.45] },
    ],
    exposure: 1,
    bloom: [0.3, 0.5, 0.9],
    hazeNear: [0.06, 0.035, 0.025],
    background: [0.01, 0.006, 0.005],
    sparkGravity: -7,
    pools: 1.6,
    grade: { contrast: 1.08, saturation: 1.1, vignette: 0.3, tint: [1.04, 0.98, 0.92] },
    bind,
    update,
    beam,
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}
