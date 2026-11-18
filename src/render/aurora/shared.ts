import * as THREE from 'three';

/** How many of a venue's own lights the shaders take (see uLight). */
export const LIGHTS = 8;
/** How many pools of light from the beams the shaders take (see uPool). */
export const POOLS = 12;

/**
 * Uniforms every venue material shares: the clock, the music, the three colours of the light show,
 * the haze and where the stage's glow comes from. One object, so the show sets them once a frame.
 */
export const shared = {
  uTime: { value: 0 },
  /** Beats since the show started, fractional. */
  uBeat: { value: 0 },
  /** 1 on a beat, decaying. */
  uPulse: { value: 0 },
  uBarPulse: { value: 0 },
  /** How busy the music is, 0..1 (smoothed). */
  uEnergy: { value: 0.3 },
  /** Bass, middle and treble of what is playing, 0..1, eased. */
  uLow: { value: 0.2 },
  uMid: { value: 0.2 },
  uHigh: { value: 0.2 },
  uKey: { value: new THREE.Color(1, 0.45, 0.8) },
  uAccent: { value: new THREE.Color(0.4, 0.9, 1) },
  uWash: { value: new THREE.Color(0.25, 0.2, 1) },
  /** Haze far from the stage (also the sky at the horizon) and haze soaked in the stage's light. */
  uHazeFar: { value: new THREE.Color(0.007, 0.018, 0.08) },
  uHazeNear: { value: new THREE.Color(0.1, 0.09, 0.42) },
  uHazeDensity: { value: 0.0024 },
  /** Centre of the stage's glow (the moon screen). */
  uGlowPos: { value: new THREE.Vector3(0, 16, -25.5) },
  /** Main screen: centre x, y, z and radius of the moon drawn on it. */
  uMoon: { value: new THREE.Vector4(0, 8.4, -23.6, 12.7) },
  /** The arch outline the main screen fills: half width, height, superellipse power. */
  uArch: { value: new THREE.Vector3(12.7, 16.9, 2.25) },
  /** The band's island: centre x, z and half axes; the deck's rings of light spread from it. */
  uIsland: { value: new THREE.Vector4(0, -4.6, 8.2, 6.0) },
  /** Where the four players stand, and how strongly each is picked out (the part being played most). */
  uBand: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uFeature: { value: [0.6, 0.6, 0.6, 0.6] },
  /** The moon: direction to it and the light it gives. */
  uMoonDir: { value: new THREE.Vector3(-0.51, 0.26, -0.82).normalize() },
  uMoonCol: { value: new THREE.Color(0.5, 0.62, 1.0) },
  /** Lights on the far shore, mirrored by the lake. */
  uShore: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, -1000, 0)) },
  uShoreCol: { value: Array.from({ length: 8 }, () => new THREE.Color(0, 0, 0)) },
  /** The last firework: where it burst and how bright it still is. */
  uBurst: { value: new THREE.Vector4(0, 60, -40, 0) },
  /** How strongly the flame jets are burning, 0..1: they light what stands near. */
  uFire: { value: 0 },
  /** Overall brightness of the screens. */
  uScreenLevel: { value: 1 },
  /**
   * What stands above the lake as the water sees it: a picture taken from below the surface, the
   * matrix that finds a point of the water in it, and whether there is one (light settings go without).
   */
  uMirrorMap: { value: null as THREE.Texture | null },
  uMirrorMatrix: { value: new THREE.Matrix4() },
  uMirrorOn: { value: 0 },
  /** Height of the lake's surface. */
  uWaterLevel: { value: -0.55 },
  /** The audience from above (see crowdMap.ts), and the ground it covers: corner x, z and 1 / size. */
  uCrowdMap: { value: null as THREE.Texture | null },
  uCrowdRect: { value: new THREE.Vector4(-136, -18, 1 / 272, 1 / 156) },
  /**
   * Lights a venue moves about the room (practicals, strobes, a mirror ball's glow): position and
   * reach in metres, and colour times strength. Unused ones stay black.
   */
  uLight: { value: Array.from({ length: LIGHTS }, () => new THREE.Vector4(0, -1000, 0, 1)) },
  uLightCol: { value: Array.from({ length: LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  /** A strobe or blinder flash over the whole room, 0..1. */
  uFlash: { value: 0 },
  /** Light that is everywhere in a venue (moon, sky, spill), for its own surfaces. */
  uAmbient: { value: new THREE.Color(0.02, 0.02, 0.03) },
  /** How strongly the stage's glow (uGlowPos) lights a venue's own surfaces, and how far it reaches, metres. */
  uGlowLight: { value: new THREE.Vector2(1, 20) },
  /** A mirror ball: its centre, and how bright the spots it throws are; and how far it has turned. */
  uBall: { value: new THREE.Vector4(0, -100, 0, 0) },
  uBallTurn: { value: 0 },
  /** How fast the stage's glow on the people falls off with distance (indoors it reaches less far). */
  uGlowFall: { value: 0.0006 },
  /**
   * Where the moving heads' beams land (see Beams.pools): centre and radius of each pool of light,
   * and its colour times strength. Unused ones stay black.
   */
  uPool: { value: Array.from({ length: POOLS }, () => new THREE.Vector4(0, -1000, 0, 1)) },
  uPoolCol: { value: Array.from({ length: POOLS }, () => new THREE.Color(0, 0, 0)) },
};

/** Noise, haze and the screen content, shared by the fragment shaders. */
export const COMMON = /* glsl */ `
uniform float uTime;
uniform float uBeat;
uniform float uPulse;
uniform float uBarPulse;
uniform float uEnergy;
uniform float uLow;
uniform float uMid;
uniform float uHigh;
uniform vec3 uKey;
uniform vec3 uAccent;
uniform vec3 uWash;
uniform vec3 uHazeFar;
uniform vec3 uHazeNear;
uniform float uHazeDensity;
uniform vec3 uGlowPos;
uniform vec4 uMoon;
uniform vec3 uArch;
uniform float uScreenLevel;
uniform vec4 uIsland;
uniform vec3 uBand[4];
uniform float uFeature[4];
uniform vec3 uMoonDir;
uniform vec3 uMoonCol;
uniform vec3 uShore[8];
uniform vec3 uShoreCol[8];
uniform vec4 uBurst;
uniform float uFire;
uniform vec4 uLight[${LIGHTS}];
uniform vec3 uLightCol[${LIGHTS}];
uniform float uFlash;
uniform float uGlowFall;
uniform vec4 uPool[${POOLS}];
uniform vec3 uPoolCol[${POOLS}];

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5; float s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return s;
}

/** The sky without its clouds: what glossy surfaces reflect and what the haze fades into. */
vec3 skyGradient(vec3 d) {
  float h = max(0.0, d.y);
  vec3 col = mix(uHazeFar * 1.25, vec3(0.003, 0.006, 0.04), pow(h, 0.5));
  // The stage side of the sky is soaked in its light.
  float toStage = max(0.0, dot(normalize(vec3(d.x, 0.0, d.z) + 1e-4), vec3(0.0, 0.0, -1.0)));
  col += uHazeNear * 0.5 * pow(toStage, 3.0) * exp(-h * 4.5);
  return col;
}

/** Pools of coloured light the rig lays on the field in front of the stage, drifting slowly. */
vec3 fieldPools(vec2 p) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float k = float(i);
    vec2 c = vec2(sin(uTime * (0.07 + 0.013 * k) + k * 2.4) * (24.0 + 9.0 * k), 30.0 + 13.0 * k + cos(uTime * (0.05 + 0.011 * k) + k * 1.7) * 14.0);
    sum += (mod(k, 2.0) < 0.5 ? uKey : uAccent) * smoothstep(15.0, 2.0, distance(p, c));
  }
  return sum * (0.3 + 0.7 * uEnergy);
}

/** What a venue's own lights (uLight) and a flash give a surface at p facing n, wrapped a little. */
vec3 roomLights(vec3 p, vec3 n) {
  vec3 sum = vec3(uFlash * 0.9);
  for (int i = 0; i < ${LIGHTS}; i++) {
    vec3 d = uLight[i].xyz - p;
    float l = length(d);
    float fall = 1.0 / (1.0 + l * l / (uLight[i].w * uLight[i].w));
    sum += uLightCol[i] * fall * max(0.0, dot(n, d / max(l, 1e-3)) * 0.75 + 0.25);
  }
  return sum;
}

/** The pools of light the beams lay on the floor and over the crowd, at p facing n. */
vec3 beamPools(vec3 p, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${POOLS}; i++) {
    float r = uPool[i].w;
    float d = length(p.xz - uPool[i].xz);
    float k = smoothstep(r, r * 0.45, d) * exp(-abs(p.y - uPool[i].y) * 0.35);
    sum += uPoolCol[i] * k;
  }
  return sum * (0.35 + 0.65 * max(0.0, n.y));
}

/** Distance and height haze that picks up the stage's light near it. */
vec3 applyHaze(vec3 col, vec3 wpos) {
  vec3 v = wpos - cameraPosition;
  float d = length(v);
  float h = max(0.0, 0.5 * (wpos.y + cameraPosition.y));
  float f = 1.0 - exp(-d * uHazeDensity * exp(-h * 0.02));
  float lit = exp(-distance(wpos, uGlowPos) * 0.014);
  return mix(col, mix(uHazeFar, uHazeNear, lit), f);
}

/** 1 where a point of the main screen's plane (x, height) lies on the screen. */
float onScreen(vec2 p) {
  vec2 d = vec2(abs(p.x - uMoon.x) / uArch.x, max(0.0, p.y) / uArch.y);
  return step(pow(d.x, uArch.z) + pow(d.y, uArch.z), 1.0) * step(0.0, p.y);
}

/** The main screen's picture: a moon with ripples; q runs 0..1 across the moon's own square. */
vec3 moonContent(vec2 q) {
  vec2 p = (q - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x + 1e-5);
  float rip = pow(max(0.0, 0.5 + 0.5 * sin(r * 16.0 - uBeat * 6.2831853)), 5.0) * smoothstep(1.0, 0.25, r);
  float swirl = 0.5 + 0.5 * sin(a * 3.0 + r * 6.0 - uTime * 0.5);
  vec3 col = mix(uWash * 0.9, uKey, swirl * 0.7);
  col = mix(col, uAccent * 1.3, rip * 0.85);
  // The lit side of the moon: a soft crescent that drifts.
  vec2 c = p - 0.42 * vec2(cos(uTime * 0.07), sin(uTime * 0.07));
  float lune = smoothstep(0.95, 0.35, length(c));
  col += vec3(1.0, 0.96, 1.0) * lune * (0.25 + 0.3 * uPulse);
  return col * uScreenLevel;
}

/** The wing screens' picture: flowing bands with a bright crest, and dotted lines riding them. */
vec3 wingContent(vec2 q) {
  float t = uTime * 0.3;
  float y = q.y + 0.09 * sin(q.x * 7.0 + t * 2.0) + 0.04 * sin(q.x * 19.0 - t * 3.1);
  float v = y * 2.6 - t * 0.35 + 0.1 * uLow;
  float id = floor(v);
  float f = fract(v);
  float k = hash11(id * 7.31 + 2.0);
  vec3 col = mix(uWash, uKey, smoothstep(0.35, 0.65, k)) * (0.22 + 0.78 * f * f);
  col += uAccent * smoothstep(0.9, 1.0, f) * 1.5;
  float dots = step(0.55, fract(q.x * 40.0 + t * (k - 0.5) * 6.0)) * smoothstep(0.06, 0.0, abs(f - 0.45));
  col += uAccent * dots * 1.2;
  col *= 0.8 + 0.3 * uPulse * step(0.5, k);
  return col * uScreenLevel;
}
`;

/** Vertex shader for the static venue meshes: world position and normal, AO from vertex colour. */
export const STATIC_VERTEX = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNorm;
varying vec2 vUv;
varying float vAo;
void main() {
  // glTF stores v flipped; the build's v is the one the shaders mean.
  vUv = vec2(uv.x, 1.0 - uv.y);
  #ifdef USE_COLOR
    vAo = color.r;
  #else
    vAo = 1.0;
  #endif
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWPos = w.xyz;
  vWNorm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/**
 * The end of every fragment shader. First it drops any value that is not a finite, non-negative
 * number: a single such pixel (a power of a base that rounded to just below zero, say) would be
 * spread over the whole frame by the bloom and turn it black for that frame.
 */
export const OUTPUT = /* glsl */ `
  gl_FragColor.rgb = vec3(
    (gl_FragColor.r >= 0.0 && gl_FragColor.r < 1e4) ? gl_FragColor.r : 0.0,
    (gl_FragColor.g >= 0.0 && gl_FragColor.g < 1e4) ? gl_FragColor.g : 0.0,
    (gl_FragColor.b >= 0.0 && gl_FragColor.b < 1e4) ? gl_FragColor.b : 0.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
