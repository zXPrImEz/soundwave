import * as THREE from 'three';
import { gltf, part, type Fixture } from '../../aurora/assets';
import type { Vec3 } from '../../stage/Director';
import type { VenueId } from '../catalog';
import { glow } from './surface';

/** What tools/stage/venues/build.py writes next to a venue's venue.glb (game axes). */
export interface ModelData {
  version: number;
  fixtures: Fixture[];
  /** Named spots: where each player stands, the DJ, ... */
  marks: Record<string, Vec3>;
  /** LED screens by name: their size in metres. */
  screens: Record<string, { w: number; h: number }>;
  /** Where each repeated shape goes: x, y, z, yaw, scale. */
  instances: Record<string, number[][]>;
  /** Named points: laser heads, spark fountains, CO2 jets, confetti cannons, ... */
  sources: Record<string, Vec3[]>;
}

export interface Model {
  scene: THREE.Group;
  data: ModelData;
}

const cache = new Map<VenueId, Promise<Model>>();

/** Loads a venue's model once; later callers share it (each builds its own copy, see dressModel). */
export function loadModel(id: VenueId): Promise<Model> {
  let p = cache.get(id);
  if (!p) {
    const base = `${import.meta.env.BASE_URL}stage/${id}/`;
    p = Promise.all([
      part(gltf().loadAsync(`${base}venue.glb`)),
      part(
        fetch(`${base}venue.json`).then((r) => {
          if (!r.ok) throw new Error(`venue.json: ${r.status}`);
          return r.json() as Promise<ModelData>;
        }),
      ),
    ]).then(([g, data]) => ({ scene: g.scene, data }));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** A venue's model made ready to draw: its parts sorted out by the roles the build gave them. */
export interface Dressed {
  root: THREE.Group;
  /** LED screens by name (LED_column_L and LED_column_R are both `column`'s). */
  screens: Map<string, THREE.Mesh[]>;
  /** Shapes to repeat, by name. */
  protos: Map<string, THREE.BufferGeometry>;
  /** Parts the venue moves, by name. */
  moving: Map<string, THREE.Object3D>;
  dispose(): void;
}

/**
 * A copy of the model with the venue's own materials on it. Each material role the build used
 * (Concrete, Brick, Glow.Sodium, ...) takes the material `roles` gives for it, or for the first
 * part of its name; an unknown role is drawn plain grey. LED screens, shapes to repeat and moving
 * parts are taken out by name for the venue to dress and drive.
 */
export function dressModel(model: Model, roles: Record<string, THREE.Material>): Dressed {
  const root = model.scene.clone(true);
  const screens = new Map<string, THREE.Mesh[]>();
  const protos = new Map<string, THREE.BufferGeometry>();
  const moving = new Map<string, THREE.Object3D>();
  const made: { dispose(): void }[] = [];
  const plain = glow(0x777777, 0.2);
  made.push(plain);
  // A surface drawn with baked contact shading needs the colour attribute it is kept in; parts
  // without it (shapes to repeat) get a copy of their material that does without.
  const withoutAo = new Map<THREE.Material, THREE.Material>();
  const remove: THREE.Object3D[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = o.name;
    const role = (mesh.material as THREE.Material).name;
    if (name.startsWith('Proto_')) {
      protos.set(name.slice(6), mesh.geometry);
      remove.push(o);
      return;
    }
    if (name.startsWith('LED_')) {
      const key = name.split('_')[1];
      const uv = mesh.geometry.getAttribute('uv');
      // glTF stores v flipped; the screens' pictures are drawn the right way up.
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      screens.set(key, [...(screens.get(key) ?? []), mesh]);
      return;
    }
    if (name.startsWith('Move_')) moving.set(name.slice(5), o);
    let material = roles[role] ?? roles[role.split('.')[0]] ?? plain;
    const ao = !!mesh.geometry.getAttribute('color');
    if (material instanceof THREE.ShaderMaterial && material.vertexColors && !ao) {
      let copy = withoutAo.get(material);
      if (!copy) {
        copy = material.clone();
        (copy as THREE.ShaderMaterial).vertexColors = false;
        withoutAo.set(material, copy);
        made.push(copy);
      }
      material = copy;
    }
    mesh.material = material;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
  });
  for (const o of remove) o.removeFromParent();
  return {
    root,
    screens,
    protos,
    moving,
    dispose() {
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      for (const g of protos.values()) g.dispose();
      for (const m of made) m.dispose();
      for (const m of Object.values(roles)) m.dispose();
    },
  };
}

/**
 * Copies of a shape at the model's places for it, one instanced draw: each instance placed by its
 * x, y, z, yaw and scale. Colours per instance when the material wants them.
 */
export function instances(geometry: THREE.BufferGeometry, places: number[][], material: THREE.Material): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, places.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  places.forEach(([x, y, z, yaw = 0, s = 1], i) => {
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, yaw), new THREE.Vector3(s, s, s)));
    mesh.setColorAt(i, new THREE.Color(1, 1, 1));
  });
  mesh.frustumCulled = false;
  return mesh;
}
