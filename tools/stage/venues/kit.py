"""
The modelling kit the venue scripts share (see build.py): solids, trusses, tubes and the gear a show
is made of (moving heads, a DJ's booth, speaker stacks and hangs, road cases, a mixing desk,
barriers), built with bmesh.

Everything here works in the game's own axes (three.js: Y up, metres, the stage toward -z and the
crowd toward +z), so positions can go into the venue's JSON as they are; the meshes are turned to
Blender's Z up only when they are made into objects, and the glTF export turns them back.

Geometry is gathered per material: one object per material when it is made (see Kit.finish), so a
venue of thousands of parts is a dozen draws in the game. Parts the game moves or dresses on its
own (LED screens, things it animates, shapes it repeats) are objects of their own, by name:

    LED_<name>    an LED screen; its uvs run 0..1 across it (LED_<name>_<n> for several of one kind)
    Move_<name>   a part the game moves
    Proto_<name>  a shape the game repeats (its positions are in the JSON)
    Podium_<part>_<piece>  a player's podium, which the game raises and lowers (see Kit.podium)

(Underscores, not dots: the game's glTF loader drops dots from names.)

Material names are roles the game maps to its shaders (src/render/venues/kit/model.ts).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

# three.js axes to Blender's: (x, y, z) -> (x, -z, y)
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
UP = Vector((0, 1, 0))

# Colours for the preview renders only; the game draws every role with its own shader.
PREVIEW = {
    'Black': (0.02, 0.02, 0.022), 'Dark': (0.06, 0.06, 0.07), 'Alu': (0.55, 0.56, 0.6), 'Chrome': (0.8, 0.8, 0.85),
    'Grille': (0.08, 0.08, 0.09), 'Rubber': (0.01, 0.01, 0.01), 'Steel': (0.2, 0.21, 0.23), 'Concrete': (0.38, 0.37, 0.35),
    'Floor': (0.22, 0.21, 0.2), 'Brick': (0.42, 0.2, 0.14), 'Wood': (0.3, 0.17, 0.08), 'Fabric': (0.25, 0.05, 0.08),
    'Hazard': (0.85, 0.65, 0.05), 'Crane': (0.7, 0.5, 0.08), 'Glass': (0.05, 0.08, 0.14), 'Grass': (0.12, 0.2, 0.08),
    'Seats': (0.08, 0.1, 0.25), 'Graffiti': (0.45, 0.2, 0.35), 'Panels': (0.3, 0.3, 0.32), 'Plaster': (0.14, 0.12, 0.16),
    'Podium': (0.12, 0.16, 0.45),
}


def mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    if name.startswith('Glow') or name.startswith('LED'):
        m.diffuse_color = (1.0, 0.85, 0.6, 1)
    else:
        c = PREVIEW.get(name.split('.')[0], (0.4, 0.4, 0.4))
        m.diffuse_color = (*c, 1)
    return m


def v3(p):
    return Vector((p[0], p[1], p[2]))


def r3(v):
    return [round(v[0], 3), round(v[1], 3), round(v[2], 3)]


def place(at, yaw=0.0, pitch=0.0, roll=0.0, scale=None):
    """A placement in game axes: turned `yaw` about the vertical, tipped `pitch` about x, at `at`."""
    m = Matrix.Translation(v3(at)) @ Matrix.Rotation(yaw, 4, 'Y') @ Matrix.Rotation(pitch, 4, 'X') @ Matrix.Rotation(roll, 4, 'Z')
    if scale is not None:
        m = m @ Matrix.Diagonal((*scale, 1))
    return m


def frame(at, yaw):
    """Local x, y, z turned by `yaw` and moved to `at`."""
    c, s = math.cos(yaw), math.sin(yaw)
    return lambda x, y, z: (at[0] + x * c + z * s, at[1] + y, at[2] - x * s + z * c)


def axes(x, y, z, at=(0, 0, 0), scale=1.0):
    """A placement whose local x, y, z are the given directions (unit, right-handed), at `at`."""
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = v3(at)
    return m @ Matrix.Scale(scale, 4) if scale != 1.0 else m


class Kit:
    def __init__(self):
        self.parts = {}
        self.objects = []
        self.data = {'fixtures': [], 'marks': {}, 'screens': {}, 'instances': {}, 'sources': {}}

    # ------------------------------------------------------------------ gathering
    def bm(self, material):
        if material not in self.parts:
            b = bmesh.new()
            b.loops.layers.uv.new()
            self.parts[material] = b
        return self.parts[material]

    def own(self, name, material, build):
        """A part that is an object of its own: `build(bm)` fills a fresh bmesh."""
        b = bmesh.new()
        b.loops.layers.uv.new()
        build(b)
        self.objects.append((name, material, b))

    # ------------------------------------------------------------------ solids
    def box(self, material, size, at, yaw=0.0, pitch=0.0, bevel=0.0, b=None):
        b = b or self.bm(material)
        made = bmesh.ops.create_cube(b, size=1.0, matrix=place(at, yaw, pitch, scale=size))
        if bevel > 0:
            vs = set(made['verts'])
            edges = [e for e in b.edges if e.verts[0] in vs and e.verts[1] in vs]
            bmesh.ops.bevel(b, geom=edges, offset=bevel, segments=2, profile=0.5, affect='EDGES', clamp_overlap=True)
        return made

    def rod(self, material, a, c, radius, sides=8, cap=False, b=None):
        a, c = v3(a), v3(c)
        d = c - a
        length = d.length
        if length < 1e-5:
            return
        b = b or self.bm(material)
        q = UP.rotation_difference(d.normalized())
        m = Matrix.Translation((a + c) / 2) @ q.to_matrix().to_4x4()
        made = bmesh.ops.create_cone(b, cap_ends=cap, cap_tris=False, segments=sides, radius1=radius, radius2=radius, depth=length, matrix=m @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
        for f in {f for v in made['verts'] for f in v.link_faces}:
            f.smooth = sides > 6

    def drum(self, material, radius, height, at, sides=32, radius2=None, b=None):
        """A cylinder standing on `at`."""
        b = b or self.bm(material)
        m = Matrix.Translation(v3(at) + Vector((0, height / 2, 0))) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
        made = bmesh.ops.create_cone(b, cap_ends=True, cap_tris=False, segments=sides, radius1=radius, radius2=radius if radius2 is None else radius2, depth=height, matrix=m)
        for f in {f for v in made['verts'] for f in v.link_faces}:
            if abs(f.normal.z) < 0.5:
                f.smooth = True

    def panel(self, material, w, h, at, yaw=0.0, pitch=0.0, b=None):
        """A flat panel w by h facing +z (turned by yaw, tipped by pitch), its uvs 0..1."""
        b = b or self.bm(material)
        bmesh.ops.create_grid(b, x_segments=1, y_segments=1, size=0.5, matrix=place(at, yaw, pitch, scale=(w, h, 1)), calc_uvs=True)

    def floor(self, material, w, d, at, b=None):
        self.panel(material, w, d, at, 0, -math.pi / 2, b)

    def grid(self, material, w, h, nx, ny, at, yaw=0.0, pitch=0.0, shape=None, b=None):
        """A panel of nx by ny quads; `shape(x, y)` gives each vertex an offset along the panel's face."""
        b = b or self.bm(material)
        made = bmesh.ops.create_grid(b, x_segments=nx, y_segments=ny, size=0.5, matrix=Matrix.Diagonal((w, h, 1, 1)), calc_uvs=True)
        m = place(at, yaw, pitch)
        for v in made['verts']:
            if shape:
                v.co.z += shape(v.co.x, v.co.y)
            v.co = m @ v.co
        for f in {f for v in made['verts'] for f in v.link_faces}:
            f.smooth = shape is not None

    def prism(self, material, outline, depth, at, yaw=0.0, b=None):
        """An outline in the x-y plane (a list of points) pushed `depth` along z, centred on z."""
        b = b or self.bm(material)
        m = place(at, yaw)
        front = [b.verts.new(m @ Vector((x, y, depth / 2))) for x, y in outline]
        back = [b.verts.new(m @ Vector((x, y, -depth / 2))) for x, y in outline]
        b.faces.new(front)
        b.faces.new(list(reversed(back)))
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            b.faces.new((front[i], back[i], back[j], front[j]))

    def tube(self, material, points, radius, sides=8, closed=False, b=None):
        """A tube along a path of points (neon, pipes that bend, cables)."""
        b = b or self.bm(material)
        pts = [v3(p) for p in points]
        n = len(pts)
        rings = []
        prev_side = None
        for i, p in enumerate(pts):
            a = pts[(i - 1) % n] if (closed or i > 0) else p
            c = pts[(i + 1) % n] if (closed or i < n - 1) else p
            t = (c - a).normalized()
            side = t.cross(UP if abs(t.dot(UP)) < 0.95 else Vector((1, 0, 0))).normalized()
            if prev_side is not None and side.dot(prev_side) < 0:
                side = -side
            prev_side = side
            up = side.cross(t).normalized()
            rings.append([b.verts.new(p + (side * math.cos(k / sides * math.tau) + up * math.sin(k / sides * math.tau)) * radius) for k in range(sides)])
        for i in range(n if closed else n - 1):
            r0, r1 = rings[i], rings[(i + 1) % n]
            for k in range(sides):
                f = b.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
                f.smooth = True

    def torus(self, material, radius, thickness, at, yaw=0.0, pitch=0.0, segments=64, sides=8, arc=math.tau, b=None):
        """A ring lying flat (in the x-z plane) round `at`."""
        b = b or self.bm(material)
        m = place(at, yaw, pitch)
        full = arc >= math.tau - 1e-6
        count = segments if full else segments + 1
        rings = []
        for i in range(count):
            a = arc * i / segments
            c = Vector((math.cos(a), 0, math.sin(a)))
            rings.append([b.verts.new(m @ (c * (radius + thickness * math.cos(k / sides * math.tau)) + UP * thickness * math.sin(k / sides * math.tau))) for k in range(sides)])
        for i in range(segments if full else segments):
            r0, r1 = rings[i], rings[(i + 1) % count]
            for k in range(sides):
                f = b.faces.new((r0[k], r1[k], r1[(k + 1) % sides], r0[(k + 1) % sides]))
                f.smooth = True

    def sphere(self, material, radius, at, segments=16, rings=10, smooth=True, b=None):
        b = b or self.bm(material)
        made = bmesh.ops.create_uvsphere(b, u_segments=segments, v_segments=rings, radius=radius, matrix=Matrix.Translation(v3(at)), calc_uvs=False)
        for f in {f for v in made['verts'] for f in v.link_faces}:
            f.smooth = smooth

    def ring(self, material, r0, r1, at, segments=96, b=None):
        """A flat annulus facing up."""
        b = b or self.bm(material)
        inner = [b.verts.new(v3(at) + Vector((math.cos(i / segments * math.tau) * r0, 0, math.sin(i / segments * math.tau) * r0))) for i in range(segments)]
        outer = [b.verts.new(v3(at) + Vector((math.cos(i / segments * math.tau) * r1, 0, math.sin(i / segments * math.tau) * r1))) for i in range(segments)]
        for i in range(segments):
            j = (i + 1) % segments
            b.faces.new((inner[i], inner[j], outer[j], outer[i]))

    def wall_ring(self, material, radius, y0, y1, at=(0, 0, 0), segments=96, inward=True, b=None):
        """An open cylinder (a ring of wall), its faces turned in or out."""
        b = b or self.bm(material)
        lo = [b.verts.new(v3(at) + Vector((math.cos(i / segments * math.tau) * radius, y0, math.sin(i / segments * math.tau) * radius))) for i in range(segments)]
        hi = [b.verts.new(v3(at) + Vector((math.cos(i / segments * math.tau) * radius, y1, math.sin(i / segments * math.tau) * radius))) for i in range(segments)]
        for i in range(segments):
            j = (i + 1) % segments
            quad = (lo[i], hi[i], hi[j], lo[j]) if inward else (lo[i], lo[j], hi[j], hi[i])
            b.faces.new(quad)

    def truss(self, material, a, c, size=0.4):
        """A box truss from a to c: four chords and zigzag lacing between them."""
        a, c = v3(a), v3(c)
        axis = c - a
        length = axis.length
        axis.normalize()
        side = Vector((1, 0, 0)) if abs(axis.y) > 0.9 else axis.cross(UP).normalized()
        up = side.cross(axis).normalized()
        h = size / 2
        corners = [side * x + up * y for x, y in ((h, h), (-h, h), (-h, -h), (h, -h))]
        for k in corners:
            self.rod(material, a + k, c + k, size * 0.08, 6)
        step = size * 1.4
        t, i = 0.0, 0
        while t + step <= length + 1e-3:
            for f in range(4):
                c0, c1 = corners[f], corners[(f + 1) % 4]
                p0, p1 = (c0, c1) if i % 2 else (c1, c0)
                self.rod(material, a + axis * t + p0, a + axis * (t + step) + p1, size * 0.035, 4)
            t += step
            i += 1

    # ------------------------------------------------------------------ the gear of a show
    # Gear is modelled in its own axes: a placement matrix (`place`, `axes`) with parts put on it by
    # the builders below. Its detail is cheap on purpose (chamfers, flat plates, few-sided
    # cylinders): some of it is placed hundreds of times in a venue.
    def block(self, material, size, m, bevel=0.0, b=None):
        """A box of `size` centred on the placement `m`, its edges chamfered by `bevel` metres."""
        b = b or self.bm(material)
        made = bmesh.ops.create_cube(b, size=1.0, matrix=m @ Matrix.Diagonal((*size, 1)))
        if bevel > 0:
            edges = list({e for v in made['verts'] for e in v.link_edges})
            bmesh.ops.bevel(b, geom=edges, offset=bevel, segments=1, affect='EDGES', clamp_overlap=True)

    def plate(self, material, w, h, m, b=None):
        """A flat w by h plate on the placement `m`, facing its +z."""
        b = b or self.bm(material)
        bmesh.ops.create_grid(b, x_segments=1, y_segments=1, size=0.5, matrix=m @ Matrix.Diagonal((w, h, 1, 1)), calc_uvs=True)

    def can(self, material, m, z0, z1, r0, r1=None, sides=12, cap=True, b=None):
        """A cylinder along the local z of `m` from z0 to z1 (a cone when r1, its radius at z1, differs)."""
        b = b or self.bm(material)
        made = bmesh.ops.create_cone(b, cap_ends=cap, cap_tris=False, segments=sides, radius1=r0, radius2=r0 if r1 is None else r1,
                                     depth=z1 - z0, matrix=m @ Matrix.Translation((0, 0, (z0 + z1) / 2)))
        if sides > 6:
            for f in {f for v in made['verts'] for f in v.link_faces}:
                f.smooth = len(f.verts) == 4

    def disc(self, material, m, r, sides=12, b=None):
        """A flat disc on the placement `m`, facing its +z."""
        b = b or self.bm(material)
        bmesh.ops.create_circle(b, cap_ends=True, cap_tris=False, segments=sides, radius=r, matrix=m)

    def slab(self, material, outline, depth, m, b=None):
        """An outline in the local x-y plane of `m` pushed `depth` along its z, centred, faces turned out."""
        b = b or self.bm(material)
        front = [b.verts.new(m @ Vector((x, y, depth / 2))) for x, y in outline]
        back = [b.verts.new(m @ Vector((x, y, -depth / 2))) for x, y in outline]
        n = len(outline)
        faces = [b.faces.new(front), b.faces.new(list(reversed(back)))]
        faces += [b.faces.new((front[i], back[i], back[(i + 1) % n], front[(i + 1) % n])) for i in range(n)]
        bmesh.ops.recalc_face_normals(b, faces=faces)

    def moving_head(self, at, direction, group, length=None, spread=None, size=1.0, body=True):
        """
        A moving head and its beam. The base (on the floor, or hung above the head) has a lit display,
        vents and omega brackets, a pan bearing on top; the yoke's arms end round at the tilt hubs; the
        head along the beam has a vented back, a cooling band, and a deep bezel round the lens.
        """
        d = v3(direction).normalized()
        fx = {'group': group, 'pos': r3(at), 'dir': r3(d)}
        if length is not None:
            fx['length'] = length
        if spread is not None:
            fx['spread'] = spread
        self.data['fixtures'].append(fx)
        if not body:
            return
        p = v3(at)
        side = UP.cross(d)
        side = side.normalized() if side.length > 0.01 else Vector((1, 0, 0))
        hung = d.y < 0.2
        # The fixture's axes: x along the tilt axis, y from the base up to the head (down when hung).
        x, y = (-side, -UP) if hung else (side, UP)
        m = axes(x, y, x.cross(y), p, size)
        self.block('Black', (0.44, 0.13, 0.34), m @ place((0, -0.24, 0)), 0.015 * size)
        self.block('Dark', (0.11, 0.05, 0.006), m @ place((0.09, -0.245, 0.171)))
        self.plate('Glow.Screen', 0.075, 0.032, m @ place((0.09, -0.245, 0.1745)))
        for k in (-1, 1):
            self.plate('Grille', 0.24, 0.07, m @ place((k * 0.2205, -0.24, 0), k * math.pi / 2))
            self.block('Alu', (0.05, 0.014, 0.3), m @ place((k * 0.13, -0.312, 0)))
            if hung:
                self.block('Dark', (0.06, 0.07, 0.05), m @ place((k * 0.13, -0.355, 0)))
            # The yoke's arm, rounded at the top round the tilt hub.
            self.block('Black', (0.045, 0.13, 0.13), m @ place((k * 0.2, -0.065, 0)))
            arm = m @ place((k * 0.2, 0, 0), k * math.pi / 2)
            self.can('Black', arm, -0.0225, 0.0225, 0.065, sides=10)
            self.can('Dark', arm, 0.0225, 0.032, 0.042, sides=10)
        self.can('Dark', m @ place((0, -0.175, 0), 0, -math.pi / 2), 0, 0.03, 0.11, sides=10)
        self.block('Black', (0.44, 0.035, 0.14), m @ place((0, -0.128, 0)))
        h = axes(x, d.cross(x), d, p, size)
        self.can('Dark', h, -0.17, 0.1, 0.115, 0.14, 14, cap=False)
        self.can('Dark', h, -0.22, -0.17, 0.07, 0.115, 14, cap=False)
        self.disc('Grille', h @ place((0, 0, -0.22), math.pi), 0.07, 14)
        self.can('Black', h, -0.11, -0.07, 0.127, sides=14, cap=False)
        self.can('Black', h, 0.1, 0.15, 0.146, 0.148, 14, cap=False)
        self.can('Black', h, 0.15, 0.153, 0.148, 0.12, 14, cap=False)
        self.can('Black', h, 0.13, 0.152, 0.12, sides=14, cap=False)
        self.disc('Glow.Lens', h @ place((0, 0, 0.13)), 0.12, 14)
        for k in (-1, 1):
            self.block('Dark', (0.05, 0.11, 0.15), h @ place((k * 0.155, 0, -0.03)))

    def par(self, at, direction, size=1.0):
        """A par can pointing along `direction`: the can with its gel frame and lens, its yoke and a clamp above."""
        d = v3(direction).normalized()
        p = v3(at)
        side = UP.cross(d)
        side = side.normalized() if side.length > 0.01 else Vector((1, 0, 0))
        h = axes(side, d.cross(side), d, p, size)
        self.can('Black', h, -0.15, 0.13, 0.1, 0.11, 14, cap=False)
        self.can('Black', h, -0.2, -0.15, 0.055, 0.1, 14)
        self.block('Black', (0.27, 0.27, 0.014), h @ place((0, 0, 0.14)))
        self.can('Dark', h, 0.147, 0.156, 0.112, sides=14, cap=False)
        self.disc('Glow.Lens', h @ place((0, 0, 0.152)), 0.1, 14)
        yoke = axes(side, UP, side.cross(UP), p, size)
        for k in (-1, 1):
            self.block('Black', (0.014, 0.22, 0.04), yoke @ place((k * 0.125, 0.11, 0)))
            self.can('Dark', yoke @ place((k * 0.125, 0, 0), k * math.pi / 2), -0.007, 0.02, 0.03, sides=8)
        self.block('Black', (0.264, 0.014, 0.04), yoke @ place((0, 0.22, 0)))
        self.rod('Chrome', yoke @ Vector((0, 0.22, 0)), yoke @ Vector((0, 0.3, 0)), 0.01 * size, 6)
        self.block('Dark', (0.05, 0.07, 0.07), yoke @ place((0, 0.32, 0)))

    def dj_booth(self, at, yaw=0.0, width=3.4, screen='booth'):
        """
        A DJ's booth facing +z (the crowd) when `yaw` is 0, the DJ behind it: a desk with an LED
        front, a top lit along its front edge; four players with platters on lit jog wheels, centre
        displays, tilted screens, pads, transport buttons and tempo faders; a mixer with knobs,
        faders, a crossfader and segmented meters, patched to the players; a laptop on a stand, a
        lamp, a drink, cables, and a monitor on a tripod stand at each end turned in to the DJ.
        """
        p = frame(at, yaw)
        m = place(at, yaw)
        w, h = width, 1.0
        self.box('Black', (w, h - 0.06, 0.92), p(0, (h - 0.06) / 2, 0), yaw, bevel=0.01)
        self.box('Dark', (w + 0.14, 0.06, 1.06), p(0, h - 0.03, 0), yaw, bevel=0.015)
        self.box('Glow.Edge', (w + 0.1, 0.014, 0.014), p(0, h - 0.04, 0.53), yaw)
        for x, z in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            self.box('Alu', (0.06, h - 0.06, 0.06), p(x * w / 2, (h - 0.06) / 2, z * 0.46), yaw, bevel=0.01)
        self.own('LED_' + screen, 'LED.' + screen, lambda b: self.panel('LED.' + screen, w - 0.14, h - 0.22, p(0, (h - 0.06) / 2, 0.462), yaw, b=b))
        self.data['screens'][screen] = {'w': w - 0.14, 'h': h - 0.22}
        up = -math.pi / 2   # a pitch that turns a part's z up
        mixer = m @ place((0, h, 0))
        # Four players, two either side of the mixer: a body with a big tilted screen at the back,
        # a platter on a lit jog wheel, pads, play and cue, a tempo fader, patched to the mixer.
        for x in (-1.02, -0.6, 0.6, 1.02):
            pl = m @ place((x, h, 0))
            self.block('Dark', (0.38, 0.1, 0.5), pl @ place((0, 0.05, -0.04)), 0.01)
            self.plate('Black', 0.35, 0.46, pl @ place((0, 0.1005, -0.04), 0, up))
            self.box('Dark', (0.36, 0.05, 0.2), p(x, h + 0.13, -0.2), yaw, -0.5, bevel=0.008)
            self.panel('Glow.Screen', 0.31, 0.16, p(x, h + 0.158, -0.187), yaw, -1.07)
            jog = pl @ place((0, 0.1, 0.07), 0, up)
            self.can('Glow.Jog', jog, -0.004, 0.006, 0.128, sides=32)
            self.can('Chrome', jog, 0.0, 0.02, 0.118, sides=32, cap=False)
            self.disc('Dark', jog @ place((0, 0, 0.02)), 0.118, 32)
            self.can('Black', jog, 0.0202, 0.0206, 0.092, 0.086, 32, cap=False)
            self.can('Chrome', jog, 0.02, 0.026, 0.054, sides=24)
            self.disc('Glow.Screen', jog @ place((0, 0, 0.0262)), 0.046, 24)
            self.block('Black', (0.31, 0.004, 0.03), pl @ place((0, 0.102, -0.075)))
            for i in range(8):
                self.box('Glow.Pad', (0.03, 0.008, 0.02), p(x - 0.126 + i * 0.036, h + 0.106, -0.075), yaw)
            for z, glow in ((0.19, 'Glow.Green'), (0.13, 'Glow.Amber')):
                self.can('Black', pl @ place((-0.14, 0.1, z), 0, up), 0, 0.006, 0.029, sides=12)
                self.can(glow, pl @ place((-0.14, 0.1, z), 0, up), 0, 0.013, 0.022, sides=12)
            self.block('Black', (0.01, 0.003, 0.17), pl @ place((0.158, 0.1015, 0.09)))
            self.block('Alu', (0.034, 0.016, 0.022), pl @ place((0.158, 0.108, 0.06)), 0.003)
            for i in range(3):
                self.can('Alu', pl @ place((0.158, 0.1, -0.075 + i * 0.03), 0, up), 0, 0.01, 0.009, sides=8)
            k = 1 if x > 0 else -1
            self.tube('Rubber', [pl @ Vector((0.05 * k, 0.04, -0.3)), pl @ Vector((0.05 * k, 0.012, -0.36)),
                                 mixer @ Vector((0.12 * k, 0.012, -0.36)), mixer @ Vector((0.12 * k, 0.05, -0.31))], 0.006, 5)
        # The mixer: a tall four-channel desk with rows of knobs, cue buttons, faders, a crossfader and meters.
        self.block('Dark', (0.44, 0.11, 0.56), mixer @ place((0, 0.055, -0.02)), 0.01)
        self.plate('Black', 0.41, 0.53, mixer @ place((0, 0.1105, -0.02), 0, up))
        for c in range(4):
            cx = -0.135 + c * 0.09
            for r in range(5):
                kz = -0.25 + r * 0.05
                self.can('Black', mixer @ place((cx, 0.11, kz), 0, up), 0, 0.016, 0.016 if r == 4 else 0.012, 0.011, 10)
                self.disc('Alu', mixer @ place((cx, 0.1265, kz), 0, up), 0.007, 8)
            self.box('Glow.Amber', (0.024, 0.008, 0.016), p(cx, h + 0.114, 0.03), yaw)
            self.box('Black', (0.012, 0.004, 0.13), p(cx, h + 0.111, 0.13), yaw)
            self.block('Alu', (0.026, 0.026, 0.034), mixer @ place((cx, 0.122, 0.1 + (c % 2) * 0.04)), 0.004)
            for i in range(8):
                self.box('Glow.Red' if i == 7 else 'Glow.Meter', (0.008, 0.005, 0.018), p(cx + 0.035, h + 0.112, -0.03 - i * 0.025), yaw)
        self.box('Black', (0.2, 0.004, 0.012), p(0, h + 0.111, 0.235), yaw)
        self.block('Alu', (0.03, 0.026, 0.024), mixer @ place((0.02, 0.122, 0.235)), 0.004)
        self.panel('Glow.Screen', 0.1, 0.05, p(0.16, h + 0.112, -0.24), yaw, -math.pi / 2)
        lx = w / 2 - 0.36
        self.rod('Alu', p(lx, h, -0.1), p(lx, h + 0.18, -0.12), 0.012, 6)
        self.box('Alu', (0.34, 0.018, 0.24), p(lx, h + 0.19, -0.12), yaw, bevel=0.004)
        self.box('Alu', (0.34, 0.23, 0.012), p(lx, h + 0.31, 0.0), yaw, bevel=0.004)
        self.panel('Glow.Screen', 0.3, 0.19, p(lx, h + 0.31, -0.008), yaw + math.pi)
        self.tube('Black', [p(-w / 2 + 0.3, h, -0.3), p(-w / 2 + 0.31, h + 0.2, -0.26), p(-w / 2 + 0.36, h + 0.3, -0.12), p(-w / 2 + 0.38, h + 0.3, -0.04)], 0.008, 5)
        self.drum('Glow.Amber', 0.022, 0.02, p(-w / 2 + 0.38, h + 0.28, -0.04), 10)
        self.drum('Glow.Red', 0.035, 0.12, p(-w / 2 + 0.2, h, 0.15), 12, radius2=0.042)
        for side in (-1, 1):
            x = side * (w / 2 + 0.5)
            st = place(p(x, 0, -0.25), yaw)
            self.rod('Black', p(x, 0.12, -0.25), p(x, 0.62, -0.25), 0.02, 8)
            self.rod('Chrome', p(x, 0.62, -0.25), p(x, 0.85, -0.25), 0.015, 8)
            self.can('Black', st @ place((0, 0.6, 0), 0, up), 0, 0.05, 0.026, sides=8)
            self.can('Black', st @ place((0, 0.08, 0), 0, up), 0, 0.1, 0.03, sides=8)
            for k in range(3):
                a = k / 3 * math.tau
                c, s = math.cos(a), math.sin(a)
                self.rod('Black', st @ Vector((c * 0.03, 0.15, s * 0.03)), st @ Vector((c * 0.33, 0.015, s * 0.33)), 0.012, 6)
                self.rod('Black', st @ Vector((0, 0.4, 0)), st @ Vector((c * 0.17, 0.09, s * 0.17)), 0.007, 4)
                self.can('Rubber', st @ place((c * 0.33, 0, s * 0.33), 0, up), 0, 0.025, 0.02, sides=6)
            cab = place(p(x, 0.85, -0.25), yaw - side * 0.55) @ place((0, 0.31, 0))
            self.block('Black', (0.42, 0.62, 0.4), cab, 0.015)
            self.plate('Grille', 0.36, 0.56, cab @ place((0, 0, 0.2005)))
            self.block('Alu', (0.09, 0.022, 0.005), cab @ place((0.11, -0.25, 0.203)))
            self.block('Dark', (0.12, 0.05, 0.12), cab @ place((0, -0.33, 0)))
            for i in (-1, 1):
                for j in (-1, 1):
                    self.block('Alu', (0.035, 0.035, 0.035), cab @ place((i * 0.2, j * 0.3, 0.19)))
        for k in range(4):
            self.tube('Rubber', [p(-0.6 + k * 0.4, h - 0.1, -0.46), p(-0.55 + k * 0.38, 0.4, -0.55), p(-0.5 + k * 0.38, 0.0, -0.66 - k * 0.05), p(-0.4 + k * 0.38, 0.0, -1.2)], 0.012, 5)

    def speaker_stack(self, at, yaw=0.0, subs=2, tops=2):
        """
        Subs with tops on them: chamfered cabinets with grilles, a bass port under each sub's grille,
        handles let into the sides, metal corners, logo plates, and rigging points on the tops.
        """
        m = place(at, yaw)
        y = 0.0
        for _ in range(subs):
            c = m @ place((0, y + 0.31, 0))
            self.block('Black', (1.2, 0.62, 0.9), c, 0.015)
            self.plate('Grille', 1.1, 0.4, c @ place((0, 0.07, 0.4505)))
            self.plate('Rubber', 1.02, 0.07, c @ place((0, -0.2, 0.4505)))
            self.block('Alu', (0.14, 0.03, 0.006), c @ place((0.42, 0.22, 0.453)))
            for k in (-1, 1):
                self.block('Dark', (1.06, 0.014, 0.012), c @ place((0, -0.2 + k * 0.042, 0.452)))
                self.plate('Rubber', 0.22, 0.08, c @ place((k * 0.6005, 0.1, 0), k * math.pi / 2))
                self.block('Alu', (0.014, 0.018, 0.17), c @ place((k * 0.605, 0.1, 0)))
                for j in (-1, 1):
                    self.block('Alu', (0.05, 0.05, 0.05), c @ place((k * 0.585, j * 0.295, 0.435)))
            y += 0.62
        for _ in range(tops):
            c = m @ place((0, y + 0.24, -0.1))
            self.block('Black', (0.8, 0.48, 0.6), c, 0.015)
            self.plate('Grille', 0.74, 0.42, c @ place((0, 0, 0.3005)))
            self.block('Alu', (0.1, 0.024, 0.006), c @ place((0.27, -0.17, 0.303)))
            for k in (-1, 1):
                self.block('Dark', (0.02, 0.07, 0.1), c @ place((k * 0.41, 0.12, -0.18)))
                self.plate('Rubber', 0.16, 0.06, c @ place((k * 0.4005, 0, 0), k * math.pi / 2))
                self.block('Alu', (0.012, 0.016, 0.12), c @ place((k * 0.405, 0, 0)))
                for j in (-1, 1):
                    self.block('Alu', (0.04, 0.04, 0.04), c @ place((k * 0.39, j * 0.23, 0.29)))
            y += 0.48

    def line_array(self, top, yaw=0.0, count=8, size=1.0, chain=3.0):
        """
        A hang in a gentle J under its flybar, each box a little more splayed: wedge-shaped cabinets
        with grilles and logo plates, rigging links down their corners; the flybar a frame of beams
        with shackles, and chains up to the rig through their hoists.
        """
        p = frame(top, yaw)
        m = place(top, yaw)
        s = size
        for k in (-1, 1):
            self.block('Dark', (0.06 * s, 0.1, 0.9 * s), m @ place((k * 0.6 * s, 0, 0)))
            self.block('Dark', (1.26 * s, 0.07, 0.06 * s), m @ place((0, 0, k * 0.42 * s)))
            self.block('Chrome', (0.04, 0.07, 0.05), m @ place((k * 0.5 * s, 0.08, 0)))
            self.rod('Chrome', p(k * 0.5 * s, 0.1, 0), p(k * 0.5 * s, chain, 0), 0.012, 4)
            if chain > 1.5:
                self.block('Black', (0.22, 0.32, 0.22), m @ place((k * 0.5 * s, chain - 0.45, 0)), 0.02)
                self.block('Dark', (0.1, 0.1, 0.27), m @ place((k * 0.5 * s, chain - 0.4, 0)))
        self.block('Dark', (1.2 * s, 0.05, 0.05 * s), m)
        plan = [(x * s, z * s) for x, z in ((-0.53, 0.31), (0.53, 0.31), (0.56, 0.28), (0.36, -0.31), (-0.36, -0.31), (-0.56, 0.28))]
        y, z = -0.06, 0.0
        for k in range(count):
            tilt = k * k * 0.008
            hb = 0.36 * s
            y -= hb * math.cos(tilt)
            z += hb * math.sin(tilt)
            c = m @ place((0, y + hb / 2, z), 0, tilt)
            self.slab('Black', plan, hb * 0.96, c @ Matrix.Rotation(math.pi / 2, 4, 'X'))
            self.plate('Grille', 1.06 * s, hb * 0.8, c @ place((0, 0, 0.311 * s)))
            self.block('Alu', (0.12 * s, 0.022, 0.005), c @ place((0.4 * s, -hb * 0.33, 0.314 * s)))
            for j in (-1, 1):
                self.block('Steel', (0.03 * s, hb * 1.02, 0.1 * s), c @ place((j * 0.37 * s, 0, -0.25 * s)))
                self.block('Steel', (0.025 * s, hb * 1.02, 0.05 * s), c @ place((j * 0.55 * s, 0, 0.24 * s)))

    def road_cases(self, at, yaw=0.0, count=6, seed=1):
        """
        Road cases stacked against a wall: black boxes with aluminium extrusions along every edge,
        ball corners, the lid's valance with its catches, handles in their dishes.
        """
        p = frame(at, yaw)
        x = 0.0
        e = 0.026
        for k in range(count):
            r = abs(math.sin(seed * 31 + k * 7.7))
            w = 0.7 + r * 0.7
            h = 0.6 + (r * 3) % 1 * 0.5
            d = 0.6 + (r * 7) % 1 * 0.3
            stack = 1 + int((r * 13) % 1 * 2.2)
            y = 0.0
            for _ in range(stack):
                c = place(p(x + w / 2, y + h / 2, 0), yaw)
                self.block('Black', (w, h, d), c)
                for i in (-1, 1):
                    for j in (-1, 1):
                        self.block('Alu', (w, e, e), c @ place((0, i * h / 2, j * d / 2)))
                        self.block('Alu', (e, h, e), c @ place((i * w / 2, 0, j * d / 2)))
                        self.block('Alu', (e, e, d), c @ place((i * w / 2, j * h / 2, 0)))
                        for l in (-1, 1):
                            self.block('Chrome', (0.045, 0.045, 0.045), c @ place((i * w / 2, j * h / 2, l * d / 2)))
                lid = h / 2 - min(0.18, h * 0.28)
                self.block('Alu', (w + 0.012, 0.02, d + 0.012), c @ place((0, lid, 0)))
                self.plate('Dark', 0.2, 0.08, c @ place((0, -0.06, d / 2 + 0.001)))
                self.block('Chrome', (0.14, 0.022, 0.024), c @ place((0, -0.06, d / 2 + 0.014)))
                for i in (-1, 1):
                    self.block('Chrome', (0.07, 0.05, 0.014), c @ place((i * (w / 2 - 0.16), lid, d / 2 + 0.012)))
                    self.plate('Dark', 0.16, 0.07, c @ place((i * (w / 2 + 0.001), -0.06, 0), i * math.pi / 2))
                    self.block('Chrome', (0.022, 0.02, 0.12), c @ place((i * (w / 2 + 0.012), -0.06, 0)))
                y += h
            x += w + 0.06

    def foh(self, at, yaw=0.0, roof=True):
        """
        The mixing desk on its riser: consoles with lit screens in their housings, rows of knobs,
        faders in their slots; racks of gear with their lights; a work lamp and a roof.
        """
        p = frame(at, yaw)
        self.box('Black', (5, 0.45, 3.4), p(0, 0.225, 0), yaw, bevel=0.02)
        for x in (-1.2, 1.2):
            self.box('Dark', (2.0, 0.85, 0.9), p(x, 0.875, -0.4), yaw, bevel=0.02)
            # The screens tip up toward the engineer's eyes (they stand at -z), in a housing behind.
            self.panel('Glow.Screen', 1.7, 0.26, p(x, 1.37, -0.31), yaw + math.pi, -0.5)
            self.box('Black', (1.8, 0.32, 0.04), p(x, 1.37 - 0.48 * 0.022, -0.31 + 0.88 * 0.022), yaw + math.pi, -0.5)
            for k in range(24):
                cx = x - 0.9 + k * 0.078
                self.box('Glow.Green' if k % 5 == 0 else 'Alu', (0.03, 0.02, 0.07), p(cx, 1.32, -0.1), yaw)
                self.box('Black', (0.008, 0.004, 0.13), p(cx, 1.302, -0.1), yaw)
                for r in range(2):
                    self.box('Black', (0.02, 0.016, 0.02), p(cx, 1.308, -0.18 - r * 0.045), yaw)
        for x in (-2.1, 2.1):
            self.box('Black', (0.6, 1.2, 0.6), p(x, 1.05, -1.2), yaw, bevel=0.015)
            for k in range(5):
                self.box('Glow.Green' if k % 2 else 'Glow.Amber', (0.04, 0.015, 0.01), p(x - 0.2 + k * 0.1, 1.5, -0.895), yaw)
            for k in range(4):
                self.box('Dark', (0.54, 0.17, 0.01), p(x, 0.62 + k * 0.2, -0.897), yaw)
                self.box('Alu', (0.58, 0.17, 0.006), p(x, 0.62 + k * 0.2, -0.902), yaw)
        if roof:
            for x, z in ((-2.4, -1.6), (2.4, -1.6), (-2.4, 1.6), (2.4, 1.6)):
                self.rod('Alu', p(x, 0, z), p(x, 3.2, z), 0.05, 8)
            self.box('Black', (5.3, 0.14, 3.7), p(0, 3.27, 0), yaw)
            self.box('Glow.Amber', (4.0, 0.03, 0.05), p(0, 3.18, 1.0), yaw)

    def barrier(self, a, c):
        """
        A crowd barrier from a to c: frames a metre apart, each braced to its foot, clamped to a round
        top rail; a front panel, and the plate the crowd stands on.
        """
        a, c = v3(a), v3(c)
        length = (c - a).length
        yaw = math.atan2(c.x - a.x, c.z - a.z) - math.pi / 2
        mid = (a + c) / 2
        p = frame((mid.x, a.y, mid.z), yaw)
        self.rod('Alu', p(-length / 2, 1.18, 0), p(length / 2, 1.18, 0), 0.034, 8)
        self.box('Dark', (length, 0.95, 0.03), p(0, 0.62, 0), yaw)
        self.box('Steel', (length, 0.012, 0.86), p(0, 0.006, -0.47), yaw)
        x = -length / 2
        while x <= length / 2 + 1e-3:
            self.rod('Alu', p(x, 0.05, 0), p(x, 1.18, 0), 0.025, 6)
            self.rod('Alu', p(x, 0.1, 0), p(x, 0.02, -0.9), 0.02, 5)
            self.rod('Alu', p(x, 0.85, -0.02), p(x, 0.03, -0.8), 0.016, 5)
            self.box('Alu', (0.08, 0.02, 1.0), p(x, 0.01, -0.45), yaw)
            self.box('Chrome', (0.05, 0.09, 0.09), p(x, 1.18, 0), yaw)
            x += 1.0

    def wedge(self, at, yaw=0.0):
        """
        A floor monitor, its face tipped up toward the player behind it (-z): a chamfered cabinet with
        a grille across the slope and a logo plate, handles let into its sides, metal corners, skids,
        and a handle, the connectors and a port at the back.
        """
        m = place(at, yaw)
        side_view = [(-0.3, 0.02), (0.3, 0.02), (0.3, 0.395), (0.275, 0.42), (-0.275, 0.145), (-0.3, 0.12)]
        self.slab('Black', side_view, 0.62, m @ Matrix.Rotation(-math.pi / 2, 4, 'Y'))
        slope = math.atan2(0.275, 0.55)
        g = m @ place((0, 0.2825 + 0.003 * math.cos(slope), -0.003 * math.sin(slope)), 0, -(math.pi / 2 + slope))
        self.plate('Grille', 0.54, 0.56, g)
        self.block('Alu', (0.1, 0.026, 0.006), g @ place((0.19, 0.24, 0.002)))
        for k in (-1, 1):
            self.plate('Rubber', 0.15, 0.05, m @ place((k * 0.311, 0.24, 0.05), k * math.pi / 2))
            self.block('Alu', (0.012, 0.016, 0.12), m @ place((k * 0.316, 0.24, 0.05)))
            self.block('Rubber', (0.04, 0.02, 0.54), m @ place((k * 0.22, 0.01, 0)))
            for y, z in ((0.4, 0.285), (0.13, -0.285), (0.035, 0.285), (0.035, -0.285)):
                self.block('Alu', (0.04, 0.04, 0.04), m @ place((k * 0.3, y, z)))
        # Its back, the tall side away from the player: a handle in its dish, the connector plate, a port.
        self.plate('Rubber', 0.22, 0.07, m @ place((0, 0.3, 0.3005)))
        self.block('Alu', (0.16, 0.018, 0.016), m @ place((0, 0.3, 0.309)))
        self.plate('Dark', 0.2, 0.07, m @ place((0.14, 0.12, 0.3005)))
        for i in range(2):
            self.can('Chrome', m @ place((0.09 + i * 0.09, 0.12, 0.3)), 0, 0.014, 0.012, sides=8)
        self.plate('Rubber', 0.2, 0.05, m @ place((-0.14, 0.12, 0.3005)))

    def amp(self, at, yaw=0.0, cabs=2):
        """
        A guitar or bass amp: cabinets in black covering, a grille cloth framed by piping, metal
        corners, a logo plate and strap handles; the head on top with its vent, a metal control
        panel with knobs, switches, a jack and the jewel light, and a handle.
        """
        m = place(at, yaw)
        y = 0.0
        for _ in range(cabs):
            c = m @ place((0, y + 0.38, 0))
            self.block('Black', (0.76, 0.76, 0.38), c, 0.015)
            self.plate('Grille', 0.66, 0.66, c @ place((0, 0, 0.1905)))
            self.block('Alu', (0.13, 0.036, 0.006), c @ place((-0.21, 0.27, 0.194)))
            for k in (-1, 1):
                self.block('Alu', (0.672, 0.008, 0.006), c @ place((0, k * 0.332, 0.192)))
                self.block('Alu', (0.008, 0.672, 0.006), c @ place((k * 0.332, 0, 0.192)))
                self.block('Black', (0.02, 0.035, 0.16), c @ place((k * 0.388, 0.14, 0)), 0.006)
                for j in (-1, 1):
                    for l in (-1, 1):
                        self.block('Chrome', (0.06, 0.06, 0.06), c @ place((k * 0.358, j * 0.358, l * 0.168)))
            y += 0.76
        hd = m @ place((0, y + 0.14, 0))
        self.block('Black', (0.76, 0.28, 0.32), hd, 0.015)
        self.plate('Grille', 0.7, 0.1, hd @ place((0, 0.065, 0.1605)))
        self.block('Alu', (0.12, 0.03, 0.006), hd @ place((-0.24, 0.065, 0.163)))
        self.block('Alu', (0.7, 0.11, 0.008), hd @ place((0, -0.055, 0.161)))
        for k in range(8):
            self.can('Black', hd @ place((-0.25 + k * 0.06, -0.05, 0.165)), 0, 0.022, 0.015, 0.012, 10)
        for k in range(2):
            self.rod('Chrome', hd @ Vector((0.23 + k * 0.035, -0.05, 0.165)), hd @ Vector((0.23 + k * 0.035, -0.04, 0.185)), 0.004, 4)
        self.can('Chrome', hd @ place((-0.31, -0.05, 0.165)), 0, 0.012, 0.009, sides=8)
        self.can('Glow.Red', hd @ place((0.315, -0.05, 0.165)), 0, 0.012, 0.011, 0.008, 8)
        self.block('Black', (0.24, 0.025, 0.045), hd @ place((0, 0.152, 0)), 0.008)
        for k in (-1, 1):
            self.block('Chrome', (0.03, 0.03, 0.05), hd @ place((k * 0.13, 0.15, 0)))
            for j in (-1, 1):
                self.block('Chrome', (0.05, 0.05, 0.05), hd @ place((k * 0.365, j * 0.115, 0.14)))

    def mic_stand(self, at, lean=0.0):
        """
        A boom mic stand, the mic reaching about `lean` along z toward the singer: tripod legs on a
        hub with braces and rubber feet, a clutch, the boom with its counterweight, the clip, the mic
        with its grille, and its cable down the stand.
        """
        m = place(at, 0.0 if lean <= 0 else math.pi)   # the singer is toward local -z
        up = -math.pi / 2
        self.can('Black', m @ place((0, 0.05, 0), 0, up), 0, 0.11, 0.022, sides=8)
        for k in range(3):
            a = math.pi / 2 + k * math.tau / 3
            c, s = math.cos(a), math.sin(a)
            self.rod('Black', m @ Vector((c * 0.02, 0.11, s * 0.02)), m @ Vector((c * 0.3, 0.012, s * 0.3)), 0.009, 6)
            self.rod('Black', m @ Vector((0, 0.3, 0)), m @ Vector((c * 0.15, 0.065, s * 0.15)), 0.005, 4)
            self.can('Rubber', m @ place((c * 0.3, 0, s * 0.3), 0, up), 0, 0.022, 0.016, sides=6)
        self.can('Black', m @ place((0, 0.28, 0), 0, up), 0, 0.04, 0.018, sides=8)
        self.rod('Black', m @ Vector((0, 0.16, 0)), m @ Vector((0, 1.0, 0)), 0.011, 8)
        self.can('Black', m @ place((0, 0.96, 0), 0, up), 0, 0.06, 0.017, sides=8)
        self.rod('Chrome', m @ Vector((0.017, 0.99, 0)), m @ Vector((0.04, 0.99, 0)), 0.005, 6)
        self.block('Black', (0.012, 0.028, 0.028), m @ place((0.046, 0.99, 0)))
        self.rod('Chrome', m @ Vector((0, 1.02, 0)), m @ Vector((0, 1.34, 0)), 0.008, 8)
        # The boom clutch, the boom tipped up 30 degrees, its counterweight behind.
        joint = Vector((0, 1.36, 0))
        self.block('Black', (0.036, 0.05, 0.036), m @ place(joint))
        self.can('Black', m @ place(joint, math.pi / 2), 0.018, 0.034, 0.017, sides=8)
        boom = Vector((0, 0.5, -0.866))
        aim = Vector((0, 0.26, -0.966))
        tip = joint + boom * max(0.05, (abs(lean) + 0.06 - 0.116) / 0.866)
        back = joint - boom * 0.32
        self.rod('Chrome', m @ back, m @ tip, 0.007, 8)
        self.rod('Black', m @ back, m @ (back + boom * 0.08), 0.022, 10, cap=True)
        mic = m @ axes(Vector((-1, 0, 0)), aim.cross(Vector((-1, 0, 0))), aim, tip)
        self.can('Black', mic, -0.035, 0.005, 0.02, sides=10)
        self.can('Black', mic, -0.095, -0.08, 0.009, sides=8)
        self.can('Black', mic, -0.08, 0.05, 0.011, 0.017, 10)
        self.can('Chrome', mic, 0.05, 0.064, 0.019, sides=10, cap=False)
        made = bmesh.ops.create_uvsphere(self.bm('Grille'), u_segments=10, v_segments=6, radius=0.028, matrix=mic @ Matrix.Translation((0, 0, 0.09)), calc_uvs=False)
        for f in {f for v in made['verts'] for f in v.link_faces}:
            f.smooth = True
        tail = mic @ Vector((0, 0, -0.095))
        self.tube('Rubber', [tail, tail + (m.to_3x3() @ Vector((0, -0.08, 0.05))), m @ Vector((0.02, 1.15, 0.03)), m @ Vector((0.02, 0.6, 0.02)),
                             m @ Vector((0.03, 0.15, -0.04)), m @ Vector((0.02, 0.012, -0.14))], 0.005, 5)

    # ------------------------------------------------------------------ the players' podiums
    def podium(self, part, at, rx, ry, height, travel, yaw=0.0, wedge=False, mic=True, pedals=False):
        """
        A player's podium as Moonrise has them: a round lift (an ellipse, half axes rx across and
        ry deep) standing `height` tall on the floor at `at`, which the game raises by up to
        `travel` with the music. Its lid shows a turning record and its wall the sound as a
        waveform (the game's podium shader, by the role Podium.<part>); a lit ring runs round the
        rim. On it the player's own things, turned to `yaw` (the way the player faces): a wedge at
        the front edge, a microphone, a pedalboard. The wall reaches below the floor as far as the
        lift rises, so no gap opens under it. The parts are objects named Podium_<part>_*; the
        player's mark goes on the lid, the podium into data['podiums'].
        UV: the lid is marked by v = -1; on the wall u runs once round it.
        """
        x, floor, z = at
        top, foot, bevel, n = floor + height, floor - travel - 0.15, 0.04, 72

        def body(b):
            uv = b.loops.layers.uv.active

            def ring(inset, y):
                return [b.verts.new((x + math.cos(math.tau * k / n) * (rx - inset), y, z + math.sin(math.tau * k / n) * (ry - inset))) for k in range(n)]

            lid, edge, base = ring(bevel, top), ring(0.0, top - bevel), ring(0.0, foot)
            for loop in b.faces.new(list(reversed(lid))).loops:
                loop[uv].uv = (0.0, -1.0)
            for k in range(n):
                j = (k + 1) % n
                for loop in b.faces.new((edge[k], lid[k], lid[j], edge[j])).loops:
                    loop[uv].uv = (0.0, -1.0)
                # u runs the way Moonrise's does (a quarter round from the side: the back), so the
                # shader puts the bass toward the audience.
                u0, u1 = 1 - k / n, 1 - (k + 1) / n
                wall = b.faces.new((base[k], edge[k], edge[j], base[j]))
                wall.smooth = True
                for loop, w in zip(wall.loops, ((u0, 1.0), (u0, 0.0), (u1, 0.0), (u1, 1.0))):
                    loop[uv].uv = w

        self.own('Podium_%s_Top' % part, 'Podium.' + part, body)

        p = frame((x, top, z), yaw)
        reach = min(rx, ry)

        def lamps(b):
            self.tube('Glow.Podium', [(x + math.cos(a) * (rx + 0.012), top - 0.045, z + math.sin(a) * (ry + 0.012)) for a in (math.tau * i / 96 for i in range(96))], 0.03, 6, True, b)
            if pedals:
                for i in range(4):
                    self.box('Glow.Podium', (0.06, 0.012, 0.04), p(-0.18 + i * 0.12, 0.05, 0.26), yaw, b=b)

        self.own('Podium_%s_Led' % part, 'Glow.Podium', lamps)

        def gear(b):
            if wedge:
                at_w = p(0, 0, ry - 0.36)
                self.prism('Black', [(-0.3, 0), (0.3, 0), (0.3, 0.14), (-0.3, 0.42)], 0.62, at_w, yaw + math.pi / 2, b)
            if pedals:
                self.box('Black', (0.6, 0.04, 0.24), p(0, 0.02, 0.2), yaw, bevel=0.008, b=b)
            if mic:
                # A stand in front of the player, its boom leaning back to the mouth.
                d = min(0.5, reach - 0.2, ry - 0.91 if wedge else 1.0)
                assert d >= 0.3, 'podium %s too small for its microphone and wedge' % part
                foot_m = Vector(p(0, 0, d))
                pole = Vector(p(0, 1.38, d))
                for k in range(3):
                    a = yaw + k / 3 * math.tau
                    self.rod('Black', foot_m + Vector((0, 0.1, 0)), foot_m + Vector((math.sin(a) * 0.22, 0, math.cos(a) * 0.22)), 0.01, 4, b=b)
                self.rod('Black', foot_m, pole, 0.012, 6, b=b)
                tip = Vector(p(0, 1.48, d - 0.22))
                self.rod('Black', pole, tip, 0.01, 5, b=b)
                self.rod('Black', tip, tip + (tip - pole).normalized() * 0.16, 0.022, 8, cap=True, b=b)

        if wedge or pedals or mic:
            self.own('Podium_%s_Gear' % part, 'Black', gear)
        if wedge:
            self.own('Podium_%s_Grille' % part, 'Grille', lambda b: self.panel('Grille', 0.54, 0.56, p(0, 0.284, ry - 0.362), yaw, -math.pi / 2 - 0.4366, b))

        self.mark(part, (x, top, z))
        self.data.setdefault('podiums', {})[part] = {'rx': rx, 'ry': ry, 'travel': travel, 'floor': round(floor, 3)}
        return top

    # ------------------------------------------------------------------ data the game reads
    def mark(self, name, at):
        self.data['marks'][name] = r3(at)

    def source(self, name, at):
        self.data['sources'].setdefault(name, []).append(r3(at))

    def instance(self, proto, at, yaw=0.0, scale=1.0):
        self.data['instances'].setdefault(proto, []).append([*r3(at), round(yaw, 4), round(scale, 3)])

    def proto(self, name, material, build):
        """A shape the game repeats: made at the origin, its copies placed with `instance`."""
        self.own('Proto_' + name, material, build)

    # ------------------------------------------------------------------ making the objects
    def finish(self):
        """Turns what was gathered into objects: one per material, and the named parts."""
        made = []
        for material, b in self.parts.items():
            made.append(self._object(material, material, b))
        for name, material, b in self.objects:
            made.append(self._object(name, material, b))
        self.parts.clear()
        self.objects.clear()
        return made

    def _object(self, name, material, b):
        b.transform(TO_BLENDER)
        me = bpy.data.meshes.new(name)
        b.to_mesh(me)
        b.free()
        me.materials.append(mat(material))
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return o
