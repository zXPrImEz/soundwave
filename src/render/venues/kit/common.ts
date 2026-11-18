import type { Cast, FireworkSpec } from '../../aurora/assets';
import { makeBand, type Person } from '../../aurora/figures';
import type { Vec3 } from '../../stage/Director';
import type { ModelData } from './model';

/** The four players on the model's marks, each turned toward `face(pos)` (the crowd, by default). */
export function bandOn(data: ModelData, cast: Cast, focus?: string, face: (p: Vec3) => [number, number] = (p) => [p[0] * 0.8, p[2] + 10]) {
  const band: Record<string, Vec3> = {};
  for (const key of ['vox', 'lead', 'bass', 'drums']) if (data.marks[key]) band[key] = data.marks[key];
  const players: Person[] = makeBand({ band }, cast.band.data.band ?? {}, focus);
  for (const p of players) {
    const [x, z] = face(p.pos);
    p.yaw = Math.atan2(x - p.pos[0], z - p.pos[2]);
  }
  return { band, players };
}

/** Cold-spark fountains at the model's spark points: short fans straight up, `height` metres. */
export function fountains(points: Vec3[] | undefined, height: [number, number]): FireworkSpec[] {
  const far = Math.max(1, ...(points ?? []).map((p) => Math.abs(p[0])));
  return (points ?? []).map((origin) => ({ origin, n: 7, spread: 5, length: height, lean: 0, side: Math.abs(origin[0]) > far * 0.5 }));
}

/** Fireworks at the model's firework points: wide fans, leaning out with their distance from the middle. */
export function rockets(points: Vec3[] | undefined, length: [number, number]): FireworkSpec[] {
  const far = Math.max(1, ...(points ?? []).map((p) => Math.abs(p[0])));
  return (points ?? []).map((origin) => ({
    origin,
    n: 14,
    spread: 40,
    length,
    lean: (origin[0] / far) * 14,
    side: Math.abs(origin[0]) > far * 0.5,
  }));
}

/** Whether a spot on the floor is clear of every obstacle ([x, z, radius], or {pos, radius}). */
export function clearOf(obstacles: (number[] | { pos: number[]; radius: number })[] | undefined, margin = 0.3) {
  const list = (obstacles ?? []).map((o) => (Array.isArray(o) ? { x: o[0], z: o[1], r: o[2] } : { x: o.pos[0], z: o.pos[2], r: o.radius }));
  return (x: number, z: number) => list.every((o) => Math.hypot(x - o.x, z - o.z) > o.r + margin);
}

/** How busy the music is for set pieces, 0..1, from a frame's energy. */
export const busyOf = (energy: number) => Math.min(1, Math.max(0, (energy - 0.25) / 0.6));
