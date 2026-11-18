/**
 * The look of a hand-held camera feed: a slight barrel of the lens, colour fringes at the edges, a
 * vignette and moving grain. `uAmount` (0..1) sets how much of it there is.
 */
export const HANDHELD_SHADER = {
  name: 'Handheld',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 1 },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform float uAspect;
    varying vec2 vUv;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 a = c * vec2(uAspect, 1.0);
      float r2 = dot(a, a);
      vec2 uv = 0.5 + c * (1.0 - 0.06 * uAmount * r2);
      vec2 fringe = c * 0.006 * uAmount * r2 * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, uv + fringe).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - fringe).b);
      col *= mix(1.0, smoothstep(1.25, 0.25, r2 * 2.2), 0.75 * uAmount);
      float grain = hash(vUv * vec2(1931.0, 1171.0) + fract(uTime * 7.31)) - 0.5;
      col += grain * 0.05 * uAmount * (0.4 + col);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};
