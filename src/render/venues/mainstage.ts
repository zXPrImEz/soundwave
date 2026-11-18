import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import { shared } from '../aurora/shared';
import type { Vec3 } from '../stage/Director';
import { Bulbs } from './kit/bulbs';
import { bandOn, busyOf, clearOf, fountains, rockets } from './kit/common';
import { dj, fillCrowd } from './kit/crowd';
import { Lasers, fan } from './kit/lasers';
import { LedScreen } from './kit/led';
import { dressModel, loadModel, type ModelData } from './kit/model';
import { gearRoles } from './kit/roles';
import { bandShots, shot } from './kit/shots';
import { duskSky } from './kit/sky';
import { glow, modelSurface } from './kit/surface';
import { loadScans } from './kit/textures';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

interface MainstageData extends ModelData {
  deck: { front: number; half: number; y: number };
  screen: Vec3;
  thrust: { half: number; front: number };
  outlines: string[];
  obstacles: number[][];
}

/** Seconds the sun takes to go down in a song. */
const SUNSET = 200;

/**
 * Mainstage: the headline stage of a big festival, a palace of domes, arcades and towers modelled
 * in Blender (tools/stage/venues/mainstage.py). Every arch, rib and cornice is drawn in light that
 * chases through the facade zone by zone; lamps stud the edges; screens fill the great arch and
 * the wings; lasers fan from the skyline; flames, fireworks and confetti go off on the big
 * moments; and the sun sets behind it all over the course of a song. The band plays at the front
 * of the deck and out on the thrust, the DJ on a balcony under the great arch.
 */
export async function buildMainstage(ctx: VenueContext): Promise<Venue> {
  const { g, menu } = ctx;
  const model = await loadModel('mainstage');
  const data = model.data as MainstageData;
  const scans = await loadScans(
    ['sandstone', 'marble', 'steel_paint', 'concrete_wall', 'grass', 'planks', 'wood_floor', 'plaster'],
    g,
    ctx.anisotropy,
  );
  const gear = gearRoles();
  const dressed = dressModel(model, {
    ...gear.roles,
    Stone: modelSurface({
      pattern: 'brick',
      color: 0x9a8468,
      color2: 0x5a4a3a,
      rough: 0.9,
      scale: 1.2,
      scan: scans.sandstone,
      scanScale: 4,
      tint: 0xd8c8b0,
    }),
    Marble: modelSurface({
      pattern: 'concrete',
      color: 0xc8c4bc,
      color2: 0x8a8680,
      rough: 0.4,
      scale: 2,
      scan: scans.marble,
      scanScale: 3,
      tint: 0xe8e4dc,
      scanRough: 0.7,
    }),
    Dome: modelSurface({
      pattern: 'panels',
      color: 0x2c6a62,
      color2: 0x1a3a36,
      rough: 0.5,
      metal: 0.5,
      scale: 1.5,
      scan: scans.steel_paint,
      scanScale: 3,
      tint: 0x4aa898,
    }),
    Gold: modelSurface({ pattern: 'metal', color: 0xd8a838, rough: 0.25, metal: 1, scale: 0.5 }),
    Rock: modelSurface({
      pattern: 'concrete',
      color: 0x4a4640,
      color2: 0x2a2824,
      rough: 0.95,
      scale: 2,
      scan: scans.concrete_wall,
      scanScale: 5,
      tint: 0x8a8478,
      bump: 1.4,
    }),
    Ground: modelSurface({
      pattern: 'grass',
      color: 0x1d2a14,
      color2: 0x2e2a18,
      rough: 0.95,
      scale: 3,
      scan: scans.grass,
      scanScale: 3,
      tint: 0x8a9a70,
    }),
    Deck: modelSurface({
      pattern: 'wood',
      color: 0x121212,
      color2: 0x080808,
      rough: 0.3,
      scale: 3,
      scan: scans.planks,
      scanScale: 3,
      tint: 0x2a2a2c,
      scanRough: 0.6,
    }),
    Canvas: modelSurface({ pattern: 'fabric', color: 0xd8d4cc, rough: 0.9, scale: 0.6, scan: scans.plaster, scanScale: 3, tint: 0xe8e4dc }),
    Wood: modelSurface({
      pattern: 'wood',
      color: 0x4a3524,
      color2: 0x24180e,
      rough: 0.6,
      scale: 1.4,
      scan: scans.wood_floor,
      scanScale: 2,
    }),
    'Glow.Window': glow(0xffb468, 1.5),
    'Glow.Lamp': glow(0xfff0d8, 2),
  });
  const root = dressed.root;
  const owned: { dispose(): void }[] = [dressed];

  const dusk = { value: 0 };
  root.add(duskSky(dusk));

  // The light lines of the facade, a glow of its own for every zone.
  const outlines = (data.outlines ?? []).map((_, i) => {
    const material = glow(0xffffff, 1.5);
    const part = dressed.moving.get(`outline_${i}`) as THREE.Mesh | undefined;
    if (part) part.material = material;
    owned.push(material);
    return material;
  });

  const wall = new LedScreen([150, 130], ['horizon', 'kaleido', 'tunnel', 'plasma', 'rings', 'glyph'], 2, 4);
  const wing = new LedScreen([140, 90], ['plasma', 'kaleido', 'bars', 'rings'], 1.8, 5);
  const fascia = new LedScreen([760, 13], ['bars', 'stripes', 'rings', 'solid'], 1.6, 7);
  const booth = new LedScreen([64, 16], ['bars', 'stripes', 'grid'], 2, 8);
  const screens = { main: wall, wing, fascia, booth };
  for (const [key, scr] of Object.entries(screens)) for (const mesh of dressed.screens.get(key) ?? []) mesh.material = scr.material;
  owned.push(wall, wing, fascia, booth);

  const bulbs = new Bulbs(dressed.protos.get('bulb')!, data.instances.bulb ?? [], 0xffd8a0);
  root.add(bulbs.mesh);
  owned.push(bulbs);

  const lasers = new Lasers(g.effects === 'off' ? 0 : g.effects === 'low' ? 80 : 200);
  root.add(lasers.mesh);
  const top = (data.sources['laser.top'] ?? []).map((p) => new THREE.Vector3(...p));
  const arch = new THREE.Vector3(...(data.sources['laser.arch']?.[0] ?? [0, 20, -23]));

  const { band, players } = bandOn(data, ctx.cast, ctx.focus);
  const djAt = data.marks.dj;
  const shots = [
    shot('front', [0, 6.5, 50], [0, 16, -22], 78, 'push', 8, 'all', 3),
    shot('hero', [62, 26, 88], [-6, 12, -16], 56, 'orbit', 0.14, 'all', 2),
    shot('crowd', [10, 3.4, 26], [0, 15, -22], 80, 'truck', 4, 'busy', 2),
    shot('close', [7.5, 5.6, 1.5], [-0.5, 4.6, -15], 70, 'pull', 3, 'busy', 1.5),
    shot('aerial', [30, 70, 110], [0, 8, -16], 54, 'orbit', 0.2, 'all', 1),
    shot('wide-left', [-56, 8, 40], [0, 15, -22], 64, 'truck', 8, 'all', 1.2),
    shot('wide-right', [56, 8, 40], [0, 15, -22], 64, 'truck', 8, 'all', 1.2),
    shot('low-gate', [0, 1.7, 0.5], [0, 22, -28], 88, 'crane', 2, 'peak', 1.2),
    shot('arcade', [25, 7.5, -11], [33, 10, -25], 62, 'truck', 4, 'all', 0.8),
    shot('dj', [2.8, djAt[1] + 2.4, djAt[2] + 6.6], [0, djAt[1] + 1.1, djAt[2]], 56, 'truck', 1.5, 'busy', 1.2),
    shot('band', [-2, 6.4, 6], [0, 4.4, -12], 62, 'truck', 4, 'busy', 1.4),
    ...bandShots(band, ctx.part, (p) => [p[0] * 0.4, p[1], p[2] + 12], 6.5),
  ];
  const low = shots.filter((s) => s.pos[1] < 10).map((s) => s.pos);

  const clear = clearOf(data.obstacles, 0.6);
  const audience = fillCrowd(
    {
      bounds: [-82, -7, 82, 140],
      step: 0.92,
      density: (x, z) => {
        if (!clear(x, z) || Math.abs(x) > 46 + (z + 7) * 0.5) return 0;
        if (Math.abs(x) <= 5.2 && z < -1.8) return 0;
        return Math.max(0.25, 1.08 - Math.hypot(x, z + 8) / 150);
      },
      face: (x) => [x * 0.3, -20],
    },
    ctx.characters,
    LEVEL_SHARE[g.crowd],
    low,
    ctx.cast.crowd.data.sync,
    41,
  );
  if (djAt) audience.push(dj(ctx.characters, djAt, 0));

  const L = shared.uLight.value;
  const LC = shared.uLightCol.value;
  const c1 = new THREE.Color();
  const c2 = new THREE.Color();
  const tmp = new THREE.Vector3();
  let laserLook = 0;

  const bind = () => {
    const k = dusk.value;
    shared.uGlowPos.value.set(...data.screen);
    shared.uHazeFar.value.setRGB(0.07 * (1 - k) + 0.008 * k, 0.03 * (1 - k) + 0.012 * k, 0.045 * (1 - k) + 0.04 * k);
    shared.uHazeDensity.value = 0.0017;
    shared.uAmbient.value.setRGB(0.2 * (1 - k) + 0.016 * k, 0.11 * (1 - k) + 0.018 * k, 0.13 * (1 - k) + 0.04 * k);
    shared.uGlowLight.value.set(1.6, 30);
    shared.uGlowFall.value = 0.0012;
    shared.uBall.value.w = 0;
  };

  const update = (f: VenueFrame) => {
    const s = f.show;
    const busy = busyOf(f.energy);
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    // In the menus the light hovers at dusk; in a song the sun goes down as it plays.
    dusk.value = menu ? 0.6 + 0.1 * Math.sin(f.time * 0.02) : Math.min(1, 0.15 + f.time / SUNSET);
    const night = 0.35 + 0.65 * dusk.value;
    if (f.beat === 'downbeat') {
      if (s.bar % 8 === 0) wall.next(s.bar / 8);
      if (s.bar % 4 === 0) wing.next(s.bar / 4);
      if (s.bar % 4 === 2) fascia.next(s.bar / 4);
      if (s.bar % 4 === 1) booth.next(s.bar / 4);
    }
    wall.level = (1.4 + 0.8 * dusk.value) * (0.85 + 0.25 * f.barPulse) + 0.5 * s.overdrive;
    for (const scr of Object.values(screens)) scr.update(f.dt);
    bulbs.update(f, night * 1.3);
    gear.jog.uniforms.uLevel.value = 1.4 + 2 * f.pulse;
    gear.jog.uniforms.uColor.value.copy(f.accent);
    gear.meter.uniforms.uLevel.value = 1 + 2.5 * f.low;

    // The facade's light lines: every zone in its colour, a wave passing from the gate out to the
    // towers on the beat; in a peak the zones trade colours bar by bar and the domes burn white.
    outlines.forEach((m, i) => {
      const wave = Math.pow(Math.max(0, Math.cos((f.clock * 0.5 - i * 0.22) * Math.PI)), 4);
      const turn = (i + (peak ? s.bar : 0)) % 3;
      m.uniforms.uColor.value
        .copy(turn === 0 ? f.key : turn === 1 ? f.accent : f.wash)
        .lerp(WHITE, i === 4 ? 0.5 * f.barPulse + 0.2 : 0.12);
      m.uniforms.uLevel.value = night * (0.9 + 0.6 * busy + 1.6 * busy * wave + 0.8 * f.barPulse) + 1.5 * s.overdrive;
    });

    // Light on the deck and the field: the screens' spill, and warm light under the arcades.
    L[0].set(0, 10, -14, 34);
    LC[0]
      .copy(f.key)
      .lerp(f.wash, 0.4)
      .multiplyScalar(0.7 * shared.uScreenLevel.value);
    L[1].set(-31, 7, -22, 16);
    L[2].set(31, 7, -22, 16);
    LC[1].setRGB(1, 0.62, 0.3).multiplyScalar(0.5 * night);
    LC[2].copy(LC[1]);
    L[3].set(0, 6, -4, 14);
    LC[3].setScalar(s.blinder * 2);
    for (let i = 4; i < 8; i++) LC[i].setRGB(0, 0, 0);
    shared.uFlash.value = s.blinder * 0.15;

    // Lasers from the skyline: fans raking the field, and a cone out of the great arch at a peak.
    lasers.begin();
    if (f.beat === 'downbeat' && s.bar % 4 === 0) laserLook++;
    const t = f.time;
    const lv = (menu ? 0.4 : 1) * (0.3 + 0.7 * busy) * 0.5 * night;
    c1.copy(f.key).lerp(WHITE, 0.1);
    c2.copy(f.accent);
    if (s.level !== 'calm' || menu)
      top.forEach((p, k) => {
        if (laserLook % 2 === 0)
          fan(
            lasers,
            p,
            10,
            Math.sin(t * 0.5 + k * 0.8) * 0.35,
            -0.2 + 0.12 * Math.sin(t * 0.7 + k),
            0.7,
            110,
            k % 2 ? c1 : c2,
            lv,
            Math.PI / 2,
          );
        else fan(lasers, p, 12, -p.x * 0.012, 0.08 + 0.22 * Math.sin(t * 0.4 + k * 0.5), 0.9, 130, c1, lv);
      });
    if (peak) {
      const n = 26;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 - t * 0.7;
        tmp
          .set(Math.cos(a) * 0.4, Math.sin(a) * 0.28 + 0.02, 1)
          .normalize()
          .multiplyScalar(150)
          .add(arch);
        lasers.add(arch, tmp, k % 2 ? c1 : c2, lv * 1.3);
      }
    }
    lasers.end(f.height);
  };

  const beam = (group: string, i: number, f: VenueFrame): BeamPose | undefined => {
    const s = f.show;
    const t = s.time;
    const night = 0.35 + 0.65 * dusk.value;
    switch (group) {
      case 'Sky':
        return {
          pan: Math.sin(t * 0.2 + i * 0.9) * 0.3,
          tilt: Math.sin(t * 0.15 + i * 1.3) * 0.2,
          level: (0.3 + 0.5 * s.beamLevel) * night,
          color: 'white',
        };
      case 'Tower':
        return {
          pan: Math.sin(t * 0.3 + i) * 0.4,
          tilt: Math.sin(t * 0.25 + i * 2) * 0.15,
          level: s.beamLevel * 0.7 * night,
          color: i % 2 ? 'accent' : 'key',
        };
      case 'Floor':
        return {
          pan: Math.sin(t * 0.6 + i * 0.5) * 0.3,
          tilt: s.beamMode === 'fan' ? (i % 2 ? 0.25 : -0.25) : Math.sin(t * 0.4 + i) * 0.15,
          level: s.beamLevel * (s.beamMode === 'chase' ? ((f.beats + i) % 4 === 0 ? 1 : 0.15) : 0.6) * night,
          color: i % 2 ? 'accent' : 'key',
        };
    }
    return undefined;
  };

  const src = data.sources;
  const jets = src.flames?.length ?? 0;
  return {
    root,
    shots,
    band,
    audience,
    players,
    fixtures: data.fixtures,
    fireworks: [...rockets(src.fireworks, [24, 38]), ...fountains(src.sparks, [5, 8])],
    co2: src.co2 ?? [],
    flames: src.flames,
    flameMiddle: [Math.floor(jets / 3), Math.ceil((jets * 2) / 3) - 1],
    confetti: (src.confetti ?? []).map((pos) => ({ pos, dir: [-Math.sign(pos[0]) * 0.3, 0.7, 0.65] as Vec3 })),
    looks: [
      { key: [0.15, 0.95, 0.75], accent: [0.2, 0.6, 1], wash: [0.05, 0.4, 0.5] },
      { key: [1, 0.5, 0.15], accent: [1, 0.2, 0.5], wash: [0.6, 0.15, 0.1] },
      { key: [0.3, 0.55, 1], accent: [0.9, 0.95, 1], wash: [0.1, 0.15, 0.7] },
      { key: [1, 0.25, 0.7], accent: [1, 0.85, 0.3], wash: [0.5, 0.1, 0.6] },
    ],
    exposure: 0.92,
    bloom: [0.3, 0.5, 0.92],
    hazeNear: [0.08, 0.05, 0.1],
    pools: 1.7,
    grade: { contrast: 1.1, saturation: 1.12, vignette: 0.28 },
    bind,
    update,
    beam,
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

const WHITE = new THREE.Color(1, 1, 1);
