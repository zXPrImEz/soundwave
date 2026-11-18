import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../../stage/Director';

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Puts a venue together from simple solids, then merges everything that shares a material into
 * one mesh: a room of a few thousand boxes and tubes is drawn in a dozen draws.
 */
export class Builder {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  /** Any geometry, placed by `matrix`. */
  add(material: THREE.Material, geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
    const g = geometry.index ? geometry : geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
    if (matrix) g.applyMatrix4(matrix);
    const list = this.parts.get(material) ?? [];
    list.push(g);
    this.parts.set(material, list);
  }

  /** A box `size` big, centred at `at`, turned `yaw` about the vertical. */
  box(material: THREE.Material, size: Vec3, at: Vec3, yaw = 0) {
    this.add(material, new THREE.BoxGeometry(...size), M.compose(P.set(...at), Q.setFromAxisAngle(UP, yaw), S.set(1, 1, 1)));
  }

  /** A round post or tube from `a` to `b`. */
  rod(material: THREE.Material, a: Vec3, b: Vec3, radius: number, sides = 6) {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const len = from.distanceTo(to);
    if (len < 1e-4) return;
    const geo = new THREE.CylinderGeometry(radius, radius, len, sides, 1, true);
    Q.setFromUnitVectors(UP, to.clone().sub(from).normalize());
    this.add(material, geo, M.compose(from.add(to).multiplyScalar(0.5), Q, S.set(1, 1, 1)));
  }

  /** A disc or squat drum of `radius`, `height` tall, standing on `at`. */
  drum(material: THREE.Material, radius: number, height: number, at: Vec3, sides = 48) {
    this.add(
      material,
      new THREE.CylinderGeometry(radius, radius, height, sides),
      M.compose(P.set(at[0], at[1] + height / 2, at[2]), Q.identity(), S.set(1, 1, 1)),
    );
  }

  /** A flat panel `w` by `h` facing +z, centred at `at`, turned `yaw` (and tipped `pitch`). */
  panel(material: THREE.Material, w: number, h: number, at: Vec3, yaw = 0, pitch = 0) {
    const e = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    this.add(material, new THREE.PlaneGeometry(w, h), M.compose(P.set(...at), Q.setFromEuler(e), S.set(1, 1, 1)));
  }

  /**
   * A box truss from `a` to `b`: four chords `size` apart and zigzag lacing between them, the
   * aluminium frame a rig hangs from.
   */
  truss(material: THREE.Material, a: Vec3, b: Vec3, size = 0.4) {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const axis = to.clone().sub(from);
    const len = axis.length();
    axis.normalize();
    const side = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(axis, UP).normalize();
    const up = new THREE.Vector3().crossVectors(side, axis).normalize();
    const h = size / 2;
    const corners = [
      [h, h],
      [-h, h],
      [-h, -h],
      [h, -h],
    ].map(([x, y]) => side.clone().multiplyScalar(x).add(up.clone().multiplyScalar(y)));
    const at = (c: THREE.Vector3, t: number): Vec3 => {
      const p = from.clone().addScaledVector(axis, t).add(c);
      return [p.x, p.y, p.z];
    };
    for (const c of corners) this.rod(material, at(c, 0), at(c, len), size * 0.08, 5);
    const step = size * 1.4;
    for (let t = 0, k = 0; t + step <= len + 1e-3; t += step, k++)
      for (let f = 0; f < 4; f++) {
        const c0 = corners[f];
        const c1 = corners[(f + 1) % 4];
        if (k % 2) this.rod(material, at(c0, t), at(c1, t + step), size * 0.04, 4);
        else this.rod(material, at(c1, t), at(c0, t + step), size * 0.04, 4);
      }
  }

  /** The merged meshes, one per material. */
  build(name = 'venue'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [material, list] of this.parts) {
      const merged = mergeGeometries(list.map(clean), false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

/** Only position, normal and uv, the attributes every solid here has. */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  return g;
}

/** Disposes every geometry and material under `root`. */
export function disposeTree(root: THREE.Object3D) {
  const seen = new Set<object>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats)
      if (!seen.has(m)) {
        seen.add(m);
        m.dispose();
      }
  });
}
