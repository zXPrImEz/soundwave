import * as THREE from 'three';
import type { ShowLevel } from '../stage/LightShow';
import { type Lasers, cone, fan } from './kit/lasers';
import type { VenueFrame } from './types';

/**
 * The Warehouse's laser show. Heads on the deck's front, the main truss, the back truss over the
 * LED wall, the side walls, the spine down the hall's middle and the hall's back wall play
 * programmes that change every four bars: sheets over the heads, fans, scanning waves, chases,
 * beams crossing the hall, and in a peak tunnels, spinning cones, a web and a storm of beat-synced
 * flicks. Overdrive plays them all at once in rainbow colours.
 */
export type LaserProgram = 'sheet' | 'fans' | 'scan' | 'chase' | 'cross' | 'tunnel' | 'cones' | 'web' | 'storm';

const GROOVE: LaserProgram[] = ['fans', 'scan', 'chase', 'cross'];
const PEAK: LaserProgram[] = ['tunnel', 'web', 'cones', 'storm'];

/**
 * What plays in a phrase (counted every four bars): the sheet alone when calm, a groove programme on
 * the sheet, a peak programme and a groove one in a peak, and everything in overdrive.
 */
export function laserPrograms(level: ShowLevel, phrase: number, overdrive: number): LaserProgram[] {
  const n = Math.abs(Math.floor(phrase));
  if (overdrive > 0.5) return ['sheet', ...PEAK, GROOVE[n % GROOVE.length]];
  if (level === 'calm') return ['sheet'];
  if (level === 'groove') return ['sheet', GROOVE[n % GROOVE.length]];
  return ['sheet', PEAK[n % PEAK.length], GROOVE[(n + 1) % GROOVE.length]];
}

/** Where the heads are (venue.json's laser sources). Missing ones play nothing. */
export interface LaserHeads {
  deck: THREE.Vector3[];
  truss: THREE.Vector3[];
  wall: THREE.Vector3[];
  back: THREE.Vector3[];
  side: THREE.Vector3[];
  spine: THREE.Vector3[];
  rear: THREE.Vector3[];
}

const WHITE = new THREE.Color(1, 1, 1);
const GREEN = new THREE.Color(0.1, 1, 0.25);

export class WarehouseLasers {
  private phrase = 0;
  private drive = false;
  private readonly c1 = new THREE.Color();
  private readonly c2 = new THREE.Color();
  private readonly hue = new THREE.Color();
  private readonly to = new THREE.Vector3();

  constructor(
    private readonly out: Lasers,
    private readonly heads: LaserHeads,
    private readonly menu: boolean,
  ) {}

  update(f: VenueFrame) {
    const s = f.show;
    const out = this.out;
    out.begin();
    if (f.beat === 'downbeat' && s.bar % 4 === 0) this.phrase++;
    const busy = Math.min(1, Math.max(0, (f.energy - 0.25) / 0.6));
    const lv = (this.menu ? 0.5 : 1) * (0.35 + 0.65 * busy) * 0.45;
    // Two of the show's colours and laser green, trading places every phrase.
    const pal = [f.key, f.accent, GREEN];
    this.c1.copy(pal[this.phrase % 3]).lerp(WHITE, 0.1);
    this.c2.copy(pal[(this.phrase + 1) % 3]);
    this.drive = s.overdrive > 0.5;
    for (const p of laserPrograms(this.menu ? 'groove' : s.level, this.phrase, s.overdrive)) this.play(p, f, lv);
    out.end(f.height);
  }

  /** A beam's colour: the one given, or a turn round the rainbow in overdrive. */
  private tint(base: THREE.Color, k: number, n: number, f: VenueFrame): THREE.Color {
    if (!this.drive) return base;
    return this.hue.setHSL((((k / n + f.clock * 0.125) % 1) + 1) % 1, 1, 0.5);
  }

  private play(program: LaserProgram, f: VenueFrame, lv: number) {
    const { out, heads, c1, c2, to } = this;
    const t = f.time;
    const calm = f.show.level === 'calm' && !this.menu;
    switch (program) {
      case 'sheet': {
        // Two flat fans from the deck's ends over the heads, slow and low when it is calm.
        const deck = heads.deck;
        if (deck.length < 2) return;
        const roll = Math.sin(t * (calm ? 0.3 : 0.7)) * 0.05;
        const level = lv * (calm ? 0.8 : 1.4);
        for (const [p, side] of [
          [deck[0], 1],
          [deck[deck.length - 1], -1],
        ] as const)
          fan(out, p, 22, side * 0.62, 0.09 + 0.03 * Math.sin(t * 0.5 + side), 1.3, 46, this.tint(c1, side, 4, f), level, side * roll);
        return;
      }
      case 'fans':
        // Upright fans from the main truss sweeping the floor; level ones from the back truss
        // skimming over everything toward the hall's back.
        heads.truss.forEach((p, k) =>
          fan(
            out,
            p,
            9,
            Math.sin(t * 0.8 + k) * 0.5,
            -0.42 + 0.1 * Math.sin(t + k),
            0.8,
            40,
            this.tint(k % 2 ? c1 : c2, k, 4, f),
            lv * 1.3,
            Math.PI / 2 + Math.sin(t * 0.6 + k) * 0.3,
          ),
        );
        heads.back.forEach((p, k) =>
          fan(
            out,
            p,
            7,
            (k - 1.5) * 0.2 + Math.sin(t * 0.6) * 0.15,
            -0.08 + 0.04 * Math.sin(t * 0.9 + k),
            0.5,
            60,
            c2,
            lv * (0.7 + 0.5 * f.pulse),
          ),
        );
        return;
      case 'scan':
        // From the side walls across the hall, the beams' height a wave running down it.
        heads.side.forEach((p, k) => {
          const pitch = -0.17 + 0.09 * Math.sin(t * 1.6 - p.z * 0.12 + (p.x > 0 ? Math.PI : 0));
          fan(
            out,
            p,
            5,
            -Math.sign(p.x) * Math.PI * 0.5,
            pitch,
            0.35,
            52,
            this.tint(p.x > 0 ? c2 : c1, k, 8, f),
            lv * (0.8 + 0.5 * f.pulse),
          );
        });
        return;
      case 'chase': {
        // A beam fan runs along the deck's heads, one a beat, a tail behind it; down the hall the
        // spine's heads drop a cone in turn.
        const deck = heads.deck;
        deck.forEach((p, k) => {
          const age = mod(f.clock - k, deck.length);
          const jump = hash(Math.floor(f.clock - age) * 7 + k);
          fan(out, p, 5, (jump - 0.5) * 1.0, 0.08 + 0.25 * hash(jump * 13), 0.25, 45, k % 2 ? c2 : c1, lv * 2 * Math.exp(-age * 1.6));
        });
        heads.spine.forEach((p, k) => {
          const age = mod(f.clock * 0.5 - k, heads.spine.length);
          cone(out, p, 8, 0, -1.45, 0.3, 14, [c1, c2], lv * 1.6 * Math.exp(-age * 2), t * 2);
        });
        return;
      }
      case 'cross':
        // From both ends of the hall at once: they cross over the crowd, swelling on the bar.
        heads.rear.forEach((p, k) => {
          const side = k % 2 ? 1 : -1;
          fan(
            out,
            p,
            12,
            Math.PI + side * (0.08 + 0.08 * Math.sin(t * 0.7)),
            -0.07 + 0.03 * Math.sin(t * 0.5 + k),
            0.6,
            82,
            c2,
            lv * (0.8 + 0.6 * f.barPulse),
            0,
            0.025,
          );
        });
        heads.back.forEach((p, k) =>
          fan(out, p, 7, (k - 1.5) * 0.12 + Math.sin(t * 0.45 + k) * 0.2, -0.1, 0.5, 85, c1, lv * (0.8 + 0.6 * f.barPulse)),
        );
        return;
      case 'tunnel':
        // A spinning cone out of the wall, breathing with the bass: the crowd stands in its tunnel.
        heads.wall.forEach((p) =>
          cone(
            out,
            p,
            24,
            0,
            0.06,
            0.2 + 0.05 * Math.sin(t * 1.7) + 0.06 * f.low,
            60,
            this.drive ? [this.tint(c1, 0, 2, f), c2] : [c1, c2],
            lv * 1.5,
            t * 0.9,
          ),
        );
        heads.rear.forEach((p, k) =>
          cone(out, p, 10, Math.PI, -0.08, 0.12 + 0.04 * f.low, 70, [c2], lv * (0.6 + 0.6 * f.pulse), -t * 1.2 + k),
        );
        return;
      case 'cones':
        // Cones down from the spine, opening and closing with the bass, turning each its own way.
        heads.spine.forEach((p, k) =>
          cone(
            out,
            p,
            10,
            t * 0.3,
            -1.5,
            0.16 + 0.22 * f.low + 0.08 * f.pulse,
            14,
            [this.tint(c1, k, 4, f), c2],
            lv * 1.3,
            t * (1.2 + k * 0.2) * (k % 2 ? 1 : -1),
          ),
        );
        return;
      case 'web':
        // From the side walls, leaning one way and the other: a net of beams over the crowd.
        heads.side.forEach((p, k) => {
          const lean = (k % 2 ? 1 : -1) * (0.45 + 0.15 * Math.sin(t * 0.5 + k));
          fan(
            out,
            p,
            6,
            -Math.sign(p.x) * (Math.PI * 0.5 - lean),
            -0.15 + 0.03 * Math.sin(t * 0.8),
            0.45,
            55,
            this.tint(p.x > 0 ? c2 : c1, k, 8, f),
            lv * 1.1,
            0.15 * lean,
          );
        });
        return;
      case 'storm':
        // Beat-synced flicks: every head jumps to a new aim on the beat and rings out.
        heads.deck.forEach((p, k) => {
          const flip = f.beats % 2 ? 1 : -1;
          fan(
            out,
            p,
            4,
            (k - 2.5) * 0.15 + flip * 0.3,
            0.12 + 0.2 * hash(f.beats * 3 + k),
            0.3,
            45,
            this.tint(k % 2 ? c1 : c2, k, 6, f),
            lv * 1.4 * (0.3 + 0.7 * f.pulse),
          );
        });
        heads.truss.forEach((p, k) => {
          const jump = hash(f.beats * 5 + k);
          to.set((jump - 0.5) * 1.4, -0.45, 1)
            .normalize()
            .multiplyScalar(40)
            .add(p);
          out.add(p, to, this.tint(c2, k, 4, f), lv * 2 * (0.4 + 0.6 * f.pulse));
        });
        return;
    }
  }
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
