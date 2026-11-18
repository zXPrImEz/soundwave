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
      let nearest = Infinity;
      for (const c of cameras) nearest = Math.min(nearest, Math.hypot(px - c[0], pz - c[2]));
      if (nearest < 1.4) continue;
      const [tx, tz] = area.face(px, pz);
      const style = rand();
      people.push({
        pos: [px, area.ground?.(px, pz) ?? 0, pz],
        yaw: Math.atan2(tx - px, tz - pz) + (rand() - 0.5) * (area.wander ?? 0.5),
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
  }
  return people;
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
