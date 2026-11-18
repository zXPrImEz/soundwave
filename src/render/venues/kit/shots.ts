import type { Part } from '../../../chart/types';
import type { Move, Shot, Vec3 } from '../../stage/Director';
import type { ShowLevel } from '../../stage/LightShow';

const ALL: ShowLevel[] = ['calm', 'groove', 'peak'];
const BUSY: ShowLevel[] = ['groove', 'peak'];

/** A shot, with the levels it suits given as 'all', 'busy' (groove and peak) or 'peak'. */
export function shot(
  name: string,
  pos: Vec3,
  target: Vec3,
  hfov: number,
  move: Move,
  amount: number,
  levels: 'all' | 'busy' | 'peak',
  weight = 1,
  calm = levels === 'all',
): Shot {
  return { name, pos, target, hfov, move, amount, levels: levels === 'all' ? ALL : levels === 'busy' ? BUSY : ['peak'], weight, calm };
}

/**
 * Close-ups of the band, each from `distance` metres out from the player toward the point they
 * face (`facing`), a little to the side; the player whose part is played gets them most often.
 */
export function bandShots(band: Record<string, Vec3>, part: Part | undefined, facing: (p: Vec3) => Vec3, distance = 6, hfov = 44): Shot[] {
  const out: Shot[] = [];
  for (const [key, p] of Object.entries(band)) {
    const name = key === 'vox' ? 'vocals' : key;
    const f = facing(p);
    const dx = f[0] - p[0];
    const dz = f[2] - p[2];
    const l = Math.hypot(dx, dz) || 1;
    const pos: Vec3 = [p[0] + (dx / l) * distance + (dz / l) * 1.6, p[1] + 1.8, p[2] + (dz / l) * distance - (dx / l) * 1.6];
    out.push(shot(`band-${name}`, pos, [p[0], p[1] + 1.25, p[2]], hfov, 'truck', 1.6, 'busy', name === part ? 3 : 0.6));
  }
  return out;
}
