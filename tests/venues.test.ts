import { describe, expect, it } from 'vitest';
import { DEFAULT_VENUE, isVenueChoice, menuVenue, resolveVenue, VENUE_IDS, venueName } from '../src/render/venues/catalog';
import { MIN_FLASH_GAP, StrobeGate } from '../src/render/venues/kit/strobe';
import { normalizeSettings } from '../src/game/settings';

describe('venues', () => {
  it('knows every venue and the random choice', () => {
    expect(VENUE_IDS).toEqual(['moonrise', 'mainstage', 'monolith', 'warehouse', 'arena', 'basement', 'bar']);
    for (const v of VENUE_IDS) expect(isVenueChoice(v)).toBe(true);
    expect(isVenueChoice('random')).toBe(true);
    expect(isVenueChoice('stadium')).toBe(false);
    expect(venueName('arena')).toBe('Arena 360');
    expect(venueName('random')).toBe('Random');
  });

  it('builds the chosen venue, and a real one for random', () => {
    expect(resolveVenue('bar', 3)).toBe('bar');
    for (let seed = 0; seed < 50; seed++) {
      const v = resolveVenue('random', seed);
      expect(VENUE_IDS).toContain(v);
      expect(resolveVenue('random', seed, v)).not.toBe(v);
    }
    const seen = new Set(Array.from({ length: 200 }, (_, seed) => resolveVenue('random', seed)));
    expect(seen.size).toBe(VENUE_IDS.length);
  });

  it('shows the chosen venue behind the menus, the first one while every song gets its own', () => {
    expect(menuVenue('warehouse')).toBe('warehouse');
    expect(menuVenue('random')).toBe(DEFAULT_VENUE);
  });

  it('stores the venue with the settings and repairs a stored one it does not know', () => {
    expect(normalizeSettings({}).venue).toBe(DEFAULT_VENUE);
    expect(normalizeSettings({ venue: 'basement' }).venue).toBe('basement');
    expect(normalizeSettings({ venue: 'random' }).venue).toBe('random');
    expect(normalizeSettings({ venue: 'stadium' as never }).venue).toBe(DEFAULT_VENUE);
  });
});

describe('strobes', () => {
  it('never flash more than three times a second, however often they are asked to', () => {
    const gate = new StrobeGate();
    const fired: number[] = [];
    // Asked on every frame at 120 fps for ten seconds.
    for (let i = 0; i < 1200; i++) {
      const t = i / 120;
      if (gate.fire(t)) fired.push(t);
    }
    for (let i = 1; i < fired.length; i++) expect(fired[i] - fired[i - 1]).toBeGreaterThanOrEqual(MIN_FLASH_GAP - 1e-9);
    for (let s = 0; s < 10; s++) expect(fired.filter((t) => t >= s && t < s + 1).length).toBeLessThanOrEqual(3);
  });
});
