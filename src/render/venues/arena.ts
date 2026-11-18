import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import type { Fixture, FireworkSpec } from '../aurora/assets';
import { makeBand } from '../aurora/figures';
import { COMMON, OUTPUT, shared } from '../aurora/shared';
import type { Vec3 } from '../stage/Director';
import { Builder, disposeTree } from './kit/build';
import { fillCrowd } from './kit/crowd';
import { Lasers } from './kit/lasers';
import { LedScreen } from './kit/led';
import { shot } from './kit/shots';
import { glow, surface } from './kit/surface';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

/** The round stage in the middle: radius and height. */
const STAGE_R = 7;
const DECK = 1.6;
/** The arena floor's radius, and the tiers of seats round it. */
const FLOOR_R = 34;
const TIERS = 14;
const TIER_DEPTH = 1.9;
const TIER_RISE = 1.45;
const ROOF = 36;
/** Height of the step at a distance from the middle. */
function tierHeight(r: number): number {
  if (r < FLOOR_R + 1.5) return 0;
  const i = Math.min(TIERS - 1, Math.floor((r - FLOOR_R - 1.5) / TIER_DEPTH));
  return 2 + i * TIER_RISE;
}

/**
 * Arena 360: a show in the round. The band on a turning stage in the middle of the floor, the
 * crowd on every side and up the steep tiers to the roof, a drum of LEDs hanging over the stage
 * with rings of light that tilt and sink around it, a dome of lasers, and in the quiet parts a
 * sea of phone lights in the stands.
 */
export function buildArena(ctx: VenueContext): Venue {
  const { g, menu } = ctx;
  const b = new Builder();
  const floorMat = surface({ pattern: 'concrete', color: 0x1a1b20, color2: 0x0e0f12, rough: 0.3, scale: 2.5, mirror: true, wet: 0.75 });
  const seats = surface({ pattern: 'fabric', color: 0x141a2c, rough: 0.9, scale: 0.25 });
  const wall = surface({ pattern: 'concrete', color: 0x16161a, color2: 0x0c0c0e, rough: 0.9, scale: 3 });
  const black = surface({ color: 0x0a0a0c, rough: 0.5 });
  const steel = surface({ pattern: 'metal', color: 0x2c2e34, rough: 0.4, metal: 0.85, scale: 2 });
  const deckTop = surface({ color: 0x0e0e12, rough: 0.18 });

  b.add(floorMat, new THREE.CircleGeometry(FLOOR_R + 2, 96).rotateX(-Math.PI / 2));
  // The tiers: a riser and a tread for each step, round the whole arena.
  for (let i = 0; i < TIERS; i++) {
    const r = FLOOR_R + 1.5 + i * TIER_DEPTH;
    const y = 2 + i * TIER_RISE;
    const riser = new THREE.CylinderGeometry(r, r, y, 120, 1, true);
    riser.translate(0, y / 2, 0);
    b.add(i === 0 ? black : seats, riser);
    b.add(seats, new THREE.RingGeometry(r, r + TIER_DEPTH, 120, 1).rotateX(-Math.PI / 2).translate(0, y, 0));
  }
  const outer = FLOOR_R + 1.5 + TIERS * TIER_DEPTH;
  const wallGeo = new THREE.CylinderGeometry(outer, outer, ROOF, 120, 1, true);
  wallGeo.translate(0, ROOF / 2, 0);
  b.add(wall, wallGeo);
  b.add(black, new THREE.CircleGeometry(outer, 120).rotateX(Math.PI / 2).translate(0, ROOF, 0));
  // Catwalk rings and spokes under the roof.
  for (const r of [12, 26, 45]) {
    const n = Math.round(r * 1.2);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      const y = r === 12 ? 20 : 31;
      b.truss(steel, [Math.cos(a0) * r, y, Math.sin(a0) * r], [Math.cos(a1) * r, y, Math.sin(a1) * r], 0.7);
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.truss(steel, [Math.cos(a) * 12, 20, Math.sin(a) * 12], [Math.cos(a) * 45, 31, Math.sin(a) * 45], 0.6);
    b.rod(steel, [Math.cos(a) * 9, 17.5, Math.sin(a) * 9], [Math.cos(a) * 9, ROOF, Math.sin(a) * 9], 0.03, 4);
  }
  // The stage: a drum with a glossy top, a turntable inset, and a drum riser in the middle.
  b.drum(black, STAGE_R, DECK, [0, 0, 0], 72);
  b.add(deckTop, new THREE.CircleGeometry(STAGE_R - 0.15, 72).rotateX(-Math.PI / 2).translate(0, DECK + 0.01, 0));
  b.drum(black, 2, 0.4, [0, DECK, 0], 36);
  // Speaker hangs over the stage, four ways.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    for (let j = 0; j < 8; j++) b.box(black, [1.6, 0.6, 1], [Math.cos(a) * 10.5, 16 - j * 0.62, Math.sin(a) * 10.5], -a + Math.PI / 2);
  }
  const root = b.build('arena');
  const owned: { dispose(): void }[] = [{ dispose: () => disposeTree(root) }];

  // The LED drum over the stage, and a band of LEDs round the stage's edge.
  const drum = new LedScreen([480, 60], ['rings', 'kaleido', 'tunnel', 'bars', 'plasma', 'stripes'], 2, 8);
  const drumMesh = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 5.5, 96, 1, true), drum.material);
  drumMesh.material.side = THREE.DoubleSide;
  drumMesh.position.y = 15;
  const edge = new LedScreen([600, 8], ['bars', 'stripes', 'rings'], 1.6, 9);
  const edgeMesh = new THREE.Mesh(new THREE.CylinderGeometry(STAGE_R + 0.02, STAGE_R + 0.02, DECK - 0.3, 96, 1, true), edge.material);
  edgeMesh.position.y = DECK / 2;
  root.add(drumMesh, edgeMesh);
  owned.push(drum, edge);

  // Rings of light that tilt and sink round the drum.
  const ringMats = [0, 1, 2].map(() => glow(0xffffff, 2));
  const rings = [12.5, 16, 19.5].map((r, i) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 6, 160), ringMats[i]);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 18;
    root.add(mesh);
    return mesh;
  });

  // Phones in the stands: points that come up in the quiet parts.
  const phones = phoneLights(g.crowd === 'off' ? 0 : g.crowd === 'low' ? 900 : g.crowd === 'medium' ? 2200 : 4200, outer);
  root.add(phones.points);
  owned.push(phones);

  const lasers = new Lasers(g.effects === 'off' ? 0 : g.effects === 'low' ? 96 : 200);
  root.add(lasers.mesh);

  // Moving heads: a ring over the stage into the floor, the catwalk's ring onto the stage, a ring
  // on the stage's edge pointing up.
  const fixtures: Fixture[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    fixtures.push({
      group: 'Ring',
      pos: [Math.cos(a) * 12, 19.6, Math.sin(a) * 12],
      dir: [Math.cos(a) * 0.55, -1, Math.sin(a) * 0.55],
      length: 32,
      spread: 0.04,
    });
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + 0.2;
    fixtures.push({
      group: 'Catwalk',
      pos: [Math.cos(a) * 45, 30.4, Math.sin(a) * 45],
      dir: [-Math.cos(a), -0.72, -Math.sin(a)],
      length: 56,
      spread: 0.022,
    });
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    fixtures.push({
      group: 'Floor',
      pos: [Math.cos(a) * (STAGE_R - 0.4), DECK + 0.15, Math.sin(a) * (STAGE_R - 0.4)],
      dir: [Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3],
      length: 18,
      spread: 0.035,
    });
  }

  const around = (n: number, r: number, y: number, phase = 0): Vec3[] =>
    Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2 + phase;
      return [Math.cos(a) * r, y, Math.sin(a) * r];
    });
  const fireworks: FireworkSpec[] = around(8, STAGE_R - 0.3, DECK, Math.PI / 8).map((p, k) => ({
    origin: p,
    n: 6,
    spread: 6,
    length: [6, 9],
    lean: 0,
    side: k % 2 === 1,
  }));

  // The band in the round: drums in the middle, the others out at the edge, each facing a side.
  const band: Record<string, Vec3> = {
    vox: [0, DECK, 4.2],
    lead: [-4.2, DECK, -1.5],
    bass: [4.2, DECK, -1.5],
    drums: [0, DECK + 0.4, -0.4],
  };
  const players = makeBand({ band }, ctx.cast.band.data.band ?? {}, ctx.focus);
  const facing: Record<string, number> = { vox: 0, lead: -1.9, bass: 1.9, drums: 0 };
  for (const p of players) p.yaw = facing[p.part ?? ''] ?? 0;

  const shots = [
    shot('front', [0, 4.2, 30], [0, 6, 0], 70, 'orbit', 0.35, 'all', 3),
    shot('hero', [44, 26, 44], [0, 5, 0], 62, 'orbit', 0.45, 'all', 2),
    shot('crowd', [11, 2.2, 13], [0, 4, 0], 80, 'orbit', 0.3, 'busy', 2),
    shot('close', [3.5, 3.4, 9.5], [0, 3, 2.5], 60, 'orbit', 0.25, 'busy', 1.5),
    shot('aerial', [0.5, 32, 3], [0, 0, 0], 86, 'orbit', 0.9, 'all', 1),
    shot('stands', [0, 22, 56], [0, 6, 0], 66, 'orbit', 0.3, 'all', 1.2),
    shot('wide-left', [-28, 9, 18], [0, 8, 0], 74, 'orbit', 0.4, 'all', 1.2),
    shot('low-gate', [0, 1.2, 8.6], [0, 15, 0], 92, 'orbit', 0.5, 'peak', 1.3),
    shot('band', [0, 5, 14], [0, 2.6, 0], 66, 'orbit', 0.5, 'busy', 1.4),
    ...Object.entries(band).map(([key, p]) => {
      const name = key === 'vox' ? 'vocals' : key;
      const out = Math.atan2(p[0], p[2] + (key === 'drums' ? 1 : 0));
      const d = key === 'drums' ? 6 : 5;
      return shot(
        `band-${name}`,
        [p[0] + Math.sin(out) * d + 1.2, p[1] + 1.9, p[2] + Math.cos(out) * d],
        [p[0], p[1] + 1.2, p[2]],
        46,
        'truck',
        1.6,
        'busy',
        name === ctx.part ? 3 : 0.6,
      );
    }),
  ];
  const low = shots.filter((s) => s.pos[1] < 5).map((s) => s.pos);

  const share = LEVEL_SHARE[g.crowd];
  const floorCrowd = fillCrowd(
    {
      bounds: [-FLOOR_R, -FLOOR_R, FLOOR_R, FLOOR_R],
      step: 0.84,
      density: (x, z) => {
        const r = Math.hypot(x, z);
        return r < STAGE_R + 2.6 || r > FLOOR_R - 0.6 ? 0 : Math.max(0.35, 1.05 - (r - STAGE_R) / 40);
      },
      face: () => [0, 0],
    },
    ctx.characters,
    share,
    low,
    ctx.cast.crowd.data.sync,
    53,
  );
  const stands = fillCrowd(
    {
      bounds: [-outer, -outer, outer, outer],
      step: 1.0,
      density: (x, z) => {
        const r = Math.hypot(x, z);
        if (r < FLOOR_R + 1.7 || r > outer - 0.6) return 0;
        // Keep to the middle of each tread.
        const f = (r - FLOOR_R - 1.5) / TIER_DEPTH;
        return Math.abs(f - Math.floor(f) - 0.5) < 0.3 ? 0.75 : 0;
      },
      face: () => [0, 0],
      ground: (x, z) => tierHeight(Math.hypot(x, z)),
      wander: 0.3,
    },
    ctx.characters,
    share * 0.8,
    [],
    ctx.cast.crowd.data.sync,
    59,
  );
  const audience = [...floorCrowd, ...stands];

  const L = shared.uLight.value;
  const LC = shared.uLightCol.value;
  const ringY = [18, 18, 18];
  const c1 = new THREE.Color();
  const c2 = new THREE.Color();
  const center = new THREE.Vector3(0, 13.5, 0);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const edgeSrc = around(8, STAGE_R - 0.2, DECK + 0.3).map((p) => new THREE.Vector3(...p));
  let laserLook = 0;

  const bind = () => {
    shared.uGlowPos.value.set(0, 15, 0);
    shared.uHazeFar.value.setRGB(0.006, 0.007, 0.012);
    shared.uHazeDensity.value = 0.011;
    shared.uAmbient.value.setRGB(0.012, 0.014, 0.022);
    shared.uGlowLight.value.set(2.2, 22);
    shared.uGlowFall.value = 0.003;
    shared.uBall.value.w = 0;
  };

  const update = (f: VenueFrame) => {
    const s = f.show;
    const t = f.time;
    const busy = Math.min(1, Math.max(0, (f.energy - 0.25) / 0.6));
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    if (f.beat === 'downbeat' && s.bar % 8 === 0) drum.next(s.bar / 8);
    if (f.beat === 'downbeat' && s.bar % 4 === 0) edge.next(s.bar / 4);
    drum.level = 1.7 + 0.8 * f.barPulse + 0.5 * s.overdrive;
    drum.update(f.dt);
    edge.update(f.dt);
    drumMesh.rotation.y += f.dt * 0.05;

    // The rings: level and high when it is calm; tilting against each other and sinking toward
    // the stage as it builds; in a peak they swing on the beat.
    rings.forEach((ring, i) => {
      const want = 18 + i * 1.5 - busy * (4 + i * 1.5) - s.overdrive * 3;
      ringY[i] += (want - ringY[i]) * Math.min(1, f.dt * 1.2);
      ring.position.y = ringY[i];
      const tilt = (0.05 + 0.22 * busy) * (peak ? Math.sin(f.clock * Math.PI * 0.5 + i * 2) : Math.sin(t * 0.3 + i * 2));
      ring.rotation.set(Math.PI / 2 + tilt, (i - 1) * 0.3 * busy * Math.sin(t * 0.2), t * 0.1 * (i - 1));
      const chase = Math.pow(Math.max(0, Math.cos((f.clock * 0.5 - i * 0.33) * Math.PI)), 4);
      ringMats[i].uniforms.uColor.value.copy(i % 2 ? f.accent : f.key);
      ringMats[i].uniforms.uLevel.value = (0.8 + 2.2 * busy) * (0.5 + 0.5 * chase) + s.overdrive * 2;
    });

    // Phones come out when it is calm (and in the menus), and go away when it kicks off.
    phones.material.uniforms.uOn.value +=
      ((s.level === 'calm' || menu ? 1 : 0.15) - phones.material.uniforms.uOn.value) * Math.min(1, f.dt * 0.6);
    phones.material.uniforms.uTime.value = t;

    // Light on the floor from the drum and the rings.
    L[0].set(0, 12, 0, 20);
    LC[0]
      .copy(f.key)
      .lerp(f.wash, 0.4)
      .multiplyScalar(1.1 * shared.uScreenLevel.value);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + t * 0.2;
      L[1 + k].set(Math.cos(a) * 18, ringY[1] - 1, Math.sin(a) * 18, 12);
      LC[1 + k].copy(k % 2 ? f.accent : f.key).multiplyScalar(0.45 * (0.3 + busy));
    }
    L[5].set(0, 6, 0, 10);
    LC[5].setScalar(s.blinder * 3);
    for (let i = 6; i < 8; i++) LC[i].setRGB(0, 0, 0);
    shared.uFlash.value = s.blinder * 0.2;

    // Lasers: a turning dome from over the stage out to the stands, and fans from the stage's edge.
    lasers.begin();
    if (f.beat === 'downbeat' && s.bar % 4 === 0) laserLook++;
    const lv = (menu ? 0.45 : 1) * (0.3 + 0.7 * busy) * 0.5;
    c1.copy(f.key).lerp(WHITE, 0.1);
    c2.copy(f.accent);
    if (s.level !== 'calm' || menu) {
      const n = 40;
      const dip = laserLook % 2 ? -0.18 + 0.1 * Math.sin(t * 0.8) : -0.08;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + t * (laserLook % 2 ? 0.35 : -0.2);
        tmpA
          .set(Math.cos(a), dip + 0.05 * Math.sin(a * 3 + t), Math.sin(a))
          .normalize()
          .multiplyScalar(60)
          .add(center);
        lasers.add(center, tmpA, k % 2 ? c1 : c2, lv);
      }
    }
    if (peak)
      edgeSrc.forEach((src, k) => {
        const a = Math.atan2(src.z, src.x);
        for (let j = -2; j <= 2; j++) {
          const yaw = a + j * 0.12 + Math.sin(t * 1.2 + k) * 0.2;
          tmpB
            .set(Math.cos(yaw), 0.35 + 0.25 * Math.sin(t + k + j), Math.sin(yaw))
            .normalize()
            .multiplyScalar(55)
            .add(src);
          lasers.add(src, tmpB, k % 2 ? c2 : c1, lv * 1.2);
        }
      });
    lasers.end(f.height);
  };

  const beam = (group: string, i: number, f: VenueFrame): BeamPose | undefined => {
    const s = f.show;
    const t = s.time;
    switch (group) {
      case 'Ring':
        return {
          pan: Math.sin(t * 0.5 + i * 0.5) * (0.15 + 0.25 * s.beamLevel),
          tilt: Math.cos(t * 0.4 + i * 0.7) * 0.2,
          level: s.beamLevel * (s.beamMode === 'chase' ? ((f.beats + i) % 6 === 0 ? 1 : 0.15) : 0.75),
          color: i % 2 ? 'accent' : 'key',
        };
      case 'Catwalk':
        return { pan: Math.sin(t * 0.2 + i) * 0.06, tilt: Math.sin(t * 0.25 + i) * 0.05, level: 0.35 + 0.25 * f.barPulse, color: 'white' };
      case 'Floor':
        return {
          pan: Math.sin(t * 0.7 + i) * 0.35,
          tilt: Math.cos(t * 0.5 + i * 2) * 0.25,
          level: s.beamLevel * (0.45 + 0.5 * f.pulse),
          color: i % 2 ? 'key' : 'accent',
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
    co2: around(8, STAGE_R - 0.4, DECK),
    flames: around(10, STAGE_R + 0.6, 0.2, 0.1),
    flameMiddle: [0, 4],
    confetti: around(4, 9.2, 12.5, Math.PI / 4).map((p) => ({ pos: p, dir: [p[0] * 0.1, 0.5, p[2] * 0.1] as Vec3 })),
    looks: [
      { key: [0.15, 0.85, 1], accent: [1, 0.2, 0.75], wash: [0.2, 0.15, 0.9] },
      { key: [1, 0.75, 0.3], accent: [1, 1, 1], wash: [0.6, 0.3, 0.05] },
      { key: [0.6, 0.3, 1], accent: [0.2, 0.5, 1], wash: [0.3, 0.05, 0.6] },
      { key: [1, 0.2, 0.15], accent: [1, 0.6, 0.15], wash: [0.6, 0.05, 0.05] },
    ],
    exposure: 0.95,
    bloom: [0.28, 0.5, 0.92],
    hazeNear: [0.03, 0.03, 0.05],
    background: [0.003, 0.003, 0.006],
    sparkGravity: -8,
    mirror: { level: 0 },
    bind,
    update,
    beam,
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

/** Phone torches held up in the stands: points that twinkle, each on a rhythm of its own. */
function phoneLights(count: number, outer: number) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = FLOOR_R + 2 + Math.random() * (outer - FLOOR_R - 3);
    pos.set([Math.cos(a) * r, tierHeight(r) + 1.6 + Math.random() * 0.4, Math.sin(a) * r], i * 3);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...shared, uOn: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uOn; uniform float uTime;
      attribute float aSeed;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Raised one by one as the light comes on, swaying a little.
        float up = smoothstep(aSeed * 0.8, aSeed * 0.8 + 0.2, uOn);
        vA = up * (0.7 + 0.3 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 40.0));
        gl_PointSize = up > 0.01 ? max(2.0, 150.0 / -mv.z) : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float k = exp(-d * d * 40.0);
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * k * vA * 2.4, 1.0);
        ${OUTPUT}
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  const dispose = () => {
    geo.dispose();
    material.dispose();
  };
  return { points, material, dispose };
}

const WHITE = new THREE.Color(1, 1, 1);
