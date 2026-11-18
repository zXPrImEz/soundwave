import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { setDiscordEnabled, showScene } from '../app/discord';
import { analysisManager, canPlay } from '../analysis/manager';
import { stemModel } from '../analysis/separation/model';
import { analysisDevice, type AnalysisDevice } from '../analysis/separation/support';
import { getEngine } from '../audio/engine';
import { ACCEPTED, isAudioFile, readSongFile } from '../audio/importSong';
import { menuMusicStatus, setMenuMusic, setMusicVolume } from '../audio/menuMusic';
import { isPreviewing, previewSong, previewStatus, setPreviewVolume, watchPreview } from '../audio/preview';
import { loadSfx, playSfx, setSfxVolume, sfxStatus } from '../audio/sfx';
import { forgetSongBuffer, loadSongBuffer } from '../audio/songAudio';
import type { Chart, Part } from '../chart/types';
import { detectGrid } from '../editor/detect';
import { emptyEdits } from '../editor/edits';
import type { Results } from '../game/GameSession';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { applyDisplayMode, canExit, exitApp, inDesktopApp, isFullscreenToggle, toggledMode } from '../game/displayMode';
import {
  loadPick,
  loadSetlist,
  partAmong,
  pruneSetlist,
  savePick,
  saveSetlist,
  SET_MAX,
  songParts,
  toggleSong,
  type Pick,
  type ThinParts,
} from '../game/setlist';
import { loadSettings, saveSettings, type DisplayMode, type Settings } from '../game/settings';
import { getInputMode, installInputMode, setInputMode, usesFocus } from '../input/inputMode';
import { EDIT_EVENT, focusStart, focusStartSettled, installMenuNav } from '../input/menuNav';
import { followOutputDevice, muteWhileUnfocused } from '../audio/output';
import { pads, resolveStyle } from '../input/pads';
import { setBindings } from '../input/bindings';
import { menuPulse, setMenuRumble } from '../input/rumble';
import {
  deleteSong,
  getSong,
  listAllScores,
  listSongs,
  StorageBlockedError,
  submitScore,
  type BestScore,
  type SongMeta,
} from '../storage/db';
import { soundwaveFileName, isSoundwaveFile } from '../storage/soundwaveFile';
import { saveSongFile, watchOpenedFiles } from '../storage/share';
import { readSongPackage, songFile, storeNewSong, storeSongPackage, updateSongMeta } from '../storage/songFile';
import { ActionBar, useActions } from './actions';
import { Dialog } from './Dialog';
import type { PickedSong } from './TrackPicker';
import { EditorScreen } from './EditorScreen';
import { FocusRing } from './FocusRing';
import { HomeScreen } from './HomeScreen';
import { DIFFICULTY_LABEL, PART_LABEL } from './icons';
import { LibraryScreen, type SongStatus } from './LibraryScreen';
import { LobbyScreen } from './LobbyScreen';
import { watchStageLoading } from '../render/stage/StageView';
import { bootDone, bootStep } from './boot';
import { MenuBackground } from './MenuBackground';
import { menuVenue } from '../render/venues/catalog';
import { onBackdrop } from './windowDrag';
import { InstallAppCard, UpdateCard } from './AppUpdates';
import { checkForUpdates, updates } from '../app/updates';
import { PlayScreen } from './PlayScreen';
import { ResultsScreen, SummaryScreen, type SetResult } from './ResultsScreen';
import { SettingsScreen } from './SettingsScreen';
import type { SongActions } from './SongMenu';
import { SongSheet } from './SongSheet';
import { MetadataSheet } from './MetadataSheet';
import { Toasts, useToasts } from './Toasts';
import { VirtualKeyboard } from './VirtualKeyboard';
import { installUiSounds } from './uiSounds';

type LobbyView = { name: 'lobby'; ids: string[]; from: 'home' | 'library' };
/** A song open in the track editor; `tested` is how the last test play of its chart went. */
type EditorView = { name: 'editor'; song: SongMeta; back: View; tested?: Results };

/** A set being played: its songs with their charts, where it is, and what has been scored so far. */
interface Run {
  songs: SongMeta[];
  charts: Chart[];
  index: number;
  results: SetResult[];
  pick: Pick;
  /** Per song, the parts with notes at the set's difficulty: the next song's part is chosen among them. */
  parts?: Part[][];
  lobby: LobbyView;
  /** A chart played from the track editor: where to go back to, and where in the song it starts. */
  test?: { back: EditorView; startAt: number };
}

type View =
  | { name: 'home' }
  | { name: 'library' }
  | LobbyView
  | { name: 'settings'; back: View }
  | EditorView
  | { name: 'play'; run: Run; buffer: AudioBuffer; key: number }
  | { name: 'results'; run: Run }
  | { name: 'summary'; run: Run };

/** While it is mounted (the launch wipe), no screen's actions answer keys or buttons. */
function Busy() {
  useActions([]);
  return null;
}

const DEPTH: Record<View['name'], number> = { home: 0, library: 1, settings: 1, lobby: 2, editor: 2, play: 3, results: 4, summary: 5 };

export function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [songs, setSongs] = useState<SongMeta[]>([]);
  const [scores, setScores] = useState<BestScore[]>([]);
  /** What has come back from storage since the game opened. */
  const [loaded, setLoaded] = useState({ songs: false, scores: false });
  /** The first screen waits for the library, so it arrives whole instead of filling in piece by piece. */
  const [booted, setBooted] = useState(false);
  /** The stage behind the menus has been built and has drawn (or cannot be built). */
  const [stageReady, setStageReady] = useState(false);
  const onStage = useCallback(() => setStageReady(true), []);
  const [importing, setImporting] = useState(0);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  // The player's shortcuts, for every screen drawn from here (they read them as they draw).
  setBindings(settings.bindings);
  const [setlist, setSetlistState] = useState<string[]>(loadSetlist);
  const [pick, setPickState] = useState<Pick>(loadPick);
  const [seed, setSeed] = useState(() => Date.now());
  const [sheet, setSheet] = useState<SongMeta | null>(null);
  /** The song whose details are being edited (see MetadataSheet). */
  const [metaSong, setMetaSong] = useState<SongMeta | null>(null);
  /** The song highlighted in the library or the track list: its preview plays. */
  const [highlight, setHighlight] = useState<string | null>(null);
  const [exitAsk, setExitAsk] = useState(false);
  /** The card that offers an update (desktop app), or the desktop app itself (website). */
  const [appCard, setAppCard] = useState<'update' | 'install' | null>(null);
  const update = useSyncExternalStore(updates.subscribe, updates.snapshot);
  // The desktop app looks for a new release a few seconds after it opens (not in development).
  useEffect(() => {
    if (!booted || import.meta.env.DEV || !settings.checkUpdates) return;
    const soon = window.setTimeout(() => void checkForUpdates(true), 4000);
    return () => clearTimeout(soon);
  }, [booted, settings.checkUpdates]);
  /** The settings, open over a paused song. */
  const [songSettings, setSongSettings] = useState(false);
  /** The text field the on-screen keyboard is open for (a controller pressed it). */
  const [typing, setTyping] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const edit = (e: Event) => {
      const field = (e as CustomEvent<HTMLElement>).detail;
      if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && !field.disabled && !field.readOnly)
        setTyping(field);
    };
    // The game has no use for the browser's right-click menu, anywhere.
    const noMenu = (e: Event) => e.preventDefault();
    window.addEventListener(EDIT_EVENT, edit);
    window.addEventListener('contextmenu', noMenu);
    return () => {
      window.removeEventListener(EDIT_EVENT, edit);
      window.removeEventListener('contextmenu', noMenu);
    };
  }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);
  const toasts = useToasts();
  const { push: toast } = toasts;

  const setSetlist = useCallback((next: string[]) => {
    setSetlistState(next);
    saveSetlist(next);
  }, []);
  const setPick = useCallback((next: Pick) => {
    setPickState(next);
    savePick(next);
  }, []);

  // Input: controllers are polled from the start; the keyboard and controllers both move focus.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    pads.start();
    const stopMode = installInputMode();
    const stopNav = installMenuNav(() => resolveStyle(settingsRef.current.glyphs, pads.snapshot().family));
    const stopSounds = installUiSounds();
    void loadSfx();
    if (import.meta.env.DEV)
      Object.assign(window, {
        __audio: { sfx: sfxStatus, music: menuMusicStatus },
        __input: setInputMode,
        __analysis: analysisManager,
        __stemModel: stemModel,
        __pads: pads,
        __preview: previewStatus,
      });
    return () => {
      stopMode();
      stopNav();
      stopSounds();
    };
  }, []);
  useEffect(() => setSfxVolume(settings.sfxVolume), [settings.sfxVolume]);
  useEffect(() => setMusicVolume(settings.musicVolume), [settings.musicVolume]);
  useEffect(() => (settings.muteUnfocused ? muteWhileUnfocused() : undefined), [settings.muteUnfocused]);
  useEffect(() => followOutputDevice(settings.outputDevice), [settings.outputDevice]);
  useEffect(() => setMenuRumble(settings.rumble, settings.ps5Haptics), [settings.rumble, settings.ps5Haptics]);
  useEffect(() => void applyDisplayMode(settings.displayMode), [settings.displayMode]);
  // Alt+Enter, and F11 in the desktop app, switch between a window and the way of filling the screen
  // used last (fullscreen or windowed fullscreen), as the Window mode setting (so the settings show it). In a browser tab Alt+Enter asks the browser
  // for fullscreen instead (F11 is the browser's own). Taken before anything else hears the keys, so
  // the Enter does not also press the focused button or play a lane.
  const settingsNow = useRef(settings);
  settingsNow.current = settings;
  const lastFullMode = useRef<Exclude<DisplayMode, 'windowed'> | null>(null);
  if (settings.displayMode !== 'windowed') lastFullMode.current = settings.displayMode;
  useEffect(() => {
    const desktop = inDesktopApp();
    const key = (e: KeyboardEvent) => {
      if (!isFullscreenToggle(e, desktop)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (desktop) {
        const s = settingsNow.current;
        updateSettings({ ...s, displayMode: toggledMode(s.displayMode, lastFullMode.current) });
      } else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [updateSettings]);
  // In Window mode the menus' background moves the window (see windowDrag). Not in a song or the
  // editor, where the mouse plays and edits.
  const windowed = inDesktopApp() && settings.displayMode === 'windowed';
  useEffect(() => {
    if (!windowed) return;
    const press = (e: MouseEvent) => {
      if (e.button !== 0 || e.detail !== 1 || e.defaultPrevented || !(e.target instanceof Element)) return;
      const menu = e.target.closest('.menu');
      if (!menu || !onBackdrop(e.target, menu)) return;
      e.preventDefault();
      void getCurrentWindow()
        .startDragging()
        .catch(() => {});
    };
    window.addEventListener('mousedown', press);
    return () => window.removeEventListener('mousedown', press);
  }, [windowed]);
  useEffect(() => document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale)), [settings.uiScale]);
  // Motion: the player's choice, or the system's when they left it alone.
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const reduced = settings.motion === 'reduced' || (settings.motion === 'system' && media.matches);
      document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.motion]);

  const refresh = useCallback(async () => {
    try {
      setSongs(await listSongs());
    } catch (e) {
      setSongs([]);
      toast(
        e instanceof StorageBlockedError
          ? e.message
          : 'Song storage is unavailable in this browser window. Imported songs will not be saved.',
      );
    }
    setLoaded((l) => (l.songs ? l : { ...l, songs: true }));
  }, [toast]);
  const refreshScores = useCallback(async () => {
    try {
      setScores(await listAllScores());
    } catch {
      /* scores are best-effort */
    }
    setLoaded((l) => (l.scores ? l : { ...l, scores: true }));
  }, []);

  useEffect(() => {
    void refresh();
    void refreshScores();
  }, [refresh, refreshScores]);

  // Every song is separated into stems before it is charted. The model for that is fetched once,
  // the first time the game opens on a device that can run it.
  const model = useSyncExternalStore(stemModel.subscribe, stemModel.snapshot);
  const [device, setDevice] = useState<AnalysisDevice | null>(null);
  useEffect(() => {
    let live = true;
    void analysisDevice().then(async (d) => {
      if (!live) return;
      setDevice(d);
      if (d !== 'none' && (await stemModel.check()) === 'absent') void stemModel.ensure().catch(() => {});
    });
    return () => {
      live = false;
    };
  }, []);
  const modelWas = useRef(model.state);
  useEffect(() => {
    const was = modelWas.current;
    modelWas.current = model.state;
    // The download itself shows in the progress bar of the song waiting for it; only a failure is news.
    if (was !== model.state && model.state === 'error' && model.error) toast(model.error);
  }, [model, toast]);

  const analysisStatus = useSyncExternalStore(analysisManager.subscribe, analysisManager.snapshot);
  const status: Record<string, SongStatus> = analysisStatus;

  // Analyze new songs automatically; previously analyzed ones load from the cache.
  useEffect(() => {
    // Not before it is known what this device can do: that decides which stored analyses count.
    if (!device) return;
    for (const s of songs) if (!analysisStatus[s.id]) void analysisManager.check(s.id, true);
  }, [songs, analysisStatus, device]);

  // The loading screen stays until everything is there: the library, the scores, which songs have
  // charts, and the stage behind the menus, built and drawn. Then the game opens in a quiet moment,
  // so the entrance plays smoothly. Nothing holds it for ever: what has not come after a long wait
  // is opened without.
  const [patience, setPatience] = useState(0);
  useEffect(() => {
    const a = window.setTimeout(() => setPatience(1), 8000);
    const b = window.setTimeout(() => setPatience(2), 30000);
    return () => (clearTimeout(a), clearTimeout(b));
  }, []);
  const libraryKnown = loaded.songs && loaded.scores && !!device && songs.every((s) => analysisStatus[s.id]);
  const libraryReady = libraryKnown || patience >= 1;
  const known = libraryReady && (stageReady || patience >= 2);
  useEffect(() => {
    if (booted) return bootDone();
    if (!libraryReady) return bootStep(0.2, 'Opening your library');
    if (!known) return watchStageLoading((share) => bootStep(0.35 + share * 0.5, share < 1 ? 'Loading the stage' : 'Building the stage'));
    bootStep(1, 'Ready');
  }, [booted, libraryReady, known]);
  useEffect(() => {
    if (booted) return;
    if (!known) return;
    if (typeof requestIdleCallback !== 'function') {
      const soon = window.setTimeout(() => setBooted(true), 60);
      return () => clearTimeout(soon);
    }
    const idle = requestIdleCallback(() => setBooted(true), { timeout: 400 });
    return () => cancelIdleCallback(idle);
  }, [known, booted]);

  const byId = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  /** Per song, the parts it hardly has: they are not offered for playing. */
  const thin: ThinParts = useMemo(() => Object.fromEntries(Object.entries(status).map(([id, s]) => [id, s.thin])), [status]);
  // Songs that were removed leave the setlist with them.
  useEffect(() => {
    if (!songs.length) return;
    const kept = pruneSetlist(setlist, new Set(songs.map((s) => s.id)));
    if (kept.length !== setlist.length) setSetlist(kept);
  }, [songs, setlist, setSetlist]);
  const setSongs_ = useMemo(() => setlist.map((id) => byId.get(id)).filter((s): s is SongMeta => !!s), [setlist, byId]);
  const played = useMemo(() => new Set(scores.map((s) => s.songId)), [scores]);

  /** Adds audio files and .soundwave song files to the library. Resolves to the songs they hold. */
  const importFiles = useCallback(
    async (files: File[]): Promise<SongMeta[]> => {
      const usable = files.filter((f) => isSoundwaveFile(f) || isAudioFile(f));
      if (usable.length < files.length) toast(`Skipped ${files.length - usable.length} file(s) that are not audio or Soundwave songs.`);
      setImporting((n) => n + usable.length);
      const got: SongMeta[] = [];
      for (const f of usable) {
        try {
          const song = isSoundwaveFile(f) ? await readSongPackage(f, f.name) : await readSongFile(f);
          const { meta } = song;
          const had = await getSong(meta.id);
          if (had) {
            toast(`"${had.title}" is already in your library.`);
            got.push(had);
            continue;
          }
          // A re-import of a removed song starts clean: no stale status or failed analysis.
          forgetSongBuffer(meta.id);
          analysisManager.forget(meta.id);
          if ('audio' in song) await storeSongPackage(song);
          else await storeNewSong(meta, new Blob([song.bytes], { type: meta.mime }));
          playSfx('add');
          got.push(meta);
        } catch (e) {
          toast(`Could not import ${f.name}: ${(e as Error).message}`);
        } finally {
          setImporting((n) => n - 1);
        }
      }
      await refresh();
      return got;
    },
    [refresh, toast],
  );
  // Song files the desktop app is opened with (double-clicked in Explorer) are added, and a single
  // one opens on its page.
  const openedRef = useRef<(files: File[]) => void>(() => {});
  openedRef.current = (files) =>
    void importFiles(files).then((got) => {
      if (got.length === 1 && view.name !== 'play' && view.name !== 'editor') setSheet(got[0]);
    });
  useEffect(() => watchOpenedFiles((files) => openedRef.current(files)), []);
  const exportSong = useCallback(
    async (song: SongMeta) => {
      try {
        if (await saveSongFile(await songFile(song.id), soundwaveFileName(song))) toast(`Saved "${song.title}" as a Soundwave song file.`);
      } catch (e) {
        toast(`Could not export "${song.title}": ${(e as Error).message}`);
      }
    },
    [toast],
  );
  const addSongs = useCallback(() => fileInput.current?.click(), []);

  /* The track editor ---------------------------------------------------------------------- */

  /**
   * Adds a song picked in the track editor. Analyzed, it is added like any other and charted by the
   * game. From scratch, the game only listens for its tempo and the song gets empty charts on that
   * grid, stored with it before it joins the library, so it is never queued for analysis.
   */
  const addTrack = useCallback(
    async ({ meta, bytes }: PickedSong, how: 'analyze' | 'scratch'): Promise<SongMeta> => {
      forgetSongBuffer(meta.id);
      analysisManager.forget(meta.id);
      const audio = new Blob([bytes], { type: meta.mime });
      let song = meta;
      if (how === 'scratch') {
        let buffer: AudioBuffer;
        try {
          buffer = await getEngine().decode(bytes);
        } catch {
          throw new Error('This audio format could not be decoded here. Try MP3, WAV, FLAC or OGG.');
        }
        const found = await detectGrid(buffer);
        song = { ...meta, duration: meta.duration || buffer.duration };
        await storeNewSong(song, audio, {
          ...emptyEdits(),
          grid: found.grid,
          ...(found.tracked ? { tracked: found.tracked } : {}),
          duration: buffer.duration,
        });
      } else await storeNewSong(song, audio);
      playSfx('add');
      await refresh();
      return song;
    },
    [refresh],
  );
  /** Gives a song already in the library empty charts on its own tempo, instead of an analysis. */
  const startFromScratch = useCallback(async (song: SongMeta) => {
    analysisManager.cancel(song.id);
    const buffer = await loadSongBuffer(song.id);
    const found = await detectGrid(buffer);
    const had = await analysisManager.editsOf(song.id);
    await analysisManager.saveEdits(song.id, {
      ...(had ?? emptyEdits()),
      grid: found.grid,
      ...(found.tracked ? { tracked: found.tracked } : {}),
      duration: buffer.duration,
      updatedAt: Date.now(),
    });
  }, []);

  // Files dropped anywhere on a menu are imported.
  const [dragging, setDragging] = useState(false);
  const inMenus = view.name !== 'play';
  const takesDrops = inMenus && view.name !== 'editor';
  useEffect(() => {
    if (!takesDrops) return;
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void importFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      setDragging(false);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [takesDrops, importFiles]);

  const toggle = (song: SongMeta) => {
    if (!setlist.includes(song.id) && !canPlay(analysisStatus[song.id]))
      return toast('No notes were found in this song, so it cannot go in a set.');
    if (!setlist.includes(song.id) && setlist.length >= SET_MAX)
      return toast(`The setlist holds ${SET_MAX} songs. Take one out to add another.`);
    setSetlist(toggleSong(setlist, song.id));
  };

  /** What can be done with songs: from a song's detail sheet, or its menu for one or several songs. */
  const songActions: SongActions = {
    details: (song) => setSheet(song),
    addToSet: (list) => {
      const next = [...setlist];
      for (const song of list) if (next.length < SET_MAX && !next.includes(song.id) && canPlay(analysisStatus[song.id])) next.push(song.id);
      if (next.length !== setlist.length) setSetlist(next);
      if (list.some((song) => !next.includes(song.id))) toast(`The setlist holds ${SET_MAX} songs. Take one out to add another.`);
    },
    removeFromSet: (list) => setSetlist(setlist.filter((id) => !list.some((song) => song.id === id))),
    analyze: (list) => list.forEach((song) => analysisManager.enqueue(song.id, true)),
    exportSong: (song) => void exportSong(byId.get(song.id) ?? song),
    editMeta: (song) => setMetaSong(song),
    edit: (song) => {
      setSheet(null);
      getEngine().stop();
      setView({ name: 'editor', song: byId.get(song.id) ?? song, back: view });
    },
    remove: async (list) => {
      if (sheet && list.some((song) => song.id === sheet.id)) setSheet(null);
      getEngine().stop();
      for (const song of list) {
        forgetSongBuffer(song.id);
        analysisManager.forget(song.id);
        await deleteSong(song.id);
      }
      await Promise.all([refresh(), refreshScores()]);
    },
  };

  /* Playing a set ------------------------------------------------------------------------- */

  // A stage-light wipe covers the moment a song loads: it closes over the menu, the play screen
  // mounts behind it, and it opens again.
  const [launch, setLaunch] = useState<'in' | 'out' | null>(null);
  const launchRef = useRef(launch);
  launchRef.current = launch;
  const playAt = async (run: Run, index: number, started = false) => {
    // One launch at a time: a second press while the wipe is up does nothing.
    if (launchRef.current && !started) return;
    setLaunch('in');
    const minWipe = new Promise((r) => setTimeout(r, 620));
    try {
      getEngine().stop();
      const buffer = await loadSongBuffer(run.songs[index].id);
      await minWipe;
      setView({ name: 'play', run: { ...run, index }, buffer, key: Date.now() });
      // The sheets part once the play screen has had a moment to build its highway behind them,
      // so the way out is as smooth as the way in.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 140));
      setLaunch('out');
      setTimeout(() => setLaunch(null), 860);
    } catch (e) {
      setLaunch(null);
      toast((e as Error).message);
    }
  };

  const start = async (lobby: LobbyView) => {
    if (launchRef.current) return;
    // The held button makes no sound of its own: the set starting is the sound.
    playSfx('launch');
    menuPulse('launch');
    setLaunch('in');
    try {
      // The chosen part is the first song's (the lobby offers only the parts it has notes on). Each
      // song after it is played on that part, or on the first one it has notes on when it has none
      // on that one (the next song's part can be changed between songs). A song without a note on
      // any part sits the set out.
      const ids = lobby.ids.filter((id) => byId.has(id) && canPlay(analysisStatus[id]));
      const found: { song: SongMeta; charts: Map<Part, Chart> }[] = [];
      for (const id of ids) {
        const charts = new Map<Part, Chart>();
        for (const p of songParts(id, thin)) {
          const chart = await analysisManager.chart(id, p, pick.difficulty);
          if (chart && chart.notes.length > 0) charts.set(p, chart);
        }
        if (charts.size) found.push({ song: byId.get(id)!, charts });
      }
      const use: Pick = { ...pick, part: partAmong(pick.part, [...(found[0]?.charts.keys() ?? [])]) ?? pick.part };
      const entries = found.map(({ song, charts }) => {
        const parts = [...charts.keys()];
        return { song, chart: charts.get(partAmong(use.part, parts)!)!, parts };
      });
      if (!entries.length) {
        setLaunch(null);
        return toast('No notes were found in these songs at this difficulty.');
      }
      await playAt(
        {
          songs: entries.map((e) => e.song),
          charts: entries.map((e) => e.chart),
          parts: entries.map((e) => e.parts),
          index: 0,
          results: [],
          pick: use,
          lobby,
        },
        0,
        true,
      );
    } catch (e) {
      setLaunch(null);
      toast((e as Error).message);
    }
  };

  /** Plays a chart from the track editor in the game itself; the editor comes back when it ends. */
  const testPlay = (editor: EditorView, chart: Chart, startAt: number) => {
    menuPulse('launch');
    void playAt(
      {
        songs: [editor.song],
        charts: [chart],
        index: 0,
        results: [],
        pick: { part: chart.part, difficulty: chart.difficulty },
        lobby: { name: 'lobby', ids: [], from: 'home' },
        test: { back: editor, startAt },
      },
      0,
    );
  };

  const withResult = (run: Run, result: SetResult): Run => {
    const results = [...run.results];
    results[run.index] = result;
    return { ...run, results };
  };

  const finish = async (run: Run, results: Results) => {
    const song = run.songs[run.index];
    let best: number | undefined;
    try {
      best = await submitScore({
        songId: song.id,
        part: run.charts[run.index].part,
        difficulty: run.pick.difficulty,
        score: results.score,
        stars: results.stars,
        accuracy: results.accuracy,
        fullCombo: results.fullCombo,
      });
      void refreshScores();
    } catch {
      /* scores are best-effort */
    }
    setView({ name: 'results', run: withResult(run, { song, results, best }) });
  };

  /** Every song of the run with its result so far; songs not reached count as skipped. */
  const filled = (run: Run): Run => ({ ...run, results: run.songs.map((song, i) => run.results[i] ?? { song, results: null }) });
  const goHome = () => {
    setSeed(Date.now());
    setView({ name: 'home' });
  };
  const advance = (run: Run) => {
    if (run.index + 1 < run.songs.length) void playAt(run, run.index + 1);
    else if (run.songs.length > 1) setView({ name: 'summary', run: filled(run) });
    else setView(run.lobby.from === 'library' ? { name: 'library' } : { name: 'home' });
  };

  // A song previews by itself (unless that is switched off): the one whose page is open, else the one
  // highlighted in a list.
  const sheetOpen = !!sheet && inMenus && view.name !== 'editor';
  const previewId =
    launch !== null || !settings.songPreviews
      ? null
      : sheetOpen
        ? sheet.id
        : view.name === 'library' || view.name === 'home'
          ? highlight
          : null;
  useEffect(() => previewSong(previewId), [previewId]);
  useEffect(() => () => previewSong(null), []);
  useEffect(() => setPreviewVolume(settings.volume), [settings.volume]);
  const previewing = useSyncExternalStore(watchPreview, isPreviewing);
  /** The song that is heard right now, for the lists to mark. */
  const heard = previewing ? previewId : null;

  // The theme plays behind the menus and makes way for a preview, the launch and the song.
  // The editor plays the song itself.
  const menuMusic = booted && inMenus && view.name !== 'editor' && !previewing && launch === null;
  useEffect(() => setMenuMusic(menuMusic, 0.45), [menuMusic]);

  // Going deeper enters from the right; going back, from the left.
  const prevDepth = useRef(DEPTH[view.name]);
  const sceneDirRef = useRef<'fwd' | 'back'>('fwd');
  if (DEPTH[view.name] !== prevDepth.current) {
    sceneDirRef.current = DEPTH[view.name] > prevDepth.current ? 'fwd' : 'back';
    prevDepth.current = DEPTH[view.name];
  }
  const sceneKey = view.name === 'results' ? `results:${view.run.index}` : view.name;
  // The first screen after the loading screen comes in from it (see bootDone), once: until its
  // entrance has played, or another screen is opened. (Its tabs' contents mount anew, and must not
  // wait like that again.)
  const bootScene = useRef<{ key: string; done: boolean } | null>(null);
  if (booted) {
    if (!bootScene.current) bootScene.current = { key: sceneKey, done: false };
    else if (sceneKey !== bootScene.current.key) bootScene.current.done = true;
  }
  const [bootEntrance, setBootEntrance] = useState(true);
  useEffect(() => {
    if (!booted) return;
    const over = window.setTimeout(() => setBootEntrance(false), 1600);
    return () => clearTimeout(over);
  }, [booted]);
  const fromBoot = bootEntrance && bootScene.current?.done === false;
  const fromBootRef = useRef(fromBoot);
  fromBootRef.current = fromBoot;

  // A new screen starts with focus on its first control for keyboard and controller players. The
  // first screen after the loading screen waits until that control has come in (see
  // focusStartSettled): its entrance is long, and a tile focused while rising would snap at the end.
  useEffect(() => {
    if (view.name === 'play') return;
    let cancelFocus = () => {};
    const raf = requestAnimationFrame(() => {
      if (document.querySelector('[data-modal]')) return;
      if (usesFocus(getInputMode())) {
        if (fromBootRef.current) cancelFocus = focusStartSettled();
        else focusStart();
        return;
      }
      // Mouse and touch players get no ring, but a screen reader still hears where it is now.
      const heading = document.querySelector<HTMLElement>('.scene h1');
      if (!heading) return (document.activeElement as HTMLElement | null)?.blur?.();
      heading.tabIndex = -1;
      heading.dataset.ring = 'none';
      heading.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelFocus();
    };
  }, [sceneKey, view.name, booted]);

  // The settings over a paused song take focus as they open (the pause menu takes it back, see PlayScreen).
  useEffect(() => {
    if (!songSettings) return;
    const raf = requestAnimationFrame(() => {
      const over = document.querySelector<HTMLElement>('.settings-over');
      if (!over) return;
      if (usesFocus(getInputMode())) return focusStart(over);
      const heading = over.querySelector<HTMLElement>('h1');
      if (!heading) return;
      heading.tabIndex = -1;
      heading.dataset.ring = 'none';
      heading.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [songSettings]);

  const subtitle = (run: Run, index = run.index) =>
    `${PART_LABEL[run.charts[index]?.part ?? run.pick.part]} · ${DIFFICULTY_LABEL[run.pick.difficulty]}`;

  /** Between songs: the next song is to be played on another part. Its chart for that part is fetched first. */
  const setNextPart = async (run: Run, part: Part) => {
    const index = run.index + 1;
    const song = run.songs[index];
    if (!song || run.charts[index]?.part === part) return;
    try {
      const chart = await analysisManager.chart(song.id, part, run.pick.difficulty);
      if (!chart || chart.notes.length === 0) return toast(`No ${PART_LABEL[part].toLowerCase()} notes were found in ${song.title}.`);
      const charts = [...run.charts];
      charts[index] = chart;
      // Still on this screen (the player may have moved on while the chart was fetched).
      setView((v) =>
        v.name === 'results' && v.run.songs === run.songs && v.run.index === run.index ? { ...v, run: { ...v.run, charts } } : v,
      );
    } catch (e) {
      toast((e as Error).message);
    }
  };

  // The player's Discord profile shows where they are and what they play (desktop app; src/app/discord.ts).
  useEffect(() => setDiscordEnabled(settings.discordStatus), [settings.discordStatus]);
  useEffect(() => {
    const named = (s: SongMeta) => (s.artist ? `${s.title} — ${s.artist}` : s.title);
    const count = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;
    switch (view.name) {
      case 'home':
        return showScene({ details: 'In the main menu' });
      case 'library':
        return showScene({ details: 'Browsing the library', state: count(songs.length) });
      case 'settings':
        return showScene({ details: 'In the settings' });
      case 'lobby':
        return showScene({ details: 'Getting a set ready', state: count(view.ids.length) });
      case 'editor':
        return showScene({ details: named(view.song), state: 'Editing the chart' });
      case 'play': {
        const { run } = view;
        const part = run.charts[run.index].part;
        const what = `${PART_LABEL[part]} · ${DIFFICULTY_LABEL[run.pick.difficulty]}`;
        const where = run.test ? 'Test play' : run.songs.length > 1 ? `Song ${run.index + 1} of ${run.songs.length}` : '';
        return showScene({ details: named(run.songs[run.index]), state: where ? `${what} · ${where}` : what, part, partText: what });
      }
      case 'results': {
        const { song, results } = view.run.results[view.run.index] ?? { song: view.run.songs[view.run.index], results: null };
        if (!results) return showScene({ details: named(song), state: 'Results' });
        const stars = '★'.repeat(Math.max(0, Math.min(6, Math.floor(results.stars))));
        const parts = [stars, `${Math.round(results.accuracy * 100)}%`, results.fullCombo ? 'Full combo' : ''].filter(Boolean);
        return showScene({ details: named(song), state: parts.join(' · ') });
      }
      case 'summary':
        return showScene({ details: 'Finished a set', state: count(view.run.songs.length) });
    }
  }, [view, songs.length]);

  let content: React.ReactNode;
  if (view.name === 'play') {
    const { run } = view;
    const song = run.songs[run.index];
    const more = run.index + 1 < run.songs.length;
    content = (
      <PlayScreen
        key={view.key}
        title={song.title}
        artist={song.artist}
        position={run.index + 1}
        total={run.songs.length}
        buffer={view.buffer}
        chart={run.charts[run.index]}
        startAt={run.test?.startAt}
        settings={settings}
        onSettings={() => setSongSettings(true)}
        settingsOpen={songSettings}
        onQuit={() => {
          setSongSettings(false);
          setView(run.test ? run.test.back : run.lobby);
        }}
        onSkip={more ? () => void playAt(withResult(run, { song, results: null }), run.index + 1) : undefined}
        // A test play keeps no score: it goes back to the editor with how it went.
        onFinish={(r) => (run.test ? setView({ ...run.test.back, tested: r }) : void finish(run, r))}
      />
    );
  } else {
    let screen: React.ReactNode;
    if (view.name === 'editor') {
      screen = (
        <EditorScreen
          key={view.song.id}
          song={view.song}
          settings={settings}
          tested={view.tested}
          onTest={(chart, startAt) => testPlay(view, chart, startAt)}
          onBack={() => setView(view.back)}
        />
      );
    } else if (view.name === 'settings') {
      screen = (
        <SettingsScreen settings={settings} model={model} device={device} onChange={updateSettings} onBack={() => setView(view.back)} />
      );
    } else if (view.name === 'library') {
      screen = (
        <LibraryScreen
          songs={songs}
          status={status}
          setlist={setlist}
          scores={scores}
          importing={importing}
          settings={settings}
          previewing={heard}
          onCurrent={setHighlight}
          onToggle={toggle}
          onDetails={setSheet}
          onReady={() => setView({ name: 'lobby', ids: setlist, from: 'library' })}
          onBack={goHome}
          onAdd={addSongs}
          actions={songActions}
        />
      );
    } else if (view.name === 'lobby') {
      // A song without a note on any part cannot be played, so it is not in the set.
      const list = view.ids.map((id) => byId.get(id)).filter((s): s is SongMeta => !!s && canPlay(analysisStatus[s.id]));
      screen = (
        <LobbyScreen
          songs={list}
          pick={pick}
          thin={thin}
          scores={scores}
          settings={settings}
          onPick={setPick}
          onVenue={(venue) => updateSettings({ ...settings, venue })}
          onStart={() => void start(view)}
          onBack={() => (view.from === 'library' ? setView({ name: 'library' }) : goHome())}
        />
      );
    } else if (view.name === 'results') {
      const { run } = view;
      const r = run.results[run.index];
      screen = (
        <ResultsScreen
          song={r.song}
          subtitle={subtitle(run)}
          results={r.results!}
          best={r.best}
          position={run.index + 1}
          total={run.songs.length}
          next={run.songs[run.index + 1]}
          nextPart={run.charts[run.index + 1]?.part}
          nextParts={run.parts?.[run.index + 1]}
          onNextPart={(p: Part) => void setNextPart(run, p)}
          settings={settings}
          onRetry={() => void playAt(run, run.index)}
          onNext={() => advance(run)}
          onEnd={() => setView({ name: 'summary', run: filled(run) })}
        />
      );
    } else if (view.name === 'summary') {
      const { run } = view;
      screen = (
        <SummaryScreen set={run.results} subtitle={subtitle(run)} onAgain={() => void playAt({ ...run, results: [] }, 0)} onDone={goHome} />
      );
    } else {
      screen = (
        <HomeScreen
          songs={songs}
          status={status}
          setlist={setSongs_}
          played={played}
          seed={seed}
          importing={importing}
          empty={songs.length === 0}
          onLibrary={() => setView({ name: 'library' })}
          onSet={(ids) => setView({ name: 'lobby', ids, from: 'home' })}
          onAdd={addSongs}
          tracks={{
            device,
            previewing: heard,
            onCurrent: setHighlight,
            onNew: addTrack,
            onPackage: async (file) => (await importFiles([file]))[0],
            onAnalyze: (song) => analysisManager.enqueue(song.id, true),
            onScratch: startFromScratch,
            onOpen: (song) => setView({ name: 'editor', song, back: view }),
            toast,
          }}
          onSettings={() => setView({ name: 'settings', back: view })}
          onExit={canExit() ? () => setExitAsk(true) : undefined}
          update={update.state === 'available' ? update.version : undefined}
          onUpdate={() => setAppCard('update')}
          onInstallApp={update.state === 'unsupported' ? () => setAppCard('install') : undefined}
          settings={settings}
        />
      );
    }
    content = (
      <div className={`menu on-${view.name}`}>
        <MenuBackground graphics={settings.graphics} venue={menuVenue(settings.venue)} onReady={onStage} />
        <div className="veil" aria-hidden />
        {/* One entrance per screen change; the stage behind it stays. */}
        {booted && (
          <div className={`scene ${sceneDirRef.current} ${fromBoot ? 'from-boot' : ''}`} key={sceneKey}>
            {screen}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      {content}
      {sheet && sheetOpen && (
        <SongSheet
          song={byId.get(sheet.id) ?? sheet}
          status={status[sheet.id] ?? { state: 'idle' }}
          scores={scores}
          slot={setlist.indexOf(sheet.id)}
          setFull={setlist.length >= SET_MAX}
          previewing={heard === sheet.id}
          onToggle={() => toggle(sheet)}
          onAnalyze={() => songActions.analyze([sheet])}
          onExport={() => songActions.exportSong(sheet)}
          onEdit={() => songActions.edit(sheet)}
          onDelete={() => void songActions.remove([sheet])}
          onClose={() => setSheet(null)}
        />
      )}
      {metaSong && (
        <MetadataSheet
          song={byId.get(metaSong.id) ?? metaSong}
          onSave={async (change) => {
            await updateSongMeta(metaSong.id, change);
            await refresh();
          }}
          onClose={() => setMetaSong(null)}
        />
      )}
      {songSettings && view.name === 'play' && (
        <div className="menu settings-over" data-modal>
          <div className="veil" aria-hidden />
          <div className="scene fwd">
            <SettingsScreen
              settings={settings}
              model={model}
              device={device}
              onChange={updateSettings}
              onBack={() => setSongSettings(false)}
              inSong
            />
          </div>
        </div>
      )}
      {exitAsk && (
        <Dialog title="Close the game" variant="card" closeLabel="Stay" onClose={() => setExitAsk(false)}>
          {(close) => (
            <div className="pause-card">
              <h2 className="display">Close the game?</h2>
              <p className="hint">Your library, scores and settings are saved.</p>
              <button type="button" className="btn wide" data-autofocus data-sfx="back" onClick={close}>
                Stay
              </button>
              <button type="button" className="btn primary wide" onClick={() => void exitApp()}>
                Close the game
              </button>
            </div>
          )}
        </Dialog>
      )}
      {appCard === 'update' && <UpdateCard settings={settings} onClose={() => setAppCard(null)} />}
      {appCard === 'install' && <InstallAppCard settings={settings} onClose={() => setAppCard(null)} />}
      {typing && <VirtualKeyboard target={typing} settings={settings} onClose={() => setTyping(null)} />}
      {/* The desktop window has no title bar: in Window mode this strip along the top moves it. */}
      {inDesktopApp() && settings.displayMode === 'windowed' && <div className="drag-strip" data-tauri-drag-region aria-hidden />}
      <ActionBar settings={settings} />
      <FocusRing />
      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <span>Drop songs or Soundwave song files to add them</span>
        </div>
      )}
      {launch && (
        <div className={`launch-wipe ${launch}`} aria-hidden data-nav-off>
          <Busy />
          <span />
          <span />
          <span />
        </div>
      )}
      <Toasts items={toasts.items} onDismiss={toasts.dismiss} />
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void importFiles(files);
        }}
      />
    </div>
  );
}
