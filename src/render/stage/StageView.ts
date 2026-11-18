import { gpuFound, type GraphicsSettings } from '../../game/graphics';
import type { VenueId } from '../venues/catalog';
import type { StageOptions } from './Stage';
import type { Beat, FromStage, StageInput, StageRate, ToStage } from './protocol';

/**
 * The 3D stage as the page sees it: a canvas in the page, drawn by a worker of its own.
 *
 * The stage is by far the heaviest thing the game draws. Run on the page, every one of its frames
 * (and building it, which takes the better part of a second) would hold up everything else there:
 * the menus, the highway, the input. So the page hands the canvas over to a worker
 * (OffscreenCanvas) that builds and draws the stage on a frame loop of its own, and only tells it
 * what the music is doing. Where a worker cannot draw with WebGL, the same host runs on the page,
 * as before (see stageHost).
 */

/** Messages to the stage are sent at most this often, ms (beats go at once). */
const INPUT_MS = 1000 / 120;

type Target = 'worker' | 'page';

/** undefined: not started yet; null: the worker cannot be used here. */
let worker: Worker | null | undefined;
/** The worker can draw with WebGL (false once it has been seen not to). */
let workerDraws = true;
let pageHost: Promise<(m: ToStage) => void> | null = null;
let nextId = 1;
const views = new Map<number, StageView>();
const debugAsks = new Map<number, (info: Record<string, unknown>) => void>();

let venueShare = 0;
const venueWatchers = new Set<(share: number) => void>();

function receive(m: FromStage) {
  switch (m.type) {
    case 'gpu':
      gpuFound(m.name);
      return;
    case 'venue':
      // Two hosts may report (the worker and, after a fallback, the page): the furthest counts.
      venueShare = Math.max(venueShare, m.share);
      venueWatchers.forEach((w) => w(venueShare));
      return;
    case 'shown':
      views.get(m.id)?.onShown();
      return;
    case 'failed':
      views.get(m.id)?.onFailed(m.message, m.webgl);
      return;
    case 'debug':
      debugAsks.get(m.id)?.(m.info);
      debugAsks.delete(m.id);
      return;
  }
}

function canHandOver(): boolean {
  return (
    typeof Worker === 'function' &&
    typeof OffscreenCanvas === 'function' &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'
  );
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (!canHandOver()) return (worker = null);
  try {
    const w = new Worker(new URL('./stage.worker.ts', import.meta.url), { type: 'module', name: 'stage' });
    w.onmessage = (e: MessageEvent<FromStage>) => receive(e.data);
    // The worker's script would not load or run: every stage it holds goes to the page instead.
    w.onerror = (e) => {
      console.warn('Stage worker failed; drawing the stage on the page', e.message);
      worker = null;
      w.terminate();
      for (const view of views.values()) view.onFailed('the stage worker stopped', true);
    };
    w.postMessage({ type: 'visible', visible: document.visibilityState !== 'hidden' } satisfies ToStage);
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

function getPageHost(): Promise<(m: ToStage) => void> {
  pageHost ??= import('./stageHost').then(({ createStageHost }) => {
    const host = createStageHost(receive);
    host.handle({ type: 'visible', visible: document.visibilityState !== 'hidden' });
    return host.handle;
  });
  return pageHost;
}

if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    const m: ToStage = { type: 'visible', visible: document.visibilityState !== 'hidden' };
    worker?.postMessage(m);
    void pageHost?.then((handle) => handle(m));
  });

/** Starts loading the venue now, ahead of the first stage, so it is there sooner. */
export function preloadStage(venue: VenueId) {
  const w = workerDraws ? getWorker() : null;
  if (w) w.postMessage({ type: 'preload', venue } satisfies ToStage);
  else void getPageHost().then((handle) => handle({ type: 'preload', venue }));
}

/** Calls back with how much of the venue has loaded (0..1), now and as more of it arrives. */
export function watchStageLoading(cb: (share: number) => void): () => void {
  venueWatchers.add(cb);
  cb(venueShare);
  return () => void venueWatchers.delete(cb);
}

export class StageView {
  /** Resolves once the stage's first frame is drawn; rejects if it cannot be built. */
  readonly ready: Promise<void>;
  private canvas!: HTMLCanvasElement;
  private readonly id = nextId++;
  private target: Target = 'page';
  private pageHandle: ((m: ToStage) => void) | null = null;
  /** Messages for the page's host until it has loaded. */
  private queue: ToStage[] = [];
  private readonly observer: ResizeObserver;
  private resolve!: () => void;
  private reject!: (err: Error) => void;
  private settled = false;
  private disposed = false;
  private lastInput = 0;
  private lastSize = '';

  constructor(
    private host: HTMLElement,
    private readonly graphics: GraphicsSettings,
    private readonly options: StageOptions,
  ) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    // Whoever waits on it reports the failure; nobody waiting is not an error.
    this.ready.catch(() => undefined);
    this.observer = new ResizeObserver(() => this.sendSize());
    window.addEventListener('resize', this.sendSize);
    views.set(this.id, this);
    this.start(workerDraws && getWorker() ? 'worker' : 'page');
  }

  /** Puts a fresh canvas in the host and builds the stage on it, in the worker or on the page. */
  private start(target: Target) {
    this.target = target;
    this.canvas?.remove();
    const canvas = document.createElement('canvas');
    canvas.className = 'stage3d';
    this.host.appendChild(canvas);
    this.canvas = canvas;
    this.observer.disconnect();
    this.observer.observe(canvas);
    this.lastSize = '';
    const { width, height, dpr } = this.measure();
    const base = { type: 'create' as const, id: this.id, graphics: this.graphics, options: this.options, width, height, dpr };
    if (target === 'worker') {
      const offscreen = canvas.transferControlToOffscreen();
      worker!.postMessage({ ...base, canvas: offscreen } satisfies ToStage, [offscreen]);
    } else {
      this.send({ ...base, canvas });
      void getPageHost().then((handle) => {
        this.pageHandle = handle;
        const queued = this.queue;
        this.queue = [];
        if (this.target === 'page') queued.forEach(handle);
      });
    }
  }

  private send(m: ToStage) {
    if (this.disposed && m.type !== 'dispose') return;
    if (this.target === 'worker') worker?.postMessage(m);
    else if (this.pageHandle) this.pageHandle(m);
    else this.queue.push(m);
  }

  private measure() {
    const c = this.canvas;
    return {
      width: c.clientWidth || window.innerWidth,
      height: c.clientHeight || window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    };
  }

  private readonly sendSize = () => {
    const { width, height, dpr } = this.measure();
    const key = `${width}x${height}@${dpr}`;
    if (key === this.lastSize) return;
    this.lastSize = key;
    this.send({ type: 'size', id: this.id, width, height, dpr });
  };

  /** @internal The first frame is on screen: the canvas fades in. */
  onShown() {
    this.canvas.classList.add('on');
    if (!this.settled) {
      this.settled = true;
      this.resolve();
    }
  }

  /** @internal The stage could not be built. Without WebGL in the worker, it is built on the page. */
  onFailed(message: string, webgl: boolean) {
    if (this.disposed) return;
    if (webgl && this.target === 'worker') {
      workerDraws = false;
      this.start('page');
      return;
    }
    if (!this.settled) {
      this.settled = true;
      this.reject(new Error(message));
    }
  }

  /** Moves the stage's canvas into another host; the stage carries on as it is. */
  attach(host: HTMLElement) {
    this.host = host;
    if (this.canvas.parentElement !== host) host.appendChild(this.canvas);
    this.sendSize();
  }

  /** What the music is doing now. Cheap to call every frame: it is passed on at most 120 times a second. */
  input(input: StageInput) {
    const now = performance.now();
    if (now - this.lastInput < INPUT_MS) return;
    this.lastInput = now;
    const { low, mid, high } = input.bands;
    this.send({ type: 'input', id: this.id, input: { ...input, bands: { low, mid, high } } });
  }

  beat(beat: Beat) {
    this.send({ type: 'beat', id: this.id, beat });
  }

  setRate(rate: StageRate) {
    this.send({ type: 'rate', id: this.id, rate });
  }

  overdriveStart() {
    this.send({ type: 'overdrive', id: this.id });
  }

  finale(seconds: number) {
    this.send({ type: 'finale', id: this.id, seconds });
  }

  /** Dev diagnostics from the stage, wherever it runs. */
  debugInfo(): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      debugAsks.set(this.id, resolve);
      this.send({ type: 'debug', id: this.id });
    });
  }

  dispose() {
    if (this.disposed) return;
    this.send({ type: 'dispose', id: this.id });
    this.disposed = true;
    views.delete(this.id);
    this.observer.disconnect();
    window.removeEventListener('resize', this.sendSize);
    this.canvas.remove();
  }
}
