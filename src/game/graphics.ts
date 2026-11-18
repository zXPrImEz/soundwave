/**
 * Graphics settings for the 3D stage behind the highway. The highway itself always renders at full
 * quality; everything here only scales the stage, so a laptop keeps a smooth highway while an
 * RTX-class desktop gets the full show.
 */
export type GraphicsPreset = 'auto' | 'low' | 'medium' | 'high' | 'ultra' | 'custom';
export type Level = 'off' | 'low' | 'medium' | 'high';
export type CameraMode = 'auto' | 'calm' | 'fixed';

export interface GraphicsSettings {
  preset: GraphicsPreset;
  /** Stage render resolution relative to the screen, 0.5..1. */
  resolution: number;
  /** Lowers the stage resolution on the fly when frames run long. */
  dynamicResolution: boolean;
  /** Stage frame-rate cap (0 = match the display). The highway is never capped. */
  fpsCap: 0 | 30 | 60 | 120;
  crowd: Level;
  /** Moving-head beams in the haze. */
  beams: Level;
  /** Washes, bulbs and glowing details. */
  lights: Level;
  /** Fireworks and CO2. */
  effects: Level;
  /** Scanned surface textures: off (drawn in the shader instead), 1K, 2K or 4K. */
  textures: Level;
  /** Bloom around bright lights. */
  glow: boolean;
  antialias: boolean;
}

export type Tier = Exclude<GraphicsPreset, 'auto' | 'custom'>;

export const PRESETS: Record<Tier, Omit<GraphicsSettings, 'preset'>> = {
  low: {
    resolution: 0.6,
    dynamicResolution: true,
    fpsCap: 30,
    crowd: 'low',
    beams: 'low',
    lights: 'low',
    effects: 'low',
    textures: 'low',
    glow: false,
    antialias: false,
  },
  medium: {
    resolution: 0.75,
    dynamicResolution: true,
    fpsCap: 60,
    crowd: 'medium',
    beams: 'medium',
    lights: 'medium',
    effects: 'medium',
    textures: 'low',
    glow: true,
    antialias: false,
  },
  high: {
    resolution: 1,
    dynamicResolution: true,
    fpsCap: 0,
    crowd: 'high',
    beams: 'high',
    lights: 'high',
    effects: 'high',
    textures: 'medium',
    glow: true,
    antialias: true,
  },
  ultra: {
    resolution: 1,
    dynamicResolution: false,
    fpsCap: 0,
    crowd: 'high',
    beams: 'high',
    lights: 'high',
    effects: 'high',
    textures: 'high',
    glow: true,
    antialias: true,
  },
};

export const DEFAULT_GRAPHICS: GraphicsSettings = { preset: 'auto', ...PRESETS.medium };

/** Share of the crowd, trees and bulbs drawn at each level. */
export const LEVEL_SHARE: Record<Level, number> = { off: 0, low: 0.12, medium: 0.45, high: 1 };

/**
 * A tier from the GPU's name: integrated laptop graphics get Low, mainstream GPUs Medium, current
 * discrete cards High and the top cards Ultra. Unknown GPUs start at Medium (dynamic resolution
 * then adapts).
 */
export function tierForGpu(name: string | null): Tier {
  if (!name) return 'medium';
  const n = name.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(n)) return 'low';
  if (/rtx\s*(40[89]0|50[789]0|4080|4090)|rx\s*7[89]00|rx\s*9070|apple m\d (max|ultra)/.test(n)) return 'ultra';
  if (/rtx|rx\s*[5-9]\d{3}|arc a7|apple m\d pro|radeon pro/.test(n)) return 'high';
  if (/gtx|rx\s*[4-5]\d{2}|arc|apple m\d/.test(n)) return 'medium';
  if (/intel|uhd|iris|vega \d|radeon\(tm\) graphics|mali|adreno/.test(n)) return 'low';
  return 'medium';
}

/**
 * The GPU's name as WebGL reports it, when the browser allows it. Opening a graphics context costs
 * the better part of a second on the thread that does it, so the game asks the stage's worker, which
 * opens one anyway (see gpuFound), and only falls back to this on the page.
 */
export function detectGpu(): string | null {
  try {
    const canvas = () => (typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas'));
    const gl = (canvas().getContext('webgl2') ?? canvas().getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return typeof name === 'string' ? name : null;
  } catch {
    return null;
  }
}

/** Where the GPU's name is remembered between starts (not carried by backups: see preferenceKeys). */
const GPU_KEY = 'soundwave.cache.gpu';
let detected: Tier | null = null;
let found: () => void = () => {};
const foundGpu = new Promise<void>((resolve) => (found = resolve));

function rememberedGpu(): string | null {
  try {
    return localStorage.getItem(GPU_KEY);
  } catch {
    return null;
  }
}

/** The GPU's name, as the stage's worker found it: used from now on and remembered for next time. */
export function gpuFound(name: string | null) {
  detected = tierForGpu(name);
  try {
    if (name) localStorage.setItem(GPU_KEY, name);
  } catch {
    /* storage unavailable: found again next time */
  }
  found();
}

/**
 * Resolves once the Auto tier can be told without opening a graphics context on the page: at once
 * when this machine's GPU is remembered from before, else when the stage's worker has found it (or,
 * should it never say, after `ms`).
 */
export function gpuKnown(ms = 2000): Promise<void> {
  if (detected || rememberedGpu()) return Promise.resolve();
  return Promise.race([foundGpu, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

function tier(): Tier {
  if (detected) return detected;
  const remembered = rememberedGpu();
  detected = tierForGpu(remembered ?? detectGpu());
  return detected;
}

/** The settings actually used: Auto resolves to a tier for this machine, the rest are explicit. */
export function resolveGraphics(g: GraphicsSettings): GraphicsSettings {
  if (g.preset !== 'auto') return g;
  return { ...g, ...PRESETS[tier()] };
}

export function autoTier(): Tier {
  return tier();
}

/** Applying a preset sets every individual option; changing one afterwards makes it Custom. */
export function applyPreset(g: GraphicsSettings, preset: GraphicsPreset): GraphicsSettings {
  if (preset === 'auto' || preset === 'custom') return { ...g, preset };
  return { ...g, ...PRESETS[preset], preset };
}

const LEVELS: Level[] = ['off', 'low', 'medium', 'high'];

export function normalizeGraphics(raw: unknown): GraphicsSettings {
  const g = { ...DEFAULT_GRAPHICS, ...(typeof raw === 'object' && raw ? raw : {}) } as GraphicsSettings;
  if (!['auto', 'low', 'medium', 'high', 'ultra', 'custom'].includes(g.preset)) g.preset = 'auto';
  for (const k of ['crowd', 'beams', 'lights', 'effects', 'textures'] as const) if (!LEVELS.includes(g[k])) g[k] = DEFAULT_GRAPHICS[k];
  if (![0, 30, 60, 120].includes(g.fpsCap)) g.fpsCap = DEFAULT_GRAPHICS.fpsCap;
  g.resolution = Math.min(1, Math.max(0.5, Number(g.resolution) || DEFAULT_GRAPHICS.resolution));
  for (const k of ['dynamicResolution', 'glow', 'antialias'] as const) g[k] = Boolean(g[k]);
  // The switch for the 2D backdrop went with the backdrop, and the camera choice: the director
  // always moves the camera during a song.
  delete (g as unknown as Record<string, unknown>).stage3d;
  delete (g as unknown as Record<string, unknown>).camera;
  return g;
}
