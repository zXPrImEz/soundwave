import { useEffect, useRef } from 'react';
import { BandMeter } from '../audio/bands';
import { getEngine } from '../audio/engine';
import { gpuKnown, resolveGraphics, type GraphicsSettings } from '../game/graphics';
import { acquireMenuStage, releaseMenuStage } from '../render/aurora/menuStage';
import type { StageView } from '../render/stage/StageView';
import type { VenueId } from '../render/venues/catalog';

/**
 * The backdrop behind menus: the 3D stage idling with slow camera moves, reacting to whatever the
 * engine plays (e.g. previews). Until it is built, and where it cannot be, the menus stand before
 * the plain night. The stage is shared between mounts (see menuStage), so remounting this never
 * shows a black frame, and it draws in a worker of its own (see StageView), so it never slows the
 * menus down.
 *
 * `onReady` is told once the stage has drawn (or cannot be built): the loading screen waits for it.
 */
export function MenuBackground({ graphics, venue, onReady }: { graphics: GraphicsSettings; venue: VenueId; onReady?(): void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    let live = true;
    let acquired = false;
    let raf = 0;
    const ready = () => live && readyRef.current?.();
    const start = () => {
      if (!live) return;
      acquired = true;
      const g = resolveGraphics(graphics);
      // Menus never need the full show: cap the frame rate so the machine stays light.
      const stage = acquireMenuStage(stageRef.current!, { ...g, fpsCap: g.fpsCap && g.fpsCap < 60 ? g.fpsCap : 60, effects: 'off' }, venue);
      stage.ready.then(ready, (err) => {
        console.warn('3D stage unavailable', err);
        ready();
      });
      if (import.meta.env.DEV) (window as unknown as { __stage?: StageView }).__stage = stage;
      // The stage moves with whatever plays (previews, the menu music): metered here, where the audio is.
      const meter = new BandMeter();
      meter.setAnalyser(getEngine().analyser);
      let last = performance.now();
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        const b = meter.update(Math.min(0.1, (now - last) / 1000));
        last = now;
        stage.input({ intensity: Math.min(1, (b.low + b.mid) * 0.7), overdrive: false, barSeconds: 2, bands: b });
      };
      loop();
    };
    // Auto graphics go by the GPU, which the stage's worker names (on the very first start only is
    // there anything to wait for): asking on the page would hold up the loading screen.
    if (graphics.preset === 'auto') void gpuKnown().then(start);
    else start();
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      if (acquired) releaseMenuStage();
    };
  }, [graphics, venue]);
  return <div ref={stageRef} className="layer stage-host" />;
}
