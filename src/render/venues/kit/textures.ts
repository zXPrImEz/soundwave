import * as THREE from 'three';
import type { GraphicsSettings, Level } from '../../../game/graphics';
import { part } from '../../aurora/assets';

/**
 * Scanned materials (tools/stage/textures/build_textures.py makes them from CC0 scans): for each a
 * tiling colour texture and a normal map with the roughness in its blue, in 1K, 2K and 4K. The
 * graphics settings pick the size; with textures off, surfaces draw their pattern in the shader.
 */
export type ScanName =
  | 'concrete_wall'
  | 'concrete_floor'
  | 'brick'
  | 'sandstone'
  | 'marble'
  | 'plaster'
  | 'wood_floor'
  | 'planks'
  | 'steel_rust'
  | 'steel_paint'
  | 'steel_ribbed'
  | 'steel_tread'
  | 'velvet'
  | 'carpet'
  | 'leather'
  | 'grass'
  | 'ground'
  | 'asphalt';

export interface Scan {
  color: THREE.Texture;
  normal: THREE.Texture;
}

const FOLDER: Record<Level, string | null> = { off: null, low: '1k', medium: '2k', high: '4k' };
const cache = new Map<string, Promise<Scan | undefined>>();

async function image(url: string, anisotropy: number, srgb: boolean): Promise<THREE.Texture> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  // As stored: not turned over, no colour conversion.
  const bitmap = await createImageBitmap(await r.blob(), {
    imageOrientation: 'none',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const t = new THREE.Texture(bitmap);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.premultiplyAlpha = false;
  t.flipY = false;
  t.anisotropy = anisotropy;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * The scans a venue asks for, at the size the graphics settings name. One that cannot be loaded is
 * left out (its surfaces fall back to their pattern); with textures off, all are.
 */
export async function loadScans<N extends ScanName>(
  names: readonly N[],
  g: GraphicsSettings,
  anisotropy: number,
): Promise<Partial<Record<N, Scan>>> {
  const folder = FOLDER[g.textures];
  const out: Partial<Record<N, Scan>> = {};
  if (!folder || typeof createImageBitmap !== 'function') return out;
  const base = `${import.meta.env.BASE_URL}stage/textures/${folder}/`;
  await Promise.all(
    names.map(async (name) => {
      const key = `${folder}/${name}`;
      let p = cache.get(key);
      if (!p) {
        p = part(
          Promise.all([image(`${base}${name}_c.webp`, anisotropy, true), image(`${base}${name}_n.webp`, anisotropy, false)]).then(
            ([color, normal]): Scan => ({ color, normal }),
          ),
        ).catch((err) => {
          console.warn('texture unavailable', name, err);
          cache.delete(key);
          return undefined;
        });
        cache.set(key, p);
      }
      const scan = await p;
      if (scan) out[name] = scan;
    }),
  );
  return out;
}
