import { ArrowLeft, Gauge, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { analysisManager } from '../analysis/manager';
import { DIFFICULTIES, lanesFor, PARTS, type Difficulty, type Part } from '../chart/types';
import type { Settings } from '../game/settings';
import { formatTime, partAmong, partFor, songParts, type Pick, type ThinParts } from '../game/setlist';
import { PadGlyph } from '../input/glyphs';
import { TAB_EVENT } from '../input/menuNav';
import { confirmInput } from '../input/pads';
import { playSfx } from '../audio/sfx';
import { menuPulse } from '../input/rumble';
import type { BestScore, SongMeta } from '../storage/db';
import { Hint, useActions, useHints } from './actions';
import { Cover } from './Cover';
import { HoldButton } from './HoldButton';
import { DIFFICULTY_LABEL, ICON_STROKE, PART_ICON, PART_LABEL, Pips, Stars } from './icons';
import { useSlide } from './useSlide';
import { keysOf } from '../input/bindings';
import { VENUES, type VenueChoice } from '../render/venues/catalog';

interface Props {
  songs: SongMeta[];
  pick: Pick;
  /** Per song, the parts it hardly has: a part no song of the set has cannot be chosen. */
  thin: ThinParts;
  scores: BestScore[];
  settings: Settings;
  onPick(pick: Pick): void;
  /** The venue the set is played in (a setting, chosen here too). */
  onVenue(venue: VenueChoice): void;
  onStart(): void;
  onBack(): void;
}

/** Per song, its notes on each part at the chosen difficulty, as they are counted. */
type Counts = Record<string, Partial<Record<Part, number>> | undefined>;

/** The venues to choose from, and a different one for every song. */
const VENUE_CHOICES: { id: VenueChoice; name: string; blurb: string }[] = [
  ...VENUES,
  { id: 'random', name: 'Random', blurb: 'A different venue for every song' },
];

/** What a song has almost none of, in a sentence. */
const PART_STUFF: Record<Part, string> = { vocals: 'vocals', lead: 'lead instrument', bass: 'bass', drums: 'drums' };

/** Ready up: the set in order, the part and difficulty to play it on, and the button that starts it. */
export function LobbyScreen({ songs, pick, thin, scores, settings, onPick, onVenue, onStart, onBack }: Props) {
  const hints = useHints(settings);
  const [counts, setCounts] = useState<Counts>({});
  // The parts each song has: those it does not hardly have, less any without a note at this
  // difficulty (once counted).
  const own = (s: SongMeta) => songParts(s.id, thin).filter((p) => (counts[s.id]?.[p] ?? 1) > 0);
  // The part chosen here is the first song's: only the parts it has notes on can be chosen, and
  // the set starts on the chosen one, or on the first song's first part when it lacks that one (the
  // choice itself is kept for the next set). The songs after it follow the part where they have it
  // and can be changed between songs.
  const open = songs.length ? own(songs[0]) : [];
  const part = partFor(pick, open);
  // A song without the part is played on one it has instead.
  const partOf = (s: SongMeta) => partAmong(part, own(s));

  // The notes each song has on each of its parts, at the chosen difficulty.
  useEffect(() => {
    let cancelled = false;
    setCounts({});
    void (async () => {
      for (const s of songs) {
        const n: Partial<Record<Part, number>> = {};
        for (const p of songParts(s.id, thin)) {
          const chart = await analysisManager.chart(s.id, p, pick.difficulty).catch(() => undefined);
          if (cancelled) return;
          n[p] = chart?.notes.length ?? 0;
        }
        setCounts((c) => ({ ...c, [s.id]: n }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [songs, pick.difficulty, thin]);

  // Shoulder buttons (Q and E) step through the difficulties.
  useEffect(() => {
    const onTab = (e: Event) => {
      const d = (e as CustomEvent<number>).detail;
      const i = DIFFICULTIES.indexOf(pick.difficulty) + d;
      if (i < 0 || i >= DIFFICULTIES.length) return;
      playSfx('tab');
      menuPulse(d < 0 ? 'tab-left' : 'tab-right');
      onPick({ ...pick, difficulty: DIFFICULTIES[i] });
    };
    window.addEventListener(TAB_EVENT, onTab);
    return () => window.removeEventListener(TAB_EVENT, onTab);
  }, [pick, onPick]);

  // The top face button (Triangle, Y, X on a Switch pad) steps to the next part the set has, round and round.
  const nextPart = () => {
    if (open.length < 2) return;
    playSfx('tab');
    menuPulse('tab-right');
    onPick({ ...pick, part: open[(open.indexOf(part) + 1) % open.length] });
  };

  // The left face button (Square, X, Y on a Switch pad) does the same for the difficulty.
  const nextDifficulty = () => {
    playSfx('tab');
    menuPulse('tab-right');
    onPick({ ...pick, difficulty: DIFFICULTIES[(DIFFICULTIES.indexOf(pick.difficulty) + 1) % DIFFICULTIES.length] });
  };

  useActions([
    { id: 'back', label: 'Back', icon: ArrowLeft, kbd: 'Escape', sfx: 'back', run: onBack },
    { id: 'part-next', label: 'Next part', icon: PART_ICON[part], ...keysOf('lobby.part'), bar: false, run: nextPart },
    { id: 'difficulty-next', label: 'Next difficulty', icon: Gauge, ...keysOf('lobby.difficulty'), bar: false, run: nextDifficulty },
    ...PARTS.map((p, i) => ({
      id: `part-${p}`,
      label: PART_LABEL[p],
      icon: PART_ICON[p],
      ...keysOf(`lobby.part${i + 1}`),
      bar: false,
      run: () => open.includes(p) && onPick({ ...pick, part: p }),
    })),
  ]);

  const pad = hints.mode === 'pad';
  const partRow = useSlide<HTMLDivElement>(part);
  const diffRow = useSlide<HTMLDivElement>(pick.difficulty);
  const venueRow = useSlide<HTMLDivElement>(settings.venue);
  const venue = VENUE_CHOICES.find((v) => v.id === settings.venue) ?? VENUE_CHOICES[0];
  const lanes = lanesFor(pick.difficulty);
  const known = songs.every((s) => counts[s.id] !== undefined);
  const notesOf = (s: SongMeta) => {
    const p = partOf(s);
    return counts[s.id] === undefined ? undefined : p ? (counts[s.id]?.[p] ?? 0) : 0;
  };
  const playable = songs.filter((s) => (notesOf(s) ?? 0) > 0).length;
  const total = formatTime(songs.reduce((t, s) => t + s.duration, 0));
  const best = (s: SongMeta) => scores.find((b) => b.songId === s.id && b.part === partOf(s) && b.difficulty === pick.difficulty);

  return (
    <div className="page lobby">
      <header className="page-head">
        <h1 className="page-title">Ready up</h1>
        <p className="head-count">
          {songs.length} {songs.length === 1 ? 'song' : 'songs'}
          {total && ` · ${total}`}
        </p>
      </header>
      <div className="lobby-body">
        <ol className="set-cards" aria-label="Setlist">
          {songs.map((s, i) => {
            const n = notesOf(s);
            const b = best(s);
            return (
              <li key={s.id} className={`set-card ${n === 0 ? 'skipped' : ''}`} style={{ ['--i' as string]: i }}>
                <span className="slot-num" aria-hidden>
                  {i + 1}
                </span>
                <Cover blob={s.cover} title={s.title} />
                <span className="song-text">
                  <span className="song-title">{s.title}</span>
                  <span className="song-artist">
                    {s.artist}
                    {s.duration > 0 && ` · ${formatTime(s.duration)}`}
                  </span>
                  <span className="set-notes">
                    {n === undefined ? (
                      'Counting notes…'
                    ) : n === 0 ? (
                      <span className="warn">
                        <TriangleAlert strokeWidth={ICON_STROKE} aria-hidden />
                        No notes found. This song will be skipped.
                      </span>
                    ) : (
                      `${n.toLocaleString()} notes`
                    )}
                  </span>
                </span>
                <span className="set-best">
                  {b ? (
                    <>
                      <Stars n={b.stars} />
                      <span className="num">{b.score.toLocaleString()}</span>
                    </>
                  ) : (
                    <span className="dim">Not played</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        <section className="ready-panel" data-nav-group="ready" aria-label="Part, difficulty and venue">
          <h2 className="label" id="part-label">
            Part
          </h2>
          {/* On a controller the button that steps through a row sits to its left. */}
          <div className="pick-line">
            {pad && (
              <span className="pick-hint" aria-hidden>
                <PadGlyph input={keysOf('lobby.part').pad ?? 'b3'} style={hints.style} />
              </span>
            )}
            <div className="part-row slide" ref={partRow} role="radiogroup" aria-labelledby="part-label">
              <span className="sel" aria-hidden />
              {PARTS.map((p, i) => {
                const Icon = PART_ICON[p];
                const on = part === p;
                const off = !open.includes(p);
                const why = `${songs.length === 1 ? 'This song has' : 'The first song has'} no ${PART_STUFF[p]}`;
                return (
                  <button
                    key={p}
                    type="button"
                    className={`choice part ${on ? 'on' : ''}`}
                    data-on={on}
                    data-action={`part-${p}`}
                    role="radio"
                    aria-checked={on}
                    disabled={off}
                    title={off ? why : undefined}
                    aria-label={off ? `${PART_LABEL[p]}: not available. ${why}.` : undefined}
                    onClick={() => onPick({ ...pick, part: p })}
                  >
                    <Icon strokeWidth={ICON_STROKE} aria-hidden />
                    <span>{PART_LABEL[p]}</span>
                    {!off && <Hint kbd={keysOf(`lobby.part${i + 1}`).kbd} mode={pad ? 'touch' : hints.mode} style={hints.style} />}
                  </button>
                );
              })}
            </div>
          </div>

          <h2 className="label" id="diff-label">
            Difficulty
            {!pad && (
              <span className="label-hints" aria-hidden>
                <Hint kbd={keysOf('menus.tabPrev').kbd} {...hints} />
                <Hint kbd={keysOf('menus.tabNext').kbd} {...hints} />
              </span>
            )}
          </h2>
          <div className="pick-line">
            {pad && (
              <span className="pick-hint" aria-hidden>
                <PadGlyph input={keysOf('lobby.difficulty').pad ?? 'b2'} style={hints.style} />
              </span>
            )}
            <div className="diff-row slide" ref={diffRow} role="radiogroup" aria-labelledby="diff-label">
              <span className="sel" aria-hidden />
              {DIFFICULTIES.map((d: Difficulty) => {
                const on = pick.difficulty === d;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`choice diff ${on ? 'on' : ''}`}
                    data-on={on}
                    role="radio"
                    aria-checked={on}
                    onClick={() => onPick({ ...pick, difficulty: d })}
                  >
                    <Pips difficulty={d} />
                    <span>{DIFFICULTY_LABEL[d]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="lane-info">
            <span>{lanes} lanes</span>
            {hints.mode === 'touch' && <span className="dim">Tap the lanes to play</span>}
          </p>

          <h2 className="label" id="venue-label">
            Venue
          </h2>
          <div className="venue-row slide" ref={venueRow} role="radiogroup" aria-labelledby="venue-label" aria-describedby="venue-blurb">
            <span className="sel" aria-hidden />
            {VENUE_CHOICES.map((v) => {
              const on = settings.venue === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  className={`choice venue ${on ? 'on' : ''}`}
                  data-on={on}
                  role="radio"
                  aria-checked={on}
                  onClick={() => onVenue(v.id)}
                >
                  <span>{v.name}</span>
                </button>
              );
            })}
          </div>
          <p className="venue-blurb dim" id="venue-blurb">
            {venue.blurb}
          </p>

          <HoldButton
            label={(PART_LABEL[part] as Part | string) + ' · ' + DIFFICULTY_LABEL[pick.difficulty]}
            hint={
              !known
                ? 'Getting the charts ready…'
                : playable === 0
                  ? 'No notes on this part. Pick another one.'
                  : hints.mode === 'keyboard'
                    ? 'Hold Enter to start'
                    : 'Hold to start'
            }
            disabled={!known || playable === 0}
            glyph={pad ? <PadGlyph input={confirmInput(hints.style)} style={hints.style} /> : undefined}
            glyphStyle={hints.style}
            onComplete={onStart}
          />
        </section>
      </div>
    </div>
  );
}
