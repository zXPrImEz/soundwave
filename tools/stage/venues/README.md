# Venue models

Every venue but Moonrise is modelled here, in Blender, by a script: `build.py` runs one venue module
(`warehouse.py`, `arena.py`, ...) against the modelling kit in `kit.py` and writes
`public/stage/<venue>/venue.glb` and `venue.json`.

```
blender -b --factory-startup -P tools/stage/venues/build.py -- --venue warehouse --out public/stage/warehouse
blender -b --factory-startup -P tools/stage/venues/build.py -- --venue warehouse --preview local-audio/stage/warehouse.png --view front
```

The first bakes contact shading (a few minutes) and exports; the second only renders a plain
preview of one of the module's `views`, for checking shape and layout while modelling.

## Conventions

- **Axes** are the game's: Y up, metres, the stage toward -z, the crowd toward +z. `kit.py` turns
  everything to Blender's Z up when it makes the objects.
- **Material names are roles.** The game gives each role its shader and, where there is one, a
  scanned texture (`src/render/venues/<venue>.ts`, `src/render/venues/kit/roles.ts`). Gear roles
  every venue has: `Black`, `Dark`, `Alu`, `Chrome`, `Grille`, `Rubber`, `Steel`, and the lights
  `Glow.Lens`, `Glow.Screen`, `Glow.Pad`, `Glow.Green`, `Glow.Amber`, `Glow.Red`, `Glow.Edge`,
  `Glow.Jog`, `Glow.Meter`. A venue adds its own (`Concrete`, `Brick`, `Glow.Sodium`, ...).
- **Geometry is gathered per role** into one object each. Parts the game handles on its own are
  objects of their own, by name (underscores: the game's glTF loader drops dots):
  - `LED_<name>` or `LED_<name>_<n>`: an LED screen, uvs 0..1 across it.
  - `Proto_<name>`: a shape the game repeats at the places `kit.instance(name, ...)` records.
  - `Move_<name>`: a part the game moves or lights by itself.
  - `Podium_<part>_<piece>`: a player's podium (`kit.podium`), lifted with the music by the game
    (`src/render/venues/kit/podiums.ts`); its lid and wall take the role `Podium.<part>`.
- **`venue.json`** carries what the game needs to know: `fixtures` (every `kit.moving_head`),
  `marks` (where the players and the DJ stand), `podiums` (each player's: half axes, how far it
  rises, the floor it stands on), `screens`, `instances`, `sources` (laser heads,
  spark fountains, CO2 jets, confetti cannons, flame jets, fireworks), and whatever the module
  returns besides `views` and `ao`.
