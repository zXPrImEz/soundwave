import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import { shared } from '../aurora/shared';
import type { Vec3 } from '../stage/Director';
import { Bulbs } from './kit/bulbs';
import { bandOn, busyOf, clearOf, fountains, rockets } from './kit/common';
import { dj, fillCrowd } from './kit/crowd';
import { Lasers, fan } from './kit/lasers';
import { LedScreen } from './kit/led';
import { dressModel, instances, loadModel, type ModelData } from './kit/model';
import { gearRoles } from './kit/roles';
import { bandShots, shot } from './kit/shots';
import { duskSky } from './kit/sky';
import { StrobeGate } from './kit/strobe';
import { glow, modelSurface } from './kit/surface';
import { loadScans } from './kit/textures';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

interface MonolithData extends ModelData {
  deck: { front: number; half: number; y: number; back: number };
  band: { y: number; h: number; len: number; z: number };
  water: number;
  terrace: { x0: number; x1: number; z0: number; depth: number; steps: number; y0: number; rise: number };
  obstacles: { pos: number[]; radius: number }[];
}

/**
 * Monolith: four concrete gates on a lake shore and one bar of light through them all, modelled in
 * Blender (tools/stage/venues/monolith.py). The show is as spare as the architecture: the block of
 * LEDs breathes and sweeps, uplights climb the piers, heads let into the lintels rake the field, strobes fire from the soffits, lamps trace every edge, and the lake mirrors it all. The
 * band plays at the front of the deck, the DJ under the bar of light; guests stand on the terrace
 * behind them, over the water.
 */
export async function buildMonolith(ctx: VenueContext): Promise<Venue> {
  const { g, menu } = ctx;
  const model = await loadModel('monolith');
  const data = model.data as MonolithData;
  const scans = await loadScans(['concrete_wall', 'concrete_floor', 'ground', 'planks', 'wood_floor', 'plaster'], g, ctx.anisotropy);
  const gear = gearRoles();
  const strobeGlow = glow(0xffffff, 1, true);
  const dressed = dressModel(model, {
    ...gear.roles,
    Concrete: modelSurface({
      pattern: 'concrete',
      color: 0x8a8884,
      color2: 0x4a4844,
      rough: 0.9,
      scale: 2,
      scan: scans.concrete_wall,
      scanScale: 5,
      tint: 0xd8d6d0,
    }),
    Joint: modelSurface({ color: 0x1a1a1a, rough: 1 }),
    Deck: modelSurface({
      pattern: 'wood',
      color: 0x121212,
      color2: 0x080808,
      rough: 0.35,
      scale: 3,
      scan: scans.planks,
      scanScale: 3,
      tint: 0x2a2a2c,
      scanRough: 0.6,
    }),
    Ground: modelSurface({
      pattern: 'grass',
      color: 0x2a2c22,
      color2: 0x3a3428,
      rough: 0.95,
      scale: 3,
      scan: scans.ground,
      scanScale: 4,
      tint: 0x8a8678,
    }),
    Water: modelSurface({ color: 0x050a10, rough: 0.05, mirror: true, wet: 1 }),
    Glass: modelSurface({ pattern: 'glass', color: 0x101820, rough: 0.06, emissive: 0x04080c }),
    Wood: modelSurface({
      pattern: 'wood',
      color: 0x4a3524,
      color2: 0x24180e,
      rough: 0.6,
      scale: 1.4,
      scan: scans.wood_floor,
      scanScale: 2,
    }),
    Trees: glow(0x020304, 1),
    Canvas: modelSurface({ pattern: 'fabric', color: 0xd8d4cc, rough: 0.9, scale: 0.6, scan: scans.plaster, scanScale: 3, tint: 0xe8e4dc }),
    Hazard: modelSurface({ color: 0xe8a000, rough: 0.6 }),
    'Glow.Warm': glow(0xffb060, 1.8),
    'Glow.Lamp': glow(0xfff0d8, 2.2),
  });
  const root = dressed.root;
  const owned: { dispose(): void }[] = [dressed, strobeGlow];

  const dusk = { value: 0.6 };
  const sky = duskSky(dusk);
  root.add(sky);

  const band = new LedScreen([316, 20], ['solid', 'stripes', 'solid', 'bars', 'solid', 'rings'], 2.2, 11);
  const fascia = new LedScreen([520, 10], ['stripes', 'solid', 'bars'], 1.5, 12);
  const booth = new LedScreen([64, 16], ['bars', 'stripes', 'grid'], 2, 13);
  // The block's top, underside and ends: the same pictures, dimmer, so it reads as a solid.
  const bandedge = new LedScreen([316, 12], ['solid', 'stripes', 'solid', 'bars', 'solid', 'rings'], 2.2, 11);
  const screens = { band, bandedge, fascia, booth };
  for (const [key, scr] of Object.entries(screens)) for (const mesh of dressed.screens.get(key) ?? []) mesh.material = scr.material;
  owned.push(band, bandedge, fascia, booth);

  const strobes = instances(dressed.protos.get('strobe')!, data.instances.strobe ?? [], strobeGlow);
  const strobeLevel = new Float32Array(strobes.count);
  const bulbs = new Bulbs(dressed.protos.get('bulb')!, data.instances.bulb ?? [], 0xfff2e0);
  root.add(strobes, bulbs.mesh);
  owned.push(bulbs);

  const lasers = new Lasers(g.effects === 'off' ? 0 : g.effects === 'low' ? 60 : 140);
  root.add(lasers.mesh);
  const laserHeads = (data.sources['laser.band'] ?? []).map((p) => new THREE.Vector3(...p));

  const { band: marks, players } = bandOn(data, ctx.cast, ctx.focus);
  const deck = data.deck;
  const shots = [
    shot('front', [0, 5.5, 42], [0, 10, -18], 76, 'push', 6, 'all', 3),
    shot('hero', [55, 22, 70], [-5, 9, -16], 56, 'orbit', 0.14, 'all', 2),
    shot('crowd', [8, 3.2, 26], [0, 10, -16], 78, 'truck', 4, 'busy', 2),
    shot('close', [6, 5.2, 0], [-1, 7.5, -16], 74, 'pull', 3, 'busy', 1.5),
    shot('under', [6.2, 4, -8.6], [10.4, 17, -14.5], 80, 'crane', 1, 'peak', 1),
    shot('lake', [84, 10, -56], [0, 6, -24], 58, 'truck', 8, 'all', 1),
    shot('aerial', [20, 60, 90], [0, 6, -14], 56, 'orbit', 0.2, 'all', 1),
    shot('wide-left', [-52, 7, 40], [0, 10, -16], 62, 'truck', 8, 'all', 1.2),
    shot('wide-right', [52, 7, 40], [0, 10, -16], 62, 'truck', 8, 'all', 1.2),
    shot('dj', [2, deck.y + 3, -11.5], [0, deck.y + 2.1, -16.5], 54, 'truck', 1.5, 'busy', 1.2),
    shot('band', [-1, deck.y + 3.2, 2], [0, deck.y + 1.6, -11.5], 60, 'truck', 4, 'busy', 1.4),
    ...bandShots(marks, ctx.part, (p) => [p[0] * 0.4, p[1], p[2] + 12], 6),
  ];
  const low = shots.filter((s) => s.pos[1] < 10).map((s) => s.pos);

  const share = LEVEL_SHARE[g.crowd];
  const sync = ctx.cast.crowd.data.sync;
  const clear = clearOf(data.obstacles, 0.6);
  const audience = fillCrowd(
    {
      bounds: [-75, -5, 75, 108],
      step: 0.92,
      density: (x, z) => {
        if (!clear(x, z) || Math.abs(x) > 44 + (z + 5) * 0.45) return 0;
        if (Math.abs(x - 2.2) < 0.7 && z < 47) return 0;
        return Math.max(0.25, 1.08 - Math.hypot(x, z + 5) / 135);
      },
      face: (x) => [x * 0.3, -16],
    },
    ctx.characters,
    share,
    low,
    sync,
    71,
  );
  // Guests on the terrace behind the stage, looking over the artists' shoulders.
  const tr = data.terrace;
  audience.push(
    ...fillCrowd(
      {
        bounds: [tr.x0 + 0.6, tr.z0 - tr.steps * tr.depth + 0.3, tr.x1 - 0.6, tr.z0 - 0.3],
        step: 0.85,
        density: (_, z) => {
          const f = (tr.z0 - z) / tr.depth;
          return f - Math.floor(f) > 0.25 && f - Math.floor(f) < 0.85 ? 0.8 : 0;
        },
        face: (x) => [x * 0.5, 30],
        ground: (_, z) => tr.y0 + Math.min(tr.steps - 1, Math.floor((tr.z0 - z) / tr.depth)) * tr.rise,
        wander: 0.5,
      },
      ctx.characters,
      Math.max(0.5, share),
      low,
      sync,
      73,
    ),
  );
  if (data.marks.dj) audience.push(dj(ctx.characters, data.marks.dj, 0));

  const L = shared.uLight.value;
  const LC = shared.uLightCol.value;
  const color = new THREE.Color();
  const c1 = new THREE.Color();
  const tmp = new THREE.Vector3();
  const gate = new StrobeGate();
  let lastSub = -1;
  let flash = 0;

  const bind = () => {
    const k = dusk.value;
    shared.uGlowPos.value.set(0, data.band.y, data.band.z);
    shared.uHazeFar.value.setRGB(0.05 * (1 - k) + 0.006 * k, 0.045 * (1 - k) + 0.008 * k, 0.055 * (1 - k) + 0.014 * k);
    shared.uHazeDensity.value = 0.0022;
    shared.uAmbient.value.setRGB(0.12 * (1 - k) + 0.012 * k, 0.11 * (1 - k) + 0.014 * k, 0.13 * (1 - k) + 0.022 * k);
    shared.uGlowLight.value.set(2.4, 30);
    shared.uGlowFall.value = 0.0014;
    shared.uBall.value.w = 0;
  };

  const update = (f: VenueFrame) => {
    const s = f.show;
    const busy = busyOf(f.energy);
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    dusk.value = menu ? 0.75 : Math.min(1, 0.45 + f.time / 160);
    if (f.beat === 'downbeat') {
      if (s.bar % 8 === 0) {
        band.next(s.bar / 8);
        bandedge.next(s.bar / 8);
      }
      if (s.bar % 4 === 2) fascia.next(s.bar / 4);
      if (s.bar % 4 === 0) booth.next(s.bar / 4);
    }
    band.level = 1.25 + 0.7 * f.barPulse + 0.5 * busy + 0.6 * s.overdrive;
    bandedge.level = band.level * 0.35;
    for (const scr of Object.values(screens)) scr.update(f.dt);
    bulbs.update(f, 1.2);
    gear.jog.uniforms.uLevel.value = 1.4 + 2 * f.pulse;
    gear.jog.uniforms.uColor.value.copy(f.accent);
    gear.meter.uniforms.uLevel.value = 1 + 2.5 * f.low;

    // Strobes under the lintels: gate by gate on the off-beats, all four on the bar.
    const sub = Math.floor(f.clock * 2);
    if (sub !== lastSub) {
      lastSub = sub;
      const all = sub % 4 === 0;
      if (peak && !menu && busy > 0.4 && gate.fire(f.time)) {
        const portal = Math.floor(Math.random() * 4);
        for (let k = 0; k < strobeLevel.length; k++) if (all || Math.floor((k * 4) / strobeLevel.length) === portal) strobeLevel[k] = 1;
      }
    }
    let sum = 0;
    for (let k = 0; k < strobeLevel.length; k++) {
      strobeLevel[k] *= Math.exp(-f.dt * 34);
      strobes.setColorAt(k, color.setScalar(0.05 + strobeLevel[k] * 10));
      sum += strobeLevel[k];
    }
    if (strobes.instanceColor) strobes.instanceColor.needsUpdate = true;
    flash = Math.max(flash * Math.exp(-f.dt * 22), sum / Math.max(1, strobeLevel.length));
    shared.uFlash.value = flash * 0.3;

    // The bar of light is the venue's lamp: it lights the deck, the piers and the first rows.
    for (let i = 0; i < 4; i++) {
      L[i].set(-30 + i * 20, data.band.y - 2, data.band.z + 4, 22);
      LC[i]
        .copy(f.key)
        .lerp(WHITE, 0.5)
        .multiplyScalar(0.55 * shared.uScreenLevel.value * (0.6 + 0.6 * busy));
    }
    L[4].set(0, 14, -10, 40);
    LC[4].setScalar(flash * 3);
    for (let i = 5; i < 8; i++) LC[i].setRGB(0, 0, 0);

    // Lasers from under the band: flat fans over the field, crossing in a peak.
    lasers.begin();
    const lv = (menu ? 0.4 : 1) * (0.3 + 0.7 * busy) * 0.5;
    c1.copy(f.accent).lerp(WHITE, 0.2);
    if (s.level !== 'calm' || menu)
      laserHeads.forEach((p, k) => {
        const yaw = (k - (laserHeads.length - 1) / 2) * 0.16 + Math.sin(f.time * 0.4 + k) * (peak ? 0.5 : 0.15);
        fan(lasers, p, 9, yaw, 0.02 + 0.1 * Math.sin(f.time * 0.3 + k * 0.7), 0.5, 120, c1, lv, peak ? Math.PI / 2 : 0);
      });
    if (peak)
      laserHeads.forEach((p, k) => {
        tmp
          .set(Math.sin(f.time * 0.9 + k) * 0.5, 0.9, 0.5)
          .normalize()
          .multiplyScalar(90)
          .add(p);
        lasers.add(p, tmp, f.key, lv * 1.4);
      });
    lasers.end(f.height);
  };

  const beam = (group: string, i: number, f: VenueFrame): BeamPose | undefined => {
    const s = f.show;
    const t = s.time;
    switch (group) {
      case 'Pier':
        // Light climbing the concrete: steady, swelling on the bar.
        return { pan: 0, tilt: 0, level: 0.35 + 0.3 * f.barPulse + 0.3 * s.beamLevel, color: 'white' };
      case 'Wash':
        return { pan: 0, tilt: 0, level: 0.3 + 0.25 * s.beamLevel, color: i % 2 ? 'key' : 'accent' };
      case 'Sky':
        return {
          pan: Math.sin(t * 0.2 + i * 0.9) * 0.3,
          tilt: Math.sin(t * 0.15 + i * 1.3) * 0.2,
          level: 0.25 + 0.6 * s.beamLevel,
          color: 'white',
        };
      case 'Back':
        return {
          pan: Math.sin(t * 0.3 + i * 0.6) * 0.3,
          tilt: -0.05 + Math.sin(t * 0.25 + i) * 0.12,
          level: s.level === 'calm' ? 0.2 : s.beamLevel * (s.beamMode === 'chase' ? ((f.beats + i) % 4 === 0 ? 1 : 0.2) : 0.8),
          color: 'white',
        };
    }
    return undefined;
  };

  const src = data.sources;
  return {
    root,
    shots,
    band: marks,
    audience,
    players,
    fixtures: data.fixtures,
    fireworks: [...rockets(src.fireworks, [22, 34]), ...fountains(src.sparks, [4, 7])],
    co2: src.co2 ?? [],
    flames: src.flames,
    confetti: (src.confetti ?? []).map((pos) => ({ pos, dir: [-Math.sign(pos[0]) * 0.2, 0.6, 0.8] as Vec3 })),
    looks: [
      { key: [1, 1, 1], accent: [0.6, 0.85, 1], wash: [0.2, 0.3, 0.5] },
      { key: [1, 0.25, 0.15], accent: [1, 0.95, 0.9], wash: [0.5, 0.05, 0.04] },
      { key: [0.35, 0.8, 1], accent: [1, 1, 1], wash: [0.05, 0.25, 0.6] },
      { key: [1, 0.7, 0.3], accent: [1, 1, 1], wash: [0.5, 0.25, 0.05] },
    ],
    exposure: 0.92,
    bloom: [0.22, 0.5, 0.98],
    hazeNear: [0.06, 0.065, 0.08],
    mirror: { level: data.water },
    pools: 1.7,
    grade: { contrast: 1.12, saturation: 0.92, vignette: 0.3, tint: [0.94, 0.97, 1.04] },
    bind,
    update,
    beam,
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

const WHITE = new THREE.Color(1, 1, 1);
