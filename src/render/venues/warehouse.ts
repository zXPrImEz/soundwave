import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import type { Fixture, FireworkSpec } from '../aurora/assets';
import { makeBand } from '../aurora/figures';
import { shared } from '../aurora/shared';
import type { Vec3 } from '../stage/Director';
import { Builder, disposeTree } from './kit/build';
import { dj, fillCrowd } from './kit/crowd';
import { Lasers, fan } from './kit/lasers';
import { LedScreen } from './kit/led';
import { bandShots, shot } from './kit/shots';
import { glow, surface } from './kit/surface';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

/** The hall: half its width, its back and front walls, and its height (metres). */
const HALF = 25;
const BACK = -20;
const FRONT = 42;
const HEIGHT = 14;
/** The stage riser: its front edge and height. */
const STAGE_FRONT = -8;
const DECK = 1.4;
/** Pillars down both sides of the floor. */
const PILLARS: [number, number][] = [];
for (const x of [-17, 17]) for (let z = -2; z <= 38; z += 8) PILLARS.push([x, z]);
/** The kinetic light bars over the floor: columns across and rows back. */
const BAR_X = [-16, -8, 0, 8, 16];
const BAR_Z = [0, 6, 12, 18, 24, 30];
const BAR_TOP = 13.6;

/**
 * Warehouse: a disused factory hall at night. Bare concrete and old brick, a floor wet enough to
 * mirror the show, a wall of LEDs behind a DJ in the middle with the band either side, lasers that
 * cut sheets of light over the crowd, rows of light bars that sink and rise on their winches, and
 * strobes for the drops. Thick haze; red, white and cold blue.
 */
export function buildWarehouse(ctx: VenueContext): Venue {
  const { g, menu } = ctx;
  const hi = g.lights === 'medium' || g.lights === 'high';
  const b = new Builder();
  const concrete = surface({ pattern: 'concrete', color: 0x5d5b58, color2: 0x2a2826, rough: 0.85, scale: 1.4 });
  const floor = surface({ pattern: 'concrete', color: 0x3c3a38, color2: 0x1c1b1a, rough: 0.35, scale: 1.2, mirror: true, wet: 0.55 });
  const brick = surface({ pattern: 'brick', color: 0x6e3a2a, color2: 0x2c2723, rough: 0.9, scale: 0.55 });
  const steel = surface({ pattern: 'metal', color: 0x2a2c30, rough: 0.45, metal: 0.8, scale: 2 });
  const black = surface({ color: 0x0c0c0e, rough: 0.6 });
  const deck = surface({ pattern: 'wood', color: 0x15130f, color2: 0x0a0908, rough: 0.4, scale: 3 });
  const glass = surface({ pattern: 'glass', color: 0x0a1424, rough: 0.08, emissive: 0x050a18 });
  const lamp = glow(0xffa040, 2.4);
  const exit = glow(0x20ff70, 1.6);
  const red = glow(0xff1a10, 1.4);

  // The hall: floor, walls, roof.
  b.panel(floor, HALF * 2, FRONT - BACK, [0, 0, (FRONT + BACK) / 2], 0, -Math.PI / 2);
  b.panel(concrete, HALF * 2, HEIGHT, [0, HEIGHT / 2, BACK], 0);
  b.panel(concrete, HALF * 2, HEIGHT, [0, HEIGHT / 2, FRONT], Math.PI);
  for (const side of [-1, 1]) {
    b.panel(brick, FRONT - BACK, HEIGHT, [side * HALF, HEIGHT / 2, (FRONT + BACK) / 2], -side * (Math.PI / 2));
    // Tall factory windows, night outside, with their iron frames.
    for (let z = -12; z <= 36; z += 8) {
      b.panel(glass, 4.2, 5.5, [side * (HALF - 0.05), 8.6, z], -side * (Math.PI / 2));
      for (let k = -1; k <= 1; k++) b.box(steel, [0.12, 5.6, 0.1], [side * (HALF - 0.1), 8.6, z + k * 1.4]);
      for (const y of [6.8, 8.6, 10.4]) b.box(steel, [0.12, 0.1, 4.3], [side * (HALF - 0.1), y, z]);
    }
    // Sodium lamps between the windows, and an exit sign by the door at the back.
    for (const z of [6, 22]) {
      b.box(steel, [0.5, 0.3, 0.8], [side * (HALF - 0.3), 9.3, z]);
      b.box(lamp, [0.3, 0.1, 0.6], [side * (HALF - 0.4), 9.12, z]);
    }
    b.box(exit, [0.08, 0.35, 0.9], [side * (HALF - 0.06), 3.2, 38]);
  }
  b.panel(black, HALF * 2, FRONT - BACK, [0, HEIGHT, (FRONT + BACK) / 2], 0, Math.PI / 2);
  // Roof trusses across the hall and ducts along it.
  for (let z = -16; z <= 40; z += 7) {
    b.truss(steel, [-HALF, HEIGHT - 0.6, z], [HALF, HEIGHT - 0.6, z], 0.9);
  }
  for (const x of [-10, 10]) b.rod(steel, [x, HEIGHT - 1.8, BACK], [x, HEIGHT - 1.8, FRONT], 0.45, 12);
  // Concrete pillars, with a red warning light on each.
  for (const [x, z] of PILLARS) {
    b.box(concrete, [0.9, HEIGHT, 0.9], [x, HEIGHT / 2, z]);
    b.box(red, [0.12, 0.12, 0.05], [x, 3.1, z + 0.47]);
  }

  // The stage: a black riser, a wall of LEDs on scaffolding behind it, the DJ's booth in the middle.
  b.box(black, [26, DECK, STAGE_FRONT - BACK], [0, DECK / 2, (STAGE_FRONT + BACK) / 2]);
  b.panel(deck, 26, STAGE_FRONT - BACK - 0.2, [0, DECK + 0.005, (STAGE_FRONT + BACK) / 2], 0, -Math.PI / 2);
  for (let x = -12; x <= 12; x += 3) b.rod(steel, [x, 0, BACK + 2.2], [x, 11, BACK + 2.2], 0.06, 6);
  for (const y of [1.6, 10.6]) b.truss(steel, [-12.4, y, BACK + 2.1], [12.4, y, BACK + 2.1], 0.35);
  // Crowd barrier.
  b.box(steel, [30, 1.15, 0.12], [0, 0.6, STAGE_FRONT + 2.4]);
  for (let x = -14; x <= 14; x += 2) b.box(steel, [0.08, 1.15, 0.9], [x, 0.58, STAGE_FRONT + 2.8]);
  // The booth: a black desk with decks and a mixer, its front an LED strip.
  b.box(black, [4.4, 1.05, 1.2], [0, DECK + 0.52, -11]);
  for (const x of [-1.3, 0, 1.3]) b.box(steel, [x === 0 ? 0.9 : 0.75, 0.12, 0.8], [x, DECK + 1.11, -11.05]);
  // Drum riser.
  b.box(black, [4, 0.5, 3.2], [9, DECK + 0.25, -13.5]);
  // Rig: the main truss over the stage's front, the back truss over the screen.
  b.truss(steel, [-14, 11, STAGE_FRONT - 0.5], [14, 11, STAGE_FRONT - 0.5], 0.55);
  b.truss(steel, [-14, 12.2, BACK + 3.2], [14, 12.2, BACK + 3.2], 0.55);
  for (const x of [-14, 14]) b.truss(steel, [x, 0, STAGE_FRONT - 0.5], [x, 11, STAGE_FRONT - 0.5], 0.55);
  // The truss the light bars hang from.
  for (const z of BAR_Z) b.truss(steel, [-20, BAR_TOP, z], [20, BAR_TOP, z], 0.35);
  // Line arrays on chains either side of the stage.
  for (const side of [-1, 1])
    for (let k = 0; k < 6; k++) b.box(black, [1.2, 0.42, 0.7], [side * 16.5, 9.6 - k * 0.45, STAGE_FRONT + 0.6 + k * 0.05]);
  const root = b.build('warehouse');
  const owned: { dispose(): void }[] = [{ dispose: () => disposeTree(root) }];

  // The LED wall and the strip on the booth.
  const wall = new LedScreen([176, 64], ['tunnel', 'bars', 'stripes', 'grid', 'rings', 'kaleido'], 2.1, 1);
  const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(22, 8), wall.material);
  wallMesh.position.set(0, 6.2, BACK + 2.4);
  const strip = new LedScreen([48, 10], ['bars', 'stripes', 'grid'], 2.4, 2);
  const stripMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 0.9), strip.material);
  stripMesh.position.set(0, DECK + 0.52, -10.39);
  // Strips of LED along the riser's front.
  const lip = new LedScreen([260, 4], ['stripes', 'bars', 'rings'], 1.5, 3);
  const lipMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 0.3), lip.material);
  lipMesh.position.set(0, DECK - 0.2, STAGE_FRONT + 0.01);
  root.add(wallMesh, stripMesh, lipMesh);
  owned.push(wall, strip, lip, wallMesh.geometry, stripMesh.geometry, lipMesh.geometry);

  // The light bars and their cables.
  const barCount = BAR_X.length * BAR_Z.length;
  const barMat = glow(0xffffff, 1, true);
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(5.2, 0.1, 0.1), barMat, barCount);
  const cableMat = surface({ color: 0x050505, rough: 1 });
  const cables = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 3, 1, true), cableMat, barCount * 2);
  for (let i = 0; i < barCount; i++) bars.setColorAt(i, new THREE.Color(0, 0, 0));
  bars.frustumCulled = cables.frustumCulled = false;
  root.add(bars, cables);
  owned.push(bars.geometry, barMat, cables.geometry, cableMat);
  const barHeight = new Float32Array(barCount).fill(10);

  // Strobes along the main truss.
  const strobeCount = 14;
  const strobeMat = glow(0xffffff, 1, true);
  const strobes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.35, 0.12), strobeMat, strobeCount);
  const m = new THREE.Matrix4();
  for (let i = 0; i < strobeCount; i++) {
    m.makeTranslation(-13 + (26 * i) / (strobeCount - 1), 10.55, STAGE_FRONT - 0.15);
    strobes.setMatrixAt(i, m);
    strobes.setColorAt(i, new THREE.Color(0, 0, 0));
  }
  root.add(strobes);
  owned.push(strobes.geometry, strobeMat);
  const strobeLevel = new Float32Array(strobeCount);

  const lasers = new Lasers(g.effects === 'off' ? 0 : g.effects === 'low' ? 90 : 220);
  root.add(lasers.mesh);
  owned.push(lasers);

  // Moving heads: a row on the main truss into the crowd, a row on the back truss over it, a row
  // on the deck's front pointing up, and the moon through the windows.
  const fixtures: Fixture[] = [];
  for (let i = 0; i < 12; i++) {
    const x = -12.5 + (25 * i) / 11;
    fixtures.push({ group: 'Front', pos: [x, 10.6, STAGE_FRONT - 0.5], dir: [x * 0.02, -0.55, 0.83], length: 30, spread: 0.05 });
  }
  for (let i = 0; i < 10; i++) {
    const x = -12 + (24 * i) / 9;
    fixtures.push({ group: 'Back', pos: [x, 11.8, BACK + 3.2], dir: [x * 0.025, 0.05, 1], length: 52, spread: 0.022 });
  }
  for (let i = 0; i < 8; i++) {
    const x = -10.5 + 3 * i;
    fixtures.push({ group: 'Floor', pos: [x, DECK + 0.15, STAGE_FRONT - 0.4], dir: [x * 0.03, 1, 0.25], length: 13, spread: 0.06 });
  }
  for (const side of [-1, 1])
    for (const z of [-4, 12, 28])
      fixtures.push({ group: 'Moon', pos: [side * (HALF - 0.4), 9.5, z], dir: [-side * 0.75, -0.62, 0.15], length: 26, spread: 0.09 });

  // Cold sparks along the deck's front (the indoor kind), confetti from the wings.
  const fireworks: FireworkSpec[] = [-11, -6.5, -2.2, 2.2, 6.5, 11].map((x) => ({
    origin: [x, DECK, STAGE_FRONT - 0.3],
    n: 7,
    spread: 5,
    length: [3.5, 5.5],
    lean: 0,
    side: Math.abs(x) > 5,
  }));

  const band: Record<string, Vec3> = {
    lead: [-9, DECK, -12],
    vox: [-5.4, DECK, -9.6],
    bass: [5.4, DECK, -9.6],
    drums: [9, DECK + 0.5, -14],
  };
  const players = makeBand({ band }, ctx.cast.band.data.band ?? {}, ctx.focus);
  for (const p of players) p.yaw = Math.atan2(-p.pos[0] * 0.25, 10);

  const shots = [
    shot('front', [0, 3.2, 30], [0, 5.5, -14], 70, 'push', 6, 'all', 3),
    shot('hero', [9, 10.5, 39], [-2, 4, -10], 60, 'orbit', 0.12, 'all', 2),
    shot('crowd', [6, 2.4, 12], [0, 4.8, -14], 78, 'truck', 3, 'busy', 2),
    shot('close', [2.4, 3.7, -3.6], [0, 2.9, -12], 55, 'pull', 2, 'busy', 1.6),
    shot('aerial', [0, 12.6, 36], [0, 2, -6], 74, 'push', 5, 'all', 1),
    shot('wide-left', [-21, 5, 20], [2, 5, -12], 66, 'truck', 5, 'all', 1.2),
    shot('wide-right', [21, 5, 20], [-2, 5, -12], 66, 'truck', 5, 'all', 1.2),
    shot('low-gate', [0, 1.2, -5.4], [0, 7.5, -16], 90, 'crane', 1.2, 'peak', 1.2),
    shot('rig', [-11, 11.8, 4], [5, 1.5, 22], 70, 'truck', 6, 'peak', 1),
    shot('band', [0, 4.2, 4], [0, 2.6, -11], 64, 'truck', 3, 'busy', 1.2),
    ...bandShots(band, ctx.part, (p) => [p[0] * 0.5, p[1], p[2] + 10], 5.5),
  ];
  const low: Vec3[] = shots.filter((s) => s.pos[1] < 5).map((s) => s.pos);

  const share = LEVEL_SHARE[g.crowd];
  const audience = fillCrowd(
    {
      bounds: [-23.5, STAGE_FRONT + 3.4, 23.5, FRONT - 1.5],
      step: 0.72,
      density: (x, z) => {
        if (PILLARS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.1)) return 0;
        const back = (z - STAGE_FRONT) / (FRONT - STAGE_FRONT);
        return Math.max(0.35, 1.05 - back * 0.65 - Math.max(0, Math.abs(x) - 15) * 0.05);
      },
      face: (x) => [x * 0.3, -12],
    },
    ctx.characters,
    share,
    low,
    ctx.cast.crowd.data.sync,
    17,
  );
  audience.push(dj(ctx.characters, [0, DECK, -12], 0));

  // Light the show puts on the room: sodium lamps, the wall's spill, the light bars, the strobes.
  const L = shared.uLight.value;
  const LC = shared.uLightCol.value;
  const amber = new THREE.Color(1, 0.55, 0.18);
  const color = new THREE.Color();
  let lastSub = -1;
  let flash = 0;
  let laserLook = 0;
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const sources = {
    deck: [-10, -6, -2, 2, 6, 10].map((x) => new THREE.Vector3(x, DECK + 0.25, STAGE_FRONT - 0.2)),
    truss: [-12, -5, 5, 12].map((x) => new THREE.Vector3(x, 10.7, STAGE_FRONT - 0.3)),
    wall: new THREE.Vector3(0, 6.2, BACK + 2.6),
  };

  const bind = () => {
    shared.uGlowPos.value.set(0, 6.2, BACK + 3);
    shared.uHazeFar.value.setRGB(0.008, 0.008, 0.011);
    shared.uHazeDensity.value = hi ? 0.02 : 0.016;
    shared.uAmbient.value.setRGB(0.014, 0.014, 0.02);
    shared.uGlowLight.value.set(1.8, 16);
    shared.uGlowFall.value = 0.006;
    shared.uBall.value.w = 0;
    L[0].set(-HALF + 0.8, 9, 6, 9);
    L[1].set(-HALF + 0.8, 9, 22, 9);
    L[2].set(HALF - 0.8, 9, 6, 9);
    L[3].set(HALF - 0.8, 9, 22, 9);
    for (let i = 0; i < 4; i++) LC[i].copy(amber).multiplyScalar(0.55);
  };

  const update = (f: VenueFrame) => {
    const s = f.show;
    const busy = Math.min(1, Math.max(0, (f.energy - 0.25) / 0.6));
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    // The wall changes its picture every eight bars, and at once when the level changes.
    if (f.beat === 'downbeat' && s.bar % 8 === 0) wall.next(s.bar / 8);
    if (f.beat === 'downbeat' && s.bar % 4 === 0) strip.next(s.bar / 4);
    if (f.beat === 'downbeat' && s.bar % 4 === 2) lip.next(s.bar / 4);
    wall.level = 1.7 + 0.9 * f.barPulse + 0.6 * s.overdrive;
    for (const scr of [wall, strip, lip]) scr.update(f.dt);

    // Light bars: a slow swell through the rows, deeper and faster as the music builds; in a peak
    // they ride the beat in a wave down the hall; overdrive pulls them all down low.
    const dummy = new THREE.Object3D();
    let i = 0;
    for (const z of BAR_Z)
      for (const x of BAR_X) {
        const wave = Math.sin(f.time * (0.35 + 0.35 * busy) + z * 0.18 + x * 0.06);
        const beatWave = peak ? Math.sin(f.clock * Math.PI * 0.5 - z * 0.12) * 0.8 : 0;
        const want = 10.2 - busy * 2.6 + wave * (1.1 + 1.6 * busy) + beatWave - s.overdrive * 3;
        barHeight[i] += (want - barHeight[i]) * Math.min(1, f.dt * 2.5);
        const y = barHeight[i];
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, 0, peak ? Math.sin(f.clock * 0.5 + i) * 0.12 : 0);
        dummy.updateMatrix();
        bars.setMatrixAt(i, dummy.matrix);
        for (const k of [0, 1]) {
          const cx = x + (k ? 2.4 : -2.4);
          dummy.position.set(cx, (BAR_TOP + y) / 2, z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, BAR_TOP - y, 1);
          dummy.updateMatrix();
          cables.setMatrixAt(i * 2 + k, dummy.matrix);
          dummy.scale.set(1, 1, 1);
        }
        // A chase runs back through the rows on the beat; the colours trade places every bar.
        const row = BAR_Z.indexOf(z);
        const chase = Math.pow(Math.max(0, Math.cos((f.clock * 0.5 - row * 0.18) * Math.PI)), 6);
        const lvl = (0.25 + 0.75 * busy) * (0.45 + 0.55 * chase) * 2.2 + s.overdrive;
        color.copy((row + s.bar) % 2 ? f.key : f.accent).multiplyScalar(lvl);
        bars.setColorAt(i, color);
        i++;
      }
    bars.instanceMatrix.needsUpdate = true;
    bars.instanceColor!.needsUpdate = true;
    cables.instanceMatrix.needsUpdate = true;

    // Strobes: in a peak they fire in sixteenths, a few at a time, plus the blinder on the bar.
    const sub = Math.floor(f.clock * 4);
    if (sub !== lastSub) {
      lastSub = sub;
      if (peak && !menu && busy > 0.4)
        for (let k = 0; k < strobeCount; k++) if (Math.random() < 0.18 + 0.2 * s.overdrive) strobeLevel[k] = 1;
    }
    let sum = 0;
    for (let k = 0; k < strobeCount; k++) {
      strobeLevel[k] = Math.max(strobeLevel[k] * Math.exp(-f.dt * 38), s.blinder * (k % 2 ? 0.8 : 0.3));
      strobes.setColorAt(k, color.setScalar(0.08 + strobeLevel[k] * 9));
      sum += strobeLevel[k];
    }
    strobes.instanceColor!.needsUpdate = true;
    flash = Math.max(flash * Math.exp(-f.dt * 25), sum / strobeCount);
    shared.uFlash.value = flash * 0.35;

    // The room's lights: the wall's spill, two pools under the light bars, the strobes' flash.
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

    // Lasers: a sheet over the heads when it is calm, fans and scans as it builds, the tunnel and
    // everything at a peak. Each look holds for four bars.
    lasers.begin();
    if (f.beat === 'downbeat' && s.bar % 4 === 0) laserLook++;
    const t = f.time;
    const lv = (menu ? 0.5 : 1) * (0.35 + 0.65 * busy) * 0.45;
    const green = color.setRGB(0.15, 1, 0.3);
    const c1 = new THREE.Color().copy(f.key).lerp(WHITE, 0.15);
    const c2 = new THREE.Color().copy(f.accent);
    // The sheet: two lasers at the deck's corners fan out flat just over the crowd.
    if (s.level !== 'calm' || menu) {
      const roll = Math.sin(t * 0.7) * 0.05;
      fan(lasers, sources.deck[0], 22, 0.62, 0.09 + 0.03 * Math.sin(t * 0.5), 1.3, 46, laserLook % 2 ? green : c1, lv * 1.4, roll);
      fan(lasers, sources.deck[5], 22, -0.62, 0.09 + 0.03 * Math.sin(t * 0.5 + 1), 1.3, 46, laserLook % 2 ? green : c1, lv * 1.4, -roll);
    }
    if (s.level === 'groove') {
      const look = laserLook % 3;
      if (look === 0)
        // Fans from the truss, sweeping across each other.
        sources.truss.forEach((src, k) =>
          fan(
            lasers,
            src,
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
        // Single beams scanning the floor, jumping on every beat.
        sources.deck.forEach((src, k) => {
          const jump = hash(Math.floor(f.clock) * 7 + k);
          fan(lasers, src, 3, (jump - 0.5) * 1.2, 0.05 + 0.25 * hash(jump * 13), 0.18, 45, k % 2 ? c2 : c1, lv * 1.6);
        });
      else
        sources.truss.forEach((src, k) =>
          fan(lasers, src, 14, (k - 1.5) * 0.25, -0.2 + 0.12 * Math.sin(t * 1.3 + k), 1.0, 42, c2, lv * 1.2, Math.sin(t * 0.4) * 0.4),
        );
    }
    if (peak) {
      // The tunnel: a cone of beams from the middle of the wall, turning.
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
      // On every other bar the truss's lasers stab down into the crowd, one beam each, on the beat.
      if (s.bar % 2)
        sources.truss.forEach((src, k) => {
          const jump = hash(Math.floor(f.clock) * 5 + k);
          tmpB
            .set((jump - 0.5) * 1.4, -0.45, 1)
            .normalize()
            .multiplyScalar(40)
            .add(src);
          lasers.add(src, tmpB, c2, lv * 2 * (0.4 + 0.6 * f.pulse));
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
    fixtures,
    fireworks,
    co2: [-12, -7, 7, 12].map((x): Vec3 => [x, DECK, STAGE_FRONT - 0.6]),
    confetti: [-1, 1].map((side) => ({ pos: [side * 13, 9, STAGE_FRONT] as Vec3, dir: [-side * 0.25, 0.75, 0.6] as Vec3 })),
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
