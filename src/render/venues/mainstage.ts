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
import { Podiums } from './kit/podiums';
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
  flameMiddle: [number, number];
  outlines: string[];
  obstacles: number[][];
}

/** Seconds the sun takes to go down in a song. */
const SUNSET = 200;

/**
 * Mainstage: the headline stage of a big festival, a palace of domes, arcades and towers modelled
 * in Blender (tools/stage/venues/mainstage.py), its wings swung forward round the crowd. Every
 * arch, rib and cornice is drawn in light that takes the show's colours zone by zone; a pulse runs
 * on the beat into the tunnel of portals behind the great arch, each portal an LED band; lamps
 * stud the edges; the windows glow in the wash; a crown arch of light stands over it all. Moving
 * heads line the rooflines, the tunnel and the crown; lasers fan from the skyline, the towers, the
 * minarets and the crown; flames, fireworks and confetti go off on the big moments; and the sun
 * sets behind it all over the course of a song. The band plays at the front of the deck, a catwalk
 * runs out into the crowd, the DJ stands on a balcony jutting out of the great arch.
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
  const windows = glow(0xffb468, 1.2);
  const dressed = dressModel(model, {
    ...gear.roles,
    Stone: modelSurface({
      pattern: 'brick',
      color: 0x7a6a58,
      color2: 0x3a3028,
      rough: 0.9,
      scale: 1.2,
      scan: scans.sandstone,
      scanScale: 4,
      tint: 0xa8988a,
    }),
    Marble: modelSurface({
      pattern: 'concrete',
      color: 0xc8c4bc,
      color2: 0x8a8680,
      rough: 0.4,
      scale: 2,
      scan: scans.marble,
      scanScale: 3,
      tint: 0xd8d4cc,
      scanRough: 0.7,
    }),
    Dome: modelSurface({
      pattern: 'panels',
      color: 0x1c5a54,
      color2: 0x10302c,
      rough: 0.45,
      metal: 0.6,
      scale: 1.5,
      scan: scans.steel_paint,
      scanScale: 3,
      tint: 0x3a9888,
    }),
    Gold: modelSurface({ pattern: 'metal', color: 0xd8a838, rough: 0.25, metal: 1, scale: 0.5 }),
    Rib: modelSurface({ pattern: 'metal', color: 0x2a2030, rough: 0.3, metal: 0.8, scale: 0.6 }),
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
    'Glow.Window': windows,
    'Glow.Lamp': glow(0xfff0d8, 2),
  });
  const root = dressed.root;
  const owned: { dispose(): void }[] = [dressed];

  const dusk = { value: 0 };
  root.add(duskSky(dusk));

  // The light lines of the palace, a glow of its own for every zone (see OUTLINES in the model).
  const outlines = (data.outlines ?? []).map((name, i) => {
    const material = glow(0xffffff, 1.5);
    const part = dressed.moving.get(`outline_${i}`) as THREE.Mesh | undefined;
    if (part) part.material = material;
    owned.push(material);
    return { name, material, tunnel: name.startsWith('tunnel') ? Number(name.slice(6)) : -1 };
  });

  const wall = new LedScreen([150, 130], ['tunnel', 'kaleido', 'horizon', 'plasma', 'rings', 'glyph'], 2, 4);
  const wing = new LedScreen([140, 90], ['plasma', 'kaleido', 'bars', 'rings'], 1.8, 5);
  const portals = new LedScreen([420, 6], ['plasma', 'rings', 'tunnel', 'kaleido'], 2, 9);
  const crownBand = new LedScreen([600, 6], ['plasma', 'rings', 'kaleido', 'tunnel'], 1, 11);
  const fascia = new LedScreen([900, 13], ['bars', 'plasma', 'rings', 'tunnel'], 0.8, 7);
  const booth = new LedScreen([64, 16], ['bars', 'stripes', 'grid'], 2, 8);
  const screens = { main: wall, wing, tunnel: portals, crown: crownBand, fascia, booth };
  for (const [key, scr] of Object.entries(screens)) for (const mesh of dressed.screens.get(key) ?? []) mesh.material = scr.material;
  owned.push(wall, wing, portals, crownBand, fascia, booth);

  const bulbs = new Bulbs(dressed.protos.get('bulb')!, data.instances.bulb ?? [], 0xffd8a0);
  root.add(bulbs.mesh);
  owned.push(bulbs);

  const lasers = new Lasers(g.effects === 'off' ? 0 : g.effects === 'low' ? 100 : 320);
  root.add(lasers.mesh);
  const points = (name: string) => (data.sources[name] ?? []).map((p) => new THREE.Vector3(...p));
  const top = points('laser.top');
  const towers = points('laser.tower');
  const minarets = points('laser.minaret');
  const crown = points('laser.crown');
  const arch = new THREE.Vector3(...(data.sources['laser.arch']?.[0] ?? [0, 26, -30]));

  const { band, players } = bandOn(data, ctx.cast, ctx.focus);
  const podiums = new Podiums(root, data.podiums, band, players);
  owned.push(podiums);
  const djAt = data.marks.dj;
  const shots = [
    shot('front', [0, 7, 70], [0, 22, -24], 80, 'push', 8, 'all', 3),
    shot('hero', [80, 30, 100], [-6, 18, -20], 58, 'orbit', 0.14, 'all', 2),
    shot('crowd', [12, 3.4, 30], [0, 20, -26], 82, 'truck', 4, 'busy', 2),
    shot('close', [7.5, 5.6, 1.5], [-0.5, 4.6, -15], 70, 'pull', 3, 'busy', 1.5),
    shot('aerial', [40, 95, 140], [0, 14, -20], 54, 'orbit', 0.2, 'all', 1),
    shot('wide-left', [-75, 9, 45], [0, 20, -26], 66, 'truck', 8, 'all', 1.2),
    shot('wide-right', [75, 9, 45], [0, 20, -26], 66, 'truck', 8, 'all', 1.2),
    shot('low-gate', [0, 1.7, 9], [0, 30, -30], 88, 'crane', 2, 'peak', 1.2),
    shot('tunnel', [0, 9, 2], [0, 14, -42], 60, 'push', 4, 'busy', 1),
    shot('wing', [40, 16, 14], [44, 20, -24], 62, 'truck', 4, 'all', 0.8),
    shot('dj', [2.8, djAt[1] + 2.4, djAt[2] + 6.6], [0, djAt[1] + 1.1, djAt[2]], 56, 'truck', 1.5, 'busy', 1.2),
    shot('band', [-2, 6.4, 6], [0, 4.4, -12], 62, 'truck', 4, 'busy', 1.4),
    ...bandShots(band, ctx.part, (p) => [p[0] * 0.4, p[1], p[2] + 12], 6.5),
  ];
  const low = shots.filter((s) => s.pos[1] < 10).map((s) => s.pos);

  const clear = clearOf(data.obstacles, 0.6);
  const audience = fillCrowd(
    {
      bounds: [-96, -7, 96, 150],
      step: 0.92,
      density: (x, z) => {
        if (!clear(x, z) || Math.abs(x) > 52 + (z + 7) * 0.55) return 0;
        // The pit round the catwalk and its platform.
        if (Math.abs(x) <= 7.4 && z < 8.6) return 0;
        return Math.max(0.25, 1.08 - Math.hypot(x, z + 8) / 160);
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
  const warm = new THREE.Color(1, 0.6, 0.28);
  let laserLook = 0;

  const bind = () => {
    const k = dusk.value;
    shared.uGlowPos.value.set(...data.screen);
    shared.uHazeFar.value.setRGB(0.07 * (1 - k) + 0.006 * k, 0.03 * (1 - k) + 0.008 * k, 0.045 * (1 - k) + 0.035 * k);
    shared.uHazeDensity.value = 0.0015;
    shared.uAmbient.value.setRGB(0.18 * (1 - k) + 0.01 * k, 0.1 * (1 - k) + 0.011 * k, 0.12 * (1 - k) + 0.028 * k);
    shared.uGlowLight.value.set(0.9, 30);
    shared.uGlowFall.value = 0.0012;
    shared.uBall.value.w = 0;
    podiums.bind();
  };

  const update = (f: VenueFrame) => {
    const s = f.show;
    const busy = busyOf(f.energy);
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    podiums.update(f);
    // In the menus the light hovers at dusk; in a song the sun goes down as it plays.
    dusk.value = menu ? 0.6 + 0.1 * Math.sin(f.time * 0.02) : Math.min(1, 0.15 + f.time / SUNSET);
    const night = 0.35 + 0.65 * dusk.value;
    if (f.beat === 'downbeat') {
      if (s.bar % 8 === 0) wall.next(s.bar / 8);
      if (s.bar % 4 === 0) wing.next(s.bar / 4);
      if (s.bar % 4 === 3) portals.next(s.bar / 4);
      if (s.bar % 8 === 4) crownBand.next(s.bar / 8);
      if (s.bar % 4 === 2) fascia.next(s.bar / 4);
      if (s.bar % 4 === 1) booth.next(s.bar / 4);
    }
    wall.level = (1.0 + 0.4 * dusk.value) * (0.85 + 0.25 * f.barPulse) + 0.4 * s.overdrive;
    portals.level = night * (0.3 + 0.45 * busy) * (0.8 + 0.4 * f.pulse) + 0.2 * s.overdrive;
    crownBand.level = night * (0.35 + 0.3 * busy + 0.3 * f.barPulse) + 0.1 * s.overdrive;
    for (const scr of Object.values(screens)) scr.update(f.dt);
    bulbs.update(f, night * 0.9);
    gear.jog.uniforms.uLevel.value = 1.4 + 2 * f.pulse;
    gear.jog.uniforms.uColor.value.copy(f.accent);
    gear.meter.uniforms.uLevel.value = 1 + 2.5 * f.low;
    // The windows: warm lamplight when it is quiet, the show's wash as it builds, breathing with the bass.
    windows.uniforms.uColor.value.copy(warm).lerp(f.wash, 0.25 + 0.65 * busy);
    windows.uniforms.uLevel.value = (0.4 + 0.4 * night) * (0.65 + 0.4 * f.low + 0.25 * f.barPulse);

    // The light lines: every zone in a colour of its own, a wave passing from the gate out to the
    // towers on the beat; in a peak the zones trade colours bar by bar. In the tunnel a pulse runs
    // from the front portal to the back on every beat; the crown takes the accent and flares on the bar.
    const swap = peak ? s.bar : 0;
    for (const [i, o] of outlines.entries()) {
      const u = o.material.uniforms;
      if (o.tunnel >= 0) {
        const run = Math.pow(Math.max(0, Math.cos((f.clock - o.tunnel * 0.18) * Math.PI)), 6);
        u.uColor.value.copy((o.tunnel + swap) % 2 ? f.accent : f.key);
        u.uLevel.value = night * (0.45 + 0.3 * busy + 1.3 * busy * run) + 0.25 * s.overdrive;
      } else if (o.name === 'crown') {
        u.uColor.value.copy(f.accent).lerp(f.key, 0.5 + 0.5 * Math.sin(f.clock * 0.25 * Math.PI));
        u.uLevel.value = night * (0.6 + 0.3 * busy + 0.8 * f.barPulse) + 0.25 * s.overdrive;
      } else {
        const wave = Math.pow(Math.max(0, Math.cos((f.clock * 0.5 - i * 0.22) * Math.PI)), 4);
        const turn = (i + swap) % 3;
        u.uColor.value.copy(turn === 0 ? f.key : turn === 1 ? f.accent : f.wash);
        if (o.name === 'domes') u.uColor.value.lerp(WHITE, 0.25 * f.barPulse);
        u.uLevel.value = night * (0.45 + 0.25 * busy + 0.9 * busy * wave + 0.35 * f.barPulse) + 0.25 * s.overdrive;
      }
    }

    // Light on the palace: the screen's spill out of the tunnel, coloured washes on the wings, the
    // towers and the gate, the blinders over the deck.
    const wash = night * (0.45 + 0.5 * busy) * (0.8 + 0.4 * f.low);
    L[0].set(0, 12, -22, 34);
    LC[0]
      .copy(f.key)
      .lerp(f.wash, 0.4)
      .multiplyScalar(0.7 * shared.uScreenLevel.value);
    L[1].set(-40, 10, -10, 24);
    L[2].set(40, 10, -10, 24);
    LC[1].copy(f.accent).multiplyScalar(wash);
    LC[2].copy(f.key).multiplyScalar(wash);
    L[3].set(0, 6, -4, 14);
    LC[3].setScalar(s.blinder * 2);
    L[4].set(-60, 22, 0, 24);
    L[5].set(60, 22, 0, 24);
    LC[4].copy(f.wash).multiplyScalar(wash * 1.2);
    LC[5].copy(f.wash).multiplyScalar(wash * 1.2);
    L[6].set(0, 34, -16, 20);
    LC[6].copy(f.accent).multiplyScalar(night * (0.3 + 0.8 * f.barPulse * busy));
    L[7].set(0, 14, -36, 12);
    LC[7].copy(f.key).multiplyScalar(night * (0.2 + 0.35 * busy));
    shared.uFlash.value = s.blinder * 0.15;

    // Lasers: fans from the skyline, searchlights from the minarets, sheets from the towers across
    // the field, a fan from the crown's apex, and in a peak a cone out of the great arch.
    lasers.begin();
    if (f.beat === 'downbeat' && s.bar % 4 === 0) laserLook++;
    const t = f.time;
    const lv = (menu ? 0.4 : 1) * (0.3 + 0.7 * busy) * 0.55 * night;
    c1.copy(f.key);
    c2.copy(f.accent);
    if (s.level !== 'calm' || menu) {
      top.forEach((p, k) => {
        if (laserLook % 2 === 0)
          fan(
            lasers,
            p,
            6,
            Math.sin(t * 0.5 + k * 0.8) * 0.35,
            -0.2 + 0.12 * Math.sin(t * 0.7 + k),
            0.7,
            120,
            k % 2 ? c1 : c2,
            lv,
            Math.PI / 2,
          );
        else fan(lasers, p, 7, -p.x * 0.01, 0.08 + 0.22 * Math.sin(t * 0.4 + k * 0.5), 0.9, 140, c1, lv);
      });
      // Searchlights: a pair of beams from each minaret, crossing slowly over the palace.
      minarets.forEach((p, k) => {
        const side = Math.sign(p.x) || 1;
        fan(
          lasers,
          p,
          2,
          -side * (0.25 + 0.3 * Math.sin(t * 0.3 + k)),
          0.9 + 0.25 * Math.sin(t * 0.21 + k * 1.7),
          0.18,
          180,
          k % 2 ? c2 : c1,
          lv * 1.2,
        );
      });
    }
    if (busy > 0.35 || menu) {
      // Sheets from the towers, raking across the field in turn.
      towers.forEach((p, k) => {
        const side = Math.sign(p.x) || 1;
        const sweep = Math.sin(t * 0.6 + k * Math.PI);
        fan(
          lasers,
          p,
          9,
          -side * (0.5 + 0.25 * sweep),
          -0.12 + 0.1 * Math.cos(t * 0.5),
          0.8,
          130,
          (k + laserLook) % 2 ? c1 : c2,
          lv * (laserLook % 2 ? 1 : 0.6),
        );
      });
      // The crown: a fan down over the crowd from its apex, the shoulders throwing beams up.
      crown.forEach((p, k) => {
        if (k === 0)
          fan(lasers, p, 12, Math.sin(t * 0.35) * 0.25, -0.35 + 0.15 * Math.sin(t * 0.8), 1.4, 130, c2, lv * (0.6 + 0.6 * f.pulse));
        else fan(lasers, p, 6, -Math.sign(p.x) * 0.3, 0.6 + 0.3 * Math.sin(t * 0.5 + k), 0.5, 160, c1, lv, Math.PI / 2);
      });
    }
    if (peak) {
      const n = 30;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 - t * 0.7;
        tmp
          .set(Math.cos(a) * 0.4, Math.sin(a) * 0.28 + 0.02, 1)
          .normalize()
          .multiplyScalar(160)
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
          color: s.level === 'peak' ? 'accent' : 'white',
        };
      case 'Tower':
        return {
          pan: Math.sin(t * 0.3 + i) * 0.4,
          tilt: Math.sin(t * 0.25 + i * 2) * 0.15,
          level: s.beamLevel * 0.7 * night,
          color: i % 2 ? 'accent' : 'key',
        };
      case 'Roof':
        // A fan along the gate's parapet that opens and closes with the bar.
        return {
          pan: (i % 2 ? 1 : -1) * (0.1 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.7))),
          tilt: Math.sin(t * 0.4 + i * 0.6) * 0.15,
          level: s.beamLevel * (0.5 + 0.4 * f.barPulse) * night,
          color: i % 3 === 0 ? 'accent' : 'key',
        };
      case 'Tunnel':
        // Straight out of the tunnel at the crowd, in a chase that runs back and forth.
        return {
          pan: Math.sin(t * 0.5 + i) * 0.08,
          tilt: Math.sin(t * 0.35 + i * 0.7) * 0.06,
          level: s.beamLevel * ((f.beats + (i >> 2)) % 4 === 0 ? 1 : 0.25) * night,
          color: i % 2 ? 'key' : 'accent',
        };
      case 'Crown':
        return {
          pan: Math.sin(t * 0.45 + i * 0.4) * 0.3,
          tilt: s.beamMode === 'fan' ? (i % 2 ? 0.2 : -0.2) : Math.sin(t * 0.3 + i) * 0.15,
          level: s.beamLevel * (s.beamMode === 'chase' ? ((f.beats + i) % 3 === 0 ? 1 : 0.2) : 0.7) * night,
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
  return {
    root,
    shots,
    band,
    audience,
    players,
    fixtures: data.fixtures,
    fireworks: [...rockets(src.fireworks, [30, 48]), ...fountains(src.sparks, [5, 8])],
    co2: src.co2 ?? [],
    flames: src.flames,
    flameMiddle: data.flameMiddle,
    confetti: (src.confetti ?? []).map((pos) => ({ pos, dir: [-Math.sign(pos[0]) * 0.3, 0.7, 0.65] as Vec3 })),
    looks: [
      { key: [0.1, 0.9, 0.8], accent: [0.95, 0.2, 0.75], wash: [0.1, 0.25, 0.9] },
      { key: [1, 0.45, 0.08], accent: [1, 0.12, 0.4], wash: [0.55, 0.1, 0.7] },
      { key: [0.25, 0.5, 1], accent: [0.2, 1, 0.85], wash: [0.12, 0.08, 0.6] },
      { key: [1, 0.2, 0.65], accent: [1, 0.8, 0.2], wash: [0.4, 0.1, 0.85] },
    ],
    exposure: 0.9,
    bloom: [0.38, 0.55, 0.9],
    hazeNear: [0.06, 0.04, 0.09],
    pools: 1.7,
    grade: { contrast: 1.14, saturation: 1.22, vignette: 0.3 },
    bind,
    update,
    beam,
    cameraLift: (shot) => podiums.cameraLift(shot),
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

const WHITE = new THREE.Color(1, 1, 1);
