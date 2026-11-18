import * as THREE from 'three';
import { COMMON, OUTPUT, shared } from './shared';
import type { Fixture } from './assets';

const DOWN = new THREE.Vector3(0, -1, 0);
const LENGTH: Record<string, number> = { Sky: 90, Shell0: 52, Shell2: 44, Ribbon: 40, Truss: 34, Floor: 26, Halo: 17, Delay: 40, Foh: 60 };
const SPREAD: Record<string, number> = {
  Sky: 0.02,
  Shell0: 0.034,
  Shell2: 0.034,
  Ribbon: 0.03,
  Truss: 0.045,
  Floor: 0.04,
  Halo: 0.075,
  Delay: 0.03,
  Foh: 0.012,
};

export interface BeamState {
  /** Pan and tilt away from the fixture's rest direction, radians. */
  pan: number;
  tilt: number;
  color: THREE.Color;
  level: number;
}

/**
 * Moving-head beams in the haze and the star-shaped flare at each lens. All beams are one instanced
 * draw and all flares one point cloud; the show sets pan, tilt, colour and level per fixture.
 */
export class Beams {
  readonly group = new THREE.Group();
  readonly states: BeamState[];
  private readonly mesh: THREE.InstancedMesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly flares: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly base: THREE.Quaternion[];
  private readonly flareColor: Float32Array;
  private readonly flareSize: Float32Array;

  constructor(readonly fixtures: Fixture[]) {
    const n = fixtures.length;
    const geo = new THREE.CylinderGeometry(0.02, 1, 1, 20, 1, true);
    geo.translate(0, -0.5, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: shared,
      vertexShader: /* glsl */ `
        varying float vAlong; varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vAng;
        void main() {
          vAlong = -position.y;
          vAng = atan(position.z, position.x);
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vV = -mv.xyz;
          // A beam is long and thin: its surface faces straight out from its axis.
          vN = normalMatrix * (mat3(instanceMatrix) * vec3(position.x, 0.0, position.z));
          vCol = instanceColor;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying float vAlong; varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vAng;
        void main() {
          float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
          float a = clamp(vAlong, 0.0, 1.0);
          float along = pow(1.0 - a, 2.0) * (0.3 + 0.7 * exp(-a * 7.0));
          float dust = 0.82 + 0.18 * vnoise(vec2(a * 26.0 - uTime * 0.35, vAng * 2.0));
          gl_FragColor = vec4(vCol * edge * along * dust, 1.0);
          ${OUTPUT}
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 5;
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, new THREE.Color(0, 0, 0));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);

    const pos = new Float32Array(n * 3);
    fixtures.forEach((f, i) => pos.set(f.pos, i * 3));
    this.flareColor = new Float32Array(n * 3);
    this.flareSize = new Float32Array(n);
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fgeo.setAttribute('aColor', new THREE.BufferAttribute(this.flareColor, 3).setUsage(THREE.DynamicDrawUsage));
    fgeo.setAttribute('aSize', new THREE.BufferAttribute(this.flareSize, 1).setUsage(THREE.DynamicDrawUsage));
    const fmat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 800 } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute vec3 aColor; attribute float aSize;
        varying vec3 vCol;
        void main() {
          vCol = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / -mv.z, 0.0, 420.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r = length(p);
          float core = exp(-r * r * 90.0) * 1.6;
          float halo = exp(-r * 6.0) * 0.22;
          float cross = exp(-abs(p.y) * 70.0) * exp(-abs(p.x) * 3.2) + exp(-abs(p.x) * 70.0) * exp(-abs(p.y) * 4.6);
          vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.7071;
          float diag = exp(-abs(q.y) * 90.0) * exp(-abs(q.x) * 6.5) + exp(-abs(q.x) * 90.0) * exp(-abs(q.y) * 6.5);
          float a = (core + halo + cross * 0.75 + diag * 0.3) * smoothstep(1.0, 0.6, r);
          gl_FragColor = vec4(vCol * a, 1.0);
          ${OUTPUT}
        }`,
    });
    this.flares = new THREE.Points(fgeo, fmat);
    this.flares.frustumCulled = false;
    this.flares.renderOrder = 6;

    this.base = fixtures.map((f) => new THREE.Quaternion().setFromUnitVectors(DOWN, new THREE.Vector3(...f.dir).normalize()));
    this.states = fixtures.map(() => ({ pan: 0, tilt: 0, color: new THREE.Color(1, 1, 1), level: 0 }));
    this.group.add(this.mesh, this.flares);
  }

  /** Applies the fixture states; `scale` is pixels per metre at one metre (for flare size). */
  update(camera: THREE.Camera, scale: number) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const dir = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    this.fixtures.forEach((f, i) => {
      const st = this.states[i];
      const len = f.length ?? LENGTH[f.group] ?? 100;
      const radius = len * (f.spread ?? SPREAD[f.group] ?? 0.012);
      q.copy(this.base[i]).multiply(TMP.setFromEuler(e.set(st.tilt, 0, st.pan)));
      p.set(...f.pos);
      m.compose(p, q, s.set(radius, len, radius));
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, c.copy(st.color).multiplyScalar(st.level * 0.36));
      // The flare swells when the beam swings toward the camera.
      dir.copy(DOWN).applyQuaternion(q);
      toCam.copy(camera.position).sub(p).normalize();
      const facing = Math.pow(Math.max(0, dir.dot(toCam)), 6);
      const k = Math.min(0.8, st.level * 1.1);
      this.flareColor.set([st.color.r * k, st.color.g * k, st.color.b * k], i * 3);
      this.flareSize[i] = st.level > 0.01 ? 1.3 + 5 * facing : 0;
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.flares.geometry.attributes.aColor.needsUpdate = true;
    this.flares.geometry.attributes.aSize.needsUpdate = true;
    this.flares.material.uniforms.uScale.value = scale;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
    this.flares.geometry.dispose();
    this.flares.material.dispose();
  }
}

const TMP = new THREE.Quaternion();
