# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Shipped as a Tauri desktop app (Windows first) whose UI is a web view; the same build runs in a browser on desktops, tablets and phones.

## Users

Rhythm-game players who want to play along to their own music collection. The game is headed for a public release, so first-time players arriving with no context are a primary audience, alongside returning players building up a library.

They play in four settings, all of which must work: at a desk with a keyboard and mouse, at a desk with a controller, from a couch with a controller on a TV several metres away, and on a touchscreen held in the hands, down to a phone.

## Product Purpose

Players import their own songs (MP3, WAV, FLAC, OGG, M4A) and the game analyzes each one into playable charts. Each song gets four parts (Vocals, Lead, Bass, Drums) at four difficulties (Easy, Medium and Hard on four lanes, Expert on five). Players play those charts on a scrolling note highway, scoring timed hits with streaks, a multiplier and overdrive phrases.

Success: any song a player owns turns into a chart that feels like playing the instrument, and the loop of picking a song, playing and improving feels quick and rewarding.

## Positioning

The game charts the player's own music. There is no fixed setlist: every song comes from the player's library and is analyzed locally, with optional stem separation from a local analysis service for more accurate charts.

## Operating Context

- Import by file picker or drag and drop; analysis runs in the background with progress per song and can take a minute or more per song.
- A set starts on Vocals at Expert until the player chooses otherwise. A part a song hardly has compared with the rest of it (almost no vocals, say) is not offered for playing: with one song it cannot be chosen, and in a longer set a song without it sits that set out. A chart the player writes for the part in the editor makes it playable.
- The website offers the desktop app (Get the app, with the download for the player's system); the desktop app finds new releases itself and installs them on the player's word (Settings › Advanced › Updates).
- The game opens behind an animated loading screen that waits until everything is there: the library, the scores, which songs have charts, and the 3D stage, built and drawn.
- The main menu has two tabs. Play offers sets: the player's own setlist and sets dealt from the library (a shuffle, the newest songs, songs without a score). Edit is the way into the track editor: the player's tracks as a list (one press opens a track in the editor), the highlighted track's charts beside it, and a new track.
- The music library lists every song with search and sort; a song is added to or taken out of the setlist (up to four songs) with one press. A song previews by itself while the player is on its row in a list or its details are open, and stops when they move to anything else. A song's details offer best scores on every part and difficulty, re-analysis, editing its charts, export and removal.
- Ready up: the set in order, one part and one difficulty for the whole set, the venue it is played in (or a different one for every song), and a button that is held to start. The menus show the chosen venue behind them.
- Track editor: a list of the player's songs, each opening in an editor for its sixteen charts (four parts at four difficulties); a new song is either analyzed first or started from scratch on a tempo found by listening, which works on every device. Notes are set down, stretched, marked, copied, repeated and deleted on a top-down view of the lanes; a chart can also be recorded by playing along, and test-played in the game from the cursor. Edited charts save as they change and are played in place of the generated ones.
- Play: the set's songs back to back. Countdown, highway with lanes and hit pads, score, stars, multiplier, overdrive meter, break countdowns for long gaps, pause with resume/restart/skip/leave, results after each song with grades, accuracy, streak and stars, and a summary of the whole set.
- Settings: Video (window mode, interface size, menu motion, venue, stage quality with texture size), Audio (volumes, song previews on or off, output device, mute in the background), Gameplay (note speed, audio offset and tap calibration), Keyboard bindings, Controller (detected controllers, glyph style, bindings, rumble), Touch (tap vibration, overdrive button side), Advanced (export and import the whole library with scores and settings as one backup file, delete everything behind a hold to confirm; the analysis model and what it runs on).
- Input: keyboard, mouse, touch and game controllers (Xbox, PlayStation 4 and 5, Switch and others). Menus are navigated by direction with the arrow keys or a controller (confirm/back conventions per controller family), by pointer, or by touch, and the interface shows the variant for the input used last: key hints, controller symbols or larger touch targets. Songs are played with keys, controller buttons or by tapping the lanes; rumble and DualSense haptics.

## Capabilities and Constraints

- Everything must be fully operable by keyboard alone, by controller alone and by touch alone; mouse is optional.
- Must read from a couch at TV distance, at a desk, and on a phone.
- Audio playback is the core of the experience; UI motion must never compete with the gameplay highway or cost frame time during play.
- The product is called Soundwave; the design does not depend on the name.
- The game must not name, imitate or recreate any existing commercial rhythm game, in look, copy, assets or layouts.
- The settings layout is tabbed; the screen set is Home, Music library (with Song details), Track editor, Ready up, Play (with Pause), Results, Set summary, Settings.

## Evidence on Hand

- The app ships without songs: all content is the player's own music, with embedded cover art when available (generated letter covers otherwise).
- No testimonials, press, customers or download numbers exist; none may be invented.

## Product Principles

1. Your music, playable in minutes: importing and starting a song should take as few steps as possible.
2. Any input, any distance: every screen works by keyboard, controller, mouse and touch, at a desk, from the couch and in the hand.
3. The highway is sacred: during play nothing distracts from reading notes.
4. Honest feedback: analysis progress, failures and fallbacks are always visible.
5. Feels like playing: timing, feedback and rumble make hits feel physical.

## Accessibility & Inclusion

- Full keyboard-only, controller-only and touch-only operation with clearly visible focus.
- Touch targets of at least 44 CSS pixels; nothing that needs a hover.
- Actions that ask to be held (starting a set) also work for assistive technology that cannot hold.
- Large, high-contrast text legible at TV distance.
- Respect reduced-motion preferences for non-essential animation, with a setting to override the system either way, and a setting for interface size.
- Sound is muted in automated testing; all states must also be understandable without audio.
