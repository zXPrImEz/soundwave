import * as THREE from 'three';
import { COMMON, OUTPUT, shared } from '../../aurora/shared';

/**
 * Laser beams: straight lines of light through the haze. Each is drawn as a strip that faces the
 * camera and is never thinner than a pixel and a half, so a beam far away still reads as a line
 * instead of flickering in and out (a thinner beam gets dimmer instead of narrower). All beams are
 * one instanced draw; a venue sets each beam's ends, colour and strength every frame.
 */
export class Lasers {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly a: Float32Array;
  private readonly b: Float32Array;
  private readonly col: Float32Array;
  private used = 0;

  constructor(readonly max: number) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
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
        varying float vSide; varying float vAlong; varying vec3 vCol; varying float vThin; varying vec3 vWPos;
        void main() {
          vec3 va = (viewMatrix * vec4(aA, 1.0)).xyz;
          vec3 vb = (viewMatrix * vec4(aB, 1.0)).xyz;
          // Cut the beam where it passes behind the camera.
          float near = -0.35;
          float along = position.y;
          if (va.z > near && vb.z > near) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          if (va.z > near) va = mix(va, vb, (near - va.z) / (vb.z - va.z));
          if (vb.z > near) vb = mix(vb, va, (near - vb.z) / (va.z - vb.z));
          vec4 pa = projectionMatrix * vec4(va, 1.0);
          vec4 pb = projectionMatrix * vec4(vb, 1.0);
          vec2 aspect = vec2(projectionMatrix[1][1] / projectionMatrix[0][0], 1.0);
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
          p.xy += nrm / aspect * w * position.x;
          vSide = position.x;
          vAlong = along;
          vCol = aCol.rgb;
          vWPos = mix(aA, aB, along);
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying float vSide; varying float vAlong; varying vec3 vCol; varying float vThin; varying vec3 vWPos;
        void main() {
          float core = exp(-vSide * vSide * 6.0);
          // Haze makes a beam glitter along its length; it thins out toward its far end.
          float dust = 0.75 + 0.25 * vnoise(vec2(vAlong * 60.0 - uTime * 0.6, vWPos.y * 2.0));
          float fade = 1.0 - smoothstep(0.75, 1.0, vAlong);
          gl_FragColor = vec4(vCol * core * dust * fade * (0.35 + 0.65 * vThin), 1.0);
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
    const y = yaw + s * Math.cos(roll);
    const p = pitch + s * Math.sin(roll);
    DIR.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
    out.add(from, TMP.copy(DIR).multiplyScalar(length).add(from), color, level, width);
  }
}
