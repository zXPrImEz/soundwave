import * as THREE from 'three';
import { COMMON, OUTPUT, shared } from '../../aurora/shared';
import type { Fixture } from '../../aurora/assets';
import type { Vec3 } from '../../stage/Director';
import type { Builder } from './build';
import { glow, surface } from './surface';

/**
 * The gear a show is made of, modelled from simple solids: moving heads, a DJ's booth, speaker
 * stacks and hangs, road cases, a mixing desk, crowd barriers, flags. Each draws into a Builder,
 * so a venue full of them still costs a dozen draws.
 */
export interface PropMaterials {
  black: THREE.Material;
  dark: THREE.Material;
  alu: THREE.Material;
  chrome: THREE.Material;
  grille: THREE.Material;
  rubber: THREE.Material;
  /** Lenses, screens and status lights. */
  lens: THREE.ShaderMaterial;
  screen: THREE.ShaderMaterial;
  green: THREE.ShaderMaterial;
  amber: THREE.ShaderMaterial;
  red: THREE.ShaderMaterial;
}

export function propMaterials(): PropMaterials {
  return {
    black: surface({ color: 0x0b0b0d, rough: 0.55 }),
    dark: surface({ pattern: 'metal', color: 0x1c1d21, rough: 0.4, metal: 0.4, scale: 0.3 }),
    alu: surface({ pattern: 'metal', color: 0x8a8e96, rough: 0.3, metal: 0.9, scale: 0.4 }),
    chrome: surface({ pattern: 'metal', color: 0xc8ccd4, rough: 0.1, metal: 1, scale: 0.2 }),
    grille: surface({ pattern: 'grille', color: 0x2a2b2f, color2: 0x060607, rough: 0.7, scale: 1 }),
    rubber: surface({ color: 0x050506, rough: 1 }),
    lens: glow(0xdfe8ff, 1.4),
    screen: glow(0x9fd0ff, 1.6),
    green: glow(0x40ff80, 2),
    amber: glow(0xffa030, 2),
    red: glow(0xff2020, 2),
  };
}

const Y = new THREE.Vector3(0, 1, 0);
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3(1, 1, 1);
const P = new THREE.Vector3();

/** A frame to place parts in: local x, y, z turned by `yaw` and moved to `at`. */
function frame(at: Vec3, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (x: number, y: number, z: number): Vec3 => [at[0] + x * c + z * s, at[1] + y, at[2] - x * s + z * c];
}

/**
 * A moving head for every fixture: base, yoke and head, the head pointing along the beam with its
 * lens at the front. Hung heads hang from their base; standing ones stand on it.
 */
export function fixtureBodies(b: Builder, m: PropMaterials, fixtures: readonly Fixture[], size = 1) {
  const dir = new THREE.Vector3();
  for (const f of fixtures) {
    dir.set(...f.dir).normalize();
    const hung = dir.y < 0.2;
    const pos = new THREE.Vector3(...f.pos);
    const up = hung ? 0.22 * size : -0.22 * size;
    // Base and yoke.
    b.box(m.black, [0.42 * size, 0.12 * size, 0.32 * size], [pos.x, pos.y + up, pos.z], Math.atan2(dir.x, dir.z));
    const side = new THREE.Vector3().crossVectors(Y, dir).normalize();
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    for (const k of [-1, 1]) {
      const a = pos.clone().addScaledVector(side, k * 0.17 * size);
      b.rod(m.black, [a.x, a.y + up, a.z], [a.x, a.y, a.z], 0.03 * size, 4);
    }
    // The head: a drum along the beam with a lens on its face.
    const head = new THREE.CylinderGeometry(0.14 * size, 0.12 * size, 0.36 * size, 14);
    Q.setFromUnitVectors(Y, dir);
    b.add(m.dark, head, M.compose(P.copy(pos).addScaledVector(dir, -0.04 * size), Q, S));
    const lens = new THREE.CircleGeometry(0.11 * size, 14).rotateX(-Math.PI / 2);
    b.add(m.lens, lens, M.compose(P.copy(pos).addScaledVector(dir, 0.145 * size), Q.setFromUnitVectors(Y, dir.clone().negate()), S));
  }
}

/** The glows of a DJ's booth that follow the music. */
export interface BoothLights {
  /** The rings round the jog wheels, and the level meters. */
  jog: THREE.ShaderMaterial;
  meters: THREE.ShaderMaterial;
}

/**
 * A DJ's booth, facing +z (the crowd) when `yaw` is 0, the DJ standing behind it: a desk with a
 * front of LEDs (`front`), a top lit along its edge, two players with lit jog wheels and screens,
 * a mixer with its knobs, faders and level meters, a laptop on a stand, a lamp, a drink, cables,
 * and a monitor speaker on a stand at each end, turned in to the DJ.
 */
export function djBooth(b: Builder, m: PropMaterials, at: Vec3, yaw = 0, front?: THREE.Material, width = 3): BoothLights {
  const p = frame(at, yaw);
  const jog = glow(0x60c8ff, 2.2);
  const meters = glow(0x50ff90, 2);
  const edge = glow(0xffffff, 1.2);
  const h = 1.0;
  const w = width;
  // The desk: body, top, aluminium corner posts, the LED front.
  b.box(m.black, [w, h - 0.06, 0.92], p(0, (h - 0.06) / 2, 0), yaw);
  b.box(m.dark, [w + 0.12, 0.06, 1.04], p(0, h - 0.03, 0), yaw);
  b.box(edge, [w + 0.1, 0.012, 0.012], p(0, h - 0.035, 0.525), yaw);
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    b.box(m.alu, [0.05, h - 0.06, 0.05], p((x * w) / 2, (h - 0.06) / 2, z * 0.46), yaw);
  if (front) b.panel(front, w - 0.12, h - 0.2, p(0, (h - 0.06) / 2, 0.462), yaw);
  // Two players.
  for (const side of [-1, 1]) {
    const x = side * 0.66;
    b.box(m.dark, [0.33, 0.09, 0.42], p(x, h + 0.045, -0.06), yaw);
    b.drum(m.chrome, 0.105, 0.022, p(x, h + 0.09, -0.08), 28);
    b.drum(jog, 0.118, 0.012, p(x, h + 0.086, -0.08), 28);
    b.drum(m.black, 0.035, 0.026, p(x, h + 0.092, -0.08), 12);
    b.panel(m.screen, 0.17, 0.08, p(x, h + 0.125, 0.09), yaw, -1.0);
    b.box(m.green, [0.035, 0.012, 0.035], p(x - 0.11, h + 0.095, 0.09), yaw);
    b.box(m.amber, [0.035, 0.012, 0.035], p(x - 0.06, h + 0.095, 0.09), yaw);
  }
  // The mixer: knobs in columns, faders, two level meters.
  b.box(m.dark, [0.36, 0.1, 0.44], p(0, h + 0.05, -0.06), yaw);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 5; r++) b.drum(m.alu, 0.012, 0.022, p(-0.12 + c * 0.08, h + 0.1, -0.22 + r * 0.055), 8);
  for (let c = 0; c < 4; c++) b.box(m.alu, [0.02, 0.025, 0.03], p(-0.12 + c * 0.08, h + 0.11, 0.08 + (c % 2) * 0.03), yaw);
  b.box(m.black, [0.2, 0.025, 0.035], p(0, h + 0.11, 0.13), yaw);
  for (const x of [-0.015, 0.015]) b.box(meters, [0.012, 0.004, 0.12], p(x, h + 0.102, -0.02), yaw);
  // A laptop on a stand, its screen to the DJ.
  b.rod(m.alu, p(w / 2 - 0.35, h, -0.1), p(w / 2 - 0.35, h + 0.18, -0.12), 0.012, 6);
  b.box(m.alu, [0.34, 0.018, 0.24], p(w / 2 - 0.35, h + 0.19, -0.12), yaw);
  b.box(m.alu, [0.34, 0.23, 0.012], p(w / 2 - 0.35, h + 0.31, 0.0), yaw);
  b.panel(m.screen, 0.3, 0.19, p(w / 2 - 0.35, h + 0.31, -0.008), yaw + Math.PI);
  // A gooseneck lamp and a drink.
  b.rod(m.black, p(-w / 2 + 0.3, h, -0.3), p(-w / 2 + 0.32, h + 0.25, -0.2), 0.01, 4);
  b.rod(m.black, p(-w / 2 + 0.32, h + 0.25, -0.2), p(-w / 2 + 0.38, h + 0.3, -0.05), 0.01, 4);
  b.box(m.amber, [0.05, 0.02, 0.05], p(-w / 2 + 0.38, h + 0.29, -0.05), yaw);
  b.drum(m.red, 0.035, 0.12, p(-w / 2 + 0.2, h, 0.15), 10);
  // Monitors on stands at the ends, turned in.
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 0.5);
    b.rod(m.black, p(x, 0, -0.25), p(x, 0.85, -0.25), 0.025, 6);
    for (const k of [-1, 0, 1]) b.rod(m.black, p(x, 0.05, -0.25), p(x + k * 0.25, 0, -0.25 + (k ? 0.15 : -0.28)), 0.015, 4);
    const turn = yaw - side * 0.55;
    const mp = frame(p(x, 0.85, -0.25), turn);
    b.box(m.black, [0.42, 0.62, 0.4], mp(0, 0.31, 0), turn);
    b.panel(m.grille, 0.38, 0.58, mp(0, 0.31, 0.205), turn + Math.PI);
  }
  // Cables down the back.
  for (let k = 0; k < 4; k++) b.rod(m.rubber, p(-0.6 + k * 0.4, h, -0.46), p(-0.5 + k * 0.38, 0, -0.62 - k * 0.05), 0.012, 4);
  return { jog, meters };
}

/** Subwoofers stacked with tops on them, their grilles to +z (turned by `yaw`). */
export function speakerStack(b: Builder, m: PropMaterials, at: Vec3, yaw = 0, subs = 2, tops = 2) {
  const p = frame(at, yaw);
  let y = 0;
  for (let k = 0; k < subs; k++) {
    b.box(m.black, [1.2, 0.62, 0.9], p(0, y + 0.31, 0), yaw);
    b.panel(m.grille, 1.12, 0.54, p(0, y + 0.31, 0.452), yaw);
    y += 0.62;
  }
  for (let k = 0; k < tops; k++) {
    b.box(m.black, [0.8, 0.48, 0.6], p(0, y + 0.24, -0.1), yaw);
    b.panel(m.grille, 0.74, 0.42, p(0, y + 0.24, 0.202), yaw);
    y += 0.48;
  }
}

/**
 * A line array hung from `top`: boxes in a gentle J, each a little more splayed than the one
 * above, on a frame with two chains up to the rig.
 */
export function lineArray(b: Builder, m: PropMaterials, top: Vec3, yaw = 0, count = 8, size = 1, chains = 3) {
  const p = frame(top, yaw);
  b.box(m.dark, [1.2 * size, 0.1, 0.9 * size], p(0, 0, 0), yaw);
  for (const x of [-0.5, 0.5]) b.rod(m.chrome, p(x * size, 0, 0), p(x * size, chains, 0), 0.012, 4);
  let y = -0.06;
  let z = 0;
  for (let k = 0; k < count; k++) {
    const tilt = k * k * 0.008;
    const h = 0.36 * size;
    y -= h * Math.cos(tilt);
    z += h * Math.sin(tilt);
    const c = p(0, y + h / 2, z);
    const box = new THREE.BoxGeometry(1.12 * size, h * 0.96, 0.62 * size);
    const e = new THREE.Euler(tilt, yaw, 0, 'YXZ');
    b.add(m.black, box, M.compose(P.set(...c), Q.setFromEuler(e), S));
    const face = new THREE.PlaneGeometry(1.06 * size, h * 0.84);
    const f = p(0, y + h / 2, z + 0.312 * size);
    b.add(m.grille, face, M.compose(P.set(...f), Q.setFromEuler(e), S));
  }
}

/** Road cases stacked against a wall: black boxes with aluminium edges and corner caps. */
export function roadCases(b: Builder, m: PropMaterials, at: Vec3, yaw = 0, count = 6, seed = 1) {
  const p = frame(at, yaw);
  let x = 0;
  for (let k = 0; k < count; k++) {
    const r = Math.abs(Math.sin(seed * 31 + k * 7.7));
    const w = 0.7 + r * 0.7;
    const h = 0.6 + ((r * 3) % 1) * 0.5;
    const d = 0.6 + ((r * 7) % 1) * 0.3;
    const stack = 1 + Math.floor(((r * 13) % 1) * 2.2);
    let y = 0;
    for (let s = 0; s < stack; s++) {
      const c = p(x + w / 2, y + h / 2, 0);
      b.box(m.black, [w, h, d], c, yaw);
      for (const yy of [0, h]) b.box(m.alu, [w + 0.02, 0.03, d + 0.02], p(x + w / 2, y + yy, 0), yaw);
      for (const xx of [0, w]) b.box(m.alu, [0.03, h, d + 0.02], p(x + xx, y + h / 2, 0), yaw);
      b.box(m.chrome, [0.14, 0.04, 0.02], p(x + w / 2, y + h * 0.6, d / 2 + 0.01), yaw);
      y += h;
    }
    x += w + 0.06;
  }
}

/** The mixing desk on its riser: consoles with lit screens, racks, a small light on a stand. */
export function fohDesk(b: Builder, m: PropMaterials, at: Vec3, yaw = 0, roof = true) {
  const p = frame(at, yaw);
  b.box(m.black, [5, 0.45, 3.4], p(0, 0.225, 0), yaw);
  for (const x of [-1.2, 1.2]) {
    b.box(m.dark, [2, 0.85, 0.9], p(x, 0.45 + 0.425, -0.4), yaw);
    b.panel(m.screen, 1.7, 0.25, p(x, 0.45 + 0.92, -0.3), yaw + Math.PI, -0.5);
    for (let k = 0; k < 24; k++) b.box(k % 5 ? m.alu : m.green, [0.03, 0.02, 0.06], p(x - 0.9 + k * 0.078, 0.45 + 0.87, -0.1), yaw);
  }
  for (const x of [-2.1, 2.1]) b.box(m.black, [0.6, 1.2, 0.6], p(x, 0.45 + 0.6, -1.2), yaw);
  b.box(m.red, [0.3, 0.04, 0.02], p(-2.1, 0.45 + 1.1, -0.89), yaw);
  if (roof) {
    for (const [x, z] of [
      [-2.4, -1.6],
      [2.4, -1.6],
      [-2.4, 1.6],
      [2.4, 1.6],
    ])
      b.rod(m.alu, p(x, 0, z), p(x, 3.2, z), 0.05, 6);
    b.box(m.black, [5.2, 0.12, 3.6], p(0, 3.25, 0), yaw);
  }
}

/** A crowd barrier from `a` to `b`: frames a metre apart with a top rail, a front panel and feet. */
export function barrier(b: Builder, m: PropMaterials, a: Vec3, c: Vec3) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...c);
  const len = from.distanceTo(to);
  const yaw = Math.atan2(to.x - from.x, to.z - from.z) - Math.PI / 2;
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const p = frame([mid.x, a[1], mid.z], yaw);
  b.box(m.alu, [len, 0.06, 0.06], p(0, 1.18, 0), yaw);
  b.box(m.dark, [len, 0.95, 0.03], p(0, 0.62, 0), yaw);
  for (let x = -len / 2; x <= len / 2 + 1e-3; x += 1) {
    b.rod(m.alu, p(x, 0.05, 0), p(x, 1.18, 0), 0.025, 4);
    b.rod(m.alu, p(x, 0.05, 0), p(x, 0.02, -0.9), 0.02, 4);
    b.box(m.alu, [0.06, 0.02, 1], p(x, 0.01, -0.45), yaw);
  }
}

/**
 * Flags waving over the crowd: poles with cloth in many colours that ripples in the wind. One
 * instanced draw; the poles go into the Builder.
 */
export class Flags {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor(b: Builder, m: PropMaterials, spots: Vec3[], colors: THREE.ColorRepresentation[], height = 5) {
    const geo = new THREE.PlaneGeometry(1.5, 1, 10, 5);
    geo.translate(0.75, 0, 0);
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: shared,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWPos; varying vec3 vCol; varying float vShade;
        void main() {
          vec3 p = position;
          float seed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
          float u = p.x / 1.5;
          float wave = sin(u * 5.0 - uTime * 4.0 + seed) * 0.18 * u;
          p.z += wave;
          p.y -= u * u * 0.15;
          vShade = 0.7 + 0.3 * cos(u * 5.0 - uTime * 4.0 + seed);
          vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vWPos = w.xyz;
          vCol = instanceColor;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying vec3 vWPos; varying vec3 vCol; varying float vShade;
        void main() {
          vec3 light = vec3(0.05) + roomLights(vWPos, vec3(0.0, 0.0, 1.0)) + beamPools(vWPos, vec3(0.0, 1.0, 0.0)) * 0.6
            + mix(uKey, vec3(1.0), 0.4) * uScreenLevel * 0.25;
          vec3 col = vCol * light * vShade;
          // The stage shines through the cloth.
          col += vCol * uWash * 0.12;
          gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
          ${OUTPUT}
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, material, spots.length);
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      b.rod(m.alu, s, [s[0], s[1] + height, s[2]], 0.02, 4);
      M.compose(P.set(s[0], s[1] + height - 0.55, s[2]), Q.setFromAxisAngle(Y, Math.sin(i * 7.1) * 0.6), S);
      this.mesh.setMatrixAt(i, M);
      this.mesh.setColorAt(i, c.set(colors[i % colors.length]));
    });
    this.mesh.frustumCulled = false;
  }
}
