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
    def moving_head(self, at, direction, group, length=None, spread=None, size=1.0, body=True):
        """A moving head and its beam: base, yoke, the head along the beam with its lens."""
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
        hung = d.y < 0.2
        up = 0.24 * size if hung else -0.24 * size
        self.box('Black', (0.44 * size, 0.13 * size, 0.34 * size), p + Vector((0, up, 0)), math.atan2(d.x, d.z), bevel=0.02 * size)
        side = UP.cross(d)
        side = side.normalized() if side.length > 0.01 else Vector((1, 0, 0))
        for k in (-1, 1):
            arm = p + side * (k * 0.18 * size)
            self.box('Black', (0.05 * size, abs(up), 0.12 * size), arm + Vector((0, up / 2, 0)), math.atan2(d.x, d.z))
        q = UP.rotation_difference(d)
        m = Matrix.Translation(p - d * 0.04 * size) @ q.to_matrix().to_4x4() @ Matrix.Rotation(-math.pi / 2, 4, 'X')
        bmesh.ops.create_cone(self.bm('Dark'), cap_ends=True, cap_tris=False, segments=16, radius1=0.12 * size, radius2=0.15 * size, depth=0.38 * size, matrix=m)
        lens = Matrix.Translation(p + d * 0.155 * size) @ q.to_matrix().to_4x4() @ Matrix.Rotation(-math.pi / 2, 4, 'X')
        bmesh.ops.create_circle(self.bm('Glow.Lens'), cap_ends=True, cap_tris=False, segments=16, radius=0.12 * size, matrix=lens)

    def par(self, at, direction, size=1.0):
        """A plain par can on its bracket, pointing along `direction`."""
        d = v3(direction).normalized()
        p = v3(at)
        q = UP.rotation_difference(d)
        m = Matrix.Translation(p) @ q.to_matrix().to_4x4() @ Matrix.Rotation(-math.pi / 2, 4, 'X')
        bmesh.ops.create_cone(self.bm('Black'), cap_ends=True, cap_tris=False, segments=14, radius1=0.1 * size, radius2=0.12 * size, depth=0.3 * size, matrix=m)
        lens = Matrix.Translation(p + d * 0.151 * size) @ q.to_matrix().to_4x4() @ Matrix.Rotation(-math.pi / 2, 4, 'X')
        bmesh.ops.create_circle(self.bm('Glow.Lens'), cap_ends=True, cap_tris=False, segments=14, radius=0.1 * size, matrix=lens)
        self.rod('Black', p, p + Vector((0, 0.22 * size, 0)), 0.02 * size, 4)

    def dj_booth(self, at, yaw=0.0, width=3.4, screen='booth'):
        """
        A DJ's booth facing +z (the crowd) when `yaw` is 0, the DJ behind it: a desk with an LED
        front, a top lit along its front edge, two players with jog wheels, screens and pads, a
        mixer with knobs, faders and meters, a laptop on a stand, a lamp, a drink, cables, and a
        monitor on a stand at each end turned in to the DJ.
        """
        p = frame(at, yaw)
        w, h = width, 1.0
        self.box('Black', (w, h - 0.06, 0.92), p(0, (h - 0.06) / 2, 0), yaw, bevel=0.01)
        self.box('Dark', (w + 0.14, 0.06, 1.06), p(0, h - 0.03, 0), yaw, bevel=0.015)
        self.box('Glow.Edge', (w + 0.1, 0.014, 0.014), p(0, h - 0.04, 0.53), yaw)
        for x, z in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            self.box('Alu', (0.06, h - 0.06, 0.06), p(x * w / 2, (h - 0.06) / 2, z * 0.46), yaw, bevel=0.01)
        self.own('LED_' + screen, 'LED.' + screen, lambda b: self.panel('LED.' + screen, w - 0.14, h - 0.22, p(0, (h - 0.06) / 2, 0.462), yaw, b=b))
        self.data['screens'][screen] = {'w': w - 0.14, 'h': h - 0.22}
        # Four players, two either side of the mixer: a body with a big tilted screen at the back,
        # a jog wheel with a lit ring, pads and transport buttons at the front.
        for x in (-1.02, -0.6, 0.6, 1.02):
            self.box('Dark', (0.38, 0.1, 0.5), p(x, h + 0.05, -0.04), yaw, bevel=0.012)
            self.box('Dark', (0.36, 0.05, 0.2), p(x, h + 0.13, -0.2), yaw, -0.5, bevel=0.008)
            self.panel('Glow.Screen', 0.31, 0.16, p(x, h + 0.158, -0.187), yaw, -1.07)
            self.drum('Chrome', 0.115, 0.022, p(x, h + 0.1, 0.07), 36)
            self.drum('Glow.Jog', 0.128, 0.012, p(x, h + 0.096, 0.07), 36)
            self.drum('Black', 0.05, 0.027, p(x, h + 0.1, 0.07), 16)
            self.drum('Glow.Screen', 0.03, 0.029, p(x, h + 0.1, 0.07), 12)
            for i in range(8):
                self.box('Glow.Pad', (0.026, 0.008, 0.016), p(x - 0.126 + i * 0.036, h + 0.102, -0.075), yaw)
            self.drum('Glow.Green', 0.022, 0.012, p(x - 0.14, h + 0.1, 0.19), 12)
            self.drum('Glow.Amber', 0.022, 0.012, p(x - 0.14, h + 0.1, 0.13), 12)
            for i in range(3):
                self.drum('Alu', 0.011, 0.02, p(x + 0.15, h + 0.1, -0.02 + i * 0.07), 8)
        # The mixer: a tall four-channel desk with rows of knobs, faders, a crossfader and meters.
        self.box('Dark', (0.44, 0.11, 0.56), p(0, h + 0.055, -0.02), yaw, bevel=0.012)
        for c in range(4):
            cx = -0.135 + c * 0.09
            for r in range(6):
                self.drum('Alu', 0.012, 0.024, p(cx, h + 0.11, -0.25 + r * 0.05), 10)
            self.box('Black', (0.012, 0.004, 0.13), p(cx, h + 0.111, 0.13), yaw)
            self.box('Alu', (0.026, 0.026, 0.034), p(cx, h + 0.122, 0.1 + (c % 2) * 0.04), yaw)
            self.box('Glow.Meter', (0.008, 0.005, 0.2), p(cx + 0.035, h + 0.112, -0.12), yaw)
        self.box('Black', (0.2, 0.004, 0.012), p(0, h + 0.111, 0.235), yaw)
        self.box('Alu', (0.03, 0.026, 0.024), p(0.02, h + 0.122, 0.235), yaw)
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
            self.rod('Black', p(x, 0, -0.25), p(x, 0.85, -0.25), 0.025, 8)
            for k in range(3):
                a = k / 3 * math.tau
                self.rod('Black', p(x, 0.18, -0.25), p(x + math.cos(a) * 0.3, 0.0, -0.25 + math.sin(a) * 0.3), 0.014, 5)
            turn = yaw - side * 0.55
            mp = frame(p(x, 0.85, -0.25), turn)
            self.box('Black', (0.42, 0.62, 0.4), mp(0, 0.31, 0), turn, bevel=0.02)
            self.panel('Grille', 0.36, 0.56, mp(0, 0.31, 0.205), turn)
        for k in range(4):
            self.tube('Rubber', [p(-0.6 + k * 0.4, h - 0.1, -0.46), p(-0.55 + k * 0.38, 0.4, -0.55), p(-0.5 + k * 0.38, 0.0, -0.66 - k * 0.05), p(-0.4 + k * 0.38, 0.0, -1.2)], 0.012, 5)

    def speaker_stack(self, at, yaw=0.0, subs=2, tops=2):
        p = frame(at, yaw)
        y = 0.0
        for _ in range(subs):
            self.box('Black', (1.2, 0.62, 0.9), p(0, y + 0.31, 0), yaw, bevel=0.02)
            self.panel('Grille', 1.1, 0.52, p(0, y + 0.31, 0.452), yaw)
            for x in (-0.6, 0.6):
                self.box('Alu', (0.03, 0.62, 0.9), p(x, y + 0.31, 0), yaw)
            y += 0.62
        for _ in range(tops):
            self.box('Black', (0.8, 0.48, 0.6), p(0, y + 0.24, -0.1), yaw, bevel=0.02)
            self.panel('Grille', 0.74, 0.42, p(0, y + 0.24, 0.202), yaw)
            y += 0.48

    def line_array(self, top, yaw=0.0, count=8, size=1.0, chain=3.0):
        """A hang in a gentle J, each box a little more splayed, on a frame with chains to the rig."""
        p = frame(top, yaw)
        self.box('Dark', (1.25 * size, 0.1, 0.9 * size), p(0, 0, 0), yaw)
        for x in (-0.5, 0.5):
            self.rod('Chrome', p(x * size, 0, 0), p(x * size, chain, 0), 0.012, 4)
        y, z = -0.06, 0.0
        for k in range(count):
            tilt = k * k * 0.008
            hb = 0.36 * size
            y -= hb * math.cos(tilt)
            z += hb * math.sin(tilt)
            self.box('Black', (1.12 * size, hb * 0.96, 0.62 * size), p(0, y + hb / 2, z), yaw, tilt, bevel=0.012)
            self.panel('Grille', 1.06 * size, hb * 0.82, p(0, y + hb / 2 + 0.31 * size * math.sin(tilt), z + 0.312 * size * math.cos(tilt)), yaw, tilt)

    def road_cases(self, at, yaw=0.0, count=6, seed=1):
        """Road cases stacked against a wall: black boxes with aluminium edges, catches and handles."""
        p = frame(at, yaw)
        x = 0.0
        for k in range(count):
            r = abs(math.sin(seed * 31 + k * 7.7))
            w = 0.7 + r * 0.7
            h = 0.6 + (r * 3) % 1 * 0.5
            d = 0.6 + (r * 7) % 1 * 0.3
            stack = 1 + int((r * 13) % 1 * 2.2)
            y = 0.0
            for _ in range(stack):
                self.box('Black', (w, h, d), p(x + w / 2, y + h / 2, 0), yaw, bevel=0.012)
                for yy in (0.0, h):
                    self.box('Alu', (w + 0.02, 0.03, d + 0.02), p(x + w / 2, y + yy, 0), yaw)
                for xx in (0.0, w):
                    self.box('Alu', (0.03, h, d + 0.02), p(x + xx, y + h / 2, 0), yaw)
                self.box('Chrome', (0.14, 0.04, 0.02), p(x + w / 2, y + h * 0.62, d / 2 + 0.012), yaw)
                for xx in (0.15, w - 0.15):
                    self.box('Chrome', (0.06, 0.06, 0.015), p(x + xx, y + h * 0.82, d / 2 + 0.01), yaw)
                y += h
            if stack == 1 and k % 2 == 0:
                for xx in (0.1, w - 0.1):
                    for zz in (-d / 2 + 0.1, d / 2 - 0.1):
                        self.drum('Rubber', 0.05, 0.08, p(x + xx, -0.08, zz), 8)
            x += w + 0.06

    def foh(self, at, yaw=0.0, roof=True):
        """The mixing desk on its riser: consoles with lit screens and faders, racks, a work lamp, a roof."""
        p = frame(at, yaw)
        self.box('Black', (5, 0.45, 3.4), p(0, 0.225, 0), yaw, bevel=0.02)
        for x in (-1.2, 1.2):
            self.box('Dark', (2.0, 0.85, 0.9), p(x, 0.875, -0.4), yaw, bevel=0.02)
            self.panel('Glow.Screen', 1.7, 0.26, p(x, 1.37, -0.31), yaw + math.pi, 0.5)
            for k in range(24):
                self.box('Glow.Green' if k % 5 == 0 else 'Alu', (0.03, 0.02, 0.07), p(x - 0.9 + k * 0.078, 1.32, -0.1), yaw)
        for x in (-2.1, 2.1):
            self.box('Black', (0.6, 1.2, 0.6), p(x, 1.05, -1.2), yaw, bevel=0.015)
            for k in range(5):
                self.box('Glow.Green' if k % 2 else 'Glow.Amber', (0.04, 0.015, 0.01), p(x - 0.2 + k * 0.1, 1.5, -0.895), yaw)
        if roof:
            for x, z in ((-2.4, -1.6), (2.4, -1.6), (-2.4, 1.6), (2.4, 1.6)):
                self.rod('Alu', p(x, 0, z), p(x, 3.2, z), 0.05, 8)
            self.box('Black', (5.3, 0.14, 3.7), p(0, 3.27, 0), yaw)
            self.box('Glow.Amber', (4.0, 0.03, 0.05), p(0, 3.18, 1.0), yaw)

    def barrier(self, a, c):
        """A crowd barrier from a to c: frames a metre apart with a top rail, a front panel and feet."""
        a, c = v3(a), v3(c)
        length = (c - a).length
        yaw = math.atan2(c.x - a.x, c.z - a.z) - math.pi / 2
        mid = (a + c) / 2
        p = frame((mid.x, a.y, mid.z), yaw)
        self.box('Alu', (length, 0.06, 0.06), p(0, 1.18, 0), yaw)
        self.box('Dark', (length, 0.95, 0.03), p(0, 0.62, 0), yaw)
        x = -length / 2
        while x <= length / 2 + 1e-3:
            self.rod('Alu', p(x, 0.05, 0), p(x, 1.18, 0), 0.025, 6)
            self.rod('Alu', p(x, 0.1, 0), p(x, 0.02, -0.9), 0.02, 5)
            self.box('Alu', (0.08, 0.02, 1.0), p(x, 0.01, -0.45), yaw)
            x += 1.0

    def wedge(self, at, yaw=0.0):
        """A floor monitor, its face tipped up toward the player."""
        self.prism('Black', [(-0.3, 0), (0.3, 0), (0.3, 0.14), (-0.3, 0.42)], 0.62, (at[0], at[1], at[2]), yaw + math.pi / 2)

    def amp(self, at, yaw=0.0, cabs=2):
        """A guitar or bass amp: cabinets with their grilles, the head on top with its knobs lit."""
        p = frame(at, yaw)
        y = 0.0
        for _ in range(cabs):
            self.box('Black', (0.76, 0.76, 0.38), p(0, y + 0.38, 0), yaw, bevel=0.02)
            self.panel('Grille', 0.66, 0.66, p(0, y + 0.38, 0.192), yaw)
            y += 0.76
        self.box('Dark', (0.76, 0.28, 0.32), p(0, y + 0.14, 0), yaw, bevel=0.015)
        for k in range(6):
            self.drum('Alu', 0.012, 0.02, p(-0.25 + k * 0.08, y + 0.14, 0.17), 8)
        self.box('Glow.Red', (0.02, 0.02, 0.01), p(0.3, y + 0.2, 0.162), yaw)

    def mic_stand(self, at, lean=0.0):
        p = v3(at)
        for k in range(3):
            a = k / 3 * math.tau
            self.rod('Black', p + Vector((0, 0.1, 0)), p + Vector((math.cos(a) * 0.28, 0.0, math.sin(a) * 0.28)), 0.01, 4)
        self.rod('Chrome', p, p + Vector((0, 1.45, lean)), 0.012, 6)

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
