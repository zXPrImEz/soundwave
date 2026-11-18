import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import type { FireworkSpec } from '../aurora/assets';
import { makeBand } from '../aurora/figures';
import { shared } from '../aurora/shared';
import type { Vec3 } from '../stage/Director';
import { dj, fillCrowd } from './kit/crowd';
import { Lasers, fan } from './kit/lasers';
import { Bulbs } from './kit/bulbs';
import { LedScreen } from './kit/led';
import { dressModel, instances, loadModel } from './kit/model';
import { gearRoles } from './kit/roles';
import { bandShots, shot } from './kit/shots';
import { StrobeGate } from './kit/strobe';
import { glow, modelSurface } from './kit/surface';
import { loadScans } from './kit/textures';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

/** The hall (as tools/stage/venues/warehouse.py builds it): half its width, back, front, height. */
const HALF = 25;
const BACK = -20;
const FRONT = 42;
const STAGE_FRONT = -8;
const GALLERY = 4.2;
const GALLERY_Y = 5.2;
const BAR_TOP = 13.6;
const PILLARS: [number, number][] = [];
for (const x of [-17, 17]) for (let z = -2; z <= 38; z += 8) PILLARS.push([x, z]);

/**
 * Warehouse: a disused factory hall at night, modelled in Blender (tools/stage/venues/warehouse.py).
 * Here it gets its materials and comes alive: the wet floor mirrors the show, the LED wall, columns
 * and booth play looks made from the music, the light bars sink and rise on their winches, the
 * strobes fire on the drops, and lasers cut sheets and tunnels through the haze. The band plays
 * at the front of the stage, the DJ up behind them; people fill the floor and the galleries.
 */
export async function buildWarehouse(ctx: VenueContext): Promise<Venue> {
  const { g, menu } = ctx;
  const hi = g.lights === 'medium' || g.lights === 'high';
  const model = await loadModel('warehouse');
  const data = model.data;
  const gear = gearRoles();
  const barGlow = glow(0xffffff, 1, true);
  const strobeGlow = glow(0xffffff, 1, true);
  const scans = await loadScans(
    ['concrete_floor', 'concrete_wall', 'brick', 'planks', 'steel_rust', 'steel_paint', 'steel_ribbed', 'steel_tread', 'carpet'],
    g,
    ctx.anisotropy,
  );
  const emblemGlow = glow(0xffffff, 2);
  const dressed = dressModel(model, {
    ...gear.roles,
    Floor: modelSurface({
      pattern: 'concrete',
      color: 0x3c3a38,
      color2: 0x1c1b1a,
      rough: 0.35,
      scale: 1.2,
      mirror: true,
      wet: 0.55,
      scan: scans.concrete_floor,
      scanScale: 4,
      tint: 0x9a9894,
      scanRough: 0.55,
    }),
    Concrete: modelSurface({
      pattern: 'concrete',
      color: 0x5d5b58,
      color2: 0x2a2826,
      rough: 0.85,
      scale: 1.4,
      scan: scans.concrete_wall,
      scanScale: 3.5,
      tint: 0xb0aca6,
    }),
    Brick: modelSurface({
      pattern: 'brick',
      color: 0x6e3a2a,
      color2: 0x2c2723,
      rough: 0.9,
      scale: 0.55,
      scan: scans.brick,
      scanScale: 2.4,
      tint: 0xc8b8b0,
    }),
    Graffiti: modelSurface({ pattern: 'graffiti', color: 0x4a2a22, color2: 0xd23c8c, rough: 0.9, scale: 1.6 }),
    Glass: modelSurface({ pattern: 'glass', color: 0x0a1424, rough: 0.08, emissive: 0x050a18 }),
    Wood: modelSurface({
      pattern: 'wood',
      color: 0x15130f,
      color2: 0x0a0908,
      rough: 0.4,
      scale: 3,
      scan: scans.planks,
      scanScale: 2.5,
      tint: 0x3a3632,
      scanRough: 0.7,
    }),
    Fabric: modelSurface({ pattern: 'fabric', color: 0x1a1a1e, rough: 1, scale: 0.4, scan: scans.carpet, scanScale: 1.2, tint: 0x55555c }),
    Hazard: modelSurface({ pattern: 'hazard', color: 0xe8b400, color2: 0x111111, rough: 0.6, scale: 0.5 }),
    Steel: modelSurface({
      pattern: 'metal',
      color: 0x2a2c30,
      rough: 0.45,
      scale: 2,
      scan: scans.steel_rust,
      scanScale: 1.6,
      tint: 0x6a6c72,
      metal: 0.5,
    }),
    Crane: modelSurface({
      pattern: 'panels',
      color: 0xb88a12,
      color2: 0x4a3410,
      rough: 0.6,
      metal: 0.4,
      scale: 1,
      scan: scans.steel_paint,
      scanScale: 2,
      tint: 0xe0a818,
    }),
    Panels: modelSurface({
      pattern: 'panels',
      color: 0x3a3c40,
      color2: 0x1a1a1a,
      rough: 0.7,
      metal: 0.3,
      scale: 1,
      scan: scans.steel_ribbed,
      scanScale: 2,
      tint: 0x8a8e94,
    }),
    'Glow.Sodium': glow(0xffa040, 2.4),
    'Glow.Exit': glow(0x20ff70, 1.6),
    'Glow.Emblem': emblemGlow,
  });
  const root = dressed.root;
  const owned: { dispose(): void }[] = [dressed, barGlow, strobeGlow];

  // Screens: the wall, the columns either side, the booth's front and the riser's lip.
  const wall = new LedScreen([208, 76], ['tunnel', 'bars', 'stripes', 'grid', 'rings', 'kaleido'], 2.1, 1);
  const column = new LedScreen([24, 84], ['stripes', 'bars', 'plasma', 'grid'], 1.9, 4);
  const booth = new LedScreen([64, 16], ['bars', 'stripes', 'grid'], 2.2, 2);
  const lip = new LedScreen([260, 4], ['stripes', 'bars', 'rings'], 1.5, 3);
  const cube = new LedScreen([40, 40], ['glyph', 'grid', 'glyph', 'stripes'], 2, 5);
  const screens = { wall, column, booth, lip, cube };
  for (const [key, scr] of Object.entries(screens)) for (const mesh of dressed.screens.get(key) ?? []) mesh.material = scr.material;
  owned.push(wall, column, booth, lip, cube);

  // The light bars in their cases on cables, and the strobes' faces: repeated from the model.
  const barSpots = data.instances.bar ?? [];
  const bars = instances(dressed.protos.get('bar')!, barSpots, barGlow);
  const cases = instances(dressed.protos.get('barcase')!, barSpots, gear.roles.Dark);
  const cables = instances(dressed.protos.get('cable')!, [...barSpots, ...barSpots], gear.roles.Black);
  const strobes = instances(dressed.protos.get('strobe')!, data.instances.strobe ?? [], strobeGlow);
  const bulbs = new Bulbs(dressed.protos.get('bulb')!, data.instances.bulb ?? []);
  root.add(bars, cases, cables, strobes, bulbs.mesh);
  owned.push(bulbs);
  const barHeight = new Float32Array(barSpots.length).fill(10);
  const strobeLevel = new Float32Array(strobes.count);

  const lasers = new Lasers(g.effects === 'off' ? 0 : g.effects === 'low' ? 90 : 220);
  root.add(lasers.mesh);
  owned.push(lasers);
  const src = (name: string) => (data.sources[name] ?? []).map((p) => new THREE.Vector3(...p));
  const sources = {
    deck: src('laser.deck'),
    truss: src('laser.truss'),
    wall: src('laser.wall')[0] ?? new THREE.Vector3(0, 6.2, BACK + 2.6),
  };

  const fireworks: FireworkSpec[] = (data.sources.sparks ?? []).map((origin) => ({
    origin,
    n: 7,
    spread: 5,
    length: [3.5, 5.5],
    lean: 0,
    side: Math.abs(origin[0]) > 5,
  }));

  const marks = data.marks;
  const band: Record<string, Vec3> = { vox: marks.vox, lead: marks.lead, bass: marks.bass, drums: marks.drums };
  const players = makeBand({ band }, ctx.cast.band.data.band ?? {}, ctx.focus);
  for (const p of players) p.yaw = Math.atan2(-p.pos[0] * 0.18, 10);
  const djAt = marks.dj;

  const shots = [
    shot('front', [0, 3.4, 31], [0, 5.5, -14], 70, 'push', 6, 'all', 3),
    shot('hero', [9, 10.5, 39], [-2, 4, -10], 60, 'orbit', 0.12, 'all', 2),
    shot('crowd', [6, 2.4, 12], [0, 4.8, -14], 78, 'truck', 3, 'busy', 2),
    shot('close', [2.4, 3.6, -3.4], [0, 2.6, -10], 58, 'pull', 2, 'busy', 1.6),
    shot('dj', [1.6, 4.2, djAt[2] + 4], [0, djAt[1] + 1.1, djAt[2]], 56, 'truck', 1.2, 'busy', 1.4),
    shot('gallery', [-HALF + 2.2, GALLERY_Y + 1.7, 30], [2, 3, -8], 70, 'truck', 4, 'all', 1.1),
    shot('aerial', [0, 12.6, 36], [0, 2, -6], 74, 'push', 5, 'all', 1),
    shot('wide-left', [-19, 5, 20], [2, 5, -12], 66, 'truck', 5, 'all', 1.2),
    shot('wide-right', [19, 5, 20], [-2, 5, -12], 66, 'truck', 5, 'all', 1.2),
    shot('low-gate', [0, 1.2, -5.4], [0, 7.5, -16], 90, 'crane', 1.2, 'peak', 1.2),
    shot('rig', [-11, 12.4, 4], [5, 1.5, 22], 70, 'truck', 6, 'peak', 1),
    shot('band', [0, 4.2, 4], [0, 2.6, -11], 64, 'truck', 3, 'busy', 1.2),
    ...bandShots(band, ctx.part, (p) => [p[0] * 0.5, p[1], p[2] + 10], 5.5),
  ];
  const low: Vec3[] = shots.filter((s) => s.pos[1] < 5).map((s) => s.pos);

  const share = LEVEL_SHARE[g.crowd];
  const sync = ctx.cast.crowd.data.sync;
  const audience = fillCrowd(
    {
      bounds: [-HALF + GALLERY + 0.6, STAGE_FRONT + 3.4, HALF - GALLERY - 0.6, FRONT - 1.5],
      step: 0.72,
      density: (x, z) => {
        if (PILLARS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.1)) return 0;
        if (Math.abs(x) < 3 && Math.abs(z - 24) < 2.2) return 0;
        const back = (z - STAGE_FRONT) / (FRONT - STAGE_FRONT);
        return Math.max(0.35, 1.05 - back * 0.65 - Math.max(0, Math.abs(x) - 15) * 0.05);
      },
      face: (x) => [x * 0.3, -12],
    },
    ctx.characters,
    share,
    low,
    sync,
    17,
  );
  audience.push(dj(ctx.characters, djAt, 0));
  // People on the galleries, most along the rail to watch.
  for (const side of [-1, 1])
    audience.push(
      ...fillCrowd(
        {
          bounds:
            side < 0 ? [-HALF + 0.5, -1.5, -HALF + GALLERY - 0.35, FRONT - 4.5] : [HALF - GALLERY + 0.35, -1.5, HALF - 0.5, FRONT - 4.5],
          step: 0.8,
          density: (x) => (Math.abs(Math.abs(x) - (HALF - GALLERY + 0.6)) < 1.2 ? 0.85 : 0.25),
          face: (_, z) => [0, Math.min(z, -6)],
          ground: () => GALLERY_Y,
          wander: 0.4,
        },
        ctx.characters,
        share,
        low,
        sync,
        side + 40,
      ),
    );

  // Light the show puts on the room: sodium lamps, the wall's spill, the light bars, the strobes.
  const L = shared.uLight.value;
  const LC = shared.uLightCol.value;
  const amber = new THREE.Color(1, 0.55, 0.18);
  const color = new THREE.Color();
  const gate = new StrobeGate();
  let lastSub = -1;
  let flash = 0;
  let laserLook = 0;
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const c1 = new THREE.Color();
  const c2 = new THREE.Color();
  const green = new THREE.Color(0.15, 1, 0.3);

  const bind = () => {
    shared.uGlowPos.value.set(0, 6.2, BACK + 3);
    shared.uHazeFar.value.setRGB(0.008, 0.008, 0.011);
    shared.uHazeDensity.value = hi ? 0.02 : 0.016;
    shared.uAmbient.value.setRGB(0.016, 0.016, 0.022);
    shared.uGlowLight.value.set(1.8, 16);
    shared.uGlowFall.value = 0.006;
    shared.uBall.value.w = 0;
    L[0].set(-HALF + 0.8, 9, -8, 9);
    L[1].set(-HALF + 0.8, 9, 24, 9);
    L[2].set(HALF - 0.8, 9, -8, 9);
    L[3].set(HALF - 0.8, 9, 24, 9);
    for (let i = 0; i < 4; i++) LC[i].copy(amber).multiplyScalar(0.55);
  };

  const update = (f: VenueFrame) => {
    const s = f.show;
    const busy = Math.min(1, Math.max(0, (f.energy - 0.25) / 0.6));
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    if (f.beat === 'downbeat') {
      if (s.bar % 8 === 0) wall.next(s.bar / 8);
      if (s.bar % 4 === 0) booth.next(s.bar / 4);
      if (s.bar % 4 === 1) column.next(s.bar / 4);
      if (s.bar % 4 === 2) lip.next(s.bar / 4);
      if (s.bar % 8 === 4) cube.next(s.bar / 8);
    }
    wall.level = 1.7 + 0.9 * f.barPulse + 0.6 * s.overdrive;
    for (const scr of Object.values(screens)) scr.update(f.dt);
    // The emblem before the wall breathes with the bass and burns white on the bar.
    emblemGlow.uniforms.uColor.value.copy(f.key).lerp(WHITE, 0.35 + 0.5 * f.barPulse);
    emblemGlow.uniforms.uLevel.value = 1.2 + 2.2 * f.low + 1.5 * f.barPulse + 2 * s.overdrive;
    bulbs.update(f);
    gear.jog.uniforms.uLevel.value = 1.4 + 2 * f.pulse;
    gear.jog.uniforms.uColor.value.copy(f.accent);
    gear.meter.uniforms.uLevel.value = 1 + 2.5 * f.low;

    // Light bars: a slow swell through the rows, deeper and faster as the music builds; in a peak
    // they ride the beat in a wave down the hall; overdrive pulls them all down low.
    const rows = [...new Set(barSpots.map((p) => p[2]))].sort((a, b) => a - b);
    barSpots.forEach(([x, , z], i) => {
      const wave = Math.sin(f.time * (0.35 + 0.35 * busy) + z * 0.18 + x * 0.06);
      const beatWave = peak ? Math.sin(f.clock * Math.PI * 0.5 - z * 0.12) * 0.8 : 0;
      const want = 10.2 - busy * 2.6 + wave * (1.1 + 1.6 * busy) + beatWave - s.overdrive * 3;
      barHeight[i] += (want - barHeight[i]) * Math.min(1, f.dt * 2.5);
      const y = barHeight[i];
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, peak ? Math.sin(f.clock * 0.5 + i) * 0.12 : 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bars.setMatrixAt(i, dummy.matrix);
      cases.setMatrixAt(i, dummy.matrix);
      for (const k of [0, 1]) {
        dummy.position.set(x + (k ? 2.4 : -2.4), y, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, BAR_TOP - 0.3 - y, 1);
        dummy.updateMatrix();
        cables.setMatrixAt(i * 2 + k, dummy.matrix);
      }
      // A chase runs back through the rows on the beat; the colours trade places every bar.
      const row = rows.indexOf(z);
      const chase = Math.pow(Math.max(0, Math.cos((f.clock * 0.5 - row * 0.18) * Math.PI)), 6);
      const lvl = (0.12 + 0.88 * busy) * (0.3 + 0.7 * chase) * 2 + s.overdrive;
      bars.setColorAt(i, color.copy((row + s.bar) % 2 ? f.key : f.accent).multiplyScalar(lvl));
    });
    for (const mesh of [bars, cases, cables]) mesh.instanceMatrix.needsUpdate = true;
    bars.instanceColor!.needsUpdate = true;

    // Strobes: in a peak a few go off on the off-beats and all of them on the bar, never more
    // often than the gate allows.
    const sub = Math.floor(f.clock * 2);
    if (sub !== lastSub) {
      lastSub = sub;
      const all = f.beat === 'downbeat' || sub % 4 === 0;
      if (peak && !menu && busy > 0.4 && gate.fire(f.time))
        for (let k = 0; k < strobeLevel.length; k++)
          if (all || Math.random() < 0.3 + 0.2 * s.overdrive) strobeLevel[k] = all ? (k % 2 ? 1 : 0.5) : 1;
    }
    let sum = 0;
    for (let k = 0; k < strobeLevel.length; k++) {
      strobeLevel[k] *= Math.exp(-f.dt * 38);
      strobes.setColorAt(k, color.setScalar(0.08 + strobeLevel[k] * 9));
      sum += strobeLevel[k];
    }
    strobes.instanceColor!.needsUpdate = true;
    flash = Math.max(flash * Math.exp(-f.dt * 25), sum / Math.max(1, strobeLevel.length));
    shared.uFlash.value = flash * 0.35;

    L[4].set(0, 6, BACK + 5, 16);
    LC[4]
      .copy(f.key)
      .lerp(f.wash, 0.4)
      .multiplyScalar(0.9 * shared.uScreenLevel.value);
    L[5].set(-8, 9, 12, 12);
    L[6].set(8, 9, 22, 12);
    LC[5].copy(f.key).multiplyScalar(0.5 * (0.3 + busy));
    LC[6].copy(f.accent).multiplyScalar(0.5 * (0.3 + busy));
    L[7].set(0, 10.4, STAGE_FRONT, 14);
    LC[7].setScalar(flash * 3);

    // Lasers: a sheet over the heads, fans and scans as it builds, the tunnel at a peak.
    lasers.begin();
    if (f.beat === 'downbeat' && s.bar % 4 === 0) laserLook++;
    const t = f.time;
    const lv = (menu ? 0.5 : 1) * (0.35 + 0.65 * busy) * 0.45;
    c1.copy(f.key).lerp(WHITE, 0.15);
    c2.copy(f.accent);
    const deck = sources.deck;
    if ((s.level !== 'calm' || menu) && deck.length > 1) {
      const roll = Math.sin(t * 0.7) * 0.05;
      fan(lasers, deck[0], 22, 0.62, 0.09 + 0.03 * Math.sin(t * 0.5), 1.3, 46, laserLook % 2 ? green : c1, lv * 1.4, roll);
      fan(
        lasers,
        deck[deck.length - 1],
        22,
        -0.62,
        0.09 + 0.03 * Math.sin(t * 0.5 + 1),
        1.3,
        46,
        laserLook % 2 ? green : c1,
        lv * 1.4,
        -roll,
      );
    }
    if (s.level === 'groove') {
      const look = laserLook % 3;
      if (look === 0)
        sources.truss.forEach((p, k) =>
          fan(
            lasers,
            p,
            9,
            Math.sin(t * 0.8 + k) * 0.5,
            -0.42 + 0.1 * Math.sin(t + k),
            0.8,
            40,
            k % 2 ? c1 : c2,
            lv * 1.3,
            Math.PI / 2 + Math.sin(t * 0.6 + k) * 0.3,
          ),
        );
      else if (look === 1)
        deck.forEach((p, k) => {
          const jump = hash(Math.floor(f.clock) * 7 + k);
          fan(lasers, p, 3, (jump - 0.5) * 1.2, 0.05 + 0.25 * hash(jump * 13), 0.18, 45, k % 2 ? c2 : c1, lv * 1.6);
        });
      else
        sources.truss.forEach((p, k) =>
          fan(lasers, p, 14, (k - 1.5) * 0.25, -0.2 + 0.12 * Math.sin(t * 1.3 + k), 1.0, 42, c2, lv * 1.2, Math.sin(t * 0.4) * 0.4),
        );
    }
    if (peak) {
      const n = 20;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + t * 0.9;
        const r = 0.2 + 0.06 * Math.sin(t * 1.7);
        tmpA
          .set(Math.cos(a) * r, Math.sin(a) * r * 0.75 + 0.06, 1)
          .normalize()
          .multiplyScalar(60)
          .add(sources.wall);
        lasers.add(sources.wall, tmpA, k % 2 ? c1 : c2, lv * 1.5);
      }
      if (s.bar % 2)
        sources.truss.forEach((p, k) => {
          const jump = hash(Math.floor(f.clock) * 5 + k);
          tmpB
            .set((jump - 0.5) * 1.4, -0.45, 1)
            .normalize()
            .multiplyScalar(40)
            .add(p);
          lasers.add(p, tmpB, c2, lv * 2 * (0.4 + 0.6 * f.pulse));
        });
    }
    lasers.end(f.height);
  };

  const beam = (group: string, i: number, f: VenueFrame): BeamPose | undefined => {
    const s = f.show;
    const t = s.time;
    switch (group) {
      case 'Moon':
        return { pan: 0, tilt: 0, level: 0.11, color: 'white' };
      case 'Floor':
        return {
          pan: Math.sin(t * 0.7 + i) * 0.3,
          tilt: Math.cos(t * 0.5 + i) * 0.2,
          level: s.beamLevel * (s.beamMode === 'chase' ? ((f.beats + i) % 4 === 0 ? 1 : 0.15) : 0.4 + 0.5 * f.pulse),
          color: i % 2 ? 'accent' : 'key',
        };
      case 'Rig':
        return {
          pan: Math.sin(t * 0.4 + i * 0.9) * (0.15 + 0.3 * s.beamLevel),
          tilt: Math.cos(t * 0.33 + i * 1.3) * (0.1 + 0.25 * s.beamLevel),
          level: s.level === 'calm' ? 0.18 : s.beamLevel * (s.beamMode === 'chase' ? ((f.beats + i) % 3 === 0 ? 1 : 0.2) : 0.7),
          color: i % 3 ? 'key' : 'accent',
        };
      case 'Spine': {
        // The spine's heads fan out across the hall in pairs; in a peak they cross on the beat.
        const side = i % 2 ? 1 : -1;
        return {
          pan: side * (0.2 + 0.5 * s.beamLevel * (0.5 + 0.5 * Math.sin(t * 0.5 + i * 0.4))),
          tilt: Math.sin(t * 0.35 + i * 0.6) * 0.25,
          level: s.level === 'calm' ? 0.3 : s.beamLevel * (s.beamMode === 'chase' ? ((f.beats + (i >> 1)) % 4 === 0 ? 1 : 0.25) : 0.8),
          color: 'white',
        };
      }
      case 'Back':
        return {
          pan: Math.sin(t * 0.25 + i * 0.7) * 0.25,
          tilt: -0.08 + Math.sin(t * 0.3 + i) * 0.1,
          level: s.level === 'calm' ? 0.25 : s.beamLevel * 0.8,
          color: 'white',
        };
    }
    return undefined;
  };

  return {
    root,
    shots,
    band,
    audience,
    players,
    fixtures: data.fixtures,
    fireworks,
    co2: data.sources.co2 ?? [],
    confetti: (data.sources.confetti ?? []).map((pos) => ({ pos, dir: [-Math.sign(pos[0]) * 0.25, 0.75, 0.6] as Vec3 })),
    looks: [
      { key: [1, 0.08, 0.05], accent: [1, 0.92, 0.88], wash: [0.6, 0.02, 0.04] },
      { key: [0.9, 0.95, 1], accent: [0.2, 0.55, 1], wash: [0.1, 0.2, 0.7] },
      { key: [1, 0.45, 0.08], accent: [1, 0.08, 0.1], wash: [0.5, 0.12, 0.02] },
      { key: [0.1, 0.9, 1], accent: [1, 0.1, 0.55], wash: [0.25, 0.05, 0.5] },
    ],
    exposure: 0.95,
    bloom: [0.24, 0.45, 0.95],
    hazeNear: [0.03, 0.03, 0.036],
    background: [0.004, 0.004, 0.006],
    sparkGravity: -7,
    mirror: { level: 0 },
    pools: 1.7,
    grade: { contrast: 1.14, saturation: 1.08, vignette: 0.38, tint: [0.92, 0.94, 1.05] },
    bind,
    update,
    beam,
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

const WHITE = new THREE.Color(1, 1, 1);
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
