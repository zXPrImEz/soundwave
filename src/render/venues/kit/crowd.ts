import { BOTTOMS, BRIGHT, CALM, DARK, HYPE, rng, type Person } from '../../aurora/figures';
import type { Vec3 } from '../../stage/Director';

/** People closer than this to a low camera are drawn with the detailed mesh, metres. */
const NEAR_CAMERA = 12;

export interface CrowdArea {
  /** The rectangle to fill: x0, z0, x1, z1. */
  bounds: [number, number, number, number];
  /** Metres between people where the crowd is packed. */
  step: number;
  /** How packed the crowd is at a spot, 0 (nobody) to 1. */
  density(x: number, z: number): number;
  /** The spot a person there looks at (the stage, the DJ, the bar). */
  face(x: number, z: number): [number, number];
  /** Height of the floor at a spot. */
  ground?(x: number, z: number): number;
  /** How much each person turns away from facing it, radians. */
  wander?: number;
}

/** Spots people can take (seats, places along a rail), as opposed to an area to fill. */
export interface CrowdSpots {
  /** Each spot's x, y (the floor's height there) and z. */
  spots: ArrayLike<number>[];
  /** Chance a spot is taken before `share` thins the crowd, 0 to 1. */
  fill: number;
  /** The spot a person there looks at. */
  face(x: number, z: number): [number, number];
  /** How far each person strays from their spot, metres. */
  jitter?: number;
  /** How much each person turns away from facing it, radians. */
  wander?: number;
}

/**
 * An audience: a jittered grid over the area, thinned by its density and by `share` (lighter
 * graphics settings), each person turned toward what they watch. A little room is kept around each
 * low camera, and the people near one get the detailed mesh. With `sync` the loops are made to the
 * beat and everyone plays them nearly in time.
 */
export function fillCrowd(area: CrowdArea, characters: string[], share: number, cameras: Vec3[], sync = true, seed = 31): Person[] {
  const rand = rng(seed);
  const people: Person[] = [];
  if (!characters.length || share <= 0) return people;
  const [x0, z0, x1, z1] = area.bounds;
  const step = area.step;
  for (let z = z0; z < z1; z += step) {
    for (let x = x0; x < x1; x += step) {
      const r = rand();
      const px = x + (rand() - 0.5) * step * 0.8;
      const pz = z + (rand() - 0.5) * step * 0.8;
      if (r > area.density(px, pz) * share) continue;
      place(people, rand, [px, area.ground?.(px, pz) ?? 0, pz], area.face(px, pz), area.wander ?? 0.5, characters, cameras, sync);
    }
  }
  return people;
}

/** An audience on given spots, each taken by chance (`fill` times `share`), as fillCrowd does it. */
export function crowdAt(area: CrowdSpots, characters: string[], share: number, cameras: Vec3[], sync = true, seed = 31): Person[] {
  const rand = rng(seed);
  const people: Person[] = [];
  if (!characters.length || share <= 0) return people;
  const jitter = area.jitter ?? 0;
  for (const s of area.spots) {
    const r = rand();
    const px = s[0] + (rand() - 0.5) * 2 * jitter;
    const pz = s[2] + (rand() - 0.5) * 2 * jitter;
    if (r > area.fill * share) continue;
    place(people, rand, [px, s[1], pz], area.face(px, pz), area.wander ?? 0.5, characters, cameras, sync);
  }
  return people;
}

/** One person at `pos` looking at `target`, unless a low camera stands there. */
function place(
  people: Person[],
  rand: () => number,
  pos: Vec3,
  target: [number, number],
  wander: number,
  characters: string[],
  cameras: Vec3[],
  sync: boolean,
) {
  const [px, , pz] = pos;
  let nearest = Infinity;
  for (const c of cameras) nearest = Math.min(nearest, Math.hypot(px - c[0], pz - c[2]));
  if (nearest < 1.4) return;
  const style = rand();
  people.push({
    pos,
    yaw: Math.atan2(target[0] - px, target[1] - pz) + (rand() - 0.5) * wander,
    scale: 0.94 + rand() * 0.12,
    character: characters[Math.floor(rand() * characters.length)],
    far: nearest >= NEAR_CAMERA,
    calm: CALM[Math.floor(rand() * CALM.length)],
    hype: HYPE[Math.floor(rand() * HYPE.length)],
    threshold: 0.3 + rand() * 0.5,
    phase: sync ? (people.length % 2 ? 0.5 : 0) + rand() * 0.05 : rand(),
    recolor: style < 0.3 ? 0 : 1,
    top: style < 0.62 ? DARK[Math.floor(rand() * DARK.length)] : BRIGHT[Math.floor(rand() * BRIGHT.length)],
    bottom: BOTTOMS[Math.floor(rand() * BOTTOMS.length)],
  });
}

/** A DJ behind the decks: one of the crowd's characters, nodding and pumping a fist, in the spots. */
export function dj(characters: string[], pos: Vec3, yaw: number): Person {
  return {
    pos,
    yaw,
    scale: 1,
    character: characters.find((c) => c.startsWith('m_hood')) ?? characters[0],
    far: false,
    calm: 'headbang',
    hype: 'fistpump',
    threshold: 0.55,
    phase: 0,
    recolor: 1,
    top: '#15151c',
    bottom: '#101018',
    spot: 1.15,
  };
}
