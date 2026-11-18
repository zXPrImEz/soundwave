import { applyPreset, DEFAULT_GRAPHICS, type GraphicsPreset } from '../game/graphics';
import { Stage } from '../render/stage/Stage';
import { isVenueChoice, resolveVenue } from '../render/venues/catalog';

/**
 * Dev-only: the 3D stage full screen with a simulated song, for checking looks and performance
 * without playing. Open /#stage?preset=high&bpm=126&shot=hero&level=0.9&mode=play (shot pins one
 * camera, level pins how busy the music is, od = seconds until overdrive, venue = a venue's id).
 */
export async function runStagePreview(root: HTMLElement) {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const preset = (q.get('preset') ?? 'high') as GraphicsPreset;
  const g = applyPreset(DEFAULT_GRAPHICS, preset);
  // Drawn on the page, not in the worker the game uses, so the console can reach into the stage.
  const canvas = document.createElement('canvas');
  // No fade-in here: a capture right after loading should show the stage, not the fade.
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;background:#000';
  root.replaceChildren(canvas);
  const choice = q.get('venue');
  const venue = resolveVenue(isVenueChoice(choice) ? choice : 'moonrise', Date.now());
  const stage = await Stage.create(canvas, g, { mode: q.get('mode') === 'menu' ? 'menu' : 'play', part: 'lead', venue });
  const fit = () => stage.setSize(innerWidth, innerHeight, devicePixelRatio);
  fit();
  (window as unknown as { __stage: Stage }).__stage = stage;
  const shot = q.get('shot');
  if (shot) {
    const d = stage.director as unknown as { shots: { name: string }[]; current: unknown; update: () => boolean };
    const found = d.shots.find((s) => s.name === shot);
    if (found) {
      d.current = found;
      d.update = () => false;
    }
  }
  const bpm = Number(q.get('bpm') ?? 126);
  const od = Number(q.get('od') ?? -1);
  const level = q.get('level');
  const spb = 60 / bpm;
  const t0 = performance.now();
  let beat = -1;
  let odOn = false;
  const loop = () => {
    requestAnimationFrame(loop);
    const t = (performance.now() - t0) / 1000;
    const b = Math.floor(t / spb);
    let ev: 'none' | 'beat' | 'downbeat' = 'none';
    if (b !== beat) {
      beat = b;
      ev = b % 4 === 0 ? 'downbeat' : 'beat';
    }
    if (od >= 0 && t > od && !odOn) {
      odOn = true;
      stage.overdriveStart();
    }
    // A simulated song: builds for 8 bars, peaks, drops back.
    const bar = b / 4;
    const intensity = level !== null ? Number(level) : bar < 8 ? 0.2 + bar * 0.08 : bar < 24 ? 0.95 : 0.4;
    stage.render({ beat: ev, intensity, overdrive: odOn && t < od + 12, barSeconds: spb * 4 });
  };
  loop();
  addEventListener('resize', fit);
  // From the console: jump to a shot, or run the show ahead by simulated seconds (a page in the
  // background gets few frames, so time is moved on by hand; performance.now is pinned for it).
  let fake = performance.now();
  let simBeat = 0;
  Object.assign(window, {
    __shot(name: string) {
      const d = stage.director as unknown as { shots: { name: string }[]; current: unknown; shotTime: number; update: () => boolean };
      d.current = d.shots.find((s) => s.name === name) ?? d.current;
      d.shotTime = 0;
      d.update = () => false;
    },
    __sim(seconds: number, intensity = 0.9, overdrive = false) {
      performance.now = () => fake;
      for (let i = 0; i < seconds * 30; i++) {
        fake += 1000 / 30;
        const t = fake / 1000;
        const b = Math.floor(t / spb);
        const ev = b !== simBeat ? (b % 4 === 0 ? 'downbeat' : 'beat') : 'none';
        simBeat = b;
        stage.setBands({ low: 0.3 + 0.5 * intensity * (ev !== 'none' ? 1 : 0.5), mid: 0.4 * intensity, high: 0.3 * intensity });
        stage.render({ beat: ev, intensity, overdrive, barSeconds: spb * 4 });
      }
      return stage.debugInfo();
    },
  });
  document.title = 'stage ready';
}
