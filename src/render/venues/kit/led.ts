import * as THREE from 'three';
import { COMMON, OUTPUT, shared } from '../../aurora/shared';

/**
 * LED screens. Their picture is drawn in the shader from the music (no video to load): a handful of
 * looks, each made for the beat, the bass and the show's colours, cross-faded from one to the next.
 * Up close the screen shows its diodes; from afar they blend into one picture.
 */
export const LED_LOOKS = {
  /** Bars that jump with the bass, middle and treble. */
  bars: 0,
  /** Squares rushing out from the middle on the beat. */
  tunnel: 1,
  /** Slow liquid colour. */
  plasma: 2,
  /** Cells that flash on the beat. */
  grid: 3,
  /** A sun going down over a grid running toward it. */
  horizon: 4,
  /** A turning kaleidoscope. */
  kaleido: 5,
  /** Scrolling stripes, hard, like a strobe wall. */
  stripes: 6,
  /** Rings rippling out on every beat. */
  rings: 7,
  /** A sign: five bars of a sound wave, breathing with the music. */
  glyph: 8,
} as const;
export type LedLook = keyof typeof LED_LOOKS;

const FRAGMENT = /* glsl */ `
${COMMON}
uniform vec2 uRes;
uniform float uLookA;
uniform float uLookB;
uniform float uMix;
uniform float uLevel;
uniform float uSeed;
varying vec2 vUv;
varying vec3 vWPos;

vec3 ramp(float x) { return x < 0.5 ? mix(uWash, uKey, x * 2.0) : mix(uKey, uAccent, x * 2.0 - 1.0); }

vec3 look(float which, vec2 uv) {
  float t = uTime + uSeed * 13.0;
  vec2 c = uv - 0.5;
  c.x *= uRes.x / uRes.y;
  if (which < 0.5) {
    float col = floor(uv.x * 24.0);
    float band = col / 24.0;
    float lvl = band < 0.33 ? uLow : band < 0.66 ? uMid : uHigh;
    float h = 0.15 + 0.85 * lvl * (0.55 + 0.45 * vnoise(vec2(col * 1.7, t * 3.0)));
    float on = step(uv.y, h) * step(0.12, fract(uv.x * 24.0));
    return ramp(uv.y) * on * (1.0 + step(h - 0.04, uv.y) * 1.5);
  }
  if (which < 1.5) {
    // Frames the shape of the screen, rushing out of its middle.
    float d = max(abs(uv.x - 0.5), abs(uv.y - 0.5));
    float w = fract(log(d + 0.02) * 1.6 - uBeat * 0.5);
    float edge = smoothstep(0.0, 0.08, w) * smoothstep(0.3, 0.12, w);
    return ramp(fract(d * 1.5 + uBeat * 0.125)) * edge * (0.6 + 0.8 * uPulse);
  }
  if (which < 2.5) {
    float f = fbm(c * 2.2 + vec2(t * 0.15, -t * 0.1));
    float g = fbm(c * 3.0 - f * 1.5 + t * 0.05);
    return ramp(g) * (0.45 + 0.9 * g) * (0.8 + 0.4 * uLow);
  }
  if (which < 3.5) {
    vec2 cell = floor(uv * vec2(10.0, 6.0));
    float r = hash21(cell + floor(uBeat));
    float on = step(0.62, r);
    return mix(uKey, uAccent, step(0.82, r)) * on * (0.5 + 1.5 * uPulse);
  }
  if (which < 4.5) {
    // The sun: banded toward its foot, sinking a little on each bar.
    vec2 s = c - vec2(0.0, 0.08);
    float sun = smoothstep(0.31, 0.3, length(s)) * step(0.0, s.y + 0.02);
    float band = step(0.5, fract((s.y + 0.3) * 18.0 - t * 0.6)) + step(0.12, s.y);
    vec3 col = mix(uKey, vec3(1.0, 0.85, 0.5), clamp(s.y * 3.0 + 0.4, 0.0, 1.0)) * sun * min(1.0, band) * 1.4;
    // The grid below the horizon, running toward it.
    float y = -c.y + 0.02;
    if (y > 0.0) {
      float z = 0.25 / y;
      vec2 g = vec2(c.x * z, z + uBeat * 0.5);
      vec2 gl = abs(fract(g) - 0.5);
      float line = smoothstep(0.03 * z, 0.0, min(gl.x, gl.y) - 0.0) * smoothstep(0.0, 0.25, y);
      col = uAccent * line * (0.6 + uPulse);
    }
    return col + uWash * 0.12 * smoothstep(0.5, -0.2, c.y);
  }
  if (which < 5.5) {
    float a = atan(c.y, c.x);
    float r = length(c);
    float seg = 6.2831853 / 8.0;
    a = abs(mod(a + t * 0.2, seg) - seg * 0.5);
    vec2 p = vec2(cos(a), sin(a)) * r;
    float f = sin(p.x * 22.0 - uBeat * 3.14159) * sin(p.y * 18.0 + t);
    return ramp(fract(r * 1.4 - t * 0.1)) * smoothstep(0.0, 0.9, f) * 1.4;
  }
  if (which < 6.5) {
    float s = step(0.5, fract(uv.x * 6.0 + uBeat * (mod(floor(uBeat / 4.0), 2.0) < 0.5 ? 1.0 : -1.0)));
    return mix(uKey, vec3(1.0), 0.4) * s * (0.4 + 1.2 * uPulse);
  }
  if (which > 7.5) {
    vec2 g = (uv - 0.5) * vec2(1.0, 1.0);
    float col = floor(g.x * 9.0 + 2.5);
    float inside = step(0.0, col) * step(col, 4.0) * step(0.22, fract(g.x * 9.0 + 2.5)) * step(fract(g.x * 9.0 + 2.5), 0.78);
    float h = (0.14 + 0.2 * hash11(col + 3.0 + uSeed)) * (0.75 + 0.5 * (mod(col, 2.0) < 0.5 ? uLow : uMid)) + 0.05 * uPulse;
    float bar = inside * smoothstep(h, h - 0.02, abs(g.y));
    return mix(uAccent, vec3(1.0), 0.6) * bar * (0.9 + 0.5 * uPulse);
  }
  float r = length(c);
  float w = fract(r * 4.0 - uBeat);
  return ramp(fract(r * 0.8 + t * 0.05)) * smoothstep(0.9, 1.0, w) * 1.6 + uWash * 0.08;
}

void main() {
  vec2 px = vUv * uRes;
  vec2 cell = floor(px) + 0.5;
  vec2 uv = cell / uRes;
  vec3 col = mix(look(uLookA, uv), look(uLookB, uv), uMix);
  // The diodes: round dots with a dark gap, fading into an even picture where they get small.
  vec2 f = fract(px) - 0.5;
  float size = fwidth(px.x) + fwidth(px.y);
  float diode = smoothstep(0.42, 0.28, length(f));
  float diodes = mix(diode * 1.6, 0.85, smoothstep(0.25, 0.9, size));
  col *= diodes * uLevel * uScreenLevel;
  col += vec3(0.004, 0.005, 0.008);
  gl_FragColor = vec4(applyHaze(col, vWPos) * 0.4 + col * 0.6, 1.0);
  ${OUTPUT}
}`;

/** An LED screen's material; `res` is how many diodes it has across and up. */
export class LedScreen {
  readonly material: THREE.ShaderMaterial;
  private from: number;
  private to: number;
  private blend = 1;

  constructor(
    res: [number, number],
    private readonly looks: LedLook[],
    level = 2.2,
    seed = 0,
  ) {
    this.from = LED_LOOKS[looks[0]];
    this.to = this.from;
    this.material = new THREE.ShaderMaterial({
      name: 'led',
      uniforms: {
        ...shared,
        uRes: { value: new THREE.Vector2(...res) },
        uLookA: { value: this.from },
        uLookB: { value: this.to },
        uMix: { value: 0 },
        uLevel: { value: level },
        uSeed: { value: seed },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vWPos;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWPos = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: FRAGMENT,
    });
  }

  /** Moves to the next look (on a bar, say); it fades in over a second or so. */
  next(bar: number) {
    this.from = this.to;
    this.to = LED_LOOKS[this.looks[bar % this.looks.length]];
    this.blend = 0;
  }

  set level(v: number) {
    this.material.uniforms.uLevel.value = v;
  }

  update(dt: number) {
    this.blend = Math.min(1, this.blend + dt * 1.2);
    const u = this.material.uniforms;
    u.uLookA.value = this.from;
    u.uLookB.value = this.to;
    u.uMix.value = this.blend;
  }

  dispose() {
    this.material.dispose();
  }
}
