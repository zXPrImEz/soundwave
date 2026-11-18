import type * as THREE from 'three';
import { glow, modelSurface } from './surface';

/**
 * The materials for the roles the gear in every venue's model uses (see tools/stage/venues/kit.py):
 * black boxes, dark metal, aluminium, chrome, speaker grilles, rubber, and the small lights on it
 * all (lenses, screens, pads, meters, status lights). The ones the music drives are returned too.
 */
export function gearRoles() {
  const jog = glow(0x60c8ff, 2.2);
  const meter = glow(0x50ff90, 2);
  const lens = glow(0xdfe8ff, 1.2);
  const roles: Record<string, THREE.Material> = {
    Black: modelSurface({ color: 0x0b0b0d, rough: 0.55 }),
    Dark: modelSurface({ pattern: 'metal', color: 0x1c1d21, rough: 0.4, metal: 0.4, scale: 0.3 }),
    Alu: modelSurface({ pattern: 'metal', color: 0x8a8e96, rough: 0.3, metal: 0.9, scale: 0.4 }),
    Chrome: modelSurface({ pattern: 'metal', color: 0xc8ccd4, rough: 0.1, metal: 1, scale: 0.2 }),
    Grille: modelSurface({ pattern: 'grille', color: 0x2a2b2f, color2: 0x060607, rough: 0.7, scale: 1 }),
    Rubber: modelSurface({ color: 0x050506, rough: 1 }),
    Steel: modelSurface({ pattern: 'metal', color: 0x2a2c30, rough: 0.45, metal: 0.8, scale: 2 }),
    'Glow.Lens': lens,
    'Glow.Screen': glow(0x9fd0ff, 1.6),
    'Glow.Pad': glow(0xff3aa0, 1.6),
    'Glow.Green': glow(0x40ff80, 2),
    'Glow.Amber': glow(0xffa030, 2),
    'Glow.Red': glow(0xff2020, 2),
    'Glow.Edge': glow(0xffffff, 1.2),
    'Glow.Jog': jog,
    'Glow.Meter': meter,
  };
  return { roles, jog, meter, lens };
}
