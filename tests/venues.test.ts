import { describe, expect, it } from 'vitest';
import { DEFAULT_VENUE, isVenueChoice, menuVenue, resolveVenue, VENUE_IDS, venueName } from '../src/render/venues/catalog';
import { MIN_FLASH_GAP, StrobeGate } from '../src/render/venues/kit/strobe';
import * as THREE from 'three';
import { LED_LOOKS, LedScreen, pickLook } from '../src/render/venues/kit/led';
import { Lasers, cone } from '../src/render/venues/kit/lasers';
import { laserPrograms } from '../src/render/venues/warehouseLasers';
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

  it('play their own looks, and the drop looks in a peak', () => {
    const own = ['bars', 'grid'] as const;
    const drops = ['spectrum', 'vortex', 'strobe'] as const;
    expect(pickLook(own, drops, 3, false)).toBe('grid');
    expect(pickLook(own, drops, 4.5, true)).toBe('vortex');
    expect(pickLook(own, [], 1, true)).toBe('grid');
    expect(pickLook(own, drops, -1, false)).toBe('grid');
  });
});

describe('lasers', () => {
  it('turn a cone of beams round its axis at the angle asked', () => {
    const out = new Lasers(16);
    const from = new THREE.Vector3(0, 10, 0);
    cone(out, from, 8, 0.4, -1.2, 0.3, 10, [new THREE.Color(1, 0, 0)], 1);
    out.end(720);
    const b = out.mesh.geometry.getAttribute('aB') as THREE.InstancedBufferAttribute;
    const axis = new THREE.Vector3(Math.sin(0.4) * Math.cos(-1.2), Math.sin(-1.2), Math.cos(0.4) * Math.cos(-1.2));
    expect(out.mesh.geometry.instanceCount).toBe(8);
    for (let i = 0; i < 8; i++) {
      const dir = new THREE.Vector3().fromBufferAttribute(b, i).sub(from);
      expect(dir.length()).toBeCloseTo(10, 5);
      expect(dir.angleTo(axis)).toBeCloseTo(0.3, 5);
    }
  });

  it('play the sheet alone when calm, more programmes as the show builds, everything in overdrive', () => {
    expect(laserPrograms('calm', 3, 0)).toEqual(['sheet']);
    const groove = new Set(Array.from({ length: 8 }, (_, p) => laserPrograms('groove', p, 0)[1]));
    expect(groove.size).toBe(4);
    for (let p = 0; p < 8; p++) {
      const peak = laserPrograms('peak', p, 0);
      expect(peak).toHaveLength(3);
      expect(new Set(peak).size).toBe(3);
    }
    expect(laserPrograms('groove', 0, 1)).toEqual(expect.arrayContaining(['tunnel', 'web', 'cones', 'storm']));
    expect(laserPrograms('peak', -5, 0)).toHaveLength(3);
  });
});
