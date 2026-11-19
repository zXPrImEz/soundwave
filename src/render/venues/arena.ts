import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import { COMMON, OUTPUT, shared } from '../aurora/shared';
import type { Vec3 } from '../stage/Director';
import { Bulbs } from './kit/bulbs';
import { bandOn, busyOf, fountains } from './kit/common';
import { crowdAt, dj, fillCrowd } from './kit/crowd';
import { Lasers } from './kit/lasers';
import { LedScreen } from './kit/led';
import { dressModel, instances, loadModel, type ModelData } from './kit/model';
import { Podiums } from './kit/podiums';
import { gearRoles } from './kit/roles';
import { shot } from './kit/shots';
import { glow, modelSurface, surface } from './kit/surface';
import { loadScans } from './kit/textures';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

interface ArenaData extends ModelData {
  tiers: { r0: number; y0: number; depth: number; rise: number; count: number; crossAisle: number };
  floor: number;
  stage: { r: number; y: number };
  aisles: number[];
  crowd: { inner: number; outer: number; obstacles: { x: number; z: number; w: number; d: number }[] };
  halos: number;
}

/**
 * Arena 360: a show in the round under a steel dome, modelled in Blender
 * (tools/stage/venues/arena.py). Halos of light hang over the floor and tilt and breathe with the
 * music, a lantern of light burns over the stage, a ribbon of LEDs runs round the stands, lamps
 * trace every rim, lasers spread a dome from the lantern, and in the quiet parts phone lights come
 * out in the seats. The band plays at the front of the island, the DJ on a plinth in its middle.
 */
export async function buildArena(ctx: VenueContext): Promise<Venue> {
  const { g, menu } = ctx;
  const model = await loadModel('arena');
  const data = model.data as ArenaData;
  const scans = await loadScans(['asphalt', 'concrete_wall', 'steel_paint', 'carpet'], g, ctx.anisotropy);
  const gear = gearRoles();
  const coreGlow = glow(0xffffff, 2);
  const dressed = dressModel(model, {
    ...gear.roles,
    Floor: modelSurface({
      pattern: 'concrete',
      color: 0x1a1b20,
      color2: 0x0e0f12,
      rough: 0.3,
      scale: 2.5,
      mirror: true,
      wet: 0.75,
      scan: scans.asphalt,
      scanScale: 4,
      tint: 0x6a6c74,
      scanRough: 0.45,
    }),
    Concrete: modelSurface({
      pattern: 'concrete',
      color: 0x3a3a40,
      color2: 0x1c1c20,
      rough: 0.9,
      scale: 3,
      scan: scans.concrete_wall,
      scanScale: 5,
      tint: 0x8a8c94,
    }),
    Stage: modelSurface({ color: 0x0c0c10, rough: 0.15 }),
    Glass: modelSurface({ pattern: 'glass', color: 0x0c1420, rough: 0.06, emissive: 0x03060a }),
    Roof: modelSurface({
      pattern: 'panels',
      color: 0x14161a,
      color2: 0x0a0a0c,
      rough: 0.8,
      metal: 0.3,
      scale: 2,
      scan: scans.steel_paint,
      scanScale: 4,
      tint: 0x30343a,
    }),
    Hazard: modelSurface({ pattern: 'hazard', color: 0xe8b400, color2: 0x111111, rough: 0.6, scale: 0.5 }),
    Carpet: modelSurface({ pattern: 'fabric', color: 0x2a1418, rough: 1, scale: 0.4, scan: scans.carpet, scanScale: 1.5, tint: 0x8a4a54 }),
    'Glow.Exit': glow(0x20ff70, 1.6),
    'Glow.Warm': glow(0xffb060, 1.4),
    'Glow.Lamp': glow(0xe8f0ff, 1.6),
    'Glow.Core': coreGlow,
  });
  const root = dressed.root;
  const owned: { dispose(): void }[] = [dressed];

  // The halos' tubes, each a glow of its own.
  const halos = Array.from({ length: data.halos ?? 0 }, (_, i) => {
    const material = glow(0xffffff, 2);
    const part = dressed.moving.get(`halo_${i}`) as THREE.Mesh | undefined;
    if (part) part.material = material;
    owned.push(material);
    return material;
  });

  const edge = new LedScreen([440, 10], ['bars', 'stripes', 'rings', 'solid'], 1.7, 9);
  const ribbon = new LedScreen([1500, 5], ['stripes', 'solid', 'bars', 'stripes'], 1.6, 10);
  const booth = new LedScreen([64, 16], ['bars', 'stripes', 'grid'], 2, 11);
  const screens = { edge, ribbon, booth };
  for (const [key, scr] of Object.entries(screens)) for (const mesh of dressed.screens.get(key) ?? []) mesh.material = scr.material;
  owned.push(edge, ribbon, booth);

  // Seats (one draw for all of them) and the lamps on every rim.
  const seatMat = surface({ color: 0x1a2440, rough: 0.6 });
  const seats = instances(dressed.protos.get('seat')!, data.instances.seat ?? [], seatMat);
  const bulbs = new Bulbs(dressed.protos.get('bulb')!, data.instances.bulb ?? [], 0xe8f0ff);
  root.add(seats, bulbs.mesh);
  owned.push(seatMat, bulbs);

  const T = data.tiers;
  const outer = T.r0 + T.count * T.depth;
  const tierOf = (r: number) => Math.min(T.count - 1, Math.max(0, Math.floor((r - T.r0) / T.depth)));
  const tierHeight = (r: number) => (r < T.r0 ? 0 : T.y0 + tierOf(r) * T.rise);
  const phones = phoneLights(g.crowd === 'off' ? 0 : g.crowd === 'low' ? 900 : g.crowd === 'medium' ? 2200 : 4200, T.r0, outer, tierHeight);
  root.add(phones.points);
  owned.push(phones);

  const lasers = new Lasers(g.effects === 'off' ? 0 : g.effects === 'low' ? 96 : 200);
  root.add(lasers.mesh);
  const core = new THREE.Vector3(...(data.sources['laser.core']?.[0] ?? [0, 9.5, 0]));
  const edgeSrc = (data.sources['laser.edge'] ?? []).map((p) => new THREE.Vector3(...p));

  // The band faces out from the island toward the side they stand on.
  const { band, players } = bandOn(data, ctx.cast, ctx.focus, (p) => [p[0] * 3, p[2] * 3 + 6]);
  const podiums = new Podiums(root, data.podiums, band, players);
  owned.push(podiums);
  const djAt = data.marks.dj;

  const shots = [
    shot('front', [0, 4.2, 28], [0, 7, 0], 74, 'orbit', 0.3, 'all', 3),
    shot('hero', [24, 18.6, 49], [0, 7, 0], 62, 'orbit', 0.45, 'all', 2),
    shot('crowd', [10, 2.2, 15], [0, 5, 0], 82, 'orbit', 0.3, 'busy', 2),
    shot('close', [1.5, 3.6, 12.5], [0, 3, 2], 62, 'orbit', 0.25, 'busy', 1.6),
    shot('aerial', [0.5, 27, 20], [0, 0, -4], 96, 'orbit', 0.9, 'all', 1),
    shot('stands', [-30, 15.6, 40], [0, 8, 0], 68, 'orbit', 0.3, 'all', 1.2),
    shot('wide-left', [-26, 8, 18], [0, 10, 0], 78, 'orbit', 0.4, 'all', 1.2),
    shot('low-gate', [0, 2.6, 9.4], [0, 16, 0], 96, 'orbit', 0.5, 'peak', 1),
    shot('rig', [0, 9, 26], [0, 17, 0], 78, 'orbit', 0.5, 'peak', 1),
    shot('dj', [2.2, djAt[1] + 1.9, djAt[2] + 5.4], [0, djAt[1] + 1.2, djAt[2]], 54, 'orbit', 0.4, 'busy', 1.2),
    shot('band', [0, 4.6, 13.5], [0, 2.8, 2], 64, 'orbit', 0.5, 'busy', 1.4),
    ...Object.entries(band).map(([key, p]) => {
      const name = key === 'vox' ? 'vocals' : key;
      const out = Math.atan2(p[0], p[2] + 1.5);
      return shot(
        `band-${name}`,
        [p[0] + Math.sin(out) * 5 + 1.2, p[1] + 1.9, p[2] + Math.cos(out) * 5],
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
  const sync = ctx.cast.crowd.data.sync;
  const C = data.crowd;
  const audience = fillCrowd(
    {
      bounds: [-C.outer, -C.outer, C.outer, C.outer],
      step: 0.74,
      density: (x, z) => {
        const r = Math.hypot(x, z);
        if (r < C.inner || r > C.outer) return 0;
        if (C.obstacles.some((o) => Math.abs(x - o.x) < o.w / 2 + 0.3 && Math.abs(z - o.z) < o.d / 2 + 0.3)) return 0;
        return Math.max(0.55, 1.08 - (r - C.inner) / 45);
      },
      face: () => [0, 0],
    },
    ctx.characters,
    share,
    low,
    sync,
    53,
  );
  // The stands, full all round: everyone on their feet before their seat, and more pressed
  // together along the front of each tier. The seats leave the stairways and tunnel mouths free.
  const seatAt = data.instances.seat ?? [];
  const before = (inward: number) =>
    seatAt.map(([x, y, z]) => {
      const k = 1 - inward / Math.hypot(x, z);
      return [x * k, y, z * k];
    });
  audience.push(
    ...crowdAt({ spots: before(0.4), fill: 0.97, face: () => [0, 0], jitter: 0.06, wander: 0.3 }, ctx.characters, share, [], sync, 59),
    ...crowdAt({ spots: before(1.05), fill: 0.55, face: () => [0, 0], jitter: 0.12, wander: 0.6 }, ctx.characters, share, [], sync, 61),
  );
  if (djAt) audience.push(dj(ctx.characters, djAt, 0));

  const L = shared.uLight.value;
  const LC = shared.uLightCol.value;
  const c1 = new THREE.Color();
  const c2 = new THREE.Color();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  let laserLook = 0;

  const bind = () => {
    shared.uGlowPos.value.set(0, 13, 0);
    shared.uHazeFar.value.setRGB(0.006, 0.008, 0.012);
    shared.uHazeDensity.value = 0.0095;
    shared.uAmbient.value.setRGB(0.014, 0.017, 0.024);
    shared.uGlowLight.value.set(2.4, 26);
    shared.uGlowFall.value = 0.003;
    shared.uBall.value.w = 0;
    podiums.bind();
  };

  const update = (f: VenueFrame) => {
    podiums.update(f);
    const s = f.show;
    const t = f.time;
    const busy = busyOf(f.energy);
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    if (f.beat === 'downbeat') {
      if (s.bar % 4 === 0) edge.next(s.bar / 4);
      if (s.bar % 8 === 2) ribbon.next(s.bar / 8);
      if (s.bar % 4 === 1) booth.next(s.bar / 4);
    }
    for (const scr of Object.values(screens)) scr.update(f.dt);
    bulbs.update(f, 1.1);
    gear.jog.uniforms.uLevel.value = 1.4 + 2 * f.pulse;
    gear.jog.uniforms.uColor.value.copy(f.accent);
    gear.meter.uniforms.uLevel.value = 1 + 2.5 * f.low;

    // The halos: cold white and steady when it is calm; a pulse runs from halo to halo on the
    // beat as it builds; in a peak they take the show's colours and flare on the bar.
    halos.forEach((m, i) => {
      const chase = Math.pow(Math.max(0, Math.cos((f.clock * 0.5 - i * 0.3) * Math.PI)), 4);
      m.uniforms.uColor.value.copy(WHITE).lerp(i % 2 ? f.accent : f.key, peak ? 0.75 : 0.25 * busy);
      m.uniforms.uLevel.value = 1.1 + 1.6 * busy * chase + 1.2 * f.barPulse * busy + 1.5 * s.overdrive;
    });
    // The lantern over the stage burns with the bass.
    coreGlow.uniforms.uColor.value.copy(f.key).lerp(WHITE, 0.55);
    coreGlow.uniforms.uLevel.value = 1 + 2.4 * f.low + 1.4 * f.barPulse + 2 * s.overdrive;

    const u = phones.material.uniforms;
    u.uOn.value += ((s.level === 'calm' || menu ? 1 : 0.15) - u.uOn.value) * Math.min(1, f.dt * 0.6);
    u.uTime.value = t;

    // Light from the lantern and the halos on the island and the floor.
    L[0].set(0, 11, 0, 20);
    LC[0]
      .copy(f.key)
      .lerp(WHITE, 0.5)
      .multiplyScalar(0.9 * (0.5 + 0.8 * f.low + 0.5 * busy));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.8;
      L[1 + k].set(Math.sin(a) * 17, 12, Math.cos(a) * 17, 14);
      LC[1 + k]
        .copy(k % 2 ? f.accent : f.key)
        .lerp(WHITE, 0.4)
        .multiplyScalar(0.4 * (0.4 + busy));
    }
    L[5].set(0, 6, 0, 10);
    LC[5].setScalar(s.blinder * 3);
    for (let i = 6; i < 8; i++) LC[i].setRGB(0, 0, 0);
    shared.uFlash.value = s.blinder * 0.2;

    // Lasers: a turning dome from the lantern out to the stands, fans from the island's edge.
    lasers.begin();
    if (f.beat === 'downbeat' && s.bar % 4 === 0) laserLook++;
    const lv = (menu ? 0.45 : 1) * (0.3 + 0.7 * busy) * 0.5;
    c1.copy(f.key).lerp(WHITE, 0.3);
    c2.copy(f.accent).lerp(WHITE, 0.15);
    if (s.level !== 'calm' || menu) {
      const n = 44;
      const dip = laserLook % 2 ? -0.16 + 0.1 * Math.sin(t * 0.8) : -0.05;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + t * (laserLook % 2 ? 0.35 : -0.2);
        tmpA
          .set(Math.cos(a), dip + 0.05 * Math.sin(a * 3 + t), Math.sin(a))
          .normalize()
          .multiplyScalar(62)
          .add(core);
        lasers.add(core, tmpA, k % 2 ? c1 : c2, lv);
      }
    }
    if (peak)
      edgeSrc.forEach((p, k) => {
        const a = Math.atan2(p.z, p.x);
        for (let j = -2; j <= 2; j++) {
          const yaw = a + j * 0.12 + Math.sin(t * 1.2 + k) * 0.2;
          tmpB
            .set(Math.cos(yaw), 0.35 + 0.25 * Math.sin(t + k + j), Math.sin(yaw))
            .normalize()
            .multiplyScalar(55)
            .add(p);
          lasers.add(p, tmpB, k % 2 ? c2 : c1, lv * 1.2);
        }
      });
    lasers.end(f.height);
  };

  const beam = (group: string, i: number, f: VenueFrame): BeamPose | undefined => {
    const s = f.show;
    const t = s.time;
    switch (group) {
      case 'Ring':
      case 'Halo':
        return {
          pan: Math.sin(t * 0.5 + i * 0.5) * (0.15 + 0.3 * s.beamLevel),
          tilt: Math.cos(t * 0.4 + i * 0.7) * 0.22,
          level: s.level === 'calm' ? 0.22 : s.beamLevel * (s.beamMode === 'chase' ? ((f.beats + i) % 6 === 0 ? 1 : 0.15) : 0.75),
          color: group === 'Halo' ? 'white' : i % 2 ? 'accent' : 'key',
        };
      case 'Rim':
        // The great ring of lights: long white shafts onto the island, a few at a time when calm.
        return {
          pan: Math.sin(t * 0.2 + i) * 0.05,
          tilt: Math.sin(t * 0.25 + i) * 0.04,
          level: (i % 4 === 0 ? 0.4 : 0.12 + 0.5 * s.beamLevel) + 0.25 * f.barPulse,
          color: 'white',
        };
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

  const src = data.sources;
  return {
    root,
    shots,
    band,
    audience,
    players,
    fixtures: data.fixtures,
    fireworks: fountains(src.sparks, [6, 9]).map((f, k) => ({ ...f, side: k % 2 === 1 })),
    co2: src.co2 ?? [],
    flames: src.flames,
    flameMiddle: [0, 4],
    confetti: (src.confetti ?? []).map((pos) => ({ pos, dir: [pos[0] * 0.1, 0.5, pos[2] * 0.1] as Vec3 })),
    looks: [
      { key: [0.75, 0.95, 1], accent: [0.2, 0.9, 0.85], wash: [0.05, 0.3, 0.4] },
      { key: [1, 1, 1], accent: [1, 0.75, 0.3], wash: [0.3, 0.3, 0.35] },
      { key: [0.5, 0.4, 1], accent: [0.2, 0.7, 1], wash: [0.25, 0.05, 0.6] },
      { key: [1, 0.2, 0.2], accent: [1, 0.95, 0.9], wash: [0.6, 0.05, 0.05] },
    ],
    exposure: 0.95,
    bloom: [0.3, 0.5, 0.92],
    hazeNear: [0.03, 0.04, 0.05],
    background: [0.003, 0.004, 0.006],
    sparkGravity: -8,
    mirror: { level: 0 },
    pools: 1.7,
    grade: { contrast: 1.16, saturation: 0.95, vignette: 0.34, tint: [0.9, 1.0, 1.02] },
    bind,
    update,
    beam,
    cameraLift: (shot) => podiums.cameraLift(shot),
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

/** Phone torches held up in the stands: points that twinkle, each on a rhythm of its own. */
function phoneLights(count: number, r0: number, outer: number, tierHeight: (r: number) => number) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = r0 + 0.5 + Math.random() * (outer - r0 - 1);
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
