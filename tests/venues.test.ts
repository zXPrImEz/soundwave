import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VENUE, isVenueChoice, menuVenue, resolveVenue, VENUE_IDS, venueName } from '../src/render/venues/catalog';
import { MIN_FLASH_GAP, StrobeGate } from '../src/render/venues/kit/strobe';
import { LED_LOOKS, LedScreen } from '../src/render/venues/kit/led';
import type { ModelData } from '../src/render/venues/kit/model';
import { PLAYERS, liftHeight, type LiftFrame } from '../src/render/venues/kit/podiums';
import { normalizeSettings } from '../src/game/settings';

describe('venues', () => {
  it('knows every venue and the random choice', () => {
    expect(VENUE_IDS).toEqual(['moonrise', 'mainstage', 'monolith', 'warehouse', 'arena', 'basement']);
    for (const v of VENUE_IDS) expect(isVenueChoice(v)).toBe(true);
    expect(isVenueChoice('random')).toBe(true);
    expect(isVenueChoice('stadium')).toBe(false);
    expect(venueName('arena')).toBe('Arena 360');
    expect(venueName('random')).toBe('Random');
  });

  it('builds the chosen venue, and a real one for random', () => {
    expect(resolveVenue('basement', 3)).toBe('basement');
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
    // The Bar was retired; a set stored with it opens in the default venue.
    expect(normalizeSettings({ venue: 'bar' as never }).venue).toBe(DEFAULT_VENUE);
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

describe('led screens', () => {
  it('pick a real look for any bar count, whole or not', () => {
    const screen = new LedScreen([4, 4], ['bars', 'grid', 'rings'], 1);
    for (const bar of [0, 1, 1.25, 2.5, 7.75]) {
      screen.next(bar);
      screen.update(0);
      expect(screen.material.uniforms.uLookB.value).toBe(LED_LOOKS[(['bars', 'grid', 'rings'] as const)[Math.floor(bar) % 3]]);
    }
  });
});

describe('podiums', () => {
  const frame = (energy: number, overdrive = 0): LiftFrame => ({ dt: 1 / 60, clock: 0, energy, overdrive });
  /** Where a podium settles after a minute of the same music. */
  const settle = (index: number, featured: number, f: LiftFrame) => {
    let h = 0;
    for (let i = 0; i < 3600; i++) h = liftHeight(h, 1.2, index, featured, f);
    return h;
  };

  it('rise with busier music, the featured player highest, all the way in overdrive, never past their travel', () => {
    expect(settle(1, 0.6, frame(0.9))).toBeGreaterThan(settle(1, 0.6, frame(0.2)));
    expect(settle(1, 1, frame(0.6))).toBeGreaterThan(settle(1, 0.4, frame(0.6)));
    expect(settle(1, 0.4, frame(0.3, 1))).toBeCloseTo(1.2, 3);
    for (const e of [0, 0.5, 1]) expect(settle(2, 1, frame(e, 1))).toBeLessThanOrEqual(1.2);
  });

  it('glide rather than jump', () => {
    expect(liftHeight(0, 1.2, 0, 1, frame(1, 1))).toBeLessThan(0.02);
  });

  it('stand under every player in every modelled venue, the marks on their lids', () => {
    for (const id of VENUE_IDS.filter((v) => v !== 'moonrise')) {
      const data = JSON.parse(readFileSync(`public/stage/${id}/venue.json`, 'utf8')) as ModelData;
      for (const part of PLAYERS) {
        const p = data.podiums?.[part];
        expect(p, `${id} ${part}`).toBeDefined();
        expect(data.marks[part][1]).toBeGreaterThan(p?.floor ?? 0);
        expect(p?.travel).toBeGreaterThan(0);
      }
    }
  });
});
