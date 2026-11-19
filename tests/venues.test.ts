import { describe, expect, it } from 'vitest';
import { DEFAULT_VENUE, isVenueChoice, menuVenue, resolveVenue, VENUE_IDS, venueName } from '../src/render/venues/catalog';
import { crowdAt } from '../src/render/venues/kit/crowd';
import { MIN_FLASH_GAP, StrobeGate } from '../src/render/venues/kit/strobe';
import { LED_LOOKS, LedScreen } from '../src/render/venues/kit/led';
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

describe('crowds on spots', () => {
  // A ring of seats round a stage at the centre, one storey up.
  const seats = Array.from({ length: 400 }, (_, i) => [Math.sin(i / 64) * 40, 3, Math.cos(i / 64) * 40]);
  const area = { spots: seats, fill: 1, face: (): [number, number] => [0, 0], jitter: 0.1, wander: 0 };

  it('takes every spot when full, on its floor, near the spot and facing the stage', () => {
    const people = crowdAt(area, ['a', 'b'], 1, []);
    expect(people.length).toBe(seats.length);
    people.forEach((p, i) => {
      expect(p.pos[1]).toBe(3);
      expect(Math.hypot(p.pos[0] - seats[i][0], p.pos[2] - seats[i][2])).toBeLessThanOrEqual(0.1 * Math.SQRT2 + 1e-9);
      // Facing the centre: the yaw's direction points from the person back to the origin.
      expect(Math.sin(p.yaw) * -p.pos[0] + Math.cos(p.yaw) * -p.pos[2]).toBeCloseTo(Math.hypot(p.pos[0], p.pos[2]), 6);
      expect(p.far).toBe(true);
    });
  });

  it('thins out with the fill and the graphics share, and keeps room round a camera', () => {
    const quarter = crowdAt({ ...area, fill: 0.5 }, ['a'], 0.5, []).length;
    expect(quarter).toBeGreaterThan(seats.length * 0.15);
    expect(quarter).toBeLessThan(seats.length * 0.35);
    expect(crowdAt(area, ['a'], 0, [])).toEqual([]);
    const cam: [number, number, number] = [seats[0][0], 4.7, seats[0][2]];
    const people = crowdAt(area, ['a'], 1, [cam]);
    expect(people.every((p) => Math.hypot(p.pos[0] - cam[0], p.pos[2] - cam[2]) >= 1.4)).toBe(true);
    expect(people.some((p) => !p.far)).toBe(true);
  });
});
