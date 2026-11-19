import * as THREE from 'three';
import { COMMON, OUTPUT, shared } from '../../aurora/shared';

/** How far the glow round a beam reaches, in beam widths either side of its middle. */
const GLOW = 3;

/**
 * Laser beams: straight lines of light through the haze. Each is drawn as a strip that faces the
 * camera and is never thinner than a pixel and a half, so a beam far away still reads as a line
 * instead of flickering in and out (a thinner beam gets dimmer instead of narrower). The strip holds
 * a crisp core, a little whiter than the beam's colour, and the haze lit round it; the beam
 * glitters along its length and shimmers, and burns hottest at the head it comes out of, where a
 * small flare marks the aperture. All beams are one instanced draw; a venue sets each beam's
 * ends, colour and strength every frame.
 */
export class Lasers {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly a: Float32Array;
  private readonly b: Float32Array;
  private readonly col: Float32Array;
  private used = 0;

  constructor(readonly max: number) {
    const geo = new THREE.InstancedBufferGeometry();
    // The beam's strip (z 0) and the flare's square round its head (z 1).
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0, -1, -1, 1, 1, -1, 1, -1, 1, 1, 1, 1, 1]), 3),
    );
    geo.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
    this.a = new Float32Array(max * 3);
    this.b = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    geo.setAttribute('aA', new THREE.InstancedBufferAttribute(this.a, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aB', new THREE.InstancedBufferAttribute(this.b, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      name: 'lasers',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { ...shared, uPixel: { value: 1 / 720 } },
      vertexShader: /* glsl */ `
        uniform float uPixel;
        attribute vec3 aA; attribute vec3 aB; attribute vec4 aCol;
        varying vec2 vQ; varying float vAlong; varying vec3 vCol; varying float vThin; varying vec3 vWPos;
        varying float vLen; varying float vSeed; varying float vFlare;
        void main() {
          vec3 va = (viewMatrix * vec4(aA, 1.0)).xyz;
          vec3 vb = (viewMatrix * vec4(aB, 1.0)).xyz;
          vec2 aspect = vec2(projectionMatrix[1][1] / projectionMatrix[0][0], 1.0);
          vCol = aCol.rgb;
          vLen = distance(aA, aB);
          vSeed = fract(dot(aA, vec3(0.131, 0.711, 0.373)) + dot(aB, vec3(0.731, 0.137, 0.917)));
          vFlare = position.z;
          vThin = 1.0;
          float near = -0.35;
          if (position.z > 0.5) {
            // The flare: a square facing the camera round the head, at least a few pixels across.
            if (va.z > near) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
            vec4 ph = projectionMatrix * vec4(va, 1.0);
            ph.xy += position.xy / aspect * max(0.14 * projectionMatrix[1][1], 5.0 * uPixel * 2.0 * ph.w);
            vQ = position.xy;
            vAlong = 0.0;
            vWPos = aA;
            gl_Position = ph;
            return;
          }
          // Cut the beam where it passes behind the camera.
          float along = position.y;
          if (va.z > near && vb.z > near) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          if (va.z > near) va = mix(va, vb, (near - va.z) / (vb.z - va.z));
          if (vb.z > near) vb = mix(vb, va, (near - vb.z) / (va.z - vb.z));
          vec4 pa = projectionMatrix * vec4(va, 1.0);
          vec4 pb = projectionMatrix * vec4(vb, 1.0);
          vec2 sa = pa.xy / pa.w * aspect;
          vec2 sb = pb.xy / pb.w * aspect;
          vec2 d = normalize(sb - sa + 1e-6);
          vec2 nrm = vec2(-d.y, d.x);
          vec4 p = mix(pa, pb, along);
          // Width in clip units: the beam's own width, or a pixel and a half, whichever is more.
          float own = aCol.w * projectionMatrix[1][1];
          float least = 1.5 * uPixel * 2.0 * p.w;
          float w = max(own, least);
          vThin = own / w;
          p.xy += nrm / aspect * w * position.x * ${GLOW.toFixed(1)};
          vQ = vec2(position.x * ${GLOW.toFixed(1)}, 0.0);
          vAlong = along;
          vWPos = mix(aA, aB, along);
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying vec2 vQ; varying float vAlong; varying vec3 vCol; varying float vThin; varying vec3 vWPos;
        varying float vLen; varying float vSeed; varying float vFlare;
        void main() {
          float shimmer = 0.9 + 0.1 * sin(uTime * 53.0 + vSeed * 40.0) * sin(uTime * 31.0 + vSeed * 23.0);
          vec3 white = vec3(dot(vCol, vec3(0.3333)));
          if (vFlare > 0.5) {
            float d2 = dot(vQ, vQ);
            float f = exp(-d2 * 7.0) * 0.6 + exp(-sqrt(d2) * 4.0) * 0.12;
            gl_FragColor = vec4((vCol + white * 0.6) * f * shimmer * smoothstep(1.0, 0.7, d2) * 0.5, 1.0);
          } else {
            float s = abs(vQ.x);
            float core = exp(-s * s * 5.0);
            float glow = exp(-s * 1.8) * 0.2;
            // Haze makes a beam glitter along its length; it is hottest at the head and thins out
            // toward its far end.
            float dust = 0.65 + 0.35 * vnoise(vec2(vAlong * vLen * 1.2 - uTime * 0.7, vSeed * 17.0 + vWPos.y));
            float fade = 1.0 - smoothstep(0.72, 1.0, vAlong);
            float hot = 1.0 + 1.2 * exp(-vAlong * vLen * 1.5);
            vec3 col = (vCol + white * 0.4 * core) * core * (0.35 + 0.65 * vThin) * (0.8 + 0.2 * dust) + vCol * glow * dust;
            gl_FragColor = vec4(col * fade * hot * shimmer, 1.0);
          }
          ${OUTPUT}
        }`,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
  }

  /** Starts a frame's beams. */
  begin() {
    this.used = 0;
  }

  /** One beam from `from` to `to`, `width` metres wide. */
  add(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, level: number, width = 0.02) {
    if (this.used >= this.max || level <= 0.002) return;
    const i = this.used++;
    this.a.set([from.x, from.y, from.z], i * 3);
    this.b.set([to.x, to.y, to.z], i * 3);
    this.col.set([color.r * level, color.g * level, color.b * level, width], i * 4);
  }

  /** Ends the frame: uploads what was added. `height` is the canvas's height in pixels. */
  end(height: number) {
    const geo = this.mesh.geometry;
    geo.instanceCount = this.used;
    for (const name of ['aA', 'aB', 'aCol']) {
      const attr = geo.getAttribute(name) as THREE.InstancedBufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.used * attr.itemSize);
      attr.needsUpdate = true;
    }
    this.mesh.material.uniforms.uPixel.value = 1 / Math.max(1, height);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const TMP = new THREE.Vector3();
const DIR = new THREE.Vector3();

/** The way a beam aimed by `yaw` (about the vertical, 0 toward +z) and `pitch` (up from level) points. */
export function aim(out: THREE.Vector3, yaw: number, pitch: number): THREE.Vector3 {
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

/**
 * A fan of beams from one source: `count` beams spread `spread` radians across, aimed by `yaw`
 * (about the vertical) and `pitch` (up from level), `length` metres long, `roll` tilting the fan.
 */
export function fan(
  out: Lasers,
  from: THREE.Vector3,
  count: number,
  yaw: number,
  pitch: number,
  spread: number,
  length: number,
  color: THREE.Color,
  level: number,
  roll = 0,
  width = 0.02,
) {
  for (let i = 0; i < count; i++) {
    const s = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
    // Spread across the fan, then tilted by the roll.
    aim(DIR, yaw + s * Math.cos(roll), pitch + s * Math.sin(roll));
    out.add(from, TMP.copy(DIR).multiplyScalar(length).add(from), color, level, width);
  }
}

const AXIS = new THREE.Vector3();
const SIDE = new THREE.Vector3();
const UP = new THREE.Vector3();

/**
 * A cone of beams from one source round the way `yaw` and `pitch` aim: `count` beams `angle`
 * radians off its axis, turned `spin` radians round it (a tunnel when seen from inside). `colors`
 * take turns round the cone.
 */
export function cone(
  out: Lasers,
  from: THREE.Vector3,
  count: number,
  yaw: number,
  pitch: number,
  angle: number,
  length: number,
  colors: readonly THREE.Color[],
  level: number,
  spin = 0,
  width = 0.02,
) {
  aim(AXIS, yaw, pitch);
  SIDE.set(Math.cos(yaw), 0, -Math.sin(yaw));
  UP.crossVectors(AXIS, SIDE);
  const r = Math.tan(angle);
  for (let i = 0; i < count; i++) {
    const a = spin + (i / count) * Math.PI * 2;
    DIR.copy(AXIS)
      .addScaledVector(SIDE, Math.cos(a) * r)
      .addScaledVector(UP, Math.sin(a) * r)
      .normalize();
    out.add(from, TMP.copy(DIR).multiplyScalar(length).add(from), colors[i % colors.length], level, width);
  }
}
