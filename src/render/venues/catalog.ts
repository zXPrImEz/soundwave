/**
 * The venues a set can be played in: their names and a line on each, for the menus. Nothing here
 * needs the renderer, so the interface can list them without loading any of it.
 */
export const VENUES = [
  { id: 'moonrise', name: 'Moonrise', blurb: 'Open-air festival by the lake under a night sky' },
  { id: 'mainstage', name: 'Mainstage', blurb: 'A palace of domes and towers, from sunset into the night' },
  { id: 'monolith', name: 'Monolith', blurb: 'Four concrete gates and one bar of light on a lake shore' },
  { id: 'warehouse', name: 'Warehouse', blurb: 'Concrete, lasers and strobes in an old factory hall' },
  { id: 'arena', name: 'Arena 360', blurb: 'In the round under a steel dome, halos of light overhead' },
  { id: 'basement', name: 'Basement', blurb: 'A DJ in the middle of the crowd, filmed by hand' },
  { id: 'bar', name: 'Bar', blurb: 'A small stage in a bar, close enough to touch' },
] as const;

export type VenueId = (typeof VENUES)[number]['id'];
/** What the player picks: a venue, or a different one for every song. */
export type VenueChoice = VenueId | 'random';

export const VENUE_IDS: readonly VenueId[] = VENUES.map((v) => v.id);
export const DEFAULT_VENUE: VenueId = 'moonrise';

export function isVenueChoice(v: unknown): v is VenueChoice {
  return v === 'random' || VENUE_IDS.includes(v as VenueId);
}

export function venueName(choice: VenueChoice): string {
  return choice === 'random' ? 'Random' : (VENUES.find((v) => v.id === choice)?.name ?? choice);
}

/** The venue behind the menus: the one chosen, or the first one while every song gets its own. */
export function menuVenue(choice: VenueChoice): VenueId {
  return choice === 'random' ? DEFAULT_VENUE : choice;
}

/**
 * The venue to build for a choice. Random picks one by `seed` (a song's place in the set, say), never
 * the one in `avoid`, so two songs in a row do not land in the same place.
 */
export function resolveVenue(choice: VenueChoice, seed = 0, avoid?: VenueId): VenueId {
  if (choice !== 'random') return choice;
  const pool = VENUE_IDS.filter((v) => v !== avoid);
  const i = Math.floor((Math.abs(Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1) * pool.length);
  return pool[Math.min(pool.length - 1, i)];
}
