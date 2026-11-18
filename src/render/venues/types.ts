import type * as THREE from 'three';
import type { Part } from '../../chart/types';
import type { GraphicsSettings } from '../../game/graphics';
import type { Cast, FireworkSpec, Fixture } from '../aurora/assets';
import type { Figures, Person } from '../aurora/figures';
import type { Shot, Vec3 } from '../stage/Director';
import type { Rgb, ShowState } from '../stage/LightShow';

/** One of the four colour sets the light show moves through (they stand in for its palettes one to one). */
export interface Look {
  key: Rgb;
  accent: Rgb;
  wash: Rgb;
}

/** What a venue is built from. */
export interface VenueContext {
  g: GraphicsSettings;
  menu: boolean;
  /** The part being played, and its band member (a band key: lead, vox, bass, drums). */
  part?: Part;
  focus?: string;
  cast: Cast;
  /** Highest anisotropic filtering the graphics card does (for textures seen at a slant). */
  anisotropy: number;
  /** The crowd's character names. */
  characters: string[];
}

/** What the music and the show are doing this frame, as a venue's set pieces see it. */
export interface VenueFrame {
  dt: number;
  /** Seconds since the stage was built. */
  time: number;
  /** A beat or a bar started this frame. */
  beat: 'none' | 'beat' | 'downbeat';
  /** Beats since the show started, fractional, and whole. */
  clock: number;
  beats: number;
  /** Beat and bar pulses, 1 on the beat and ringing out. */
  pulse: number;
  barPulse: number;
  /** Bass, middle and treble, eased, and how busy the music is, 0..1. */
  low: number;
  mid: number;
  high: number;
  energy: number;
  show: Readonly<ShowState>;
  key: THREE.Color;
  accent: THREE.Color;
  wash: THREE.Color;
  /** Seconds of the finale left (0 outside it). */
  finale: number;
  camera: THREE.PerspectiveCamera;
  /** Height of the picture in pixels (for things drawn a pixel wide). */
  height: number;
  band: Figures;
  /** The shot on screen. */
  shot: string;
}

/** A beam's aim and level for this frame (see Venue.beam). */
export interface BeamPose {
  pan: number;
  tilt: number;
  level: number;
  /** Which of the show's colours it takes (the key unless said otherwise). */
  color?: 'key' | 'accent' | 'white';
}

/**
 * A venue: everything that makes one place different from another. The stage (Stage.ts) brings
 * what all of them share (the renderer, the light show, the camera director, the band, the crowd,
 * the beams, sparks, smoke and flames) and asks the venue for the rest.
 */
export interface Venue {
  /** The static scene: buildings, rig, screens. Added to the stage's scene as it is. */
  root: THREE.Object3D;
  shots: Shot[];
  /** Where each player stands (band keys), for the shaders that light them. */
  band: Record<string, Vec3>;
  audience: Person[];
  players: Person[];
  fixtures: Fixture[];
  fireworks: FireworkSpec[];
  co2: Vec3[];
  /** Flame jets; none when absent. */
  flames?: Vec3[];
  /** The jets that fire with the middle salvo, first and last index (the middle two fifths if not given). */
  flameMiddle?: [number, number];
  /** Confetti cannons: where they stand and which way they shoot. */
  confetti?: { pos: Vec3; dir: Vec3 }[];
  looks: Look[];
  /** Tone mapping exposure, and the glow's strength, radius and threshold. */
  exposure?: number;
  bloom?: [number, number, number];
  /** Haze in the light near the stage, before the wash colours it. */
  hazeNear?: Rgb;
  /** Colour the frame is cleared to (what shows where nothing is drawn). */
  background?: Rgb;
  /** Pull of gravity on sparks, m/s² (negative is down). */
  sparkGravity?: number;
  /**
   * A level surface that mirrors what stands above it (a lake, a wet floor): its height, and what to
   * leave out of the mirrored picture besides the people and the beams.
   */
  mirror?: { level: number; hide?: THREE.Object3D[] };
  /** Height at which the beams lay pools of light (over the crowd's heads); none when not given. */
  pools?: number;
  /** A colour grade over the picture: contrast, saturation and a vignette (see kit/grade). */
  grade?: { contrast: number; saturation: number; vignette: number; tint?: Rgb };
  /** Film grain, vignette and a little shake for a hand-held camera, 0..1. */
  handheld?: number;
  /** Sets the shared uniforms this venue holds still (glow, haze, screens). Called every frame. */
  bind(): void;
  /** Moves the set pieces. */
  update(f: VenueFrame): void;
  /** A beam group's own motion; undefined leaves the beam to the show's looks. */
  beam?(group: string, index: number, f: VenueFrame): BeamPose | undefined;
  /** How far the camera rises with the shot on screen (a close-up of a player on a lift). */
  cameraLift?(shot: string): number;
  dispose(): void;
}

export type VenueBuilder = (ctx: VenueContext) => Promise<Venue> | Venue;
