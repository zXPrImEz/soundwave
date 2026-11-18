import * as THREE from 'three';
import { instances } from './model';
import { glow } from './surface';
import type { VenueFrame } from '../types';

/**
 * Rows of small lamps along a venue's edges (the model records where, see kit.instance('bulb')):
 * one instanced draw. They glow warm and steady when it is calm, a chase runs along them with the
 * beat as it builds, and in a peak they take the show's colours and sparkle.
 */
export class Bulbs {
  readonly mesh: THREE.InstancedMesh;
  private readonly material = glow(0xffffff, 1, true);
  private readonly color = new THREE.Color();
  private readonly warm: THREE.Color;

  constructor(geometry: THREE.BufferGeometry, places: number[][], warm: THREE.ColorRepresentation = 0xffc890) {
    this.mesh = instances(geometry, places, this.material);
    this.warm = new THREE.Color(warm);
  }

  update(f: VenueFrame, level = 1) {
    const s = f.show;
    const busy = Math.min(1, Math.max(0, (f.energy - 0.25) / 0.6));
    const peak = s.level === 'peak' || s.overdrive > 0.5;
    const n = this.mesh.count;
    for (let i = 0; i < n; i++) {
      const chase = Math.pow(Math.max(0, Math.cos((f.clock * 0.5 - i * 0.045) * Math.PI)), 6);
      const sparkle = peak ? (Math.abs((Math.sin(i * 12.9898 + Math.floor(f.clock * 4) * 78.233) * 43758.5453) % 1) > 0.6 ? 1.6 : 0.3) : 1;
      const k = level * (0.9 + 0.5 * f.barPulse + busy * 2.2 * chase) * sparkle + s.overdrive;
      this.color.copy(this.warm);
      if (busy > 0.3) this.color.lerp(i % 2 ? f.key : f.accent, Math.min(0.85, busy));
      this.mesh.setColorAt(i, this.color.multiplyScalar(k));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.material.dispose();
  }
}
