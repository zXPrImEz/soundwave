import * as THREE from 'three';
import type { Vec3 } from '../../stage/Director';

/**
 * Confetti: paper squares shot from cannons that flutter down slowly, each tumbling (it shows its
 * face, then its edge) and catching the light. One point cloud; a ring buffer, so new bursts take
 * the place of the oldest paper when it is full.
 */
export class Confetti {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly seed: Float32Array;
  private readonly life: Float32Array;
  private cursor = 0;
  private live = 0;

  constructor(private readonly max: number) {
    this.pos = new Float32Array(max * 3).fill(-1000);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.seed = new Float32Array(max);
    this.life = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: { uScale: { value: 800 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uScale; uniform float uTime;
        attribute float aSeed; attribute float aLife;
        varying vec3 vC; varying float vTurn; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Tumbling: the square turns about its own axis, wide when it faces the camera.
          vTurn = sin(uTime * (5.0 + aSeed * 7.0) + aSeed * 40.0);
          vA = clamp(aLife * 0.5, 0.0, 1.0);
          vC = color * (0.55 + 0.6 * abs(vTurn));
          gl_PointSize = aLife > 0.0 ? max(1.5, 0.11 * uScale / -mv.z) : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vTurn; varying float vA;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          if (abs(p.x) > 0.5 * max(0.18, abs(vTurn)) || abs(p.y) > 0.32) discard;
          gl_FragColor = vec4(vC, vA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  setScale(s: number) {
    this.points.material.uniforms.uScale.value = s;
  }

  /** Every cannon fires `amount` (0..1) of a full load in the show's colours, with white and gold. */
  burst(cannons: readonly { pos: Vec3; dir: Vec3 }[], key: THREE.Color, accent: THREE.Color, amount: number) {
    const per = Math.floor((this.max / Math.max(1, cannons.length)) * 0.45 * amount);
    const palette = [key, accent, WHITE, GOLD];
    for (const c of cannons) {
      const d = new THREE.Vector3(...c.dir).normalize();
      for (let k = 0; k < per; k++) {
        const i = this.cursor;
        this.cursor = (this.cursor + 1) % this.max;
        const speed = 14 + Math.random() * 16;
        const spread = 0.35;
        this.pos.set(c.pos, i * 3);
        this.vel.set(
          [
            (d.x + (Math.random() - 0.5) * spread) * speed,
            (d.y + (Math.random() - 0.5) * spread) * speed,
            (d.z + (Math.random() - 0.5) * spread) * speed,
          ],
          i * 3,
        );
        const col = palette[k % palette.length];
        this.col.set([col.r, col.g, col.b], i * 3);
        this.seed[i] = Math.random();
        this.life[i] = 7 + Math.random() * 5;
      }
    }
    this.live = this.max;
    this.points.geometry.attributes.aSeed.needsUpdate = true;
  }

  update(dt: number) {
    this.points.material.uniforms.uTime.value += dt;
    if (!this.live) return;
    let live = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      live++;
      const o = i * 3;
      // Paper is all drag: it stops within a second and then sails down, swaying.
      const k = Math.exp(-2.6 * dt);
      const sway = Math.sin(this.life[i] * (2 + this.seed[i] * 2) + this.seed[i] * 30) * 1.1;
      this.vel[o] = this.vel[o] * k + sway * dt * 3;
      this.vel[o + 1] = this.vel[o + 1] * k + (-1.3 - this.vel[o + 1] * 0.1) * dt * 2.6;
      this.vel[o + 2] *= k;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] = Math.max(0.02, this.pos[o + 1] + this.vel[o + 1] * dt);
      this.pos[o + 2] += this.vel[o + 2] * dt;
    }
    this.live = live;
    const geo = this.points.geometry;
    for (const name of ['position', 'color', 'aLife'] as const) geo.getAttribute(name).needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

const WHITE = new THREE.Color(1, 1, 1);
const GOLD = new THREE.Color(1, 0.75, 0.25);
