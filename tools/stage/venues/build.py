"""
Builds one of the venues made in code-free Blender geometry (Mainstage, Warehouse, Arena 360,
Basement) and exports it for the game:

    blender -b --factory-startup -P tools/stage/venues/build.py -- --venue warehouse \
        --out public/stage/warehouse [--preview local-audio/stage/warehouse.png --view front] [--save x.blend]

Each venue is a module next to this file (warehouse.py, ...) with a `build(kit)` that models it
with the kit (kit.py) and returns the venue's own data for the game. The geometry is gathered per
material, its contact shading is baked into vertex colours (the game's shaders read it as
ambient occlusion), and it is written as venue.glb, with venue.json beside it holding the
positions the game needs: moving heads, the band's marks, LED screens, the places of repeated
parts, light sources.

The game draws every material role with its own shaders (src/render/venues/kit/model.ts); the
preview renders here use plain colours, for checking shape and layout.
"""
import argparse
import importlib
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit as K  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--venue', required=True)
ap.add_argument('--out', default='')
ap.add_argument('--preview', default='')
ap.add_argument('--view', default='front')
ap.add_argument('--save', default='')
ap.add_argument('--ao-samples', type=int, default=24)
ap.add_argument('--no-ao', action='store_true')
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

module = importlib.import_module(args.venue)
kit = K.Kit()
own = module.build(kit) or {}
objects = kit.finish()
views = own.pop('views', {})
ao_distance = own.pop('ao', 2.0)


def to_blender(p):
    return Vector((p[0], -p[2], p[1]))


def preview(path, view):
    loc, tgt, hfov = views[view]
    data = bpy.data.cameras.new('Preview')
    data.sensor_width = 36
    data.lens = 18 / math.tan(math.radians(hfov) / 2)
    data.clip_end = 3000
    cam = bpy.data.objects.new('Preview', data)
    scene.collection.objects.link(cam)
    cam.location = to_blender(loc)
    cam.rotation_euler = (to_blender(tgt) - to_blender(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    for o in objects:
        o.hide_render = o.name.startswith('Proto_')
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_cavity = True
    scene.display.shading.show_shadows = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    for o in objects:
        o.hide_render = False


def bake_contact_shading(objs, samples, distance):
    """Ambient occlusion from the whole venue into each mesh's vertex colours."""
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.device = 'CPU'
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.light_settings.distance = distance
    for o in objs:
        me = o.data
        attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
        me.color_attributes.active_color = attr
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')


def export(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    # Glows, screens, podium displays and repeated parts are lit by the game alone; the rest gets its shading baked.
    shaded = [o for o in objects if not o.data.materials[0].name.startswith(('Glow', 'LED', 'Podium')) and not o.name.startswith('Proto_')]
    if not args.no_ao:
        bake_contact_shading(shaded, args.ao_samples, ao_distance)
    data = {'version': 1, **kit.data, **own}
    glb = os.path.join(out_dir, 'venue.glb')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_yup=True, export_lights=False, export_cameras=False,
                              export_texcoords=True, export_normals=True, export_extras=False, export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_active_vertex_color_when_no_material=True, export_animations=False,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    with open(os.path.join(out_dir, 'venue.json'), 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects)
    print('exported', glb, 'objects', len(objects), 'tris', tris, 'fixtures', len(kit.data['fixtures']), 'size', os.path.getsize(glb))


if args.preview:
    preview(args.preview, args.view)
if args.save:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save))
if args.out:
    export(args.out)
