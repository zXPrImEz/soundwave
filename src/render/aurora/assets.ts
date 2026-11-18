import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { StageCameras, Vec3 } from '../stage/Director';
import type { DeckInfo } from './materials';
import type { TerrainParams } from './terrain';

/** What tools/stage/aurora/build_venue.py writes next to venue.glb (three.js coordinates). */
export interface VenueData {
  version: number;
  cameras: StageCameras;
  band: Record<string, Vec3>;
  /** The low platform the band plays on: centre (at its top) and half axes. */
  island?: { center: Vec3; a: number; b: number };
  /** The podium each player stands on: half axes, and how far it can rise from where it rests. */
  podiums?: Record<string, { rx: number; ry: number; travel: number }>;
  fixtures: Fixture[];
  /** The main screen: centre and radius of the moon drawn on it, and the arch outline it fills. */
  moon: { center: Vec3; radius: number; arch?: { halfWidth: number; height: number; power: number } };
  fireworks: FireworkSpec[];
  co2: Vec3[];
  /** Spots in the audience that stay free: the mix position, delay towers. */
  clear?: { pos: Vec3; radius: number }[];
  deck: DeckInfo;
}

/** A fan of sparks: rays spread (degrees) around a lean from vertical, each `length` metres long. */
export interface FireworkSpec {
  origin: Vec3;
  n: number;
  spread: number;
  length: [number, number];
  lean: number;
  /** Fired with the side salvos rather than the middle one (when not given: by how far out it stands). */
  side?: boolean;
}

export interface Fixture {
  group: string;
  pos: Vec3;
  dir: Vec3;
  /** Length of the beam and its spread (radius per metre); the group's own when not given. */
  length?: number;
  spread?: number;
}

export interface Clip {
  name: string;
  /** First row of the loop in the animation texture, and its length in rows. */
  start: number;
  frames: number;
  /** Length in beats: the loop plays once per this many beats of the song. */
  beats: number;
}

export interface Character {
  /** Mesh name in the set's GLB, and the lighter mesh for people far from every camera. */
  mesh: string;
  far?: string;
  joints: number;
  height: number;
  clips: Clip[];
}

/** What tools/stage/aurora/build_cast.py and build_people.py write next to each set's GLB. */
export interface FigureData {
  version: number;
  /** The loops are made to the beat: everyone plays them in time instead of at their own point. */
  sync?: boolean;
  /** Widest skeleton in the set: the animation texture is three texels per joint wide. */
  joints: number;
  frames: number;
  characters: Record<string, Character>;
  /** Band set: who plays which part, and with which loop. */
  band?: Record<string, { character: string; clip: string }>;
}

/** One set of people: the band or the crowd. */
export interface FigureSet {
  scene: THREE.Group;
  data: FigureData;
  /** Per frame and joint a 3x4 matrix, row-major, half floats. */
  anim: Uint16Array;
}

/** What tools/stage/aurora/build_scenery.py writes next to scenery.glb. */
export interface SceneryData {
  version: number;
  terrain: TerrainParams;
  /** The big wheel's axle, for turning it. */
  wheel: { center: Vec3; radius: number };
  /** Lights on the far shore that the lake mirrors. */
  shore: { pos: Vec3; color: string }[];
  /** Direction to the moon. */
  moon: Vec3;
}

export interface VenueAssets {
  /** The land, lake and festival grounds; missing if they have not been built. */
  scenery: { scene: THREE.Group; data: SceneryData } | null;
  scene: THREE.Group;
  data: VenueData;
  band: FigureSet;
  crowd: FigureSet;
}

/** The band and the audience, which every venue shares. */
export interface Cast {
  band: FigureSet;
  crowd: FigureSet;
}

/**
 * How much of what is being loaded has arrived (0..1), for the loading screen. Parts are counted as
 * they are asked for, so loading only the cast reports on the cast alone.
 */
let asked = 0;
let arrived = 0;
const watchers = new Set<(share: number) => void>();
const tell = () => watchers.forEach((w) => w(asked ? arrived / asked : 0));
/** Calls back with the share of the venue that has loaded, now and whenever more of it arrives. */
export function watchVenue(cb: (share: number) => void): () => void {
  watchers.add(cb);
  cb(asked ? arrived / asked : 0);
  return () => void watchers.delete(cb);
}
function part<T>(p: Promise<T>): Promise<T> {
  asked++;
  return p.then((v) => {
    arrived++;
    tell();
    return v;
  });
}

const base = `${import.meta.env.BASE_URL}stage/aurora/`;
let loader: GLTFLoader | null = null;
function gltf(): GLTFLoader {
  if (loader) return loader;
  const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  return (loader = new GLTFLoader().setDRACOLoader(draco));
}
async function get(name: string) {
  const r = await fetch(base + name);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r;
}
async function loadSet(path: string): Promise<FigureSet> {
  // The description first: a missing set fails here, before anything large is fetched.
  const data = (await get(`${path}.json`).then((r) => r.json())) as FigureData;
  const [model, anim] = await Promise.all([gltf().loadAsync(`${base}${path}.glb`), get(`${path}.bin`).then((r) => r.arrayBuffer())]);
  return { scene: model.scene, data, anim: new Uint16Array(anim) };
}

let castCache: Promise<Cast> | null = null;
/** Loads the band and the audience once; later callers share the same promise. */
export function loadCast(): Promise<Cast> {
  if (castCache) return castCache;
  // Characters built on this machine from downloaded files (build_people.py, kept out of the
  // repository) take the place of the project's own cast when they are there.
  const people = (name: string): Promise<FigureSet> => loadSet(`local/${name}`).catch(() => loadSet(name));
  castCache = Promise.all([part(people('band')), part(people('crowd'))]).then(([band, crowd]) => ({ band, crowd }));
  castCache.catch(() => {
    castCache = null;
  });
  return castCache;
}

let cache: Promise<VenueAssets> | null = null;
/** Loads the Moonrise venue (and the cast) once; later callers share the same promise. */
export function loadVenue(): Promise<VenueAssets> {
  if (cache) return cache;
  const scenery = get('scenery.json')
    .then((r) => r.json() as Promise<SceneryData>)
    .then(async (data) => ({ scene: (await gltf().loadAsync(`${base}scenery.glb`)).scene, data }))
    .catch(() => null);
  cache = Promise.all([
    part(gltf().loadAsync(`${base}venue.glb`)),
    part(get('venue.json').then((r) => r.json() as Promise<VenueData>)),
    loadCast(),
    part(scenery),
  ]).then(([venue, data, cast, land]) => ({ scene: venue.scene, data, band: cast.band, crowd: cast.crowd, scenery: land }));
  cache.catch(() => {
    cache = null;
  });
  return cache;
}
