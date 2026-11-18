import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import type { Fixture, FireworkSpec } from '../aurora/assets';
import { makeBand } from '../aurora/figures';
import { shared } from '../aurora/shared';
import type { Vec3 } from '../stage/Director';
import { Builder, disposeTree } from './kit/build';
import { fillCrowd } from './kit/crowd';
import { bandShots, shot } from './kit/shots';
import { glow, surface } from './kit/surface';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

/** The room: half its width, its back and front walls, its height (metres). */
const HALF = 9;
const BACK = -7;
const FRONT = 10;
const HEIGHT = 4.4;
/** The little stage: its front edge and its height. */
const STAGE_FRONT = -3.5;
const DECK = 0.5;
/** The bar counter along the right wall: its front face and its ends. */
const COUNTER_X = 6;
const COUNTER_Z: [number, number] = [-0.5, 8.5];
/** The mirror ball. */
const BALL: Vec3 = [0, 3.85, 2.2];

/**
 * Bar: a small room with a small stage, close enough to touch. Old brick, a worn wooden floor, a
 * velvet curtain behind the band, neon on the walls, bulbs strung across the ceiling, a counter
 * of backlit bottles, and a mirror ball that throws its spots round the room when it kicks off.
 */
export function buildBar(ctx: VenueContext): Venue {
  const { g } = ctx;
  const b = new Builder();
  const brick = surface({ pattern: 'brick', color: 0x7a3b28, color2: 0x3a3029, rough: 0.9, scale: 0.42 });
  const plaster = surface({ pattern: 'concrete', color: 0x1d1a22, color2: 0x120f14, rough: 0.9, scale: 2 });
  const floor = surface({ pattern: 'wood', color: 0x4a2c18, color2: 0x24140a, rough: 0.45, scale: 1.6 });
  const darkWood = surface({ pattern: 'wood', color: 0x2a170c, color2: 0x120904, rough: 0.35, scale: 1.2 });
  const ceiling = surface({ color: 0x0b0a0c, rough: 0.9 });
  const pipe = surface({ pattern: 'metal', color: 0x3a3632, rough: 0.5, metal: 0.7 });
  const black = surface({ color: 0x0d0c0e, rough: 0.7 });
  const carpet = surface({ pattern: 'fabric', color: 0x2a0c12, rough: 1, scale: 0.4 });
  const velvet = surface({ pattern: 'fabric', color: 0x5a0a16, rough: 0.95, scale: 0.3 });
  const chrome = surface({ pattern: 'metal', color: 0xc8ccd4, rough: 0.12, metal: 1, scale: 0.2 });
  const shelfGlow = glow(0xffa860, 1.3);
  const counterGlow = glow(0xff7a30, 1.8);

  // The room.
  b.panel(floor, HALF * 2, FRONT - BACK, [0, 0, (FRONT + BACK) / 2], 0, -Math.PI / 2);
  b.panel(brick, HALF * 2, HEIGHT, [0, HEIGHT / 2, BACK], 0);
  b.panel(plaster, HALF * 2, HEIGHT, [0, HEIGHT / 2, FRONT], Math.PI);
  b.panel(brick, FRONT - BACK, HEIGHT, [-HALF, HEIGHT / 2, (FRONT + BACK) / 2], Math.PI / 2);
  b.panel(plaster, FRONT - BACK, HEIGHT, [HALF, HEIGHT / 2, (FRONT + BACK) / 2], -Math.PI / 2);
  b.panel(ceiling, HALF * 2, FRONT - BACK, [0, HEIGHT, (FRONT + BACK) / 2], 0, Math.PI / 2);
  // Ducts and pipes under the ceiling.
  b.rod(pipe, [-HALF, HEIGHT - 0.4, 6], [HALF, HEIGHT - 0.4, 6], 0.28, 12);
  b.rod(pipe, [-6, HEIGHT - 0.25, BACK], [-6, HEIGHT - 0.25, FRONT], 0.09, 8);
  b.rod(pipe, [-5.6, HEIGHT - 0.25, BACK], [-5.6, HEIGHT - 0.25, FRONT], 0.06, 8);
  // Skirting and a dado rail along the plaster walls.
  b.box(darkWood, [0.06, 1.1, FRONT - BACK], [HALF - 0.03, 0.55, (FRONT + BACK) / 2]);

  // The stage: a low riser with carpet, a drum riser, and the curtain behind.
  b.box(black, [11, DECK, STAGE_FRONT - BACK], [0, DECK / 2, (STAGE_FRONT + BACK) / 2]);
  b.panel(carpet, 10.9, STAGE_FRONT - BACK - 0.05, [0, DECK + 0.004, (STAGE_FRONT + BACK) / 2], 0, -Math.PI / 2);
  b.box(black, [2.6, 0.25, 2], [0, DECK + 0.125, -6]);
  const curtain = new THREE.PlaneGeometry(11.6, HEIGHT, 160, 1);
  const cp = curtain.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, 0.14 * Math.sin(cp.getX(i) * 5.2) + 0.05 * Math.sin(cp.getX(i) * 13.1));
  curtain.computeVertexNormals();
  b.add(velvet, curtain, new THREE.Matrix4().makeTranslation(0, HEIGHT / 2, BACK + 0.3));
  // A pipe over the stage's front for the lights, and speakers on stands.
  b.rod(pipe, [-5.4, 3.95, STAGE_FRONT + 0.1], [5.4, 3.95, STAGE_FRONT + 0.1], 0.04, 8);
  for (const side of [-1, 1]) {
    b.rod(pipe, [side * 6.2, 0, STAGE_FRONT + 0.4], [side * 6.2, 1.6, STAGE_FRONT + 0.4], 0.025, 6);
    b.box(black, [0.55, 0.85, 0.45], [side * 6.2, 2.05, STAGE_FRONT + 0.4], side * 0.25);
    for (let k = 0; k < 6; k++) b.box(pipe, [0.08, 0.06, 0.3], [side * (5.2 - k * 0.15), DECK + 0.03, STAGE_FRONT - 0.3]);
  }

  // The bar: a counter with a glowing foot, stools in front, shelves of bottles behind.
  const [cz0, cz1] = COUNTER_Z;
  b.box(darkWood, [1.2, 1.08, cz1 - cz0], [COUNTER_X + 0.6, 0.54, (cz0 + cz1) / 2]);
  b.box(darkWood, [1.45, 0.07, cz1 - cz0 + 0.2], [COUNTER_X + 0.55, 1.12, (cz0 + cz1) / 2]);
  b.box(counterGlow, [0.03, 0.03, cz1 - cz0 - 0.2], [COUNTER_X - 0.03, 0.12, (cz0 + cz1) / 2]);
  for (let z = cz0 + 0.8; z < cz1; z += 1.1) {
    b.rod(chrome, [COUNTER_X - 0.6, 0, z], [COUNTER_X - 0.6, 0.72, z], 0.03, 8);
    b.drum(black, 0.2, 0.08, [COUNTER_X - 0.6, 0.72, z], 16);
  }
  for (const y of [1.45, 2.05, 2.65]) b.box(darkWood, [0.35, 0.04, cz1 - cz0], [HALF - 0.2, y, (cz0 + cz1) / 2]);
  b.panel(shelfGlow, cz1 - cz0, 1.6, [HALF - 0.02, 2.1, (cz0 + cz1) / 2], -Math.PI / 2);
  // Pendant lamps over the counter.
  for (const z of [1, 4, 7]) {
    b.rod(pipe, [COUNTER_X + 0.4, HEIGHT, z], [COUNTER_X + 0.4, 2.7, z], 0.008, 4);
    b.add(black, new THREE.ConeGeometry(0.22, 0.24, 16, 1, true), new THREE.Matrix4().makeTranslation(COUNTER_X + 0.4, 2.6, z));
  }
  // The mirror ball on its rod.
  b.rod(pipe, [BALL[0], HEIGHT, BALL[2]], [BALL[0], BALL[1] + 0.3, BALL[2]], 0.01, 4);
  const ballGeo = new THREE.SphereGeometry(0.34, 22, 14).toNonIndexed();
  ballGeo.computeVertexNormals();
  b.add(chrome, ballGeo, new THREE.Matrix4().makeTranslation(...BALL));
  const root = b.build('bar');
  const owned: { dispose(): void }[] = [{ dispose: () => disposeTree(root) }];

  // Bottles on the shelves, backlit: one instanced draw.
  const bottleGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.3, 8);
  bottleGeo.translate(0, 0.15, 0);
  const bottleMat = glow(0xffffff, 1, true);
  const bottleSpots: [number, number][] = [];
  for (const y of [1.47, 2.07, 2.67])
    for (let z = cz0 + 0.2; z < cz1 - 0.1; z += 0.16 + Math.abs(Math.sin(z * 9 + y)) * 0.12) bottleSpots.push([y, z]);
  const bottles = new THREE.InstancedMesh(bottleGeo, bottleMat, bottleSpots.length);
  const tints = [0x6b3a10, 0x1f4a1a, 0x8a7a60, 0x3a1010, 0x6a5020, 0x204060].map((c) => new THREE.Color(c));
  const m4 = new THREE.Matrix4();
  bottleSpots.forEach(([y, z], i) => {
    m4.compose(
      new THREE.Vector3(HALF - 0.2, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 0.8 + Math.abs(Math.sin(i * 3.1)) * 0.6, 1),
    );
    bottles.setMatrixAt(i, m4);
    bottles.setColorAt(i, tints[i % tints.length].clone().multiplyScalar(1.4));
  });
  root.add(bottles);

  // Bulbs strung across the ceiling in sagging strings, and the pendants' own bulbs.
  const bulbSpots: Vec3[] = [];
  for (const z of [-2.2, 0.8, 3.8, 6.8]) {
    for (let k = 0; k <= 22; k++) {
      const u = k / 22;
      bulbSpots.push([-HALF + u * HALF * 2, HEIGHT - 0.15 - Math.sin(u * Math.PI) * 0.55, z + Math.sin(u * Math.PI * 2) * 0.2]);
    }
  }
  for (const z of [1, 4, 7]) bulbSpots.push([COUNTER_X + 0.4, 2.5, z]);
  const bulbMat = glow(0xffffff, 1, true);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), bulbMat, bulbSpots.length);
  bulbSpots.forEach((p, i) => {
    bulbs.setMatrixAt(i, m4.makeTranslation(...p));
    bulbs.setColorAt(i, new THREE.Color(0, 0, 0));
  });
  root.add(bulbs);
  // The strings themselves.
  const wireMat = surface({ color: 0x050505, rough: 1 });
  const wires = new Builder();
  for (let s = 0; s < 4; s++) for (let k = 0; k < 22; k++) wires.rod(wireMat, bulbSpots[s * 23 + k], bulbSpots[s * 23 + k + 1], 0.006, 3);
  root.add(wires.build('wires'));

  // Neon on the walls: waves on the brick to the left, a ring and a bolt on the back wall.
  const neon = (points: Vec3[], color: number, closed = false) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
      closed,
    );
    const mat = glow(color, 2.6);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 12, 0.022, 6, closed), mat);
    root.add(mesh);
    return mat;
  };
  const signs: { mat: THREE.ShaderMaterial; base: number; seed: number }[] = [];
  for (let w = 0; w < 3; w++) {
    const pts: Vec3[] = [];
    for (let k = 0; k <= 16; k++) pts.push([-HALF + 0.06, 2.3 + w * 0.32 + Math.sin(k * 0.8) * 0.12, -1 + k * 0.28]);
    signs.push({ mat: neon(pts, w === 1 ? 0x30e8ff : 0xff2a8a), base: 2.6, seed: w });
  }
  const ring: Vec3[] = [];
  for (let k = 0; k < 24; k++)
    ring.push([7 + Math.cos((k / 24) * Math.PI * 2) * 0.7, 2.6 + Math.sin((k / 24) * Math.PI * 2) * 0.7, BACK + 0.06]);
  signs.push({ mat: neon(ring, 0xffcc40, true), base: 2.4, seed: 5 });
  signs.push({
    mat: neon(
      [
        [7.15, 3.1, BACK + 0.07],
        [6.8, 2.6, BACK + 0.07],
        [7.15, 2.6, BACK + 0.07],
        [6.85, 2.1, BACK + 0.07],
      ],
      0xff5a20,
    ),
    base: 2.8,
    seed: 7,
  });

  // Lights: pars on the pipe over the stage, two little movers on the deck, a pin spot on the ball.
  const fixtures: Fixture[] = [];
  for (let i = 0; i < 6; i++) {
    const x = -4.5 + 1.8 * i;
    fixtures.push({ group: 'Par', pos: [x, 3.85, STAGE_FRONT + 0.1], dir: [-x * 0.04, -1, -0.45], length: 4.6, spread: 0.16 });
  }
  for (const side of [-1, 1])
    fixtures.push({ group: 'Floor', pos: [side * 5, DECK + 0.1, STAGE_FRONT - 0.4], dir: [-side * 0.4, 1, 0.5], length: 5, spread: 0.08 });
  fixtures.push({
    group: 'Pin',
    pos: [-3, HEIGHT - 0.1, 7],
    dir: [BALL[0] + 3, BALL[1] - HEIGHT + 0.1, BALL[2] - 7],
    length: 6,
    spread: 0.012,
  });

  // Cold sparks along the stage's front.
  const fireworks: FireworkSpec[] = [-4.5, -1.5, 1.5, 4.5].map((x) => ({
    origin: [x, DECK, STAGE_FRONT - 0.15],
    n: 5,
    spread: 4,
    length: [1.6, 2.6],
    lean: 0,
    side: Math.abs(x) > 3,
  }));

  const band: Record<string, Vec3> = {
    lead: [-3.2, DECK, -4.9],
    vox: [0, DECK, -4.3],
    bass: [3.2, DECK, -4.9],
    drums: [0, DECK + 0.25, -6.1],
  };
  const players = makeBand({ band }, ctx.cast.band.data.band ?? {}, ctx.focus);
  for (const p of players) p.yaw = Math.atan2(-p.pos[0] * 0.3, 6);

  const shots = [
    shot('front', [0, 1.9, 9.2], [0, 1.9, -5], 70, 'push', 2.5, 'all', 3),
    shot('hero', [-6.8, 3.3, 8.6], [0.5, 1.3, -4], 70, 'orbit', 0.15, 'all', 2),
    shot('crowd', [2.2, 1.6, 2.6], [0, 1.9, -5], 80, 'truck', 1.4, 'busy', 2),
    shot('close', [1.1, 1.75, -1.5], [0, 1.7, -5], 62, 'pull', 1, 'busy', 1.5),
    shot('aerial', [0.5, 4.15, 9.5], [0, 0.6, -2], 76, 'push', 2, 'all', 1),
    shot('bar', [8.3, 2.1, -0.4], [-2, 1.6, -2.5], 74, 'truck', 1.2, 'all', 1.2),
    shot('wide-left', [-8.3, 2.2, 3.5], [2, 1.5, -4], 72, 'truck', 2, 'all', 1.2),
    shot('ball', [1.6, 2.4, 5.6], [0, 3.7, 2], 52, 'orbit', 0.4, 'peak', 1.2),
    shot('band', [0, 1.9, 1.2], [0, 1.6, -5], 70, 'truck', 1.6, 'busy', 1.4),
    ...bandShots(band, ctx.part, (p) => [p[0], p[1], p[2] + 6], 2.8, 50),
  ];
  const low = shots.filter((s) => s.pos[1] < 5).map((s) => s.pos);

  // A small crowd, packed at the front; a few at the counter, turned to it.
  const share = Math.max(0.6, LEVEL_SHARE[g.crowd]);
  const audience = fillCrowd(
    {
      bounds: [-8.4, STAGE_FRONT + 0.9, COUNTER_X - 0.6, FRONT - 0.6],
      step: 0.78,
      density: (x, z) => {
        if (x > COUNTER_X - 1.4) return z > cz0 + 0.5 && z < cz1 - 0.5 ? 0.45 : 0;
        return Math.max(0.18, 0.95 - (z - STAGE_FRONT) * 0.085);
      },
      face: (x, z) => (x > COUNTER_X - 1.4 ? [HALF, z] : [x * 0.4, -5]),
      wander: 0.7,
    },
    ctx.characters,
    share,
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
  let flicker = 0;

  const bind = () => {
    shared.uGlowPos.value.set(0, 2.2, -5);
    shared.uHazeFar.value.setRGB(0.012, 0.008, 0.007);
    shared.uHazeDensity.value = g.lights === 'low' ? 0.025 : 0.034;
    shared.uAmbient.value.setRGB(0.03, 0.022, 0.02);
    shared.uGlowLight.value.set(0.7, 5);
    shared.uGlowFall.value = 0.05;
    shared.uBall.value.set(...BALL, ballLevel);
    shared.uBallTurn.value = turn;
    L[1].set(HALF - 0.6, 2, 4, 4);
    LC[1].copy(warm).multiplyScalar(0.9);
    [1, 4, 7].forEach((z, i) => {
      L[2 + i].set(COUNTER_X + 0.4, 2.3, z, 2.2);
      LC[2 + i].copy(warm).multiplyScalar(0.8);
    });
    L[5].set(-HALF + 0.5, 2.6, 1.2, 3);
    L[6].set(7, 2.6, BACK + 0.6, 3);
  };

  const update = (f: VenueFrame) => {
    const s = f.show;
    const busy = Math.min(1, Math.max(0, (f.energy - 0.25) / 0.6));
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    // The ball turns all night; its spots come up in a peak.
    turn += f.dt * (0.18 + 0.25 * busy);
    ballLevel += ((peak ? 1 : s.level === 'groove' ? 0.35 : 0.12) - ballLevel) * Math.min(1, f.dt * 1.5);
    // The bulbs: warm and steady, a gentle wave on the bar, chasing in a peak.
    for (let i = 0; i < bulbSpots.length; i++) {
      const chase = peak ? Math.pow(Math.max(0, Math.cos((f.clock * 0.5 - i * 0.09) * Math.PI)), 8) : 0;
      const lvl = 1.6 + 0.6 * f.barPulse * Math.sin(i * 0.7 + f.time) + 4 * chase;
      bulbs.setColorAt(i, c.setRGB(1, 0.62, 0.28).multiplyScalar(lvl));
    }
    bulbs.instanceColor!.needsUpdate = true;
    // Neon hums, now and then stutters; the pink and blue breathe with the beat.
    flicker = Math.random() < f.dt * 0.25 ? 0.25 : Math.min(1, flicker + f.dt * 3);
    signs.forEach((sg, i) => {
      const stutter = i === 3 ? flicker : 1;
      sg.mat.uniforms.uLevel.value = sg.base * stutter * (0.85 + 0.25 * f.pulse * (i < 3 ? 1 : 0));
    });
    LC[5].setRGB(1, 0.16, 0.55).multiplyScalar(0.35);
    LC[6].setRGB(1, 0.7, 0.2).multiplyScalar(0.3 * flicker);
    // The stage wash and a flash for the blinder.
    L[0].set(0, 3, -3, 6);
    LC[0]
      .copy(f.key)
      .lerp(warm, 0.3)
      .multiplyScalar(1.1 + 0.6 * f.barPulse);
    L[7].set(0, 3.6, STAGE_FRONT, 7);
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
    fixtures,
    fireworks,
    co2: [],
    confetti: [-1, 1].map((side) => ({ pos: [side * 5.2, DECK + 0.2, STAGE_FRONT] as Vec3, dir: [-side * 0.2, 1, 0.45] as Vec3 })),
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
    bind,
    update,
    beam,
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}
