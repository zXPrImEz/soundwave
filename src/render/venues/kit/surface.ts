import * as THREE from 'three';
import { COMMON, OUTPUT, STATIC_VERTEX, shared } from '../../aurora/shared';

/** The look of a surface: its pattern (drawn in the shader, so no textures to load) and finish. */
export type Pattern = 'plain' | 'concrete' | 'brick' | 'wood' | 'metal' | 'fabric' | 'grass' | 'glass';

export interface SurfaceOptions {
  pattern?: Pattern;
  color: THREE.ColorRepresentation;
  /** A second colour for the pattern (mortar, grain, stains). */
  color2?: THREE.ColorRepresentation;
  /** 0 a mirror, 1 dull. */
  rough?: number;
  metal?: number;
  /** Size of the pattern: metres per brick, plank, panel. */
  scale?: number;
  /** Light of its own (added, not lit). */
  emissive?: THREE.ColorRepresentation;
  /** Mirrors what stands above it (see Venue.mirror), in puddles where `wet` < 1. */
  mirror?: boolean;
  /** Share of the surface that is wet, for a mirror floor. */
  wet?: number;
  side?: THREE.Side;
}

const FRAGMENT = /* glsl */ `
${COMMON}
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uEmissive;
uniform float uRough;
uniform float uMetal;
uniform float uScale;
uniform float uWet;
uniform vec3 uAmbient;
uniform vec2 uGlowLight;
uniform vec4 uBall;
uniform float uBallTurn;
uniform sampler2D uMirrorMap;
uniform mat4 uMirrorMatrix;
uniform float uMirrorOn;
varying vec3 vWPos; varying vec3 vWNorm; varying vec2 vUv; varying float vAo;

/** Coordinates across a surface from its world position, picked by which way it faces. */
vec2 planar(vec3 p, vec3 n) {
  vec3 a = abs(n);
  if (a.y > a.x && a.y > a.z) return p.xz;
  return a.x > a.z ? p.zy : p.xy;
}

/** Spots of light a mirror ball throws round the room: a grid of facets turning about the vertical. */
float ballSpots(vec3 p) {
  if (uBall.w <= 0.0) return 0.0;
  vec3 d = p - uBall.xyz;
  float l = length(d);
  d /= l;
  float yaw = atan(d.z, d.x) + uBallTurn;
  float pitch = asin(clamp(d.y, -1.0, 1.0));
  vec2 g = vec2(yaw * 9.0, pitch * 9.0);
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float on = step(0.45, hash21(cell));
  float spot = smoothstep(0.2, 0.08, length(f)) * on;
  return spot * uBall.w * 6.0 / (1.0 + l * l * 0.02);
}

void main() {
  vec3 n = normalize(vWNorm);
  vec3 toCam = cameraPosition - vWPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  if (dot(n, v) < 0.0) n = -n;
  vec2 q = planar(vWPos, n) / uScale;
  vec3 base = uColor;
  float rough = uRough;
  #if defined(CONCRETE)
    float big = fbm(q * 0.35);
    float fine = vnoise(q * 9.0);
    base = mix(uColor * 0.7, uColor * 1.15, big) * (0.88 + 0.2 * fine);
    base = mix(base, uColor2, smoothstep(0.62, 0.8, fbm(q * 0.9 + 7.0)) * 0.6);
    // Seams of the poured slabs.
    vec2 slab = abs(fract(q / 6.0) - 0.5);
    base *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.004 * dist / uScale + 0.004, min(0.5 - slab.x, 0.5 - slab.y)));
  #elif defined(BRICK)
    vec2 b = q * vec2(1.0, 2.6);
    b.x += step(1.0, mod(floor(b.y), 2.0)) * 0.5;
    vec2 id = floor(b);
    vec2 f = fract(b);
    float aa = fwidth(b.y) * 1.5 + 0.02;
    float mortar = 1.0 - smoothstep(0.04, 0.04 + aa, min(min(f.x, 1.0 - f.x) * 0.38, min(f.y, 1.0 - f.y)));
    vec3 brick = uColor * (0.7 + 0.5 * hash21(id)) * (0.85 + 0.25 * vnoise(q * 14.0));
    base = mix(brick, uColor2, mortar);
    rough = mix(rough, 1.0, mortar);
  #elif defined(WOOD)
    vec2 w = q * vec2(1.0, 6.0);
    float plank = floor(w.y);
    float grain = vnoise(vec2(w.x * 1.5 + hash11(plank) * 40.0, w.y * 18.0)) * 0.5 + 0.5 * sin(w.x * 3.0 + vnoise(w * 2.0) * 6.0);
    base = mix(uColor, uColor2, grain * 0.6) * (0.75 + 0.45 * hash11(plank + 3.0));
    base *= 1.0 - 0.55 * (1.0 - smoothstep(0.0, fwidth(w.y) * 1.5 + 0.03, min(fract(w.y), 1.0 - fract(w.y))));
  #elif defined(METAL)
    base = uColor * (0.8 + 0.35 * vnoise(vec2(q.x * 40.0, q.y * 1.5)));
  #elif defined(FABRIC)
    base = uColor * (0.75 + 0.3 * sin(q.x * 40.0) * sin(q.y * 40.0) + 0.25 * vnoise(q * 3.0));
  #elif defined(GRASS)
    base = mix(uColor, uColor2, fbm(q * 0.5)) * (0.8 + 0.3 * vnoise(q * 30.0));
  #endif
  float ao = mix(0.35, 1.0, vAo);

  // Light: what is everywhere, the stage's glow, the room's own lights, the wash from the rig above,
  // the flame jets and the mirror ball's spots.
  vec3 toGlow = uGlowPos - vWPos;
  float gd = length(toGlow);
  toGlow /= gd;
  vec3 glowCol = mix(uKey, vec3(1.0), 0.3) * uScreenLevel * uGlowLight.x / (1.0 + gd * gd / (uGlowLight.y * uGlowLight.y));
  vec3 light = uAmbient * (0.6 + 0.4 * n.y);
  light += glowCol * max(0.0, dot(n, toGlow) * 0.7 + 0.3);
  light += roomLights(vWPos, n);
  light += uWash * 0.06 * max(0.0, n.y) * uEnergy;
  light += vec3(1.0, 0.5, 0.2) * uFire * 0.6 / (1.0 + gd * gd * 0.003);
  light += mix(vec3(1.0), uAccent, 0.3) * ballSpots(vWPos);
  vec3 col = base * light * ao * (1.0 - uMetal * 0.7);

  // A sheen of the glow and the room's lights, sharper the smoother the surface.
  vec3 r = reflect(-v, n);
  float shine = pow(1.0 - rough, 2.0);
  float spec = pow(max(0.0, dot(r, toGlow)), mix(4.0, 90.0, shine));
  col += glowCol * spec * shine * mix(0.4, 1.4, uMetal) * mix(vec3(1.0), base * 2.0, uMetal);
  float fres = pow(1.0 - max(0.0, dot(n, v)), 5.0);
  col += uAmbient * fres * shine * 2.0;

  #ifdef MIRROR
    // Puddles on the floor mirror the room; the dry floor between them barely does.
    float wet = smoothstep(1.0 - uWet - 0.08, 1.0 - uWet + 0.08, fbm(vWPos.xz * 0.11 + 3.0));
    vec4 m = uMirrorMatrix * vec4(vWPos, 1.0);
    vec2 muv = m.xy / m.w + (vec2(vnoise(vWPos.xz * 3.0), vnoise(vWPos.xz * 3.0 + 9.0)) - 0.5) * mix(0.03, 0.004, wet);
    vec3 seen = (texture2D(uMirrorMap, muv).rgb + texture2D(uMirrorMap, muv + vec2(0.004, 0.0)).rgb + texture2D(uMirrorMap, muv - vec2(0.0, 0.006)).rgb) / 3.0;
    float k = mix(0.12, 0.95, wet) * mix(0.25, 1.0, fres + 0.15) * uMirrorOn;
    col = mix(col, seen, clamp(k, 0.0, 0.92));
    col *= mix(1.0, 0.7, wet * (1.0 - uMirrorOn));
  #endif

  col += uEmissive;
  gl_FragColor = vec4(applyHaze(col, vWPos), 1.0);
  ${OUTPUT}
}`;

const DEFINE: Record<Pattern, string | null> = {
  plain: null,
  concrete: 'CONCRETE',
  brick: 'BRICK',
  wood: 'WOOD',
  metal: 'METAL',
  fabric: 'FABRIC',
  grass: 'GRASS',
  glass: null,
};

/** A venue surface: lit by the stage's glow and the room's lights, fogged by the haze. */
export function surface(o: SurfaceOptions): THREE.ShaderMaterial {
  const pattern = o.pattern ?? 'plain';
  const defines: Record<string, string> = {};
  const d = DEFINE[pattern];
  if (d) defines[d] = '';
  if (o.mirror) defines.MIRROR = '';
  const glass = pattern === 'glass';
  return new THREE.ShaderMaterial({
    name: `surface-${pattern}`,
    uniforms: {
      ...shared,
      uColor: { value: new THREE.Color(o.color) },
      uColor2: { value: new THREE.Color(o.color2 ?? o.color) },
      uEmissive: { value: new THREE.Color(o.emissive ?? 0x000000) },
      uRough: { value: o.rough ?? (glass ? 0.05 : 0.8) },
      uMetal: { value: o.metal ?? 0 },
      uScale: { value: o.scale ?? 1 },
      uWet: { value: o.wet ?? 0.5 },
    },
    defines,
    vertexShader: STATIC_VERTEX,
    fragmentShader: FRAGMENT,
    vertexColors: false,
    side: o.side ?? THREE.FrontSide,
  });
}

/**
 * Something that glows by itself (a lamp, a tube, a sign): its colour times `level`, with the haze
 * over it. Per-instance colours when drawn instanced.
 */
export function glow(color: THREE.ColorRepresentation = 0xffffff, level = 1, instanced = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'glow',
    uniforms: { ...shared, uColor: { value: new THREE.Color(color) }, uLevel: { value: level } },
    defines: instanced ? { INSTANCED: '' } : {},
    vertexShader: /* glsl */ `
      varying vec3 vWPos; varying vec3 vCol; varying vec3 vN;
      void main() {
        #ifdef INSTANCED
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vCol = instanceColor;
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #else
          vec4 w = modelMatrix * vec4(position, 1.0);
          vCol = vec3(1.0);
          vN = normalize(mat3(modelMatrix) * normal);
        #endif
        vWPos = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform vec3 uColor;
      uniform float uLevel;
      varying vec3 vWPos; varying vec3 vCol; varying vec3 vN;
      void main() {
        vec3 v = normalize(cameraPosition - vWPos);
        // A tube is brightest where it faces the camera, softer at its edges.
        float face = 0.55 + 0.45 * abs(dot(normalize(vN), v));
        vec3 col = uColor * vCol * uLevel * face;
        gl_FragColor = vec4(applyHaze(col, vWPos) + col * 0.15, 1.0);
        ${OUTPUT}
      }`,
  });
}
