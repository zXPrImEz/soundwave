import * as THREE from 'three';
import { COMMON, OUTPUT, shared } from '../aurora/shared';
import { ParticleSim } from './pyro';

/** How many beams the smoke takes its light from (the brightest, see Beams.light). */
export const SMOKE_BEAMS = 16;

/**
 * Draws a ParticleSim (see pyro.ts) in one instanced draw, straight from its arrays.
 *
 * Sparks are streaks: each is stretched along the way it moved over the last moment, so fast ones
 * draw lines (motion blur) and slow ones round dots, white hot in the middle and in their own colour
 * at the edges, added to the picture so the glow picks them up.
 *
 * Smoke is soft turning puffs of noise, blended over the picture and lit the way the haze is: by the
 * stage's colours, the venue's lights, the pools of the beams and the beams themselves where a puff
 * hangs in one, a firework's flash and the flame jets.
 */
export class Particles {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly sim: ParticleSim;
  /** Smoke only: the beams that light it (origin and spread, direction and length, colour). */
  readonly beams = {
    pos: Array.from({ length: SMOKE_BEAMS }, () => new THREE.Vector4()),
    dir: Array.from({ length: SMOKE_BEAMS }, () => new THREE.Vector4(0, -1, 0, 1)),
    col: Array.from({ length: SMOKE_BEAMS }, () => new THREE.Color(0, 0, 0)),
  };
  private readonly attributes: THREE.InstancedBufferAttribute[];
  private readonly puff: THREE.DataTexture | null = null;

  constructor(max: number, kind: 'sparks' | 'smoke') {
    const smoke = kind === 'smoke';
    this.sim = smoke ? new ParticleSim(max, 6, 1.6) : new ParticleSim(max, 12, 2.5);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (array: Float32Array, name: string) => {
      const a = new THREE.InstancedBufferAttribute(array, 4).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.attributes = [attr(this.sim.pos, 'aPos'), attr(this.sim.vel, 'aVel'), attr(this.sim.col, 'aCol')];
    geo.instanceCount = 0;
    let material: THREE.ShaderMaterial;
    if (smoke) {
      this.puff = puffAtlas();
      material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...shared,
          uScale: { value: 800 },
          uPuff: { value: this.puff },
          uBeamPos: { value: this.beams.pos },
          uBeamDir: { value: this.beams.dir },
          uBeamCol: { value: this.beams.col },
        },
        vertexShader: SMOKE_VERTEX,
        fragmentShader: SMOKE_FRAGMENT,
      });
    } else {
      material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uScale: { value: 800 } },
        vertexShader: SPARK_VERTEX,
        fragmentShader: SPARK_FRAGMENT,
      });
    }
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Smoke under everything that adds light (beams, flames, sparks), so they shine through it.
    this.mesh.renderOrder = smoke ? 3 : 6;
  }

  /** Pixels per metre at one metre from the camera. */
  setScale(s: number) {
    this.mesh.material.uniforms.uScale.value = s;
  }

  update(dt: number, gravity: number) {
    if (!this.sim.update(dt, gravity)) return;
    const used = this.sim.used;
    for (const a of this.attributes) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, used * 4);
      a.needsUpdate = true;
    }
    this.mesh.geometry.instanceCount = used;
    this.mesh.visible = used > 0;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.puff?.dispose();
  }
}

const SPARK_VERTEX = /* glsl */ `
uniform float uScale;
attribute vec2 corner;
attribute vec4 aPos; attribute vec4 aVel; attribute vec4 aCol;
varying vec3 vCol; varying vec2 vUv;
void main() {
  vec4 head = viewMatrix * vec4(aPos.xyz, 1.0);
  if (aVel.w <= 0.0 || head.z > -0.35) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  // The streak runs back from where the spark is to where it was a moment ago (longer for comets).
  vec4 tail = viewMatrix * vec4(aPos.xyz - aVel.xyz * 0.03 * aCol.w, 1.0);
  if (tail.z > -0.35) tail = head;
  vec4 h = projectionMatrix * head;
  vec4 t = projectionMatrix * tail;
  // Work in screen units that are square: x times the aspect ratio.
  float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
  vec2 hs = h.xy / h.w * vec2(aspect, 1.0);
  vec2 ts = t.xy / t.w * vec2(aspect, 1.0);
  float pixel = projectionMatrix[1][1] / uScale;
  float real = 0.5 * aPos.w * projectionMatrix[1][1] / h.w;
  // Never thinner than a pixel; a thinner spark is drawn a pixel wide and dimmer, so it does not shimmer.
  float w = max(real, 0.9 * pixel);
  vec2 d = hs - ts;
  float len = length(d);
  vec2 dir = len > 1e-6 ? d / len : vec2(0.0, 1.0);
  vec2 side = vec2(-dir.y, dir.x);
  vec2 c = mix(ts, hs, corner.y * 0.5 + 0.5) + dir * corner.y * w + side * corner.x * w;
  gl_Position = vec4(c.x / aspect * h.w, c.y * h.w, h.z, h.w);
  vUv = corner;
  // A streak spreads the spark's light over its length (not all of it: it should still read as bright).
  float stretch = (len + 2.0 * w) / (2.0 * w);
  vCol = aCol.rgb * aVel.w * (real / w) / pow(stretch, 0.35);
}`;

const SPARK_FRAGMENT = /* glsl */ `
varying vec3 vCol; varying vec2 vUv;
void main() {
  float across = exp(-vUv.x * vUv.x * 4.0);
  // Brightest at the head, thinning toward the tail; rounded ends.
  float along = (0.35 + 0.65 * smoothstep(-1.0, 0.6, vUv.y)) * smoothstep(1.0, 0.55, abs(vUv.y));
  float k = across * along;
  vec3 col = mix(vCol, vec3(max(vCol.r, max(vCol.g, vCol.b))), k * k * 0.6);
  gl_FragColor = vec4(col * k * 3.2, 1.0);
  ${OUTPUT}
}`;

const SMOKE_VERTEX = /* glsl */ `
${COMMON}
uniform float uScale;
uniform vec3 uAmbient;
uniform vec4 uBeamPos[${SMOKE_BEAMS}];
uniform vec4 uBeamDir[${SMOKE_BEAMS}];
uniform vec3 uBeamCol[${SMOKE_BEAMS}];
attribute vec2 corner;
attribute vec4 aPos; attribute vec4 aVel; attribute vec4 aCol;
varying vec2 vUv; varying vec3 vLit; varying float vA;
void main() {
  vec4 mv = viewMatrix * vec4(aPos.xyz, 1.0);
  float size = aPos.w;
  float dist = -mv.z;
  // A puff thins out as the camera comes into it, and one that would fill much of the picture is
  // left out: a cloud seen from inside is not a flat card over the lens.
  float cover = size * projectionMatrix[1][1] / max(dist, 0.1);
  float fade = smoothstep(size * 0.4, size * 1.4 + 0.5, dist) * smoothstep(1.4, 0.7, cover);
  float alpha = aVel.w * fade;
  if (alpha <= 0.002) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float seed = aCol.w;
  float turn = seed * 6.2831 + uTime * (fract(seed * 7.13) - 0.5) * 0.5;
  vec2 c = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * corner;
  mv.xy += c * size * 0.5;
  gl_Position = projectionMatrix * mv;
  float cell = floor(fract(seed * 13.7) * 4.0);
  vUv = (corner * 0.5 + 0.5) * 0.5 + vec2(mod(cell, 2.0), floor(cell / 2.0)) * 0.5;
  vA = alpha;

  // The light the puff sits in, gathered once per puff.
  vec3 p = aPos.xyz;
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 lit = vec3(0.1) + uAmbient * 1.5 + uHazeNear * 1.5 + uWash * (0.1 + 0.12 * uEnergy) + uKey * 0.06 * (0.5 + uBarPulse);
  lit += roomLights(p, up) * 0.6 + beamPools(p, up) * 0.7;
  vec3 g = p - uGlowPos;
  lit += vec3(1.0, 0.5, 0.18) * uFire * 2.2 / (1.0 + dot(g, g) * 0.003);
  vec3 b = p - uBurst.xyz;
  lit += uBurstCol * uBurst.w * 3.0 / (1.0 + dot(b, b) / 400.0);
  for (int i = 0; i < ${SMOKE_BEAMS}; i++) {
    vec3 v = p - uBeamPos[i].xyz;
    float along = dot(v, uBeamDir[i].xyz);
    float len = uBeamDir[i].w;
    if (along <= 0.0 || along >= len) continue;
    float r = length(v - uBeamDir[i].xyz * along);
    float radius = along * uBeamPos[i].w + 0.3 + size * 0.3;
    lit += uBeamCol[i] * 1.6 * smoothstep(radius * 1.6, radius * 0.3, r) * (1.0 - along / len);
  }
  vLit = aCol.rgb * lit;
}`;

const SMOKE_FRAGMENT = /* glsl */ `
uniform sampler2D uPuff;
varying vec2 vUv; varying vec3 vLit; varying float vA;
void main() {
  float d = texture2D(uPuff, vUv).r;
  float a = d * vA;
  if (a < 0.003) discard;
  // Thin edges let more light through than the dense middle: a touch brighter there.
  gl_FragColor = vec4(vLit * (1.15 - 0.3 * d), min(1.0, a));
  ${OUTPUT}
}`;

/**
 * Four puffs of smoke side by side (two by two): billowing noise inside a soft round edge, as
 * density in one channel. Made once; the smoke picks one per particle and turns it.
 */
function puffAtlas(): THREE.DataTexture {
  const cell = 128;
  const size = cell * 2;
  const data = new Uint8Array(size * size);
  const lattice = (x: number, y: number, seed: number) => {
    const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const noise = (x: number, y: number, seed: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = lattice(ix, iy, seed);
    const b = lattice(ix + 1, iy, seed);
    const c = lattice(ix, iy + 1, seed);
    const d = lattice(ix + 1, iy + 1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * cell;
    const oy = Math.floor(v / 2) * cell;
    for (let y = 0; y < cell; y++)
      for (let x = 0; x < cell; x++) {
        const px = (x + 0.5) / cell - 0.5;
        const py = (y + 0.5) / cell - 0.5;
        const r = Math.hypot(px, py) * 2;
        let n = 0;
        let amp = 0.5;
        let f = 3;
        for (let o = 0; o < 5; o++) {
          n += amp * noise(px * f + 10, py * f + 10, v * 3.1 + o);
          amp *= 0.5;
          f *= 2.1;
        }
        // Round and soft at the edge (nothing at all at the cell's border, so neighbours never bleed in).
        const edge = Math.max(0, 1 - r);
        const k = Math.min(1, Math.max(0, edge * edge * (3 - 2 * edge) * (0.25 + 1.3 * n) - 0.08) * 1.25);
        data[(oy + y) * size + ox + x] = Math.round(k * 255);
      }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
