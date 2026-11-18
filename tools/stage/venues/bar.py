"""
Bar: a small live-music bar, warm and lived-in (see build.py).

Old brick on the back and left walls with bricked-up arches and framed gig posters, dark plaster
over wooden wainscot on the other two, a wooden floor, a tin ceiling under wooden beams with a
duct and pipes. The stage is at the back before a heavy velvet curtain, a pipe of par cans over
its front. The counter runs down the right wall with its taps, stools, pendant lamps and a
back bar of lit shelves full of bottles before a mirror; booths line the left wall, high tables
stand near the door. Strings of bulbs sag across the room, a mirror ball turns in the middle,
and three neon signs hang on the walls.
"""
import math
import random

import bmesh
from mathutils import Vector

import kit as K

HALF, BACK, FRONT, H = 9.0, -7.0, 10.0, 4.4
STAGE_X, STAGE_Z, DECK, RISER = 5.5, -3.5, 0.5, 0.25
COUNTER_X, COUNTER_Z0, COUNTER_Z1, COUNTER_H = 6.0, -0.5, 8.5, 1.1
BALL = (0, 3.85, 2.2)
BEAMS_Z = (-5.8, -3.4, -1.0, 1.4, 3.8, 6.2, 8.6)
BOOTHS_Z = (-1.2, 1.32, 3.84, 6.36)
BOTTLE = ((0.034, 0.0), (0.038, 0.012), (0.038, 0.17), (0.031, 0.205), (0.015, 0.245), (0.013, 0.3), (0.017, 0.303), (0.017, 0.32))

# Colours for the preview renders only.
PREVIEW = {
    'WoodFloor': (0.3, 0.19, 0.1), 'Wood': (0.2, 0.11, 0.055), 'Ceiling': (0.1, 0.09, 0.08), 'Carpet': (0.22, 0.06, 0.07), 'Velvet': (0.35, 0.03, 0.06),
    'Leather': (0.28, 0.09, 0.05), 'Brass': (0.72, 0.55, 0.22), 'Mirror': (0.6, 0.66, 0.7), 'Poster': (0.75, 0.6, 0.3), 'Plaster': (0.2, 0.2, 0.19),
}


def wall(x=None, z=None, face=1):
    """A wall's frame: (u along it, v up, d out into the room) -> a point, and the yaw facing the room."""
    if x is not None:
        return (lambda u, v, d=0.0: (x + face * d, v, u)), face * math.pi / 2
    return (lambda u, v, d=0.0: (u, v, z + face * d)), (0.0 if face > 0 else math.pi)


WALLS = {'back': wall(z=BACK), 'front': wall(z=FRONT, face=-1), 'left': wall(x=-HALF), 'right': wall(x=HALF, face=-1)}
ROOM = (0, 2, 2)


def box(k, material, size, at, yaw=0.0, pitch=0.0, bevel=0.0):
    """kit.box, finding the new cube's edges through its own corners (quick in a big mesh)."""
    b = k.bm(material)
    made = bmesh.ops.create_cube(b, size=1.0, matrix=K.place(at, yaw, pitch, scale=size))
    if bevel > 0:
        edges = list({e for v in made['verts'] for e in v.link_edges})
        bmesh.ops.bevel(b, geom=edges, offset=bevel, segments=2 if bevel >= 0.015 else 1, profile=0.5, affect='EDGES', clamp_overlap=True)


def on(k, w, material, u, v, size, d=0.0, bevel=0.0):
    """A box on a wall: `size` is (along the wall, up, out of it), its back `d` off the wall."""
    p, yaw = w
    box(k, material, size, p(u, v, d + size[2] / 2), yaw, 0, bevel)


def _outward(k, name, material, args, kw):
    """kit.tube and kit.torus wind their faces inward: make the part, then turn its faces out."""
    b = kw.pop('b', None) or k.bm(material)
    start = len(b.faces)
    getattr(k, name)(material, *args, b=b, **kw)
    b.faces.ensure_lookup_table()
    bmesh.ops.reverse_faces(b, faces=b.faces[start:])


def tube(k, material, *args, **kw):
    _outward(k, 'tube', material, args, kw)


def torus(k, material, *args, **kw):
    _outward(k, 'torus', material, args, kw)


def disc(k, material, radius, at, yaw=0.0, pitch=0.0, sides=10):
    bmesh.ops.create_circle(k.bm(material), cap_ends=True, cap_tris=False, segments=sides, radius=radius, matrix=K.place(at, yaw, pitch))


def face(b, pts, look):
    """A face through `pts`, turned to look toward the point `look`."""
    f = b.faces.new([b.verts.new(q) for q in pts])
    f.normal_update()
    if f.normal.dot(Vector(look) - f.calc_center_median()) < 0:
        f.normal_flip()


def patch(b, p, u0, u1, v0, v1, look=ROOM, step=0.6):
    """A stretch of wall in squares about `step` wide, so the baked shading has somewhere to sit."""
    nu, nv = max(1, round((u1 - u0) / step)), max(1, round((v1 - v0) / step))
    for i in range(nu):
        for j in range(nv):
            ua, ub = u0 + (u1 - u0) * i / nu, u0 + (u1 - u0) * (i + 1) / nu
            va, vb = v0 + (v1 - v0) * j / nv, v0 + (v1 - v0) * (j + 1) / nv
            face(b, [p(ua, va), p(ub, va), p(ub, vb), p(ua, vb)], look)


def arched_wall(k, material, w, u0, u1, niches, depth=0.22, n=10):
    """A wall with arched niches let into it: (centre, width, sill, spring) each, bricked up at the back."""
    p, _ = w
    b = k.bm(material)
    u = u0
    for uc, width, sill, spring in sorted(niches):
        r = width / 2
        patch(b, p, u, uc - r, 0, H)
        patch(b, p, uc - r, uc + r, 0, sill)
        arc = [(uc - r * math.cos(math.pi * i / n), spring + r * math.sin(math.pi * i / n)) for i in range(n + 1)]
        inside = p(uc, (sill + spring + r) / 2, -depth / 2)
        for (ua, va), (ub, vb) in zip(arc, arc[1:]):
            face(b, [p(ua, va), p(ub, vb), p(ub, H), p(ua, H)], ROOM)
            face(b, [p(ua, va), p(ub, vb), p(ub, vb, -depth), p(ua, va, -depth)], inside)
            face(b, [p(ua, sill, -depth), p(ub, sill, -depth), p(ub, vb, -depth), p(ua, va, -depth)], ROOM)
        for s in (-1, 1):
            face(b, [p(uc + s * r, sill), p(uc + s * r, spring), p(uc + s * r, spring, -depth), p(uc + s * r, sill, -depth)], inside)
        face(b, [p(uc - r, sill), p(uc + r, sill), p(uc + r, sill, -depth), p(uc - r, sill, -depth)], inside)
        on(k, w, 'Wood', uc, sill - 0.02, (width + 0.14, 0.04, 0.16), -0.1, 0.008)
        u = uc + r
    patch(b, p, u, u1, 0, H)


def lathe(b, profile, at, sides=10, caps=(True, True), inside=False):
    """A turned shape: (radius, height) pairs from the bottom up, spun about the vertical through `at`."""
    rings = [[b.verts.new((at[0] + math.cos(i / sides * math.tau) * r, at[1] + y, at[2] + math.sin(i / sides * math.tau) * r)) for i in range(sides)] for r, y in profile]
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            q = (r0[i], r1[i], r1[j], r0[j])
            b.faces.new(q[::-1] if inside else q).smooth = True
    if caps[0]:
        b.faces.new(rings[0][::-1] if inside else rings[0])
    if caps[1]:
        b.faces.new(rings[-1] if inside else rings[-1][::-1])


def wainscot(k, w, u0, u1, top=1.1):
    """Panelling to the dado: skirting, rails, stiles, a raised field in every bay."""
    length, mid = u1 - u0, (u0 + u1) / 2
    on(k, w, 'Wood', mid, top / 2, (length, top, 0.02))
    on(k, w, 'Wood', mid, 0.08, (length, 0.16, 0.02), 0.02, 0.006)
    on(k, w, 'Wood', mid, top - 0.09, (length, 0.1, 0.015), 0.02)
    on(k, w, 'Wood', mid, top, (length, 0.045, 0.05), 0.02, 0.01)
    n = max(1, round(length / 0.72))
    width = length / n
    for i in range(n + 1):
        on(k, w, 'Wood', min(max(u0 + i * width, u0 + 0.035), u1 - 0.035), 0.56, (0.07, 0.8, 0.015), 0.02)
    for i in range(n):
        on(k, w, 'Wood', u0 + (i + 0.5) * width, 0.56, (width - 0.2, 0.6, 0.014), 0.02, 0.01)


def poster(k, w, u, v, width, height, frame='Black'):
    p, yaw = w
    on(k, w, frame, u, v, (width + 0.07, height + 0.07, 0.025), 0, 0.008)
    k.panel('Poster', width, height, p(u, v, 0.0265), yaw)


def socket(k, w, u, v, switch=False):
    p, yaw = w
    on(k, w, 'Brass', u, v, (0.085, 0.085 if not switch else 0.12, 0.008), 0, 0.003)
    if switch:
        on(k, w, 'Black', u, v, (0.014, 0.03, 0.012), 0.008)
    else:
        for du in (-0.016, 0.016):
            disc(k, 'Black', 0.006, p(u + du, v, 0.0085), yaw, 0, 6)


def stool(k, x, z, h=0.78):
    """A bar stool: a round leather seat on a chrome rim, four splayed legs, a foot ring."""
    lathe(k.bm('Leather'), ((0.175, 0.0), (0.195, 0.014), (0.195, 0.05), (0.17, 0.07), (0.09, 0.08)), (x, h - 0.06, z), 18)
    k.drum('Chrome', 0.2, 0.014, (x, h - 0.069, z), 16)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        c, s = math.cos(a), math.sin(a)
        k.rod('Chrome', (x + c * 0.1, h - 0.069, z + s * 0.1), (x + c * 0.21, 0.012, z + s * 0.21), 0.012, 6)
        k.drum('Rubber', 0.016, 0.012, (x + c * 0.21, 0, z + s * 0.21), 6)
    torus(k, 'Chrome', 0.172, 0.009, (x, 0.26, z), 0, 0, 16, 4)


def candle(k, at):
    k.drum('Brass', 0.045, 0.006, at, 10)
    k.drum('Glass', 0.034, 0.06, (at[0], at[1] + 0.006, at[2]), 8, radius2=0.038)
    k.drum('Glow.Candle', 0.024, 0.066, (at[0], at[1] + 0.006, at[2]), 8)
    k.sphere('Glow.Candle', 0.012, (at[0], at[1] + 0.086, at[2]), 6, 4)


def glass(k, at, tall=True):
    if tall:
        k.drum('Glass', 0.03, 0.14, at, 8, radius2=0.04)
    else:
        k.drum('Glass', 0.036, 0.085, at, 8, radius2=0.038)


def mat_(k, at, yaw):
    """A beer mat."""
    k.panel('Poster', 0.092, 0.092, at, yaw, -math.pi / 2)


def mic(k, at, lean):
    k.mic_stand(at, lean)
    top = (at[0], at[1] + 1.45, at[2] + lean)
    k.rod('Dark', top, (top[0], top[1] + 0.05, top[2] - 0.12), 0.016, 6, cap=True)
    k.sphere('Alu', 0.026, (top[0], top[1] + 0.06, top[2] - 0.14), 8, 6)


def build(k):
    for name, colour in PREVIEW.items():
        K.mat(name).diffuse_color = (*colour, 1)
    rnd = random.Random(7)
    keep = []

    def clear(x, z, r):
        keep.append([round(x, 2), round(z, 2), r])

    # ------------------------------------------------------------- the band's gear
    # (first, while the meshes are small: the kit's own bevels look through all of a mesh)
    band = {'vox': (0, DECK, -4.3), 'lead': (-3.2, DECK, -4.9), 'bass': (3.2, DECK, -4.9), 'drums': (0, DECK + RISER, -6.1)}
    for name, at in band.items():
        k.mark(name, at)
    k.amp((-3.3, DECK, -6.2), 0.12, 1)
    k.amp((3.3, DECK, -6.2), -0.12, 2)
    for x, z in ((0, -3.86), (-3.2, -4.25), (3.2, -4.25)):
        k.wedge((x, DECK, z), 0)
        k.panel('Grille', 0.54, 0.56, (x, DECK + 0.284, z - 0.002), 0, -math.pi / 2 - 0.4366)
    mic(k, (0, DECK, -3.98), -0.15)
    mic(k, (-2.7, DECK, -4.55), -0.12)
    mic(k, (2.7, DECK, -4.55), -0.12)
    mic(k, (0.9, DECK + RISER, -5.5), -0.3)

    # ------------------------------------------------------------- the room
    k.grid('WoodFloor', HALF * 2, FRONT - BACK, 36, 34, (0, 0, (FRONT + BACK) / 2), 0, -math.pi / 2)
    k.grid('Ceiling', HALF * 2, FRONT - BACK, 18, 17, (0, H, (FRONT + BACK) / 2), 0, math.pi / 2)
    arched_wall(k, 'Brick', WALLS['back'], -HALF, HALF, [(-7.25, 1.2, 1.3, 2.3)])
    arched_wall(k, 'Brick', WALLS['left'], BACK, FRONT, [(-5.2, 1.3, 1.5, 2.6), (0.06, 1.3, 1.5, 2.6), (5.1, 1.3, 1.5, 2.6)])
    k.grid('Plaster', FRONT - BACK, H, 28, 7, (HALF, H / 2, (FRONT + BACK) / 2), -math.pi / 2)
    k.grid('Plaster', HALF * 2, H, 30, 7, (0, H / 2, FRONT), math.pi)
    for name, a, c in (('back', -HALF, -STAGE_X), ('back', STAGE_X, HALF), ('left', BACK, FRONT)):
        on(k, WALLS[name], 'Wood', (a + c) / 2, 0.07, (c - a, 0.14, 0.025), 0, 0.006)
    for name, a, c in (('back', -HALF, HALF), ('front', -HALF, HALF), ('left', BACK, FRONT), ('right', BACK, FRONT)):
        on(k, WALLS[name], 'Wood', (a + c) / 2, H - 0.07, (c - a, 0.14, 0.07), 0, 0.012)
        on(k, WALLS[name], 'Wood', (a + c) / 2, 3.55, (c - a, 0.035, 0.03), 0, 0.006)
    wainscot(k, WALLS['front'], -HALF, -0.72)
    wainscot(k, WALLS['front'], 0.72, HALF)
    wainscot(k, WALLS['right'], BACK, -6.22)
    wainscot(k, WALLS['right'], -4.98, -0.02)
    wainscot(k, WALLS['right'], 8.8, FRONT)
    for z in BEAMS_Z:
        box(k, 'Wood', (HALF * 2, 0.22, 0.2), (0, H - 0.11, z), 0, 0, 0.015)
        for x in (-8.8, 8.8):
            box(k, 'Wood', (0.3, 0.3, 0.24), (x, H - 0.33, z), 0, 0, 0.015)
    # Candles in the niches.
    candle(k, (-8.98 - 0.1, 1.52, -5.2))
    candle(k, (-9.08, 1.52, 5.25))
    candle(k, (-9.1, 1.52, 4.95))
    candle(k, (-7.1, 1.32, BACK - 0.1))

    # Overhead: a spiral duct with diffusers down the left side, a sprinkler main, copper pipes.
    dx_, dy_, dr = -8.45, 3.72, 0.18
    k.rod('Steel', (dx_, dy_, -2.8), (dx_, dy_, FRONT - 0.02), dr, 14, cap=True)
    z = -2.6
    while z < FRONT:
        torus(k, 'Steel', dr + 0.003, 0.011, (dx_, dy_, z), 0, math.pi / 2, 14, 4)
        z += 0.9
    for z in (-1.9, 0.2, 2.6, 5.0, 7.4, 9.3):
        box(k, 'Steel', (0.4, 0.012, 0.03), (dx_, dy_ + dr + 0.006, z))
        for s in (-1, 1):
            k.rod('Steel', (dx_ + s * 0.19, dy_ + dr, z), (dx_ + s * 0.19, H, z), 0.005, 4)
    for z in BOOTHS_Z:
        k.drum('Steel', 0.09, 0.08, (dx_ + 0.05, dy_ - dr - 0.07, z), 12, radius2=0.075)
        k.drum('Alu', 0.17, 0.02, (dx_ + 0.05, dy_ - dr - 0.09, z), 14, radius2=0.11)
        disc(k, 'Grille', 0.1, (dx_ + 0.05, dy_ - dr - 0.092, z), 0, math.pi / 2, 12)
    disc(k, 'Grille', dr - 0.02, (dx_, dy_, -2.802), math.pi, 0, 14)
    k.rod('Steel', (2.6, 4.12, BACK + 0.02), (2.6, 4.12, FRONT - 0.02), 0.026, 8)
    for z in (-5.0, -2.2, 0.2, 2.6, 5.0, 7.4):
        k.rod('Brass', (2.6, 4.1, z), (2.6, 4.03, z), 0.012, 6)
        k.drum('Brass', 0.03, 0.006, (2.6, 4.015, z), 8)
        k.rod('Steel', (2.6, 4.14, z + 0.3), (2.6, H, z + 0.3), 0.005, 4)
    for i, x in enumerate((7.55, 7.68)):
        k.rod('Brass', (x, 4.13, BACK + 0.02), (x, 4.13, FRONT - 0.02), 0.014 + 0.004 * i, 6)
    for z in BEAMS_Z:
        box(k, 'Brass', (0.22, 0.012, 0.03), (7.615, 4.155, z + 0.14))

    # ------------------------------------------------------------- the stage
    box(k, 'Wood', (STAGE_X * 2, DECK, STAGE_Z - BACK), (0, DECK / 2 - 0.003, (STAGE_Z + BACK) / 2))
    k.grid('Carpet', STAGE_X * 2 - 0.04, STAGE_Z - BACK - 0.04, 22, 7, (0, DECK + 0.002, (STAGE_Z + BACK) / 2), 0, -math.pi / 2)
    sf = wall(z=STAGE_Z)
    on(k, sf, 'Brass', 0, DECK - 0.012, (STAGE_X * 2 + 0.04, 0.03, 0.02), 0, 0.006)
    on(k, sf, 'Wood', 0, 0.05, (STAGE_X * 2 + 0.03, 0.1, 0.015))
    for i in range(10):
        on(k, sf, 'Wood', -4.95 + i * 1.1, 0.27, (0.96, 0.28, 0.016), 0, 0.01)
    for side in (-1, 1):
        ss = wall(x=side * STAGE_X, face=side)
        on(k, ss, 'Brass', -5.25, DECK - 0.012, (3.5, 0.03, 0.02), 0, 0.006)
        for i in range(3):
            on(k, ss, 'Wood', -6.4 + i * 1.15, 0.27, (1.0, 0.28, 0.016), 0, 0.01)
    # Steps up at the left.
    box(k, 'Wood', (0.45, 0.17, 1.0), (-6.175, 0.085, -4.4), 0, 0, 0.01)
    box(k, 'Wood', (0.45, 0.34, 1.0), (-5.725, 0.17, -4.4), 0, 0, 0.01)
    for x, y in ((-6.175, 0.171), (-5.725, 0.341)):
        k.floor('Carpet', 0.36, 0.9, (x + 0.03, y + 0.002, -4.4))
        box(k, 'Brass', (0.03, 0.012, 1.0), (x - 0.21, y - 0.002, -4.4))
    clear(-5.95, -4.4, 0.75)
    # The drum riser.
    box(k, 'Wood', (2.4, RISER, 1.6), (0, DECK + RISER / 2 - 0.003, -5.9), 0, 0, 0.012)
    k.grid('Carpet', 2.34, 1.54, 6, 4, (0, DECK + RISER + 0.002, -5.9), 0, -math.pi / 2)
    box(k, 'Alu', (2.4, 0.02, 0.02), (0, DECK + RISER - 0.008, -5.1))
    # The curtain: deep folds of velvet from the pelmet to the boards, gathered legs at the sides.
    fold = lambda x, y: (0.075 * math.sin(x * 16.5) + 0.03 * math.sin(x * 5.3 + 1.0) + 0.012 * math.sin(x * 43)) * (1.0 + 0.25 * (0.5 - y / 3.45))
    k.grid('Velvet', STAGE_X * 2, 3.45, 240, 6, (0, DECK + 1.725, BACK + 0.16), 0, 0, fold)
    for side in (-1, 1):
        k.grid('Velvet', 0.95, 3.45, 40, 6, (side * 5.03, DECK + 1.725, BACK + 0.5), 0, 0, lambda x, y: 0.06 * math.sin(x * 30) + 0.05 * math.cos(x * 3.2))
        torus(k, 'Brass', 0.3, 0.014, (side * 5.03, 1.75, BACK + 0.5), 0, 0, 16, 5)
    k.grid('Velvet', STAGE_X * 2 + 0.3, 0.56, 240, 2, (0, 3.86, BACK + 0.4), 0, 0, lambda x, y: 0.05 * math.sin(x * 14) + 0.02 * math.sin(x * 37))
    k.rod('Brass', (-5.75, 4.13, BACK + 0.42), (5.75, 4.13, BACK + 0.42), 0.025, 8, cap=True)
    for side in (-1, 1):
        k.sphere('Brass', 0.05, (side * 5.78, 4.13, BACK + 0.42), 8, 6)
    for x in (-5.4, -1.8, 1.8, 5.4):
        k.rod('Brass', (x, 4.13, BACK + 0.42), (x, 4.13, BACK + 0.2), 0.012, 6)
    box(k, 'Wood', (STAGE_X * 2 + 0.5, 0.2, 0.42), (0, 4.28, BACK + 0.22), 0, 0, 0.015)
    # The lighting pipe over the stage's front: six par cans on clamps, their cables looped along it.
    pz, py = -3.9, 3.76
    k.rod('Steel', (-5.2, py, pz), (5.2, py, pz), 0.024, 8, cap=True)
    for x in (-4.8, 0, 4.8):
        k.rod('Steel', (x, py, pz), (x, H, pz), 0.012, 6)
        box(k, 'Steel', (0.07, 0.07, 0.07), (x, py, pz), 0, 0, 0.008)
        box(k, 'Steel', (0.14, 0.012, 0.14), (x, H - 0.006, pz))
    k.rod('Rubber', (-4.0, py + 0.034, pz), (4.8, py + 0.034, pz), 0.011, 5)
    tube(k, 'Rubber', [(4.8, py + 0.034, pz), (4.86, py + 0.2, pz + 0.02), (4.84, H - 0.02, pz + 0.03)], 0.011, 5)
    for x in (-4.0, -2.4, -0.8, 0.8, 2.4, 4.0):
        at = (x, 3.5, pz)
        aim = (x * 0.75 - x, 1.5 - 3.5, -5.1 - pz)
        k.par(at, aim)
        k.moving_head(at, aim, 'Par', 4.6, 0.16, body=False)
        box(k, 'Steel', (0.05, 0.075, 0.075), (x, py - 0.012, pz), 0, 0, 0.008)
        tube(k, 'Rubber', [(x, 3.56, pz + 0.13), (x + 0.1, 3.6, pz + 0.16), (x + 0.14, 3.72, pz + 0.06), (x + 0.12, py + 0.034, pz)], 0.008, 5)
        tube(k, 'Chrome', [(x - 0.07, 3.6, pz), (x - 0.1, 3.7, pz + 0.03), (x - 0.07, py + 0.026, pz)], 0.003, 4)
        for s in (-1, 1):
            box(k, 'Black', (0.004, 0.2, 0.13), (x + s * 0.125, 3.48, pz + 0.0), 0, 0)
    # House speakers on stands either side, small movers and confetti on the stage's front corners,
    # spark fountains along its front.
    for side in (-1, 1):
        sx, sz = side * 6.3, -3.1
        yaw = side * 0.2
        k.rod('Black', (sx, 0, sz), (sx, 1.38, sz), 0.02, 8)
        k.rod('Chrome', (sx, 0.9, sz), (sx, 1.4, sz), 0.015, 8)
        for i in range(3):
            a = i / 3 * math.tau + 0.5
            k.rod('Black', (sx, 0.42, sz), (sx + math.cos(a) * 0.42, 0.01, sz + math.sin(a) * 0.42), 0.013, 5)
            k.rod('Black', (sx, 0.16, sz), (sx + math.cos(a) * 0.2, 0.2, sz + math.sin(a) * 0.2), 0.008, 4)
        f = K.frame((sx, 1.4, sz), yaw)
        box(k, 'Black', (0.42, 0.68, 0.38), f(0, 0.34, 0), yaw, 0, 0.02)
        k.panel('Grille', 0.36, 0.6, f(0, 0.34, 0.192), yaw)
        box(k, 'Glow.Green', (0.012, 0.012, 0.004), f(0.15, 0.06, 0.193), yaw)
        tube(k, 'Rubber', [f(0, 0.2, -0.19), f(0.02, -0.4, -0.22), f(0.05, -1.36, -0.1), f(0.3, -1.385, -0.3), (side * 5.52, 0.015, -3.6)], 0.008, 5)
        clear(sx, sz, 0.6)
        k.moving_head((side * 5.1, DECK + 0.215, -3.85), (-side * 0.45, 1, -0.15), 'Floor', 5, 0.08, 0.7)
        cx = side * 5.15
        box(k, 'Dark', (0.3, 0.08, 0.3), (cx, DECK + 0.04, -4.5), 0, 0, 0.012)
        k.rod('Dark', (cx, DECK + 0.08, -4.5), (cx - side * 0.08, DECK + 0.5, -4.42), 0.065, 10, cap=True)
        k.source('confetti', (cx - side * 0.08, DECK + 0.52, -4.42))
    for x in (-3.9, -1.3, 1.3, 3.9):
        box(k, 'Dark', (0.26, 0.12, 0.2), (x, DECK + 0.06, -3.63), 0, 0, 0.012)
        k.drum('Alu', 0.035, 0.012, (x, DECK + 0.12, -3.63), 8)
        box(k, 'Glow.Amber', (0.01, 0.01, 0.004), (x + 0.09, DECK + 0.07, -3.528))
        k.source('sparks', (x, DECK + 0.13, -3.63))
    # A pedalboard, a DI box, cables across the carpet.
    box(k, 'Dark', (0.56, 0.03, 0.24), (-3.35, DECK + 0.015, -4.52), 0.05, 0, 0.008)
    for i, glow in enumerate(('Glow.Red', 'Glow.Green', 'Glow.Amber', 'Glow.Red')):
        px = -3.56 + i * 0.14
        box(k, 'Alu' if i % 2 else 'Steel', (0.1, 0.035, 0.15), (px, DECK + 0.047, -4.52), 0.05, 0, 0.006)
        k.drum('Chrome', 0.012, 0.012, (px, DECK + 0.064, -4.49), 6)
        box(k, glow, (0.008, 0.004, 0.008), (px, DECK + 0.066, -4.56))
    box(k, 'Alu', (0.12, 0.05, 0.14), (2.75, DECK + 0.025, -4.75), 0.2, 0, 0.006)
    for pts in ([(-3.35, -4.64), (-3.4, -5.4), (-3.3, -6.0)], [(3.2, -4.6), (3.25, -5.5), (3.3, -6.0)], [(0.0, -4.1), (0.5, -4.6), (1.5, -5.0), (4.6, -5.3), (5.3, -6.2)],
                [(-3.2, -4.45), (-2.2, -4.75), (1.2, -5.05)], [(3.2, -4.45), (2.4, -4.8), (1.6, -5.02)], [(-2.7, -4.5), (-1.2, -4.95), (1.3, -5.08)], [(0.9, -5.2), (2.2, -5.2), (4.6, -5.4)]):
        tube(k, 'Rubber', [(x, DECK + 0.012, z) for x, z in pts], 0.009, 5)
    # An upright piano at the side of the stage, its stool before it.
    yaw = math.pi / 2
    f = K.frame((-5.02, DECK, -5.55), yaw)
    box(k, 'Wood', (1.46, 1.16, 0.34), f(0, 0.6, -0.12), yaw, 0, 0.015)
    box(k, 'Wood', (1.5, 0.04, 0.4), f(0, 1.2, -0.11), yaw, 0, 0.012)
    box(k, 'Wood', (1.46, 0.09, 0.3), f(0, 0.66, 0.2), yaw, 0, 0.012)
    box(k, 'Black', (1.4, 0.03, 0.3), f(0, 0.015, -0.1), yaw)
    for s in (-1, 1):
        box(k, 'Wood', (0.07, 0.62, 0.07), f(s * 0.68, 0.31, 0.3), yaw, 0, 0.01)
        box(k, 'Wood', (0.06, 0.1, 0.3), f(s * 0.7, 0.75, 0.2), yaw, 0, 0.012)
    box(k, 'Alu', (1.3, 0.016, 0.14), f(0, 0.712, 0.26), yaw)
    for i in range(36):
        if i % 7 not in (2, 6):
            box(k, 'Black', (0.014, 0.012, 0.085), f(-0.63 + i * 0.036, 0.726, 0.225), yaw)
    box(k, 'Wood', (1.3, 0.13, 0.016), f(0, 0.79, 0.058), yaw)
    box(k, 'Wood', (0.62, 0.24, 0.012), f(0, 0.97, 0.085), yaw, -0.22)
    k.panel('Poster', 0.3, 0.2, f(0.05, 0.975, 0.101), yaw, -0.22)
    for i in (-1, 0, 1):
        box(k, 'Brass', (0.03, 0.012, 0.1), f(i * 0.09, 0.04, 0.1), yaw, 0, 0.004)
    candle(k, f(-0.5, 1.22, -0.1))
    glass(k, f(0.52, 1.22, -0.08), False)
    sx_, sz_ = f(0, 0, 0.72)[0], f(0, 0, 0.72)[2]
    k.drum('Leather', 0.18, 0.06, (sx_, DECK + 0.44, sz_), 14)
    k.drum('Wood', 0.185, 0.025, (sx_, DECK + 0.415, sz_), 14)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        k.rod('Wood', (sx_ + math.cos(a) * 0.12, DECK + 0.42, sz_ + math.sin(a) * 0.12), (sx_ + math.cos(a) * 0.17, DECK, sz_ + math.sin(a) * 0.17), 0.018, 6)
    # Kegs in the corner beside the stage.
    for kx, kz in ((6.2, -6.55), (6.82, -6.6), (6.5, -6.02)):
        k.drum('Alu', 0.2, 0.56, (kx, 0, kz), 14)
        for y in (0.0, 0.19, 0.37, 0.545):
            torus(k, 'Alu', 0.203, 0.012, (kx, y + 0.008, kz), 0, 0, 14, 4)
        k.drum('Steel', 0.035, 0.02, (kx, 0.56, kz), 8)
    clear(6.5, -6.4, 0.75)

    # ------------------------------------------------------------- the counter
    cw = wall(x=COUNTER_X, face=-1)
    cl, cm = COUNTER_Z1 - COUNTER_Z0, (COUNTER_Z0 + COUNTER_Z1) / 2
    box(k, 'Wood', (0.6, COUNTER_H - 0.1, cl), (COUNTER_X + 0.3, 0.1 + (COUNTER_H - 0.1) / 2, cm))
    box(k, 'Black', (0.5, 0.1, cl - 0.1), (COUNTER_X + 0.32, 0.05, cm))
    box(k, 'Wood', (0.96, 0.07, cl + 0.3), (COUNTER_X + 0.22, COUNTER_H + 0.035, cm), 0, 0, 0.02)
    box(k, 'Wood', (2.4, COUNTER_H - 0.1, 0.6), (7.8, 0.1 + (COUNTER_H - 0.1) / 2, COUNTER_Z1))
    box(k, 'Wood', (2.5, 0.07, 0.96), (7.75, COUNTER_H + 0.035, COUNTER_Z1 - 0.02), 0, 0, 0.02)
    on(k, cw, 'Wood', cm, 0.2, (cl, 0.12, 0.022))
    on(k, cw, 'Wood', cm, COUNTER_H - 0.1, (cl, 0.1, 0.022))
    n = 12
    for i in range(n + 1):
        on(k, cw, 'Wood', min(max(COUNTER_Z0 + i * cl / n, COUNTER_Z0 + 0.04), COUNTER_Z1 - 0.04), 0.6, (0.08, 0.7, 0.022))
    for i in range(n):
        on(k, cw, 'Wood', COUNTER_Z0 + (i + 0.5) * cl / n, 0.6, (cl / n - 0.22, 0.52, 0.018), 0, 0.012)
    ew = wall(z=COUNTER_Z0, face=-1)
    on(k, ew, 'Wood', COUNTER_X + 0.3, 0.6, (0.44, 0.7, 0.018), 0, 0.012)
    k.box('Glow.Counter', (0.03, 0.012, cl), (COUNTER_X - 0.1, COUNTER_H - 0.007, cm))
    k.box('Glow.Counter', (0.012, 0.02, cl - 0.1), (COUNTER_X + 0.062, 0.088, cm))
    # The brass foot rail on its brackets.
    k.rod('Brass', (COUNTER_X - 0.2, 0.2, COUNTER_Z0 + 0.1), (COUNTER_X - 0.2, 0.2, COUNTER_Z1 - 0.1), 0.022, 10, cap=True)
    z = COUNTER_Z0 + 0.3
    while z < COUNTER_Z1:
        tube(k, 'Brass', [(COUNTER_X, 0.26, z), (COUNTER_X - 0.2, 0.26, z), (COUNTER_X - 0.2, 0.0, z)], 0.012, 6)
        k.drum('Brass', 0.03, 0.008, (COUNTER_X - 0.2, 0, z), 8)
        z += 1.4
    top = COUNTER_H + 0.07
    # The tap tower: a brass column and bar, four taps with their handles, a drip tray under them.
    tz = 3.6
    box(k, 'Chrome', (0.22, 0.016, 0.62), (6.42, top + 0.008, tz), 0, 0, 0.005)
    k.floor('Grille', 0.18, 0.58, (6.42, top + 0.0165, tz))
    k.drum('Brass', 0.045, 0.4, (6.2, top, tz), 12)
    k.drum('Brass', 0.07, 0.02, (6.2, top, tz), 12)
    k.rod('Brass', (6.2, top + 0.4, tz - 0.32), (6.2, top + 0.4, tz + 0.32), 0.04, 12, cap=True)
    for i in range(4):
        z = tz - 0.225 + i * 0.15
        tube(k, 'Chrome', [(6.2, top + 0.4, z), (6.36, top + 0.38, z), (6.4, top + 0.33, z), (6.4, top + 0.26, z)], 0.013, 6)
        k.rod('Brass', (6.34, top + 0.39, z), (6.34, top + 0.44, z), 0.012, 6)
        box(k, 'Black', (0.03, 0.15, 0.04), (6.33, top + 0.515, z), 0, 0, 0.008)
        k.panel('Poster', 0.03, 0.05, (6.3145, top + 0.53, z), -math.pi / 2)
    # The till, a card reader, glasses in rows, a tip jar, napkins, candles, mats and drinks.
    box(k, 'Dark', (0.3, 0.09, 0.34), (6.42, top + 0.045, 7.55), 0, 0, 0.012)
    k.rod('Dark', (6.42, top + 0.09, 7.55), (6.4, top + 0.25, 7.55), 0.02, 6)
    box(k, 'Dark', (0.03, 0.24, 0.32), (6.38, top + 0.3, 7.55), 0, 0, 0.008)
    k.panel('Glow.Screen', 0.28, 0.2, (6.396, top + 0.3, 7.55), math.pi / 2)
    box(k, 'Dark', (0.09, 0.03, 0.16), (6.1, top + 0.02, 7.2), 0.3, -0.2, 0.008)
    box(k, 'Glow.Green', (0.05, 0.002, 0.05), (6.1, top + 0.038, 7.17), 0.3, -0.2)
    for i in range(4):
        for j in range(3):
            glass(k, (6.38 + j * 0.085, top, 0.9 + i * 0.085))
    for i in range(3):
        for j in range(3):
            glass(k, (6.4 + j * 0.085, top, 5.6 + i * 0.09), False)
    k.drum('Glass', 0.06, 0.16, (6.05, top, 2.5), 10)
    k.drum('Brass', 0.062, 0.012, (6.05, top + 0.16, 2.5), 10)
    box(k, 'Chrome', (0.12, 0.1, 0.14), (6.1, top + 0.05, 5.1), 0.2, 0, 0.008)
    box(k, 'Alu', (0.1, 0.02, 0.12), (6.1, top + 0.1, 5.1), 0.2)
    for z in (0.5, 4.6, 6.6):
        candle(k, (6.12, top, z))
    for i in range(8):
        z = 0.3 + i * 1.1
        stool(k, 5.35, z)
        clear(5.35, z, 0.4)
        if i in (0, 2, 3, 5, 6):
            dz = rnd.uniform(-0.2, 0.2)
            mat_(k, (5.93, top + 0.002, z + dz), rnd.uniform(0, 1.5))
            glass(k, (5.93, top + 0.003, z + dz), i % 2 == 0)
        else:
            mat_(k, (5.98, top + 0.002, z + 0.2), rnd.uniform(0, 1.5))
    for z in (1.9, 2.02, 6.0):
        mat_(k, (6.2, top + 0.002 + (0.003 if z == 2.02 else 0), z), z)

    # ------------------------------------------------------------- the back bar
    bw = wall(x=8.45, face=-1)
    bz0, bz1 = 0.0, 7.9
    bm = (bz0 + bz1) / 2
    box(k, 'Wood', (0.55, 0.92, bz1 - bz0), (8.725, 0.46, bm))
    box(k, 'Wood', (0.62, 0.04, bz1 - bz0 + 0.06), (8.7, 0.94, bm), 0, 0, 0.01)
    box(k, 'Black', (0.02, 0.08, bz1 - bz0), (8.46, 0.04, bm))
    for i in range(10):
        z = bz0 + 0.395 + i * 0.79
        if i in (3, 7):
            # A bottle fridge: a lit glass door in a steel frame, its shelves dark across the light.
            on(k, bw, 'Steel', z, 0.5, (0.74, 0.76, 0.016), 0, 0.006)
            k.panel('Glow.Shelf', 0.62, 0.64, (8.432, 0.5, z), -math.pi / 2)
            for y in (0.36, 0.56):
                on(k, bw, 'Black', z, y, (0.62, 0.02, 0.006), 0.016)
            on(k, bw, 'Chrome', z + 0.3, 0.5, (0.02, 0.3, 0.03), 0.016, 0.006)
        else:
            on(k, bw, 'Wood', z, 0.5, (0.7, 0.72, 0.018), 0, 0.012)
            k.sphere('Brass', 0.016, (8.418, 0.62, z + 0.27 * (1 if i % 2 else -1)), 6, 4)
    # The mirror in its frame, three glass shelves lit from behind on brass uprights, a lit header.
    k.panel('Mirror', 7.5, 1.95, (8.975, 2.1, bm), -math.pi / 2)
    rw = WALLS['right']
    on(k, rw, 'Wood', bm, 1.1, (7.66, 0.08, 0.05), 0, 0.01)
    on(k, rw, 'Wood', bm, 3.1, (7.66, 0.08, 0.05), 0, 0.01)
    for z in (bz0 + 0.16, bz1 - 0.16):
        on(k, rw, 'Wood', z, 2.1, (0.1, 2.08, 0.05), 0, 0.01)
        box(k, 'Wood', (0.3, 2.42, 0.16), (8.85, 2.15, z - 0.14 * (1 if z < bm else -1)), 0, 0, 0.012)
    box(k, 'Wood', (0.34, 0.24, bz1 - bz0 + 0.1), (8.83, 3.3, bm), 0, 0, 0.015)
    box(k, 'Wood', (0.4, 0.05, bz1 - bz0 + 0.2), (8.8, 3.44, bm), 0, 0, 0.012)
    k.box('Glow.Shelf', (0.03, 0.012, 7.3), (8.76, 3.174, bm))
    shelves = (1.42, 1.92, 2.42)
    for y in shelves:
        box(k, 'Glass', (0.21, 0.012, 7.4), (8.845, y, bm))
        k.box('Glow.Shelf', (0.016, 0.02, 7.4), (8.955, y + 0.016, bm))
        k.box('Glow.Shelf', (0.012, 0.008, 7.4), (8.745, y - 0.01, bm))
    for i in range(7):
        z = bz0 + 0.3 + i * (7.3 / 6)
        k.rod('Brass', (8.945, 1.14, z), (8.945, 3.06, z), 0.009, 6)
        for y in shelves:
            box(k, 'Brass', (0.2, 0.012, 0.012), (8.845, y - 0.012, z))
    k.proto('bottle', 'Glow.Bottle', lambda b: lathe(b, BOTTLE, (0, 0, 0), 8))
    for y in shelves:
        for i in range(40):
            z = bz0 + 0.37 + i * (7.16 / 39) + rnd.uniform(-0.025, 0.025)
            k.instance('bottle', (8.84 + rnd.uniform(-0.03, 0.03), y + 0.006, z), rnd.uniform(0, math.tau), rnd.choice((0.86, 0.94, 1.0, 1.0, 1.08, 1.16, 1.24)))
    # On the back counter: shakers, an ice bucket, a rack of glasses, a bowl of lemons' worth of brass.
    for i, z in enumerate((0.6, 0.72, 0.86)):
        lathe(k.bm('Chrome'), ((0.03, 0), (0.042, 0.12), (0.042, 0.15), (0.028, 0.2), (0.02, 0.24)), (8.62, 0.96, z), 8)
    k.drum('Chrome', 0.1, 0.18, (8.66, 0.96, 2.0), 12, radius2=0.12)
    torus(k, 'Chrome', 0.12, 0.008, (8.66, 1.14, 2.0), 0, 0, 12, 4)
    for i in range(5):
        for j in range(3):
            glass(k, (8.56 + j * 0.085, 0.96, 4.4 + i * 0.085), False)
    box(k, 'Dark', (0.3, 0.34, 0.42), (8.7, 1.13, 6.6), 0, 0, 0.015)
    box(k, 'Chrome', (0.2, 0.02, 0.3), (8.56, 1.02, 6.6))
    box(k, 'Glow.Amber', (0.004, 0.02, 0.06), (8.548, 1.24, 6.6))
    k.drum('Brass', 0.09, 0.05, (8.62, 0.96, 3.0), 12, radius2=0.12)
    # Pendant lamps over the counter: a cord, a brass shade, the bulb showing under it.
    for z in (0.2, 2.6, 5.0, 7.4):
        x, y = 6.2, 2.3
        k.drum('Brass', 0.05, 0.03, (x, H - 0.03, z), 10)
        k.rod('Black', (x, y + 0.2, z), (x, H - 0.03, z), 0.006, 4)
        shade = ((0.21, 0.0), (0.17, 0.08), (0.07, 0.17), (0.03, 0.2), (0.03, 0.24))
        lathe(k.bm('Brass'), shade, (x, y, z), 14, (False, True))
        lathe(k.bm('Brass'), [(r - 0.006, h) for r, h in shade[:4]], (x, y, z), 14, (False, True), inside=True)
        k.rod('Black', (x, y + 0.06, z), (x, y + 0.17, z), 0.02, 6)
        k.sphere('Glow.Bulb', 0.045, (x, y + 0.03, z), 8, 6)

    # ------------------------------------------------------------- booths along the left wall
    for zc in BOOTHS_Z:
        box(k, 'Wood', (1.15, 0.045, 0.72), (-8.4, 0.75, zc), 0, 0, 0.012)
        k.drum('Black', 0.04, 0.73, (-8.3, 0, zc), 10)
        box(k, 'Black', (0.5, 0.03, 0.4), (-8.3, 0.015, zc), 0, 0, 0.01)
        candle(k, (-8.62, 0.7725, zc + 0.05))
        mat_(k, (-8.2, 0.775, zc - 0.16), 0.4)
        glass(k, (-8.2, 0.776, zc - 0.16))
        mat_(k, (-8.05, 0.775, zc + 0.2), 1.1)
        box(k, 'Chrome', (0.02, 0.16, 0.1), (-8.85, 0.85, zc + 0.24), 0.3)
        k.panel('Poster', 0.09, 0.14, (-8.838, 0.86, zc + 0.236), 0.3 + math.pi / 2)
        for s in (-1, 1):
            box(k, 'Wood', (1.4, 0.4, 0.5), (-8.28, 0.2, zc + s * 0.905))
            box(k, 'Black', (1.36, 0.06, 0.44), (-8.28, 0.03, zc + s * 0.905))
            box(k, 'Leather', (1.4, 0.1, 0.52), (-8.28, 0.45, zc + s * 0.9), 0, 0, 0.03)
            box(k, 'Leather', (1.4, 0.66, 0.1), (-8.28, 0.86, zc + s * 1.16), 0, 0, 0.03)
            for i in range(4):
                for y in (0.72, 1.0):
                    k.sphere('Brass', 0.012, (-8.8 + i * 0.35, y, zc + s * 1.107), 6, 4)
        # A brass wall lamp over the table.
        on(k, WALLS['left'], 'Brass', zc, 1.72, (0.09, 0.14, 0.015), 0, 0.005)
        tube(k, 'Brass', [(-8.985, 1.72, zc), (-8.82, 1.72, zc), (-8.8, 1.78, zc)], 0.008, 6)
        k.drum('Brass', 0.03, 0.035, (-8.8, 1.77, zc), 8, radius2=0.05)
        k.sphere('Glow.Bulb', 0.042, (-8.8, 1.84, zc), 8, 6)
        clear(-8.28, zc, 1.5)
    for z in [BOOTHS_Z[0] - 1.26] + [zc + 1.26 for zc in BOOTHS_Z]:
        box(k, 'Wood', (1.48, 1.3, 0.1), (-8.26, 0.65, z), 0, 0, 0.012)
        box(k, 'Wood', (1.52, 0.05, 0.15), (-8.26, 1.325, z), 0, 0, 0.012)
        box(k, 'Wood', (0.06, 1.3, 0.14), (-7.5, 0.65, z), 0, 0, 0.012)
        for s in (-1, 1):
            tube(k, 'Brass', [(-7.6, 1.2, z + s * 0.05), (-7.6, 1.2, z + s * 0.1), (-7.6, 1.24, z + s * 0.12)], 0.006, 5)
    # High tables near the door, stools round them.
    for tx, tz, n in ((-4.6, 6.5, 3), (-2.4, 8.5, 2), (3.2, 7.8, 3)):
        lathe(k.bm('Wood'), ((0.34, 0.0), (0.36, 0.01), (0.36, 0.03), (0.35, 0.04)), (tx, 1.06, tz), 24)
        k.drum('Black', 0.035, 1.06, (tx, 0, tz), 10)
        k.drum('Black', 0.25, 0.025, (tx, 0, tz), 16)
        torus(k, 'Chrome', 0.2, 0.01, (tx, 0.3, tz), 0, 0, 16, 4)
        for i in range(3):
            a = i * math.tau / 3
            k.rod('Chrome', (tx, 0.3, tz), (tx + math.cos(a) * 0.2, 0.3, tz + math.sin(a) * 0.2), 0.007, 4)
        candle(k, (tx, 1.1, tz))
        for i in range(n):
            a = 0.7 + i * math.tau / 3 + tx
            stool(k, tx + math.cos(a) * 0.64, tz + math.sin(a) * 0.64)
            mat_(k, (tx + math.cos(a) * 0.22, 1.102, tz + math.sin(a) * 0.22), a)
            if i != 1:
                glass(k, (tx + math.cos(a) * 0.22, 1.103, tz + math.sin(a) * 0.22), i == 0)
        clear(tx, tz, 1.05)

    # ------------------------------------------------------------- the walls' dressing
    lw, bk, fw = WALLS['left'], WALLS['back'], WALLS['front']
    for w, u, v, pw, ph, frame in ((lw, -3.3, 2.3, 0.7, 1.0, 'Black'), (lw, -2.4, 2.6, 0.5, 0.7, 'Wood'), (lw, -2.45, 1.75, 0.42, 0.6, 'Black'), (lw, 8.35, 2.25, 0.7, 1.0, 'Wood'),
                                 (lw, 9.25, 2.45, 0.5, 0.7, 'Black'), (lw, 9.22, 1.7, 0.42, 0.6, 'Brass'), (bk, -6.1, 2.3, 0.6, 0.85, 'Black'), (bk, -8.45, 2.2, 0.5, 0.7, 'Wood'),
                                 (bk, -8.45, 3.05, 0.42, 0.6, 'Black'), (fw, -2.9, 2.25, 0.7, 1.0, 'Black'), (fw, -1.9, 2.45, 0.5, 0.7, 'Wood'), (fw, -1.95, 1.7, 0.42, 0.6, 'Black'),
                                 (rw, -0.85, 2.3, 0.6, 0.85, 'Wood'), (rw, -1.7, 2.45, 0.42, 0.6, 'Black'), (rw, 9.4, 2.2, 0.6, 0.85, 'Black')):
        poster(k, w, u, v, pw, ph, frame)
    # A chalkboard and a door marked private on the right wall, wall lamps either side.
    on(k, rw, 'Wood', -3.2, 2.2, (1.5, 1.05, 0.03), 0, 0.01)
    on(k, rw, 'Black', -3.2, 2.2, (1.38, 0.93, 0.006), 0.03)
    on(k, rw, 'Wood', -3.2, 1.7, (1.3, 0.03, 0.06), 0.03, 0.006)
    p, yaw = rw
    du = -5.6
    for s in (-1, 1):
        on(k, rw, 'Wood', du + s * 0.56, 1.08, (0.1, 2.16, 0.06), 0, 0.01)
    on(k, rw, 'Wood', du, 2.2, (1.22, 0.1, 0.06), 0, 0.01)
    on(k, rw, 'Wood', du, 1.07, (1.02, 2.12, 0.04), 0, 0.008)
    for v, h in ((0.55, 0.7), (1.5, 0.9)):
        on(k, rw, 'Wood', du, v, (0.7, h, 0.014), 0.04, 0.01)
    k.sphere('Brass', 0.03, p(du + 0.4, 1.05, 0.09), 8, 6)
    k.rod('Brass', p(du + 0.4, 1.05, 0.04), p(du + 0.4, 1.05, 0.08), 0.012, 6)
    on(k, rw, 'Brass', du + 0.4, 1.05, (0.06, 0.2, 0.004), 0.04)
    on(k, rw, 'Brass', du, 1.75, (0.3, 0.08, 0.004), 0.054)
    for v in (0.25, 1.07, 1.9):
        k.rod('Brass', p(du - 0.51, v - 0.05, 0.05), p(du - 0.51, v + 0.05, 0.05), 0.012, 6, cap=True)
    for u in (-4.45, -2.2):
        on(k, rw, 'Brass', u, 2.55, (0.09, 0.14, 0.015), 0, 0.005)
        tube(k, 'Brass', [p(u, 2.55, 0.015), p(u, 2.55, 0.18), p(u, 2.61, 0.2)], 0.008, 6)
        k.drum('Brass', 0.03, 0.035, (p(u, 2.6, 0.2)[0], 2.6, u), 8, radius2=0.05)
        k.sphere('Glow.Bulb', 0.042, p(u, 2.67, 0.2), 8, 6)
    for w, u, v, sw in ((rw, -0.5, 0.42, False), (rw, -4.0, 0.42, False), (fw, 0.95, 1.3, True), (fw, -4.2, 0.42, False), (fw, 6.7, 0.42, False), (fw, 1.5, 0.42, False), (rw, -6.4, 1.3, True)):
        socket(k, w, u, v, sw)
    p, yaw = bk
    box(k, 'Brass', (0.085, 0.085, 0.008), p(6.3, 0.4, 0.004), yaw, 0, 0.003)
    box(k, 'Brass', (0.085, 0.085, 0.008), p(-8.2, 0.4, 0.004), yaw, 0, 0.003)

    # The entrance: a panelled door with a glazed light and a transom, brass furniture, a lit sign.
    p, yaw = fw
    for s in (-1, 1):
        on(k, fw, 'Wood', s * 0.64, 1.14, (0.12, 2.28, 0.1), 0, 0.012)
    on(k, fw, 'Wood', 0, 2.3, (1.4, 0.1, 0.1), 0, 0.012)
    on(k, fw, 'Wood', 0, 2.85, (1.4, 0.1, 0.1), 0, 0.012)
    for s in (-1, 1):
        on(k, fw, 'Wood', s * 0.64, 2.58, (0.12, 0.46, 0.1), 0, 0.012)
    k.panel('Glass', 1.16, 0.46, p(0, 2.58, 0.03), yaw)
    on(k, fw, 'Wood', 0, 2.58, (0.03, 0.46, 0.04), 0.03)
    on(k, fw, 'Wood', 0, 1.13, (1.14, 2.2, 0.05), 0.02, 0.01)
    on(k, fw, 'Wood', 0, 0.58, (0.8, 0.66, 0.014), 0.07, 0.01)
    k.panel('Glass', 0.8, 1.02, p(0, 1.55, 0.074), yaw)
    for u, v, s in ((0, 2.08, (0.88, 0.04, 0.02)), (0, 1.02, (0.88, 0.04, 0.02)), (-0.42, 1.55, (0.04, 1.1, 0.02)), (0.42, 1.55, (0.04, 1.1, 0.02)), (0, 1.55, (0.022, 1.02, 0.016)), (0, 1.72, (0.8, 0.022, 0.016))):
        on(k, fw, 'Wood', u, v, s, 0.07)
    k.rod('Brass', p(0.46, 0.9, 0.13), p(0.46, 1.35, 0.13), 0.014, 8, cap=True)
    for v in (0.95, 1.3):
        k.rod('Brass', p(0.46, v, 0.07), p(0.46, v, 0.13), 0.008, 6)
    on(k, fw, 'Brass', 0, 0.14, (1.04, 0.2, 0.004), 0.07)
    on(k, fw, 'Brass', 0.3, 1.0, (0.12, 0.04, 0.004), 0.084)
    for v in (0.25, 1.13, 2.0):
        k.rod('Brass', p(-0.585, v - 0.05, 0.075), p(-0.585, v + 0.05, 0.075), 0.012, 6, cap=True)
    on(k, fw, 'Steel', -0.3, 2.2, (0.3, 0.06, 0.05), 0.07, 0.008)
    tube(k, 'Steel', [p(-0.2, 2.2, 0.1), p(0.05, 2.27, 0.14), (p(0.3, 2.3, 0.1))], 0.008, 5)
    on(k, fw, 'Dark', 0, 3.08, (0.6, 0.2, 0.06), 0, 0.01)
    on(k, fw, 'Glow.Exit', 0, 3.08, (0.52, 0.13, 0.01), 0.06)
    k.floor('Rubber', 1.3, 0.85, (0, 0.004, 9.5))
    k.grid('Carpet', 1.2, 0.75, 4, 3, (0, 0.007, 9.5), 0, -math.pi / 2)
    # The coat rack: a rail of brass hooks under a shelf, a few coats and a hat, an umbrella stand.
    on(k, fw, 'Wood', 2.6, 1.72, (1.7, 0.14, 0.025), 0, 0.008)
    on(k, fw, 'Wood', 2.6, 1.93, (1.7, 0.03, 0.24), 0, 0.008)
    for u in (1.9, 3.3):
        on(k, fw, 'Brass', u, 1.86, (0.02, 0.1, 0.2))
    for i in range(7):
        u = 1.88 + i * 0.24
        tube(k, 'Brass', [p(u, 1.74, 0.025), p(u, 1.72, 0.09), p(u, 1.76, 0.11)], 0.007, 5)
        disc(k, 'Brass', 0.02, p(u, 1.74, 0.0255), yaw, 0, 8)
    for u, role, h, lean in ((2.12, 'Leather', 0.82, 0.05), (2.84, 'Velvet', 0.95, -0.04), (3.08, 'Black', 0.9, 0.03)):
        box(k, role, (0.4, h, 0.11), p(u + lean, 1.7 - h / 2, 0.085), yaw, 0, 0.05)
        box(k, role, (0.2, 0.1, 0.12), p(u + lean, 1.69, 0.085), yaw, 0, 0.04)
        for s in (-1, 1):
            box(k, role, (0.11, h * 0.68, 0.09), p(u + lean + s * 0.235, 1.6 - h * 0.34, 0.08), yaw, 0, 0.04)
    hx, hy, hz = p(2.5, 1.945, 0.12)
    k.drum('Black', 0.15, 0.012, (hx, hy, hz), 14)
    k.drum('Black', 0.085, 0.1, (hx, hy, hz), 12, radius2=0.075)
    k.drum('Brass', 0.12, 0.5, (3.75, 0, 9.78), 12)
    torus(k, 'Brass', 0.122, 0.008, (3.75, 0.5, 9.78), 0, 0, 12, 4)
    for dx, lean in ((-0.04, -0.12), (0.05, 0.1)):
        k.rod('Black', (3.75 + dx, 0.05, 9.78), (3.75 + dx + lean, 0.86, 9.76), 0.018, 6, cap=True)
        torus(k, 'Wood', 0.04, 0.009, (3.75 + dx + lean, 0.9, 9.76), 0, math.pi / 2, 10, 4, math.pi)
    clear(3.75, 9.78, 0.3)

    # A jukebox in the front corner: an arched cabinet, neon round the arch, a lit title window.
    jf = K.frame((-7.95, 0, 9.68), math.pi)
    box(k, 'Wood', (0.82, 1.0, 0.56), jf(0, 0.5, 0), math.pi, 0, 0.02)
    arch = [(-0.41, 1.0)] + [(-0.41 * math.cos(i / 12 * math.pi), 1.0 + 0.41 * math.sin(i / 12 * math.pi)) for i in range(1, 12)] + [(0.41, 1.0)]
    k.prism('Wood', arch, 0.56, jf(0, 0, 0), math.pi)
    for r, role in ((0.36, 'Glow.NeonB'), (0.29, 'Glow.NeonA')):
        tube(k, role, [jf(-r, 0.36, 0.29)] + [jf(-r * math.cos(i / 14 * math.pi), 1.0 + r * math.sin(i / 14 * math.pi), 0.29) for i in range(15)] + [jf(r, 0.36, 0.29)], 0.014, 6)
    k.panel('Glow.Screen', 0.44, 0.2, jf(0, 1.08, 0.283), math.pi)
    box(k, 'Chrome', (0.5, 0.26, 0.012), jf(0, 1.08, 0.276), math.pi, 0, 0.004)
    k.panel('Grille', 0.5, 0.46, jf(0, 0.62, 0.283), math.pi)
    box(k, 'Chrome', (0.56, 0.52, 0.012), jf(0, 0.62, 0.276), math.pi, 0, 0.004)
    box(k, 'Chrome', (0.5, 0.05, 0.03), jf(0, 0.92, 0.29), math.pi, 0, 0.006)
    for i in range(8):
        box(k, 'Glow.Amber' if i % 3 else 'Glow.Red', (0.03, 0.014, 0.006), jf(-0.175 + i * 0.05, 0.92, 0.307), math.pi)
    box(k, 'Black', (0.86, 0.08, 0.6), jf(0, 0.04, 0), math.pi)
    tube(k, 'Black', [jf(0.3, 0.2, -0.28), jf(0.5, 0.05, -0.27), (-8.6, 0.42, 9.97)], 0.008, 5)
    clear(-7.95, 9.68, 0.65)

    # Two windows in the front wall: frames, night glass, wooden blinds, a radiator under each
    # and a neon shape hanging before the slats.
    for wu, role in ((-5.5, 'Glow.NeonC'), (5.2, 'Glow.NeonA')):
        v0, v1, ww = 1.25, 3.05, 2.0
        vm = (v0 + v1) / 2
        k.panel('Glass', ww, v1 - v0, p(wu, vm, 0.012), yaw)
        on(k, fw, 'Wood', wu, v0 - 0.03, (ww + 0.3, 0.05, 0.18), 0, 0.01)
        on(k, fw, 'Wood', wu, v1 + 0.05, (ww + 0.24, 0.1, 0.09), 0, 0.01)
        for s in (-1, 1):
            on(k, fw, 'Wood', wu + s * (ww / 2 + 0.05), vm, (0.1, v1 - v0, 0.09), 0, 0.01)
        on(k, fw, 'Wood', wu, vm, (0.05, v1 - v0, 0.04), 0.012)
        on(k, fw, 'Wood', wu, v0 + 1.2, (ww, 0.04, 0.04), 0.012)
        on(k, fw, 'Wood', wu, v1 - 0.03, (ww - 0.04, 0.05, 0.06), 0.05, 0.006)
        for i in range(26):
            box(k, 'Wood', (ww - 0.08, 0.004, 0.048), p(wu, v1 - 0.1 - i * 0.064, 0.085), yaw, 0.6)
        on(k, fw, 'Wood', wu, v1 - 0.1 - 26 * 0.064, (ww - 0.08, 0.025, 0.04), 0.065, 0.006)
        for s in (-0.7, 0.7):
            k.rod('Black', p(wu + s, v1 - 0.06, 0.085), p(wu + s, v1 - 0.1 - 26 * 0.064, 0.085), 0.003, 4)
        k.rod('Black', p(wu + 0.9, v1 - 0.06, 0.12), p(wu + 0.9, v0 + 0.5, 0.12), 0.003, 4)
        k.drum('Wood', 0.012, 0.04, p(wu + 0.9, v0 + 0.46, 0.12), 6)
        # The radiator.
        for i in range(14):
            on(k, fw, 'Steel', wu - 0.585 + i * 0.09, 0.52, (0.05, 0.62, 0.13), 0.08, 0.012)
        for v in (0.26, 0.78):
            k.rod('Steel', p(wu - 0.62, v, 0.145), p(wu + 0.62, v, 0.145), 0.022, 6)
        tube(k, 'Brass', [p(wu + 0.62, 0.26, 0.145), p(wu + 0.76, 0.26, 0.145), p(wu + 0.76, 0.0, 0.145)], 0.012, 6)
        k.drum('Brass', 0.024, 0.05, p(wu + 0.7, 0.235, 0.145), 6)
        for s in (-0.5, 0.5):
            box(k, 'Steel', (0.04, 0.2, 0.05), p(wu + s, 0.1, 0.145), yaw)
        # The neon.
        nd, nv = 0.17, 2.05
        if role == 'Glow.NeonC':
            tube(k, role, [p(wu + math.cos(i / 40 * math.tau) * 0.42, nv + math.sin(i / 40 * math.tau) * 0.42, nd) for i in range(40)], 0.014, 6, closed=True)
            tube(k, role, [p(wu + math.cos(i / 16 * math.tau) * 0.12, nv + math.sin(i / 16 * math.tau) * 0.12, nd) for i in range(16)], 0.014, 6, closed=True)
            tube(k, role, [p(wu + math.cos(0.4 + i / 10 * 1.1) * 0.28, nv + math.sin(0.4 + i / 10 * 1.1) * 0.28, nd) for i in range(11)], 0.014, 6)
            tube(k, role, [p(wu + math.cos(3.54 + i / 10 * 1.1) * 0.28, nv + math.sin(3.54 + i / 10 * 1.1) * 0.28, nd) for i in range(11)], 0.014, 6)
        else:
            pulse = [(-0.7, 0), (-0.38, 0), (-0.28, 0.14), (-0.16, -0.2), (-0.02, 0.42), (0.12, -0.4), (0.24, 0.16), (0.34, 0), (0.7, 0)]
            tube(k, role, [p(wu + a, nv + c, nd) for a, c in pulse], 0.014, 6)
        for s in (-0.36, 0.36):
            k.rod('Chrome', p(wu + s, v1 + 0.0, 0.17), p(wu + s, nv + (0.2 if role == 'Glow.NeonC' else 0.0), nd), 0.002, 4)
        on(k, fw, 'Dark', wu - 0.8, v0 + 0.06, (0.16, 0.07, 0.1), 0.02, 0.008)
        tube(k, 'Black', [p(wu - 0.72, v0 + 0.07, 0.1), p(wu - 0.6, v0 + 0.3, 0.15), p(wu - 0.42 if role == 'Glow.NeonC' else wu - 0.7, nv, nd)], 0.004, 4)

    # ------------------------------------------------------------- overhead lights
    # Four strings of bulbs sagging from wall to wall.
    k.proto('bulb', 'Glow.Bulb', lambda b: k.sphere('Glow.Bulb', 0.034, (0, 0, 0), 8, 6, b=b))
    for i, (za, zb) in enumerate(((-2.4, -1.2), (0.9, 0.1), (4.0, 4.9), (7.4, 6.6))):
        at = lambda t: (-8.97 + 17.92 * t, 4.05 - 2.2 * t * (1 - t), za + (zb - za) * t)
        tube(k, 'Black', [at(j / 48) for j in range(49)], 0.006, 4)
        n = 23 if i % 2 == 0 else 22
        for j in range(n):
            x, y, z = at((j + 0.5) / n)
            k.rod('Black', (x, y, z), (x, y - 0.05, z), 0.013, 6, cap=True)
            k.instance('bulb', (x, y - 0.082, z))
        for t in (0.0, 1.0):
            x, y, z = at(t)
            torus(k, 'Brass', 0.025, 0.006, (x, y, z), 0, math.pi / 2, 8, 4)
    # The mirror ball on its motor, and the pin spot that lights it.
    k.own('Move_ball', 'Mirror', lambda b: k.sphere('Mirror', 0.34, BALL, 24, 14, smooth=False, b=b))
    k.drum('Chrome', 0.04, 0.03, (BALL[0], BALL[1] + 0.335, BALL[2]), 8)
    k.rod('Chrome', (BALL[0], BALL[1] + 0.36, BALL[2]), (BALL[0], H - 0.1, BALL[2]), 0.008, 6)
    box(k, 'Dark', (0.18, 0.1, 0.18), (BALL[0], H - 0.05, BALL[2]), 0, 0, 0.012)
    tube(k, 'Black', [(BALL[0] + 0.09, H - 0.04, BALL[2]), (BALL[0] + 0.3, H - 0.012, BALL[2] + 0.1), (BALL[0] + 0.9, H - 0.012, BALL[2] - 0.6), (BALL[0] + 0.9, H - 0.012, 1.5)], 0.006, 4)
    pin = (-3, 4.3, 7)
    aim = (BALL[0] - pin[0], BALL[1] - pin[1], BALL[2] - pin[2])
    k.par(pin, aim, 0.42)
    k.moving_head(pin, aim, 'Pin', 6, 0.012, body=False)
    box(k, 'Dark', (0.1, 0.02, 0.1), (pin[0], H - 0.01, pin[2]))

    # ------------------------------------------------------------- the neon signs
    def standoffs(w, pts, d, every):
        p, _ = w
        for u, v in pts[::every]:
            k.rod('Chrome', p(u, v, 0), p(u, v, d - 0.012), 0.005, 4)

    def transformer(w, u, v, to):
        p, _ = w
        on(k, w, 'Dark', u, v, (0.22, 0.12, 0.07), 0, 0.01)
        box(k, 'Glow.Green', (0.008, 0.008, 0.004), p(u + 0.08, v + 0.03, 0.072))
        tube(k, 'Black', [p(u, v + 0.06, 0.04), p((u + to[0]) / 2, (v + to[1]) / 2 + 0.05, 0.03), p(to[0], to[1], 0.05)], 0.005, 4)

    # Three stacked wave lines on the brick over the booths.
    waves = []
    for i in range(3):
        half = 1.3 - i * 0.22
        waves.append([(2.58 + half * (2 * j / 60 - 1), 2.42 + i * 0.36 + 0.11 * math.sin((2 * j / 60 - 1) * half * 5.6 + i * 1.1)) for j in range(61)])
    p, _ = lw
    k.own('Move_neon_0', 'Glow.NeonA', lambda b: [tube(k, 'Glow.NeonA', [lw[0](u, v, 0.075) for u, v in line], 0.018, 6, b=b) for line in waves])
    for line in waves:
        standoffs(lw, line, 0.075, 12)
    transformer(lw, 4.2, 2.1, waves[0][-1])
    # A ring with a lightning bolt on the back wall, right of the stage.
    rc = (7.25, 2.6)
    ring = [(rc[0] + math.cos(i / 48 * math.tau) * 0.58, rc[1] + math.sin(i / 48 * math.tau) * 0.58) for i in range(48)]
    bolt = [(rc[0] + a, rc[1] + c) for a, c in ((0.1, 0.42), (-0.22, -0.05), (-0.02, -0.05), (-0.12, -0.42), (0.24, 0.07), (0.03, 0.07))]

    def neon_1(b):
        tube(k, 'Glow.NeonB', [bk[0](u, v, 0.075) for u, v in ring], 0.02, 6, closed=True, b=b)
        tube(k, 'Glow.NeonB', [bk[0](u, v, 0.075) for u, v in bolt], 0.018, 6, closed=True, b=b)

    k.own('Move_neon_1', 'Glow.NeonB', neon_1)
    standoffs(bk, ring, 0.075, 8)
    standoffs(bk, bolt, 0.075, 2)
    transformer(bk, 8.2, 1.8, ring[42])
    # A cocktail glass over the back bar.
    gc, gv, gs = bm, 3.5, 0.84
    shapes = [([(-0.33, 0.76), (0.33, 0.76), (0, 0.38)], True), ([(0, 0.38), (0, 0.04)], False), ([(-0.18, 0.02), (0.18, 0.02)], False), ([(0.1, 0.56), (0.3, 0.88)], False),
              ([(-0.1 + math.cos(i / 10 * math.tau) * 0.05, 0.64 + math.sin(i / 10 * math.tau) * 0.05) for i in range(10)], True)]
    shapes = [([(gc + a * gs, gv + c * gs) for a, c in pts], closed) for pts, closed in shapes]
    k.own('Move_neon_2', 'Glow.NeonC', lambda b: [tube(k, 'Glow.NeonC', [rw[0](u, v, 0.07) for u, v in pts], 0.016, 6, closed=closed, b=b) for pts, closed in shapes])
    for pts, closed in shapes[:4]:
        standoffs(rw, pts, 0.07, 1)
    transformer(rw, gc + 0.6, 3.56, shapes[2][0][1])

    return {
        'ao': 1.5,
        'room': {'half': HALF, 'z0': BACK, 'z1': FRONT, 'h': H},
        'counter': {'x': COUNTER_X, 'z0': COUNTER_Z0, 'z1': COUNTER_Z1},
        'ball': list(BALL),
        'keep_clear': keep,
        'views': {
            'front': ((0, 1.9, 9.2), (0, 1.9, -5), 70),
            'hero': ((-6.8, 3.3, 8.6), (3, 1.2, -2), 78),
            'bar': ((7.5, 1.7, 7.9), (5.2, 1.2, 0.5), 84),
            'stage': ((0.8, 1.7, -0.6), (0, 1.6, -5.5), 68),
            'counter': ((2.2, 1.7, 6.5), (8.5, 1.5, 2.5), 78),
            'booths': ((-3.5, 1.7, -1.5), (-9, 1.4, 4), 84),
            'door': ((1.5, 1.7, 4.5), (-0.5, 1.6, 10), 84),
            'right': ((2.5, 1.9, -1.2), (9, 1.8, -5.2), 80),
        },
    }
