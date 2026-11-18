import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import type { Fixture, FireworkSpec } from '../aurora/assets';
import { makeBand } from '../aurora/figures';
import { COMMON, OUTPUT, shared } from '../aurora/shared';
import type { Vec3 } from '../stage/Director';
import { Builder, disposeTree } from './kit/build';
import { fillCrowd } from './kit/crowd';
import { Lasers, fan } from './kit/lasers';
import { LedScreen } from './kit/led';
import { bandShots, shot } from './kit/shots';
import { glow, surface } from './kit/surface';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

/** The deck: its front edge, back, half width and height. */
const DECK_FRONT = -12;
const DECK_BACK = -32;
const DECK_HALF = 30;
const DECK = 3;
/** The main screen: centre and size. */
const SCREEN: Vec3 = [0, 12.2, -30.6];
const SCREEN_W = 36;
const SCREEN_H = 16;
/** Seconds the sun takes to go down in a song. */
const SUNSET = 200;

/** The sky from late sunset into the night: `uDusk` runs 0..1 over the show. */
function buildSky(dusk: { value: number }) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { ...shared, uDusk: dusk },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform float uDusk;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 sunDir = normalize(vec3(-0.45, 0.035 - uDusk * 0.09, -1.0));
        float toSun = max(0.0, dot(d, sunDir));
        // Sunset: deep blue above, through violet and pink to a burning horizon.
        vec3 zenith = mix(vec3(0.05, 0.08, 0.22), vec3(0.004, 0.007, 0.03), uDusk);
        vec3 mid = mix(vec3(0.45, 0.18, 0.38), vec3(0.03, 0.02, 0.08), uDusk);
        vec3 low = mix(vec3(1.4, 0.45, 0.16), vec3(0.08, 0.03, 0.06), uDusk);
        vec3 col = mix(low, mid, smoothstep(-0.02, 0.12, h));
        col = mix(col, zenith, smoothstep(0.1, 0.6, h));
        // The glow round the sun, wider than the sun itself.
        col += vec3(1.6, 0.6, 0.2) * pow(toSun, 12.0) * (1.0 - uDusk) * 1.5;
        col += vec3(2.0, 1.1, 0.5) * smoothstep(0.9993, 0.9996, toSun) * (1.0 - uDusk);
        // Clouds in bands, lit from below by the sun on their undersides, dark against the night.
        vec2 cp = d.xz / max(0.06, h + 0.08) * 1.4;
        float cl = fbm(cp * 0.6 + vec2(uTime * 0.01, 0.0));
        float cloud = smoothstep(0.5, 0.8, cl) * smoothstep(0.0, 0.08, h) * smoothstep(0.55, 0.15, h);
        vec3 lit = mix(vec3(1.3, 0.5, 0.35), vec3(0.04, 0.03, 0.07), uDusk) * (0.5 + 0.7 * pow(toSun, 3.0));
        col = mix(col, lit, cloud * 0.8);
        // Stars come out as it gets dark.
        vec3 sp = d * 180.0;
        float r = hash31(floor(sp));
        float star = step(0.9985, r) * smoothstep(0.35, 0.05, length(fract(sp) - 0.5)) * smoothstep(0.05, 0.3, h);
        col += vec3(0.9, 0.95, 1.0) * star * smoothstep(0.4, 0.9, uDusk) * (0.6 + 0.4 * sin(uTime * 3.0 + r * 50.0));
        // Treeline and hills on the horizon.
        float az = atan(d.x, -d.z);
        float ridge = 0.012 + 0.02 * fbm(vec2(az * 3.0, 1.0)) + 0.012 * vnoise(vec2(az * 40.0, 2.0));
        col = mix(col, mix(vec3(0.06, 0.03, 0.05), vec3(0.004, 0.004, 0.008), uDusk), step(h, ridge));
        // The stage's light in the haze above it.
        col += uHazeNear * 0.4 * pow(max(0.0, dot(d, vec3(0.0, 0.3, -0.95))), 4.0);
        gl_FragColor = vec4(col, 1.0);
        ${OUTPUT}
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/**
 * Mainstage: the headline stage of a big festival. A wall of LEDs as wide as a building with two
 * angled wings and a banner over them, a header bristling with lights, scaffold towers, flame jets
 * along the deck, fireworks, lasers, confetti, tens of thousands on the field, and the sun going
 * down behind it all over the course of a song.
 */
export function buildMainstage(ctx: VenueContext): Venue {
  const { g, menu } = ctx;
  const b = new Builder();
  const grass = surface({ pattern: 'grass', color: 0x1d2a14, color2: 0x2e2a18, rough: 0.95, scale: 3 });
  const black = surface({ color: 0x0b0b0d, rough: 0.6 });
  const steel = surface({ pattern: 'metal', color: 0x3a3d44, rough: 0.4, metal: 0.85, scale: 2 });
  const deckTop = surface({ color: 0x101012, rough: 0.25 });
  const canvas = surface({ pattern: 'fabric', color: 0xd8d4cc, rough: 0.9, scale: 0.6 });
  const amber = glow(0xffb060, 2);

  b.panel(grass, 600, 600, [0, 0, 100], 0, -Math.PI / 2);
  // The deck, its skirt and the stairs.
  b.box(black, [DECK_HALF * 2, DECK, DECK_BACK - DECK_FRONT], [0, DECK / 2, (DECK_FRONT + DECK_BACK) / 2]);
  b.panel(deckTop, DECK_HALF * 2 - 0.2, DECK_FRONT - DECK_BACK - 0.2, [0, DECK + 0.01, (DECK_FRONT + DECK_BACK) / 2], 0, -Math.PI / 2);
  b.box(black, [6, 1.2, 4], [0, DECK + 0.6, -24]);
  // The screen's frame and the scaffolding behind it.
  b.box(black, [SCREEN_W + 1.6, SCREEN_H + 1.6, 0.6], [SCREEN[0], SCREEN[1], SCREEN[2] - 0.4]);
  for (let x = -18; x <= 18; x += 4.5) b.truss(steel, [x, 0, -33.5], [x, 26, -33.5], 0.6);
  // The header: a deep truss frame over everything, on four legs.
  for (const z of [-11, -21, -31]) b.truss(steel, [-36, 24, z], [36, 24, z], 1.2);
  for (const x of [-36, 36]) for (const z of [-11, -31]) b.truss(steel, [x, 0, z], [x, 24, z], 1.2);
  for (let x = -36; x <= 36; x += 12) b.truss(steel, [x, 24, -11], [x, 24, -31], 1.0);
  // Scaffold towers either side with line arrays, and delay towers out on the field.
  for (const side of [-1, 1]) {
    for (const dx of [0, 4])
      for (const dz of [0, 4]) b.truss(steel, [side * (42 + dx), 0, -16 + dz], [side * (42 + dx), 30, -16 + dz], 0.5);
    for (let y = 6; y <= 30; y += 6) b.truss(steel, [side * 42, y, -16], [side * 46, y, -16], 0.4);
    for (let k = 0; k < 10; k++) b.box(black, [2.2, 0.75, 1.3], [side * 39, 21 - k * 0.78, -12 + k * 0.06], -side * 0.15);
    for (const z of [55]) {
      b.truss(steel, [side * 30, 0, z], [side * 30, 16, z], 0.5);
      for (let k = 0; k < 6; k++) b.box(black, [1.5, 0.6, 1], [side * 30, 15 - k * 0.62, z + 0.6]);
    }
  }
  // The mixing tent in the middle of the field, with its warm work lights.
  b.box(black, [10, 1.1, 6], [0, 0.55, 64]);
  b.box(canvas, [11, 0.2, 7], [0, 4.2, 64]);
  for (const x of [-5, 5]) for (const z of [61, 67]) b.rod(steel, [x, 0, z], [x, 4.1, z], 0.06, 6);
  b.box(amber, [8, 0.05, 0.2], [0, 4.05, 61.3]);
  // Crowd barrier.
  b.box(steel, [64, 1.2, 0.15], [0, 0.6, DECK_FRONT + 3.5]);
  const root = b.build('mainstage');
  const owned: { dispose(): void }[] = [{ dispose: () => disposeTree(root) }];

  const dusk = { value: 0 };
  const sky = buildSky(dusk);
  root.add(sky);

  // Screens: the main wall, two wings turned in toward the field, a banner across the header and a
  // fascia along the deck's front.
  const wall = new LedScreen([288, 128], ['horizon', 'kaleido', 'tunnel', 'plasma', 'bars', 'rings'], 2, 4);
  const wing = new LedScreen([72, 144], ['plasma', 'stripes', 'grid', 'bars'], 1.8, 5);
  const banner = new LedScreen([400, 24], ['stripes', 'bars', 'grid'], 2, 6);
  const fascia = new LedScreen([480, 16], ['bars', 'stripes', 'rings'], 1.6, 7);
  const screens = [wall, wing, banner, fascia];
  const add = (mat: THREE.Material, w: number, h: number, at: Vec3, yaw = 0) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(...at);
    mesh.rotation.y = yaw;
    root.add(mesh);
  };
  add(wall.material, SCREEN_W, SCREEN_H, SCREEN);
  for (const side of [-1, 1]) add(wing.material, 9, 18, [side * 25.5, 14, -27], -side * 0.5);
  add(banner.material, 64, 3.2, [0, 26.2, -10.3]);
  add(fascia.material, DECK_HALF * 2, DECK - 0.4, [0, DECK / 2, DECK_FRONT + 0.02]);
  owned.push(...screens);

  const lasers = new Lasers(g.effects === 'off' ? 0 : g.effects === 'low' ? 80 : 200);
  root.add(lasers.mesh);

  // Moving heads: the header's front row into the crowd, searchlights into the sky, a row on the deck.
  const fixtures: Fixture[] = [];
  for (let i = 0; i < 24; i++) {
    const x = -34 + (68 * i) / 23;
    fixtures.push({ group: 'Header', pos: [x, 23, -11.5], dir: [x * 0.008, -0.62, 0.78], length: 60, spread: 0.035 });
  }
  for (let i = 0; i < 10; i++) {
    const x = -33 + (66 * i) / 9;
    fixtures.push({ group: 'Sky', pos: [x, 25, -30], dir: [x * 0.012, 1, 0.12], length: 140, spread: 0.012 });
  }
  for (let i = 0; i < 16; i++) {
    const x = -27 + (54 * i) / 15;
    fixtures.push({ group: 'Floor', pos: [x, DECK + 0.2, DECK_FRONT - 0.6], dir: [x * 0.02, 1, 0.35], length: 30, spread: 0.03 });
  }
  for (const side of [-1, 1])
    for (let k = 0; k < 4; k++)
      fixtures.push({
        group: 'Tower',
        pos: [side * 44, 8 + k * 6, -14],
        dir: [-side * 0.8, -0.2 + k * 0.12, 0.6],
        length: 70,
        spread: 0.02,
      });

  const flames: Vec3[] = [];
  for (let k = 0; k < 12; k++) flames.push([-27 + (54 * k) / 11, DECK, DECK_FRONT - 0.5]);
  const fireworks: FireworkSpec[] = [
    { origin: [0, 26, -31], n: 20, spread: 60, length: [28, 40], lean: 0, side: false },
    { origin: [-20, 26, -31], n: 14, spread: 40, length: [22, 32], lean: -12, side: false },
    { origin: [20, 26, -31], n: 14, spread: 40, length: [22, 32], lean: 12, side: false },
    { origin: [-44, 30, -14], n: 14, spread: 35, length: [24, 34], lean: -15, side: true },
    { origin: [44, 30, -14], n: 14, spread: 35, length: [24, 34], lean: 15, side: true },
    { origin: [-30, 16, 55], n: 10, spread: 25, length: [18, 26], lean: -5, side: true },
    { origin: [30, 16, 55], n: 10, spread: 25, length: [18, 26], lean: 5, side: true },
  ];

  const band: Record<string, Vec3> = { lead: [-9, DECK, -18], vox: [0, DECK, -15.5], bass: [9, DECK, -18], drums: [0, DECK + 1.2, -24] };
  const players = makeBand({ band }, ctx.cast.band.data.band ?? {}, ctx.focus);
  for (const p of players) p.yaw = Math.atan2(-p.pos[0] * 0.15, 10);

  const shots = [
    shot('front', [0, 6.5, 62], [0, 15, -20], 74, 'push', 8, 'all', 3),
    shot('hero', [62, 26, 88], [-6, 12, -16], 56, 'orbit', 0.14, 'all', 2),
    shot('crowd', [8, 3.4, 30], [0, 14, -20], 76, 'truck', 4, 'busy', 2),
    shot('close', [-7, 6.4, -4], [0, 7, -20], 70, 'pull', 4, 'busy', 1.4),
    shot('aerial', [30, 70, 120], [0, 4, -10], 54, 'orbit', 0.2, 'all', 1),
    shot('wide-left', [-58, 8, 44], [0, 14, -18], 62, 'truck', 8, 'all', 1.2),
    shot('wide-right', [58, 8, 44], [0, 14, -18], 62, 'truck', 8, 'all', 1.2),
    shot('low-gate', [0, 1.6, -6.5], [0, 18, -26], 86, 'crane', 2, 'peak', 1.2),
    shot('sunset', [-18, 4, 40], [10, 10, -60], 58, 'truck', 6, 'all', 1),
    shot('band', [-2, 6.6, -1], [0, 4.6, -18], 58, 'truck', 4, 'busy', 1.4),
    ...bandShots(band, ctx.part, (p) => [p[0] * 0.4, p[1], p[2] + 12], 6.5),
  ];
  const low = shots.filter((s) => s.pos[1] < 10).map((s) => s.pos);

  const share = LEVEL_SHARE[g.crowd];
  const audience = fillCrowd(
    {
      bounds: [-80, DECK_FRONT + 4.5, 80, 140],
      step: 0.92,
      density: (x, z) => {
        if (Math.abs(x) > 46 + (z - DECK_FRONT) * 0.5) return 0;
        if (Math.abs(x) < 7 && Math.abs(z - 64) < 5) return 0;
        if (Math.abs(Math.abs(x) - 30) < 2.5 && Math.abs(z - 55) < 2.5) return 0;
        const d = Math.hypot(x, z - DECK_FRONT);
        return Math.max(0.25, 1.08 - d / 150);
      },
      face: (x) => [x * 0.3, -20],
    },
    ctx.characters,
    share,
    low,
    ctx.cast.crowd.data.sync,
    41,
  );

  const L = shared.uLight.value;
  const LC = shared.uLightCol.value;
  const c1 = new THREE.Color();
  const c2 = new THREE.Color();
  const tmp = new THREE.Vector3();
  const header = [-30, -18, -6, 6, 18, 30].map((x) => new THREE.Vector3(x, 23.2, -11.2));
  const wallSrc = new THREE.Vector3(0, 12, -30);
  let laserLook = 0;

  const bind = () => {
    const k = dusk.value;
    shared.uGlowPos.value.set(...SCREEN);
    shared.uHazeFar.value.setRGB(0.07 * (1 - k) + 0.008 * k, 0.03 * (1 - k) + 0.012 * k, 0.045 * (1 - k) + 0.04 * k);
    shared.uHazeDensity.value = 0.0017;
    shared.uAmbient.value.setRGB(0.18 * (1 - k) + 0.01 * k, 0.09 * (1 - k) + 0.012 * k, 0.12 * (1 - k) + 0.03 * k);
    shared.uGlowLight.value.set(1.4, 34);
    shared.uGlowFall.value = 0.0012;
    shared.uBall.value.w = 0;
    for (let i = 0; i < 8; i++) LC[i].setRGB(0, 0, 0);
  };

  const update = (f: VenueFrame) => {
    const s = f.show;
    const busy = Math.min(1, Math.max(0, (f.energy - 0.25) / 0.6));
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    // In the menus the light hovers at dusk; in a song the sun goes down as it plays.
    dusk.value = menu ? 0.55 + 0.1 * Math.sin(f.time * 0.02) : Math.min(1, 0.15 + f.time / SUNSET);
    if (f.beat === 'downbeat' && s.bar % 8 === 0) wall.next(s.bar / 8);
    if (f.beat === 'downbeat' && s.bar % 4 === 0) {
      wing.next(s.bar / 4);
      banner.next(s.bar / 4 + 1);
      fascia.next(s.bar / 4 + 2);
    }
    // Screens look brighter as the sky goes dark.
    wall.level = (1.4 + 0.8 * dusk.value) * (0.85 + 0.25 * f.barPulse) + 0.5 * s.overdrive;
    for (const scr of screens) scr.update(f.dt);

    // Light on the field: the screen's spill and the flames.
    L[0].set(0, 10, -8, 40);
    LC[0]
      .copy(f.key)
      .lerp(f.wash, 0.4)
      .multiplyScalar(0.6 * shared.uScreenLevel.value);
    L[1].set(0, 4, 64, 6);
    LC[1].setRGB(1, 0.6, 0.25).multiplyScalar(0.5);
    shared.uFlash.value = s.blinder * 0.15;

    lasers.begin();
    if (f.beat === 'downbeat' && s.bar % 4 === 0) laserLook++;
    const t = f.time;
    const lv = (menu ? 0.4 : 1) * (0.3 + 0.7 * busy) * 0.5 * (0.4 + 0.6 * dusk.value);
    c1.copy(f.key).lerp(WHITE, 0.1);
    c2.copy(f.accent);
    if (s.level !== 'calm' || menu) {
      if (laserLook % 2 === 0)
        header.forEach((src, k) =>
          fan(
            lasers,
            src,
            10,
            Math.sin(t * 0.5 + k * 0.8) * 0.35,
            -0.28 + 0.12 * Math.sin(t * 0.7 + k),
            0.7,
            90,
            k % 2 ? c1 : c2,
            lv,
            Math.PI / 2,
          ),
        );
      else header.forEach((src, k) => fan(lasers, src, 12, (k - 2.5) * 0.12, 0.05 + 0.25 * Math.sin(t * 0.4 + k * 0.5), 0.9, 110, c1, lv));
    }
    if (peak) {
      const n = 24;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 - t * 0.7;
        tmp
          .set(Math.cos(a) * 0.35, Math.sin(a) * 0.25 + 0.08, 1)
          .normalize()
          .multiplyScalar(140)
          .add(wallSrc);
        lasers.add(wallSrc, tmp, k % 2 ? c1 : c2, lv * 1.3);
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

  return {
    root,
    shots,
    band,
    audience,
    players,
    fixtures,
    fireworks,
    co2: [-24, -16, -8, 8, 16, 24].map((x): Vec3 => [x, DECK, DECK_FRONT - 0.3]),
    flames,
    flameMiddle: [4, 7],
    confetti: [-1, 1].map((side) => ({ pos: [side * 28, DECK + 1, DECK_FRONT] as Vec3, dir: [-side * 0.3, 0.8, 0.55] as Vec3 })),
    looks: [
      { key: [1, 0.25, 0.7], accent: [0.2, 0.9, 1], wash: [0.5, 0.1, 0.8] },
      { key: [1, 0.55, 0.15], accent: [0.25, 0.4, 1], wash: [0.6, 0.15, 0.1] },
      { key: [0.6, 1, 0.2], accent: [0.8, 0.3, 1], wash: [0.1, 0.4, 0.2] },
      { key: [1, 0.15, 0.2], accent: [1, 0.95, 0.9], wash: [0.6, 0.05, 0.15] },
    ],
    exposure: 0.9,
    bloom: [0.26, 0.5, 0.95],
    hazeNear: [0.08, 0.05, 0.1],
    sparkGravity: -9,
    bind,
    update,
    beam,
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

const WHITE = new THREE.Color(1, 1, 1);
