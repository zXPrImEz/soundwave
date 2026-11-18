import * as THREE from 'three';

/**
 * A colour grade over the venue's picture, before tone mapping: a gentle S of contrast around
 * middle grey, a little more (or less) saturation, a tint in the shadows and a vignette that draws
 * the eye to the middle. Set per venue (see Venue.grade).
 */
export function gradeShader(grade: { contrast: number; saturation: number; vignette: number; tint?: readonly [number, number, number] }) {
  return {
    name: 'Grade',
    uniforms: {
      tDiffuse: { value: null },
      uContrast: { value: grade.contrast },
      uSaturation: { value: grade.saturation },
      uVignette: { value: grade.vignette },
      uTint: { value: new THREE.Vector3(...(grade.tint ?? [1, 1, 1])) },
      uAspect: { value: 16 / 9 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uContrast;
      uniform float uSaturation;
      uniform float uVignette;
      uniform vec3 uTint;
      uniform float uAspect;
      varying vec2 vUv;
      void main() {
        vec3 c = max(texture2D(tDiffuse, vUv).rgb, 0.0);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // Contrast in log space, so it acts the same on dim and bright parts of an HDR picture.
        float g = 0.18;
        float lc = g * pow(max(l, 1e-5) / g, uContrast);
        c *= lc / max(l, 1e-5);
        c = mix(vec3(lc), c, uSaturation);
        // The shadows take the tint; highlights stay as they are.
        c *= mix(uTint, vec3(1.0), smoothstep(0.0, 0.25, lc));
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        c *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(p));
        gl_FragColor = vec4(c, 1.0);
      }`,
  };
}
