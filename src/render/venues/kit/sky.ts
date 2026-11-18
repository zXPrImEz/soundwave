import * as THREE from 'three';
import { COMMON, OUTPUT, shared } from '../../aurora/shared';

/** The sky from late sunset into the night: `uDusk` runs 0..1 over the show. */
export function duskSky(dusk: { value: number }) {
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
