import * as THREE from 'three';
import type { Person } from '../../aurora/figures';
import { PODIUM_FRAGMENT } from '../../aurora/materials';
import { STATIC_VERTEX, shared } from '../../aurora/shared';
import type { Vec3 } from '../../stage/Director';
import type { VenueFrame } from '../types';
import { glow } from './surface';

/** The order the shaders know the players in. */
export const PLAYERS = ['lead', 'vox', 'bass', 'drums'];

/** A player's podium as a model's data gives it: half axes, how far it rises, and the floor it stands on. */
export interface PodiumSpec {
  rx: number;
  ry: number;
  travel: number;
  floor?: number;
}

/** What moves a podium: the music, the show and the time since the last frame (see VenueFrame). */
export interface LiftFrame {
  dt: number;
  clock: number;
  energy: number;
  overdrive: number;
}

/**
 * The height a podium glides to this frame from `height`: higher as the music gets busier, the
 * player whose part is being played (`featured` near 1) above the rest, all the way up in
 * overdrive, and each drifting a little on a cycle of its own so that none ever stands still.
 * Lifts are slow: they glide.
 */
export function liftHeight(height: number, travel: number, index: number, featured: number, f: LiftFrame): number {
  const busy = Math.min(1, Math.max(0, (f.energy - 0.2) / 0.55));
  const drift = 0.5 + 0.5 * Math.sin((f.clock / 16) * Math.PI * 2 + index * 1.9);
  const want = Math.max(f.overdrive, (0.1 + 0.6 * busy) * (0.5 + 0.5 * featured) + 0.3 * drift * (0.4 + 0.6 * busy));
  return height + (travel * Math.min(1, want) - height) * Math.min(1, f.dt * 0.9);
}

interface Lift {
  part: string;
  index: number;
  group: THREE.Group;
  person?: Person;
  rest: number;
  travel: number;
  height: number;
}

/**
 * The players' podiums, as Moonrise has them: each podium's parts (the model's Podium_<part>_*
 * objects) gathered into a group that rises and falls with the music, the player on it moving
 * with it, the shaders told where the player's feet are, and close-ups of a player following
 * their podium. With `dress`, the lid and wall get the podium display (a record on the lid, the
 * sound as a waveform round the side) and the ring round the rim a glow in the show's colours;
 * without, the model's own materials stay (Moonrise dresses its own).
 */
export class Podiums {
  private readonly lifts: Lift[] = [];
  private readonly made: THREE.Material[] = [];
  private readonly rim?: THREE.ShaderMaterial;

  constructor(
    scene: THREE.Object3D,
    specs: Record<string, PodiumSpec> | undefined,
    band: Record<string, Vec3>,
    players: Person[],
    dress = true,
  ) {
    if (dress && specs) {
      this.rim = glow(0xffffff, 1);
      this.made.push(this.rim);
    }
    for (const [part, spec] of Object.entries(specs ?? {})) {
      const index = PLAYERS.indexOf(part);
      const group = new THREE.Group();
      scene.add(group);
      for (const piece of scene.children.filter((o) => o.name.startsWith(`Podium_${part}_`))) group.add(piece);
      if (dress) this.dress(group, part, index, spec);
      const person = players.find((p) => p.part === part);
      this.lifts.push({ part, index, group, person, rest: band[part]?.[1] ?? 0, travel: spec.travel, height: 0 });
    }
  }

  private dress(group: THREE.Group, part: string, index: number, spec: PodiumSpec) {
    const display = new THREE.ShaderMaterial({
      name: `podium-${part}`,
      uniforms: {
        ...shared,
        uWho: { value: Math.max(0, index) },
        uRadii: { value: new THREE.Vector2(spec.rx, spec.ry) },
        uFloor: { value: spec.floor ?? 0 },
      },
      vertexShader: STATIC_VERTEX,
      fragmentShader: PODIUM_FRAGMENT,
    });
    this.made.push(display);
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (o.name.endsWith('_Top')) mesh.material = display;
      else if (o.name.endsWith('_Led') && this.rim) mesh.material = this.rim;
    });
  }

  /** Tells the shaders where the players' feet are, lifts and all (after the stage set the marks). */
  bind() {
    for (const l of this.lifts) if (l.index >= 0) shared.uBand.value[l.index].y = l.rest + l.height;
  }

  update(f: VenueFrame) {
    for (const l of this.lifts) {
      const featured = shared.uFeature.value[l.index] ?? 0.6;
      l.height = liftHeight(l.height, l.travel, l.index, featured, {
        dt: f.dt,
        clock: f.clock,
        energy: f.energy,
        overdrive: f.show.overdrive,
      });
      l.group.position.y = l.height;
      if (l.person) f.band.setHeight(l.person, l.rest + l.height);
      if (l.index >= 0) shared.uBand.value[l.index].y = l.rest + l.height;
    }
    if (this.rim) {
      this.rim.uniforms.uColor.value.copy(f.key).lerp(f.accent, 0.5 + 0.5 * Math.sin(f.clock * Math.PI * 0.5));
      this.rim.uniforms.uLevel.value = 0.6 + 0.5 * f.pulse + 0.25 * f.energy;
    }
  }

  /** How far the camera rises with a shot: a close-up of a player follows their podium, the band shot all of them. */
  cameraLift(shot: string) {
    const riding = shot === 'band' ? this.lifts : this.lifts.filter((l) => shot === `band-${l.part === 'vox' ? 'vocals' : l.part}`);
    return riding.reduce((sum, l) => sum + l.height, 0) / Math.max(1, riding.length);
  }

  dispose() {
    for (const m of this.made) m.dispose();
  }
}
