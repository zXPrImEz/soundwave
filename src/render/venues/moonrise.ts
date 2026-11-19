import * as THREE from 'three';
import { LEVEL_SHARE } from '../../game/graphics';
import { loadVenue } from '../aurora/assets';
import { CROWD_RECT, buildCrowdMap } from '../aurora/crowdMap';
import { makeBand, makeCrowd } from '../aurora/figures';
import { applyVenueMaterials } from '../aurora/materials';
import { shared } from '../aurora/shared';
import { buildSky } from '../aurora/sky';
import { terrainHeight } from '../aurora/terrain';
import { buildShots, type Vec3 } from '../stage/Director';
import { Podiums } from './kit/podiums';
import type { BeamPose, Venue, VenueContext, VenueFrame } from './types';

/** Camera spots the director adds itself (see buildShots), for placing detailed crowd figures. */
const EXTRA_CAMERAS: Vec3[] = [
  [-62, 7, 48],
  [62, 7, 48],
  [0, 1.6, 26],
  [-7, 5, 5],
  [7, 5, 5],
  [0, 6, 13],
];

/**
 * Moonrise: the open-air venue built in Blender (tools/stage/aurora): painted forms, a polished deck,
 * the moon screen, a lake that mirrors it all, a big wheel on the festival grounds, podiums that lift
 * the players, and an audience of thousands on the rising field.
 */
export async function buildMoonrise(ctx: VenueContext): Promise<Venue> {
  const assets = await loadVenue();
  const { g } = ctx;
  const data = assets.data;
  const root = new THREE.Group();
  const owned: { dispose(): void }[] = [];

  const sky = buildSky();
  root.add(sky);
  owned.push(sky.geometry, sky.material);

  const venue = assets.scene.clone(true);
  owned.push(...applyVenueMaterials(venue, data.deck, g.lights === 'medium' || g.lights === 'high'));
  root.add(venue);

  // The land, the lake and the festival grounds around the stage.
  const land = assets.scenery;
  let wheel: THREE.Object3D | null = null;
  let water: THREE.Object3D | null = null;
  if (land) {
    const scenery = land.scene.clone(true);
    owned.push(...applyVenueMaterials(scenery, data.deck, false));
    const hub = new THREE.Group();
    hub.position.set(...land.data.wheel.center);
    scenery.add(hub);
    hub.updateMatrixWorld();
    for (const piece of scenery.children.filter((o) => o.name.startsWith('Wheel_'))) hub.attach(piece);
    wheel = hub;
    root.add(scenery);
    water = scenery.getObjectByName('Water') ?? null;
  }
  const ground = (x: number, z: number) => terrainHeight(land?.data.terrain, x, z);

  const low = [
    ...Object.values(data.cameras)
      .map((c) => c.pos)
      .filter((p) => p[1] < 10),
    ...EXTRA_CAMERAS,
  ];
  const share = LEVEL_SHARE[g.crowd];
  const audience = makeCrowd(data, ctx.characters, share, low, assets.crowd.data.sync, ground);
  // The ground needs to know where they stand, to shade it under them.
  const crowdMap = buildCrowdMap(audience, share);
  owned.push(crowdMap);
  const players = makeBand(data, assets.band.data.band ?? {}, ctx.focus);
  // Each podium and what stands on it moves as one (the model dresses them itself).
  const podiums = new Podiums(venue, data.podiums, data.band, players, false);

  // Seven jets along the front edge of the deck, between the CO2 nozzles.
  const deck = data.deck;
  const flames: Vec3[] = [];
  for (let j = 0; j < 7; j++) {
    const a = Math.PI * (1.2 + (0.6 * j) / 6);
    const sx = Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** (2 / deck.power);
    const sy = Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** (2 / deck.power);
    flames.push([deck.center[0] + sx * deck.a * 1.02, deck.height, deck.center[2] - sy * deck.b * 1.02]);
  }
  // And two more to each side of it, where the note lane does not stand in front of them.
  for (const side of [-1, 1])
    flames.push(
      [deck.center[0] + side * (deck.a + 2.5), 1.9, deck.center[2] + 5],
      [deck.center[0] + side * (deck.a + 8.5), 0.3, deck.center[2] + 6.5],
    );

  const bind = () => {
    const moon = data.moon;
    shared.uGlowPos.value.set(...moon.center);
    shared.uMoon.value.set(moon.center[0], moon.center[1], moon.center[2], moon.radius);
    if (moon.arch) shared.uArch.value.set(moon.arch.halfWidth, moon.arch.height, moon.arch.power);
    const island = data.island;
    if (island) shared.uIsland.value.set(island.center[0], island.center[2], island.a, island.b);
    shared.uHazeFar.value.setRGB(0.007, 0.018, 0.08);
    shared.uHazeDensity.value = 0.0024;
    shared.uGlowFall.value = 0.0006;
    shared.uCrowdMap.value = crowdMap;
    shared.uCrowdRect.value.set(CROWD_RECT.x, CROWD_RECT.z, 1 / CROWD_RECT.w, 1 / CROWD_RECT.d);
    for (const c of shared.uLightCol.value) c.setRGB(0, 0, 0);
    if (land) {
      shared.uMoonDir.value.set(...land.data.moon).normalize();
      shared.uWaterLevel.value = land.data.terrain.water;
      land.data.shore.slice(0, 8).forEach((s, i) => {
        shared.uShore.value[i].set(...s.pos);
        shared.uShoreCol.value[i].set(s.color);
      });
    }
    podiums.bind();
  };

  const update = (f: VenueFrame) => {
    if (wheel) wheel.rotation.z += f.dt * 0.045;
    podiums.update(f);
  };

  const beam = (group: string, i: number, f: VenueFrame): BeamPose | undefined => {
    const s = f.show;
    const t = s.time;
    const own = (pose: BeamPose): BeamPose => ({ ...pose, level: pose.level * (i % 2 ? 1 : 0.55) });
    switch (group) {
      case 'Sky':
        return own({
          pan: Math.sin(t * 0.22 + i) * 0.16,
          tilt: Math.sin(t * 0.17 + i * 1.7) * 0.1,
          level: s.beamLevel * (i % 2 ? 0.7 : 0),
          color: 'accent',
        });
      case 'Ribbon':
        // Glints along the ribbon: lenses without a beam worth the name.
        return own({ pan: 0, tilt: 0, level: s.beamLevel * 0.12 });
      case 'Truss':
        return own({ pan: 0, tilt: 0, level: 0.25 + 0.2 * f.barPulse + 0.12 * f.low });
      case 'Halo':
        // The ring over the band: every head stays on its player and breathes with the bar.
        return own({ pan: 0, tilt: Math.sin(t * 0.4 + i) * 0.012, level: 0.25 + 0.16 * f.barPulse + 0.15 * s.beamLevel });
      case 'Delay':
      case 'Foh':
        return own({ pan: 0, tilt: 0, level: 0.14 });
      case 'Floor':
        return own({ pan: Math.sin(t * 0.5 + i * 0.6) * 0.25, tilt: 0, level: s.beamLevel * (0.35 + 0.4 * f.pulse) });
    }
    return undefined;
  };

  return {
    root,
    shots: buildShots(data.cameras, data.band, ctx.part),
    band: data.band,
    audience,
    players,
    fixtures: data.fixtures,
    fireworks: data.fireworks,
    co2: data.co2,
    flames,
    flameMiddle: [2, 4],
    looks: [
      { key: [1, 0.4, 0.76], accent: [0.42, 0.9, 1], wash: [0.3, 0.2, 1] },
      { key: [0.4, 0.84, 1], accent: [0.92, 0.95, 1], wash: [0.08, 0.3, 1] },
      { key: [1, 0.3, 0.6], accent: [0.76, 0.52, 1], wash: [0.72, 0.15, 0.72] },
      { key: [0.62, 0.56, 1], accent: [1, 0.6, 0.86], wash: [0.08, 0.5, 0.78] },
    ],
    mirror: water && land ? { level: land.data.terrain.water, hide: [water] } : undefined,
    bind,
    update,
    beam,
    // A close-up of a player follows their podium up and down.
    cameraLift: (shot) => podiums.cameraLift(shot),
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}
