import type { BandLevels } from '../../audio/bands';
import type { GraphicsSettings } from '../../game/graphics';
import type { VenueId } from '../venues/catalog';
import type { StageOptions } from './Stage';

/** What the music is doing, as the page last heard it. The stage reads the latest on each of its frames. */
export interface StageInput {
  /** How busy the music is, 0..1. */
  intensity: number;
  overdrive: boolean;
  /** Seconds per bar, for pacing camera moves. */
  barSeconds: number;
  bands: BandLevels;
}

/**
 * How often a stage draws: every frame, or a frame now and then (the picture stays up while a screen
 * on top has the machine to itself). In a hidden window no stage draws at all (see `visible`).
 */
export type StageRate = 'full' | 'frozen';

export type Beat = 'beat' | 'downbeat';

/** From the page to the stage host. Every message but `preload` and `visible` names one stage. */
export type ToStage =
  | { type: 'preload'; venue: VenueId }
  | { type: 'visible'; visible: boolean }
  | {
      type: 'create';
      id: number;
      canvas: HTMLCanvasElement | OffscreenCanvas;
      graphics: GraphicsSettings;
      options: StageOptions;
      width: number;
      height: number;
      dpr: number;
    }
  | { type: 'size'; id: number; width: number; height: number; dpr: number }
  | { type: 'input'; id: number; input: StageInput }
  | { type: 'beat'; id: number; beat: Beat }
  | { type: 'rate'; id: number; rate: StageRate }
  | { type: 'overdrive'; id: number }
  | { type: 'finale'; id: number; seconds: number }
  | { type: 'debug'; id: number }
  | { type: 'dispose'; id: number };

/** From the stage host to the page. */
export type FromStage =
  /** The GPU's name, for the Auto graphics tier (null when the browser does not tell). */
  | { type: 'gpu'; name: string | null }
  /** How much of the venue has arrived, 0..1. */
  | { type: 'venue'; share: number }
  /** The first frame is on screen. */
  | { type: 'shown'; id: number }
  /** The stage could not be built (no WebGL on this canvas, say). */
  | { type: 'failed'; id: number; message: string; webgl: boolean }
  | { type: 'debug'; id: number; info: Record<string, unknown> };
