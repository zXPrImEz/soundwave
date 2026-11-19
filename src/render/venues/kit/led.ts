import * as THREE from 'three';
import { COMMON, OUTPUT, shared } from '../../aurora/shared';

/**
 * LED screens. Their picture is drawn in the shader from the music (no video to load): a handful of
 * looks, each made for the beat, the bass and the show's colours, wiped from one to the next.
 * Up close the screen shows its diodes; from afar they blend into one picture. In a peak a screen
 * plays its drop looks; on top of every look the treble sparkles, the bar hits in a peak and
 * overdrive turns the colours round the wheel.
 */
export const LED_LOOKS = {
  /** Bars of lit segments that jump with the bass, middle and treble, a cap riding each. */
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
  /** One even field of light that breathes with the bar, a brighter band sweeping across it. */
  solid: 9,
  /** A mirrored spectrum: the bass in the middle, the treble out at the edges. */
  spectrum: 10,
  /** Blocks of colour hit on the beat, the whole screen every other beat. */
  strobe: 11,
  /** Segments lit one after another on the sixteenths, a comet's tail behind. */
  chase: 12,
  /** A new colour wiped across on every beat, a bright edge leading it. */
  wipe: 13,
  /** Stars streaking out from the middle, faster with the bass. */
  starfield: 14,
  /** A round tunnel twisting toward the viewer, rings on the beat, spokes with the treble. */
  vortex: 15,
  /** An oscilloscope: a trace of the bass, middle and treble over a faint grid. */
  scope: 16,
} as const;
export type LedLook = keyof typeof LED_LOOKS;

/** What a screen plays in a peak unless told otherwise: strips get the looks that read in a few rows. */
const STRIP_DROPS: LedLook[] = ['chase', 'spectrum', 'wipe', 'strobe'];
const SCREEN_DROPS: LedLook[] = ['spectrum', 'vortex', 'starfield', 'chase', 'strobe', 'scope', 'wipe'];

/** The look for a change on `bar` (any number, whole or not): the drop looks in a peak, else the screen's own. */
export function pickLook(looks: readonly LedLook[], drops: readonly LedLook[], bar: number, peak: boolean): LedLook {
  const list = peak && drops.length ? drops : looks;
  return list[Math.floor(Math.abs(bar)) % list.length];
}

const FRAGMENT = /* glsl */ `
${COMMON}
uniform vec2 uRes;
uniform float uLookA;
uniform float uLookB;
uniform float uMix;
uniform float uWipe;
uniform float uLevel;
uniform float uSeed;
uniform float uPeak;
uniform float uDrive;
varying vec2 vUv;
varying vec3 vWPos;

vec3 ramp(float x) { return x < 0.5 ? mix(uWash, uKey, x * 2.0) : mix(uKey, uAccent, x * 2.0 - 1.0); }
/** The show's colours in turn: key, accent, a lifted wash. */
vec3 pick(float i) {
  float k = mod(floor(i), 3.0);
  return k < 0.5 ? uKey : k < 1.5 ? uAccent : mix(uWash, uKey, 0.35) * 1.4;
}
/** The music across a spectrum, x from bass (0) to treble (1). */
float spec(float x) { return x < 0.5 ? mix(uLow, uMid, x * 2.0) : mix(uMid, uHigh, x * 2.0 - 1.0); }
/** A colour turned round the grey axis by a radians. */
vec3 hueTurn(vec3 c, float a) {
  vec3 k = vec3(0.57735);
  float ca = cos(a);
  return max(vec3(0.0), c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca));
}

vec3 look(float which, vec2 uv) {
  float t = uTime + uSeed * 13.0;
  vec2 c = uv - 0.5;
  c.x *= uRes.x / uRes.y;
  if (which < 0.5) {
    float cols = 24.0;
    float col = floor(uv.x * cols);
    float h = 0.06 + 0.94 * spec((col + 0.5) / cols) * (0.6 + 0.4 * vnoise(vec2(col * 1.7, t * 4.0))) * (0.8 + 0.3 * uPulse);
    float gap = step(0.14, fract(uv.x * cols));
    // Segments of diodes with a dark row between them, where the screen has the rows for it.
    float seg = uRes.y < 30.0 ? 1.0 : step(0.5, mod(floor(uv.y * uRes.y), 4.0));
    float cap = step(abs(uv.y - h - 0.03), 0.015 + 0.5 / uRes.y);
    return (ramp(uv.y * 1.1) * step(uv.y, h) * seg + uAccent * cap * 1.3) * gap;
  }
  if (which < 1.5) {
    // Frames the shape of the screen, rushing out of its middle.
    float d = max(abs(uv.x - 0.5), abs(uv.y - 0.5));
    float w = fract(log(d + 0.02) * 1.6 - uBeat * 0.5 - t * 0.3 * uLow);
    float edge = smoothstep(0.0, 0.08, w) * smoothstep(0.3, 0.12, w);
    return ramp(fract(d * 1.5 + uBeat * 0.125)) * edge * (0.5 + 0.5 * uLow + 0.7 * uPulse);
  }
  if (which < 2.5) {
    float f = fbm(c * 2.2 + vec2(t * 0.15, -t * 0.1));
    float g = fbm(c * 3.0 - f * 1.5 + t * 0.05 + uLow * 0.3);
    return ramp(g) * (0.45 + 0.9 * g) * (0.6 + 0.6 * uLow + 0.3 * uPulse);
  }
  if (which < 3.5) {
    vec2 cell = floor(uv * vec2(10.0, 6.0));
    float r = hash21(cell + floor(uBeat * (1.0 + uPeak)));
    float on = step(0.62 - 0.2 * uMid, r);
    return mix(uKey, uAccent, step(0.82, r)) * on * (0.4 + 1.4 * uPulse);
  }
  if (which < 4.5) {
    // The sun: banded toward its foot, sinking a little on each bar.
    vec2 s = c - vec2(0.0, 0.08);
    float sun = smoothstep(0.31, 0.3, length(s)) * step(0.0, s.y + 0.02);
    float band = step(0.5, fract((s.y + 0.3) * 18.0 - t * 0.6)) + step(0.12, s.y);
    vec3 col = mix(uKey, vec3(1.0, 0.75, 0.35), clamp(s.y * 3.0 + 0.4, 0.0, 1.0)) * sun * min(1.0, band) * (1.1 + 0.4 * uLow);
    // The grid below the horizon, running toward it.
    float y = -c.y + 0.02;
    if (y > 0.0) {
      float z = 0.25 / y;
      vec2 g = vec2(c.x * z, z + uBeat * 0.5);
      vec2 gl = abs(fract(g) - 0.5);
      float line = smoothstep(0.03 * z, 0.0, min(gl.x, gl.y)) * smoothstep(0.0, 0.25, y);
      col = uAccent * line * (0.5 + uPulse);
    }
    return col + uWash * 0.12 * smoothstep(0.5, -0.2, c.y);
  }
  if (which < 5.5) {
    float a = atan(c.y, c.x);
    float r = length(c);
    float seg = 6.2831853 / 8.0;
    a = abs(mod(a + t * 0.2 + uBeat * 0.1, seg) - seg * 0.5);
    vec2 p = vec2(cos(a), sin(a)) * r;
    float f = sin(p.x * 22.0 - uBeat * 3.14159) * sin(p.y * 18.0 + t);
    return ramp(fract(r * 1.4 - t * 0.1)) * smoothstep(0.0, 0.9, f) * (0.9 + 0.6 * uPulse);
  }
  if (which < 6.5) {
    float x = uv.x * 6.0 + uBeat * (mod(floor(uBeat / 4.0), 2.0) < 0.5 ? 1.0 : -1.0);
    return mix(uKey, uAccent, step(0.5, fract(x * 0.5))) * step(0.5, fract(x)) * (0.35 + 1.1 * uPulse);
  }
  if (which < 7.5) {
    float r = length(c);
    float w = fract(r * 4.0 - uBeat);
    return ramp(fract(r * 0.8 + t * 0.05)) * smoothstep(0.9, 1.0, w) * (1.0 + 0.8 * uLow) + uWash * 0.08;
  }
  if (which < 8.5) {
    vec2 g = uv - 0.5;
    float col = floor(g.x * 9.0 + 2.5);
    float inside = step(0.0, col) * step(col, 4.0) * step(0.22, fract(g.x * 9.0 + 2.5)) * step(fract(g.x * 9.0 + 2.5), 0.78);
    float h = (0.14 + 0.2 * hash11(col + 3.0 + uSeed)) * (0.75 + 0.5 * (mod(col, 2.0) < 0.5 ? uLow : uMid)) + 0.05 * uPulse;
    float bar = inside * smoothstep(h, h - 0.02, abs(g.y));
    return mix(uAccent, vec3(1.0), 0.2) * bar * (0.9 + 0.5 * uPulse);
  }
  if (which < 9.5) {
    float sweep = smoothstep(0.12, 0.0, abs(fract(uv.x - uBeat * 0.125) - 0.5));
    return mix(uKey, vec3(1.0), 0.12 + 0.3 * sweep) * (0.5 + 0.25 * uBarPulse + 0.45 * sweep + 0.3 * uPulse);
  }
  if (which < 10.5) {
    float hn = clamp(floor(uRes.x / 6.0), 6.0, 32.0);
    float x = abs(uv.x - 0.5) * 2.0;
    float col = floor(x * hn);
    float b = (col + 0.5) / hn;
    float lvl = spec(b) * (0.55 + 0.45 * vnoise(vec2(col * 3.1, t * 6.0))) * (0.7 + 0.5 * uPulse * (1.0 - b));
    float y = abs(uv.y - 0.5) * 2.0;
    float on = step(y, lvl) * step(0.2, fract(x * hn));
    return mix(uKey, uAccent, smoothstep(0.2, 1.0, y / max(lvl, 0.01))) * on * 1.1 + uWash * 0.05;
  }
  if (which < 11.5) {
    float id = floor(uBeat);
    float hit = exp(-fract(uBeat) * 7.0);
    vec2 blk = floor(uv * vec2(4.0, 2.0));
    // The whole screen every other beat, some blocks between: never three full flashes a second.
    float on = mod(id, 2.0) < 0.5 ? 1.0 : step(0.5, hash21(blk + id * 1.7)) * 0.6;
    return pick(id + step(0.5, hash21(blk + 3.1))) * on * hit * 1.2;
  }
  if (which < 12.5) {
    float n = clamp(floor(uRes.x / max(uRes.y, 1.0) * 2.5), 5.0, 20.0);
    float seg = floor(uv.x * n);
    // The lower half runs the other way on a screen tall enough for two lanes.
    float flip = mod(floor(uBeat / 4.0), 2.0) + (uRes.y > 20.0 && uv.y < 0.5 ? 1.0 : 0.0);
    float at = mod(flip, 2.0) < 0.5 ? seg : n - 1.0 - seg;
    float age = mod(uBeat * 4.0 - at, n);
    float gap = step(0.08, fract(uv.x * n)) * step(fract(uv.x * n), 0.92);
    return mix(pick(floor(uBeat)), uAccent, step(age, 1.0)) * exp(-age * 0.8) * gap * (0.8 + 0.6 * uPulse);
  }
  if (which < 13.5) {
    float id = floor(uBeat);
    float k = mod(id + uSeed, 4.0);
    float r = length(c) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);
    float x = k < 0.5 ? uv.x : k < 1.5 ? 1.0 - uv.y : k < 2.5 ? 1.0 - uv.x : r;
    float front = 1.0 - pow(1.0 - min(1.0, fract(uBeat) * 3.0), 3.0);
    vec3 col = mix(pick(id - 1.0), pick(id), step(x, front * 1.05)) * (0.3 + 0.4 * uLow);
    return col + pick(id) * smoothstep(0.06, 0.0, abs(x - front)) * 1.4 * (1.0 - front * 0.6);
  }
  if (which < 14.5) {
    float a = atan(c.y, c.x) / 6.2831853 + 0.5;
    float r = length(c);
    vec3 col = uWash * 0.25 * exp(-r * 5.0);
    for (int i = 0; i < 2; i++) {
      float n = i == 0 ? 97.0 : 61.0;
      float sect = floor(a * n);
      float h = hash11(sect + uSeed * 7.0 + float(i) * 31.0);
      float run = fract(h + t * (0.12 + 0.45 * uLow + 0.35 * uPeak) * (0.5 + h));
      float sr = run * run * 1.2;
      float len = 0.01 + (0.04 + 0.12 * uPulse) * run;
      float thin = step(abs(fract(a * n) - 0.5), 0.18);
      float star = step(r, sr) * smoothstep(sr - len, sr, r) * thin;
      col += pick(sect + float(i)) * star * (0.4 + 1.2 * run);
    }
    return col;
  }
  if (which < 15.5) {
    float r = length(c) + 0.001;
    float a = atan(c.y, c.x) / 6.2831853;
    float z = 0.3 / r + t * (0.4 + 1.4 * uLow) + uBeat * 0.25;
    float rings = pow(0.5 + 0.5 * cos(z * 6.2831853), 6.0);
    float spokes = pow(0.5 + 0.5 * cos((a * 10.0 + z * 0.6 + t * 0.2) * 6.2831853), 8.0);
    vec3 col = ramp(fract(z * 0.25)) * (rings * (0.7 + 0.9 * uPulse) + spokes * (0.2 + 1.0 * uHigh));
    return col * smoothstep(0.02, 0.2, r);
  }
  // The scope: two traces, the bass slow and wide, the middle and treble riding it.
  float y = (uv.y - 0.5) * 2.0;
  float th = 2.0 / uRes.y + 0.03 * uLow;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float k = float(i);
    float w = sin(uv.x * 6.2831853 * (2.0 + k) + t * (2.0 - k * 3.5)) * (0.15 + 0.5 * uLow);
    w += sin(uv.x * 6.2831853 * 7.0 - t * 5.0 + k) * 0.25 * uMid;
    w += (vnoise(vec2(uv.x * 60.0 + k * 9.0, t * 12.0)) - 0.5) * 0.6 * uHigh;
    w *= (0.6 + 0.6 * uPulse) * (1.0 - k * 0.4);
    float d = abs(y - w);
    col += (k < 0.5 ? uAccent : uKey) * (smoothstep(th * 2.0, th * 0.5, d) * 1.2 + exp(-d * 9.0) * 0.2);
  }
  vec2 gg = abs(fract(vec2(uv.x * 16.0, y * 2.0)) - 0.5);
  return col + uWash * step(0.44, max(gg.x, gg.y)) * 0.08;
}

void main() {
  vec2 px = vUv * uRes;
  vec2 cell = floor(px) + 0.5;
  vec2 uv = cell / uRes;
  vec3 col;
  if (uMix >= 1.0) col = look(uLookB, uv);
  else {
    // The new look wipes in (across, up, back or out of the middle), a bright edge leading it.
    float k = mod(uWipe, 4.0);
    vec2 c = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float x = k < 0.5 ? uv.x : k < 1.5 ? uv.y : k < 2.5 ? 1.0 - uv.x : length(c) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);
    float front = uMix * 1.2 - 0.1;
    col = mix(look(uLookA, uv), look(uLookB, uv), smoothstep(front + 0.03, front - 0.03, x));
    col += mix(uAccent, uKey, 0.5) * smoothstep(0.05, 0.0, abs(x - front)) * 0.9;
  }
  // The treble: single diodes sparkling with the hats.
  float spark = hash21(cell + floor(uTime * 24.0) * 7.31);
  col += ramp(hash21(cell * 1.37)) * step(1.0 - 0.03 * uHigh * uHigh * (1.0 + uPeak), spark);
  // The bar in a peak hits the whole screen with colour.
  col += mix(uAccent, uKey, step(0.5, mod(floor(uBeat / 4.0), 2.0))) * uBarPulse * uPeak * 0.3;
  // Overdrive turns the colours round the wheel, a step on every beat.
  col = mix(col, hueTurn(col, floor(uBeat) * 1.2566 + fract(uBeat) * 0.3), uDrive);
  // Keep the colour: the brightest channel stays under a ceiling, so a hot look holds its hue
  // instead of going white; a little is taken off the bottom so the blacks stay black.
  col *= 1.1 / max(1.1, max(col.r, max(col.g, col.b)));
  col = max(col - 0.012, 0.0);
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

/**
 * An LED screen's material; `res` is how many diodes it has across and up, `drops` what it plays
 * in a peak (by its shape if not given).
 */
export class LedScreen {
  readonly material: THREE.ShaderMaterial;
  private from: number;
  private to: number;
  private blend = 1;
  private wipes = 0;
  private readonly drops: readonly LedLook[];

  constructor(
    res: [number, number],
    private readonly looks: LedLook[],
    level = 2.2,
    private readonly seed = 0,
    drops?: LedLook[],
  ) {
    this.drops = drops ?? (res[1] < 24 ? STRIP_DROPS : SCREEN_DROPS);
    this.from = LED_LOOKS[looks[0]];
    this.to = this.from;
    this.material = new THREE.ShaderMaterial({
      name: 'led',
      uniforms: {
        ...shared,
        uRes: { value: new THREE.Vector2(...res) },
        uLookA: { value: this.from },
        uLookB: { value: this.to },
        uMix: { value: 1 },
        uWipe: { value: 0 },
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

  /** Moves to the next look (on a bar, say), a drop look in a peak; it wipes in over half a second. */
  next(bar: number) {
    this.from = this.to;
    // Callers pass bar counts divided by their cycle, often fractional on off bars.
    this.to = LED_LOOKS[pickLook(this.looks, this.drops, bar, shared.uPeak.value > 0.5)];
    this.blend = 0;
    this.wipes++;
  }

  set level(v: number) {
    this.material.uniforms.uLevel.value = v;
  }

  update(dt: number) {
    this.blend = Math.min(1, this.blend + dt * 1.8);
    const u = this.material.uniforms;
    u.uLookA.value = this.from;
    u.uLookB.value = this.to;
    u.uMix.value = this.blend;
    u.uWipe.value = (this.wipes + this.seed) % 4;
  }

  dispose() {
    this.material.dispose();
  }
}
