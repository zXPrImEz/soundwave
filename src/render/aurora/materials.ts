import * as THREE from 'three';
import { COMMON, OUTPUT, STATIC_VERTEX, shared } from './shared';

/** The deck's outline, for the lines of light drawn on it (three.js coordinates). */
export interface DeckInfo {
  center: [number, number, number];
  a: number;
  b: number;
  power: number;
  height: number;
  barrier: number;
}

/**
 * Painted forms: a three-stop gradient along the form that partly glows by itself, lit by the sky,
 * the moon screen and the wash, with a coloured rim, a sheen of sky and glitter that stays a few
 * pixels wide at any distance.
 */
const PAINT_FRAGMENT = /* glsl */ `
${COMMON}
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uRim;
uniform float uGlitter; uniform float uGlow; uniform float uPanels; uniform float uVeins;
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;

float glitterLayer(vec3 p, vec3 n, vec3 v) {
  vec3 id = floor(p);
  float r = hash31(id);
  if (r > 0.5) return 0.0;
  vec3 facet = normalize(hash33(id + 7.0) - 0.5);
  float flash = pow(max(0.0, dot(normalize(n + facet * 0.85), normalize(v + vec3(0.0, 0.3, 0.0)))), 22.0);
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + r * 30.0) + r * 90.0);
  return flash * twinkle * smoothstep(0.34, 0.04, length(fract(p) - 0.5));
}
float glitter(vec3 wpos, vec3 n, vec3 v, float dist) {
  float lod = log2(max(1.0, dist / 5.0));
  float l0 = floor(lod);
  float s = 52.0 * exp2(-l0);
  return mix(glitterLayer(wpos * s, n, v), glitterLayer(wpos * s * 0.5, n, v), lod - l0);
}

void main() {
  vec3 n = normalize(vWNorm);
  vec3 toCam = cameraPosition - vWPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  if (dot(n, v) < 0.0) n = -n;
  float ndv = max(0.0, dot(n, v));
  float g = clamp(vUv.x + 0.035 * sin(vUv.y * 12.566 + vUv.x * 9.0 + uTime * 0.35), 0.0, 1.0);
  vec3 base = g < 0.55 ? mix(uA, uB, smoothstep(0.0, 0.55, g)) : mix(uB, uC, smoothstep(0.55, 1.0, g));
  float ao = mix(0.28, 1.0, vAo);
  // Panel seams across the form, and an inset face framed by piping along both rims, give the
  // big surfaces scale and a second tone.
  float su = vUv.x * 16.0;
  float seam = 1.0 - smoothstep(0.0, fwidth(su) * 1.5 + 0.012, abs(fract(su) - 0.5) * 2.0 - 0.0);
  float vv = abs(fract(vUv.y * 2.0) - 0.5);
  float aa = fwidth(vv) * 1.5 + 0.004;
  float face = 1.0 - smoothstep(0.34 - aa, 0.34 + aa, vv);
  float pipe = 1.0 - smoothstep(0.012, 0.012 + aa, abs(vv - 0.34));
  base *= mix(1.18, 0.8, face) * (1.0 - 0.3 * seam * face * (1.0 - uPanels));
  if (uPanels > 0.5) {
    // Triangulated cladding on the shell: every panel a touch lighter or darker, fine joints between.
    vec2 pp = vec2(atan(vWPos.y, abs(vWPos.x) + 1e-3) * 13.0, vWPos.z * 0.42);
    vec2 sk = vec2(pp.x + pp.y * 0.5, pp.y);
    vec2 cell = floor(sk);
    vec2 f = fract(sk);
    float upper = step(1.0, f.x + f.y);
    vec2 g = mix(f, 1.0 - f, upper);
    float edge = min(min(g.x, g.y), abs(f.x + f.y - 1.0) * 0.7071);
    float joint = smoothstep(0.0, (fwidth(sk.x) + fwidth(sk.y)) * 1.2 + 0.02, edge);
    base *= (0.82 + 0.34 * hash21(cell + upper * 37.0)) * mix(0.55, 1.0, joint * face + (1.0 - face));
  }
  if (uVeins > 0.5) {
    // Ribs running the length of a crest, like the veins of a leaf.
    float rib = abs(fract(vv * 9.0) - 0.5);
    base *= 1.0 + 0.22 * face * (1.0 - smoothstep(0.03, 0.03 + fwidth(vv * 9.0) * 1.5, rib));
  }

  vec3 toGlow = uGlowPos - vWPos;
  float gd = length(toGlow);
  float moonLit = (max(0.0, dot(n, toGlow / gd)) * 0.75 + 0.25) / (1.0 + gd * gd * 0.0022);
  vec3 moonCol = mix(uKey, vec3(1.0), 0.55) * uScreenLevel;
  float up = n.y * 0.5 + 0.5;
  vec3 light = mix(uWash * 0.42, vec3(0.085, 0.145, 0.4), up) + moonCol * min(0.5, moonLit) * 0.8;
  // Under the shell the forms are held back, so the band stands out against them.
  float inside = 1.0 - 0.4 * smoothstep(-2.0, -17.0, vWPos.z) * smoothstep(34.0, 22.0, abs(vWPos.x));
  vec3 col = base * light * ao * inside;
  col += base * uGlow * mix(0.55, 1.0, ao) * (0.5 + 0.22 * uBarPulse + 0.1 * uLow) * inside;

  float fres = pow(max(0.0, 1.0 - ndv), 3.0);
  col += uRim * fres * (0.22 + 0.26 * uEnergy) * ao;
  col += uRim * pipe * (0.2 + 0.3 * (0.5 + 0.5 * sin(vUv.x * 14.0 - uTime * 1.6)) + 0.22 * uPulse) * mix(0.5, 1.0, ao);
  col += skyGradient(reflect(-v, n)) * (0.04 + fres) * 1.6;
  #ifdef GLITTER
    col += mix(uC, vec3(1.0), 0.5) * glitter(vWPos, n, v, dist) * uGlitter * 3.0 * mix(0.4, 1.0, ao) * (0.8 + 0.7 * uHigh);
  #endif

  gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
  ${OUTPUT}
}`;

const DECK_FRAGMENT = /* glsl */ `
${COMMON}
uniform vec3 uDeckC; uniform vec3 uDeckShape;
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;
void main() {
  vec3 n = normalize(vWNorm);
  vec3 v = normalize(cameraPosition - vWPos);
  float ndv = max(0.0, dot(n, v));
  vec3 col = vec3(0.006, 0.008, 0.022);
  float fres = 0.05 + 0.95 * pow(max(0.0, 1.0 - ndv), 4.0);
  if (n.y > 0.7) {
    // Rings of light spreading from the band's island, running outward with the music.
    float rr = length((vWPos.xz - uIsland.xy) / uIsland.zw) * 2.0;
    float ring = abs(fract(rr - uBeat * 0.25) - 0.5);
    float w = fwidth(rr) + 0.012;
    col += mix(uAccent, uKey, 0.5 + 0.5 * sin(rr * 4.0)) * smoothstep(w, 0.0, ring - 0.006) * (0.26 + 0.36 * uPulse);
    // A pool of light under each player, strongest under the part being played.
    for (int i = 0; i < 4; i++) {
      vec2 q = vWPos.xz - uBand[i].xz;
      float near = step(abs(vWPos.y - uBand[i].y), 0.4);
      col += mix(vec3(1.0, 0.92, 0.84), uKey, 0.3) * exp(-dot(q, q) / 2.6) * near * (0.05 + 0.2 * uFeature[i]);
    }
    // A polished floor: it mirrors the moon and the sky.
    vec3 r = reflect(-v, n);
    if (r.z < -1e-3) {
      float t = (uMoon.z - vWPos.z) / r.z;
      vec3 hit = vWPos + r * t;
      vec2 q = (hit.xy - uMoon.xy) / (2.0 * uMoon.w) + 0.5;
      col += moonContent(q) * onScreen(hit.xy) * fres * 0.46;
    }
    col += skyGradient(r) * fres;
    col += uWash * 0.05;
    // the flame jets, while they burn
    col += vec3(1.0, 0.5, 0.18) * uFire * (0.04 + 0.5 * fres);
  } else {
    // Risers: lit softly from the crowd side.
    col += uWash * 0.07 * max(0.0, n.z) + skyGradient(reflect(-v, n)) * fres * 0.6;
  }
  gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
  ${OUTPUT}
}`;

/**
 * A player's podium: a display all over. The lid shows a record turning once every four beats:
 * grooves that catch the light in two bright wedges, the gaps between tracks, and a label in the
 * show's colours whose markings show the turning. The wall shows the sound as a waveform: bars
 * standing both ways from a middle line, taller where the music is louder (bass toward the
 * audience, treble at the back). It is a picture: it glows by itself, on a grid of lamps, and
 * mirrors nothing but a little sky on its glass.
 */
export const PODIUM_FRAGMENT = /* glsl */ `
${COMMON}
uniform float uWho; uniform vec2 uRadii; uniform float uFloor;
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;
void main() {
  int who = int(uWho + 0.5);
  vec3 c = uBand[who];
  float feature = uFeature[who];
  vec3 n = normalize(vWNorm);
  vec3 v = normalize(cameraPosition - vWPos);
  float fres = 0.05 + 0.95 * pow(max(0.0, 1.0 - max(0.0, dot(n, v))), 4.0);
  float t = uTime;
  float level = 0.55 + 0.25 * feature + 0.3 * uLow + 0.25 * uPulse;
  vec3 pic;
  vec2 cells;
  if (vUv.y < -0.5) {
    // The lid: a record.
    vec2 q = (vWPos.xz - c.xz) / uRadii;
    float r = length(q);
    float a = atan(q.y, q.x);
    float spin = uBeat * 1.5707963 + uWho * 1.3;
    float ang = a + spin;
    // pressed a hair off centre, so the grooves sway as it turns
    float rr = r + 0.006 * sin(ang);
    float lines = rr * 250.0;
    float groove = mix(0.75, 0.5 + 0.5 * sin(lines), smoothstep(2.4, 0.8, fwidth(lines)));
    float gaps = smoothstep(0.012, 0.004, abs(rr - 0.47)) + smoothstep(0.012, 0.004, abs(rr - 0.63)) + smoothstep(0.012, 0.004, abs(rr - 0.8));
    // the light lies on the grooves in two wedges that stay put while the record turns under them
    float wedge = pow(abs(cos(a - 0.6)), 14.0) + 0.5 * pow(abs(cos(a + 1.1)), 30.0);
    vec3 disc = vec3(0.012, 0.014, 0.03) + mix(uWash, uAccent, 0.5) * wedge * (0.2 + 0.55 * groove) * (0.55 + 0.7 * uLow + 0.4 * uPulse);
    // the music in the grooves: stretches of them shimmer as they pass
    disc += uKey * 0.06 * (0.5 + 0.5 * sin(ang * 24.0 + rr * 40.0)) * groove * (0.3 + 1.2 * uMid);
    disc *= (1.0 - 0.7 * min(1.0, gaps)) * step(rr, 0.965);
    // the label
    vec3 label = mix(uKey, uWash, step(0.5, fract(ang / 6.2831853 * 3.0))) * 0.55;
    label = mix(label, uAccent * 0.8, smoothstep(0.012, 0.004, abs(rr - 0.21)));
    label = mix(label, vec3(0.9), smoothstep(0.04, 0.028, length(q - 0.12 * vec2(cos(0.8 - spin), sin(0.8 - spin)))));
    label = mix(label, vec3(0.01), smoothstep(0.035, 0.025, r));
    pic = mix(disc, label * level, step(rr, 0.31));
    pic += uAccent * smoothstep(0.9, 0.99, r) * (0.18 + 0.4 * uPulse);
    cells = vWPos.xz / 0.055;
  } else {
    // The wall, as much of it as stands above the island: the sound as a waveform.
    float height = max(0.05, c.y - uFloor);
    float up = vWPos.y - uFloor;
    float cols = floor(max(uRadii.x, uRadii.y) * 26.0) * 2.0;
    float u = vUv.x * cols;
    float ang = (floor(u) + 0.5) / cols * 6.2831853;
    float across = abs(fract(vUv.x + 0.75) - 0.5) * 2.0;
    float sound = mix(mix(uLow, uMid, smoothstep(0.0, 0.5, across)), uHigh, smoothstep(0.5, 1.0, across));
    float wave = 0.5 * sin(ang * 3.0 + t * 2.1) + 0.3 * sin(ang * 7.0 - t * 3.7) + 0.2 * sin(ang * 13.0 + t * 6.3);
    float reach = (0.1 + 0.9 * clamp(0.25 + 1.3 * sound + 0.3 * uPulse, 0.0, 1.0)) * (0.3 + 0.7 * abs(wave));
    float d = abs(up - height * 0.5) / (height * 0.46);
    float on = step(d, reach);
    float tip = on * step(reach - 0.14, d);
    float bar = smoothstep(0.5, 0.3, abs(fract(u) - 0.5));
    vec3 tint = mix(mix(uKey, uWash, clamp(d, 0.0, 1.0)), mix(uAccent, vec3(1.0), 0.3), tip);
    pic = tint * bar * (on * (0.5 + 0.3 * feature + 0.35 * tip) + 0.02);
    pic += uAccent * 0.3 * smoothstep(0.014, 0.0, abs(up - height * 0.5));
    cells = vec2(u * 2.0, up / 0.045);
  }
  // The lamps the picture is made of show up close and melt together with distance.
  vec2 lamp = abs(fract(cells) - 0.5);
  float lit = smoothstep(0.5, 0.38, max(lamp.x, lamp.y));
  pic *= mix(0.55 + 0.6 * lit, 1.0, clamp(max(fwidth(cells.x), fwidth(cells.y)) * 1.6, 0.0, 1.0));
  vec3 col = vec3(0.004, 0.006, 0.02) + pic * 0.66 + skyGradient(reflect(-v, n)) * fres * 0.5;
  gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
  ${OUTPUT}
}`;

/**
 * The land: a festival field at night. Grass in tussocks, mown in rings around the stage and trodden
 * down to damp earth where the audience is packed; every person shades the ground they stand on;
 * the stage throws its colours across it and the moon lights the rest. Detail too fine for the
 * distance fades out instead of shimmering.
 */
const GROUND_FRAGMENT = /* glsl */ `
${COMMON}
uniform sampler2D uCrowdMap; uniform vec4 uCrowdRect;
uniform vec3 uDeckC; uniform vec3 uDeckShape;
uniform float uWaterLevel;
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;

/** Height of the surface: tussocks of grass, clods and footprints where it is worn to earth. */
float relief(vec2 p, float worn, float fine) {
  float tuft = vnoise(p * 1.9) * 0.6 + vnoise(p * 5.3 + 7.7) * 0.4 * fine;
  float clod = vnoise(p * 3.1 + 3.3) * 0.45 + vnoise(p * 9.7) * 0.3 * fine;
  return mix(tuft, clod, worn);
}

void main() {
  vec3 toCam = cameraPosition - vWPos;
  vec3 v = normalize(toCam);
  vec2 p = vWPos.xz;
  // How much ground one pixel covers, in metres.
  float px = max(length(dFdx(p)), length(dFdy(p)));
  float mid = smoothstep(1.2, 0.25, px);
  float fine = smoothstep(0.16, 0.04, px);
  float close = smoothstep(0.05, 0.015, px);

  vec2 crowd = texture2D(uCrowdMap, (p - uCrowdRect.xy) * uCrowdRect.zw).rg;
  float shade = crowd.r;
  float packed = min(1.0, crowd.g);

  // Distance from the edge of the stage's deck, in metres (roughly), and the pit in front of it.
  vec2 dd = abs(p - uDeckC.xz) / uDeckShape.xy;
  float front = (pow(pow(dd.x, uDeckShape.z) + pow(dd.y, uDeckShape.z), 1.0 / uDeckShape.z) - 1.0) * uDeckShape.y;
  float pit = smoothstep(16.0, 3.0, front);

  float patchy = fbm(p * 0.045);
  float worn = smoothstep(0.42, 0.8, packed * 0.72 + pit * 0.3 + (patchy - 0.5) * 0.75 + (vnoise(p * 0.85) - 0.5) * 0.3 * mid);

  // Grass: two greens in broad patches, lighter and darker rings where the mower went round.
  vec3 grass = mix(vec3(0.02, 0.048, 0.038), vec3(0.045, 0.085, 0.04), vnoise(p * 0.07));
  float ring = sin(length(p - uDeckC.xz) * 1.05 + (patchy - 0.5) * 2.0);
  grass *= 1.0 + 0.1 * clamp(ring * 2.5, -1.0, 1.0) * smoothstep(2.4, 0.8, px);
  grass *= mix(1.0, 0.76 + 0.48 * vnoise(p * 1.7 + 2.0), mid);
  float blades = vnoise(vec2(p.x * 19.0 + p.y * 4.0, p.y * 6.0 - p.x * 1.5)) * 0.5 + vnoise(vec2(p.y * 17.0 - p.x * 5.0, p.x * 5.0 + p.y * 1.5) + 8.3) * 0.5;
  grass *= mix(1.0, 0.5 + blades, close);

  // Earth: brown, with paler dry patches, stones and the straw of what grew there.
  vec3 earth = mix(vec3(0.046, 0.038, 0.034), vec3(0.088, 0.07, 0.054), vnoise(p * 0.55 + 5.0));
  earth *= mix(1.0, 0.7 + 0.6 * vnoise(p * 6.5 + 1.0), fine);
  float straw = smoothstep(0.72, 0.9, vnoise(vec2(p.x * 23.0 - p.y * 7.0, p.y * 5.0 + p.x * 2.0) + 4.1)) * close;
  earth = mix(earth, vec3(0.13, 0.115, 0.06), straw * 0.6);
  vec3 albedo = mix(grass, earth, worn);
  // Where the land goes down to the lake it is wet sand, then the lake's floor.
  albedo = mix(albedo, vec3(0.03, 0.028, 0.026), smoothstep(0.4, 0.05, vWPos.y - uWaterLevel));

  // The lie of the surface.
  float e = 0.07;
  float h0 = relief(p, worn, fine);
  vec2 slope = vec2(relief(p + vec2(e, 0.0), worn, fine) - h0, relief(p + vec2(0.0, e), worn, fine) - h0) / e;
  vec3 n = normalize(normalize(vWNorm) + vec3(-slope.x, 0.0, -slope.y) * 0.06 * mid);

  // Night sky and moon.
  vec3 light = vec3(0.3, 0.42, 0.85) * (0.36 + 0.16 * n.y) + uMoonCol * max(0.0, dot(n, uMoonDir)) * 1.6;
  // The stage: its colours fall across the field from the arches, weaker with distance and where
  // the crowd stands in the way.
  vec3 toStage = vec3(uGlowPos.x, 21.0, uGlowPos.z + 12.0) - vWPos;
  float sd = length(toStage);
  vec3 l = toStage / sd;
  vec3 show = (mix(uKey, vec3(1.0), 0.3) * 0.7 + uWash * 0.3) * uScreenLevel;
  float reach = (1.0 - 0.35 * packed) / (1.0 + sd * sd * 0.0008);
  light += (show + vec3(1.0, 0.5, 0.18) * uFire * 1.4) * max(0.0, dot(n, l)) * 7.0 * reach;
  // And the pools the rig lays on the field, which come from overhead.
  light += fieldPools(p) * (0.5 + 0.5 * n.y) * 0.9;
  vec3 col = albedo * light;

  // Confetti left from the cannons, thickest toward the stage.
  vec2 cell = floor(p * 15.0);
  float pick = hash21(cell);
  float strewn = smoothstep(70.0, 6.0, front) * step(0.0, front);
  vec2 q = fract(p * 15.0) - 0.5 - (vec2(hash21(cell + 3.1), hash21(cell + 7.9)) - 0.5) * 0.4;
  float turn = pick * 91.0;
  q = vec2(q.x * cos(turn) - q.y * sin(turn), q.x * sin(turn) + q.y * cos(turn));
  float paper = step(1.0 - 0.022 * strewn, pick) * step(abs(q.x), 0.26) * step(abs(q.y), 0.13) * close;
  vec3 tint = mix(0.5 + 0.5 * cos(6.2831853 * (hash21(cell + 13.7) + vec3(0.0, 0.33, 0.67))), vec3(1.0), 0.35);
  col = mix(col, tint * 0.22 * light, paper);

  // Damp, trodden ground gives the stage and the moon back as a dull sheen.
  float gloss = mix(0.2, 1.0, worn) * (0.6 + 0.4 * vnoise(p * 2.3 + 6.0));
  float sheen = pow(max(0.0, dot(n, normalize(l + v))), mix(18.0, 46.0, worn));
  col += show * sheen * gloss * 0.2 * reach;
  col += uMoonCol * pow(max(0.0, dot(n, normalize(uMoonDir + v))), 40.0) * gloss * 0.03;

  // People keep the light off the ground they stand on; so does the stage along its foot.
  col *= (1.0 - 0.82 * shade) * (1.0 - 0.12 * packed);
  col *= 0.35 + 0.65 * smoothstep(-0.2, 2.6, front);
  gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
  ${OUTPUT}
}`;

/**
 * The lake: dark water with a moving surface. It mirrors the sky, lays the moon down as a path of
 * glitter, streaks the far shore's lights toward the viewer and flashes with every firework.
 */
const WATER_FRAGMENT = /* glsl */ `
${COMMON}
uniform sampler2D uMirrorMap; uniform mat4 uMirrorMatrix; uniform float uMirrorOn;
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;
void main() {
  vec3 toCam = cameraPosition - vWPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  vec2 p = vWPos.xz;
  float t = uTime;
  vec2 big = vec2(vnoise(p * 0.11 + vec2(t * 0.05, t * 0.02)), vnoise(p * 0.11 + vec2(-t * 0.03, t * 0.045) + 31.7)) - 0.5;
  vec2 small = vec2(vnoise(p * 0.7 + t * 0.22), vnoise(p * 0.7 - t * 0.19 + 11.1)) - 0.5;
  // Ripples flatten into one sheen far away, where they would only shimmer.
  vec2 g = big * 0.3 + small * 0.2 / (1.0 + dist * 0.01);
  vec3 n = normalize(vec3(g.x, 1.0, g.y));
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  float fres = 0.03 + 0.97 * pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 5.0);
  vec3 above = skyGradient(r) * 1.4;
  if (uMirrorOn > 0.5) {
    // The stage, the sky and everything else that stands over the water, seen in it: looked up in
    // the picture taken from below the surface, at a point the ripples push about.
    vec4 at = uMirrorMatrix * vec4(vWPos + vec3(g.x, 0.0, g.y) * (2.5 + dist * 0.05), 1.0);
    above = texture2D(uMirrorMap, clamp(at.xy / max(at.w, 1e-3), 0.001, 0.999)).rgb * 0.9;
  }
  vec3 col = vec3(0.002, 0.005, 0.016) + above * fres;
  // Near the stage the water takes up the colours of the show.
  float fromStage = distance(vWPos.xz, uGlowPos.xz + vec2(0.0, 14.0));
  col += mix(uWash, uKey, 0.4) * uScreenLevel * 0.05 / (1.0 + fromStage * fromStage * 0.0005);
  float toMoon = max(0.0, dot(r, uMoonDir));
  col += uMoonCol * (pow(toMoon, 420.0) * 2.6 + pow(toMoon, 60.0) * 0.3);
  for (int i = 0; i < 8; i++) {
    vec3 l = uShore[i] - vWPos;
    float d = length(l);
    col += uShoreCol[i] * pow(max(0.0, dot(r, l / d)), 900.0) * 3.2;
  }
  vec3 b = uBurst.xyz - vWPos;
  col += mix(uKey, vec3(1.0), 0.5) * pow(max(0.0, dot(r, normalize(b))), 60.0) * uBurst.w * 1.2;
  gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
  ${OUTPUT}
}`;

/** Steady lamps: stalls, strings, the campsite, the far shore. They glow through the haze. */
const LAMP_FRAGMENT = /* glsl */ `
${COMMON}
uniform vec3 uTint; uniform float uTwinkle;
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;
void main() {
  float h = hash31(floor(vWPos * 0.9));
  float twinkle = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (1.2 + h * 3.0) + h * 60.0));
  vec3 col = uTint * 1.5 * twinkle;
  gl_FragColor = vec4(mix(col, applyHaze(col, vWPos), 0.55), 1.0);
  ${OUTPUT}
}`;

/** Cloth lit from inside: stalls, the arch, flags, the wheel's cabins. */
const CANVAS_FRAGMENT = /* glsl */ `
${COMMON}
uniform vec3 uTint;
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;
void main() {
  vec3 n = normalize(vWNorm);
  vec3 v = normalize(cameraPosition - vWPos);
  if (dot(n, v) < 0.0) n = -n;
  vec3 col = uTint * (0.34 + 0.16 * n.y) + uTint * uMoonCol * max(0.0, dot(n, uMoonDir)) * 0.3;
  gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
  ${OUTPUT}
}`;

/** Trees: dark shapes against the sky, edged by the moon. */
const FOLIAGE_FRAGMENT = /* glsl */ `
${COMMON}
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;
void main() {
  vec3 n = normalize(vWNorm);
  vec3 base = vec3(0.01, 0.026, 0.022) * (0.7 + 0.6 * hash31(floor(vWPos * 0.25)));
  vec3 col = base * (vec3(0.3, 0.42, 0.85) * (0.5 + 0.3 * n.y) + uMoonCol * max(0.0, dot(n, uMoonDir)) * 2.2);
  gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
  ${OUTPUT}
}`;

/**
 * Stage equipment (trusses, cabinets, fixtures) and its grilles: satin black that still takes the
 * stage's light and a highlight, so the shapes read instead of sinking into silhouettes. Grilles
 * are perforated metal, with holes that melt into an even tone with distance.
 */
const GEAR_FRAGMENT = /* glsl */ `
${COMMON}
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;
void main() {
  vec3 n = normalize(vWNorm);
  vec3 v = normalize(cameraPosition - vWPos);
  if (dot(n, v) < 0.0) n = -n;
  vec3 base = vec3(0.058, 0.06, 0.07);
  float gloss = 0.45;
  #ifdef GRILLE
    vec3 an = abs(n);
    vec2 p = an.y > 0.75 ? vWPos.xz : (an.x > an.z ? vWPos.zy : vWPos.xy);
    vec2 g = p * 52.0;
    g.x += 0.5 * floor(g.y);
    float hole = smoothstep(0.36, 0.26, length(fract(g) - 0.5));
    float far = clamp(max(fwidth(g.x), fwidth(g.y)) * 1.3, 0.0, 1.0);
    base = vec3(0.14, 0.145, 0.165) * mix(1.0 - 0.8 * hole, 0.6, far);
    gloss = 0.6;
  #endif
  vec3 toGlow = uGlowPos - vWPos;
  float gd = length(toGlow);
  toGlow /= gd;
  float stage = 1.0 / (1.0 + gd * gd * 0.0008);
  vec3 stageCol = mix(uKey, vec3(1.0), 0.4) * uScreenLevel;
  vec3 light = vec3(0.05, 0.07, 0.16) * (0.55 + 0.45 * n.y) + stageCol * (max(0.0, dot(n, toGlow)) * 0.7 + 0.3) * stage * 1.5 + uWash * 0.3 * stage;
  vec3 col = base * light;
  float fres = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 3.0);
  col += stageCol * pow(max(0.0, dot(n, normalize(toGlow + v))), 36.0) * gloss * stage * 0.5;
  col += (uWash * 0.2 + skyGradient(reflect(-v, n))) * fres * gloss;
  gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
  ${OUTPUT}
}`;

const LED_FRAGMENT = /* glsl */ `
${COMMON}
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;
void main() {
  float run = 0.5 + 0.5 * sin(vUv.x * 60.0 - uTime * 2.5 - vWPos.y * 0.3);
  vec3 col = mix(uKey, uAccent, run) * (0.8 + 0.7 * uPulse + 0.35 * uEnergy);
  // The rings round the podiums and the band's island sit right beside the players: held well back.
  float byBand = step(length((vWPos.xz - uIsland.xy) / uIsland.zw), 1.08) * step(vWPos.y, 6.0);
  col *= mix(1.0, 0.42, byBand);
  gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
  ${OUTPUT}
}`;

const LENS_FRAGMENT = /* glsl */ `
${COMMON}
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;
void main() {
  gl_FragColor = vec4(mix(uKey, vec3(1.0), 0.5) * (1.1 + 0.9 * uEnergy), 1.0);
  ${OUTPUT}
}`;

const SCREEN_FRAGMENT = /* glsl */ `
${COMMON}
uniform float uCells;
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;
void main() {
  #ifdef MOON
    vec3 col = moonContent(vUv) * 0.46;
    vec2 cells = vUv * uCells;
  #else
    vec3 col = wingContent(vUv) * 1.0;
    vec2 cells = vUv * vec2(uCells * 5.0, uCells);
  #endif
  // The LED grid shows up close and melts away with distance.
  vec2 gcell = abs(fract(cells) - 0.5);
  float grid = smoothstep(0.5, 0.38, max(gcell.x, gcell.y));
  float soft = clamp(max(fwidth(cells.x), fwidth(cells.y)) * 1.6, 0.0, 1.0);
  col *= mix(0.55 + 0.6 * grid, 1.0, soft);
  gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
  ${OUTPUT}
}`;

const FRAGMENTS: Record<string, string> = {
  paint: PAINT_FRAGMENT,
  deck: DECK_FRAGMENT,
  podium: PODIUM_FRAGMENT,
  ground: GROUND_FRAGMENT,
  black: GEAR_FRAGMENT,
  grille: GEAR_FRAGMENT,
  led: LED_FRAGMENT,
  lens: LENS_FRAGMENT,
  water: WATER_FRAGMENT,
  lamp: LAMP_FRAGMENT,
  canvas: CANVAS_FRAGMENT,
  foliage: FOLIAGE_FRAGMENT,
  screen: SCREEN_FRAGMENT,
};

/**
 * Swaps the exported placeholder materials for the venue's shaders, by the role and colours the
 * Blender build stored on each material (`glitter` off spares the sparkle on light settings).
 * Returns everything that needs disposing.
 */
export function applyVenueMaterials(root: THREE.Object3D, deck: DeckInfo, glitter = true): THREE.Material[] {
  const made: THREE.Material[] = [];
  const byName = new Map<string, THREE.ShaderMaterial>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.Material;
    const info = src.userData as {
      kind?: string;
      a?: string;
      b?: string;
      c?: string;
      rim?: string;
      glitter?: number;
      glow?: number;
      panels?: number;
      veins?: number;
      tint?: string;
      twinkle?: number;
      who?: number;
      rx?: number;
      ry?: number;
      floor?: number;
    };
    const kind = info.kind && FRAGMENTS[info.kind] ? info.kind : 'black';
    const moon = kind === 'screen' && /Moon/.test(mesh.name);
    const key = kind === 'screen' ? `screen-${moon}` : src.name;
    let mat = byName.get(key);
    if (!mat) {
      const uniforms: Record<string, THREE.IUniform> = { ...shared };
      if (kind === 'paint') {
        uniforms.uA = { value: new THREE.Color(info.a ?? '#101060') };
        uniforms.uB = { value: new THREE.Color(info.b ?? '#3050e0') };
        uniforms.uC = { value: new THREE.Color(info.c ?? '#80d0ff') };
        uniforms.uRim = { value: new THREE.Color(info.rim ?? '#ffffff') };
        uniforms.uGlitter = { value: info.glitter ?? 0.5 };
        uniforms.uGlow = { value: info.glow ?? 0.3 };
        uniforms.uPanels = { value: info.panels ?? 0 };
        uniforms.uVeins = { value: info.veins ?? 0 };
      } else if (kind === 'deck' || kind === 'ground') {
        uniforms.uDeckC = { value: new THREE.Vector3(...deck.center) };
        uniforms.uDeckShape = { value: new THREE.Vector3(deck.a, deck.b, deck.power) };
      } else if (kind === 'podium') {
        uniforms.uWho = { value: info.who ?? 0 };
        uniforms.uRadii = { value: new THREE.Vector2(info.rx ?? 1.7, info.ry ?? 1.7) };
        uniforms.uFloor = { value: info.floor ?? 0 };
      } else if (kind === 'screen') {
        uniforms.uCells = { value: moon ? 150 : 60 };
      } else if (kind === 'lamp' || kind === 'canvas') {
        uniforms.uTint = { value: new THREE.Color(info.tint ?? '#ffffff') };
        uniforms.uTwinkle = { value: info.twinkle ?? 0 };
      }
      mat = new THREE.ShaderMaterial({
        name: key,
        uniforms,
        vertexShader: STATIC_VERTEX,
        fragmentShader: FRAGMENTS[kind],
        vertexColors: !!mesh.geometry.getAttribute('color'),
        defines: moon ? { MOON: '' } : kind === 'paint' && glitter ? { GLITTER: '' } : kind === 'grille' ? { GRILLE: '' } : {},
        side: kind === 'screen' || kind === 'lens' || kind === 'canvas' ? THREE.DoubleSide : THREE.FrontSide,
      });
      byName.set(key, mat);
      made.push(mat);
    }
    mesh.material = mat;
    mesh.frustumCulled = false;
  });
  return made;
}
