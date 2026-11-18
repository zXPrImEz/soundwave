"""
Basement: a DJ set in a raw concrete cellar (see build.py).

A long, narrow bunker of board-marked concrete: piers down both walls with beams across the
ceiling between them, speaker stacks in every bay and in the corners, rows of bare fluorescent
tubes, a cable tray, ducts and old pipes overhead. The DJ stands in the middle of the room on a
low platform under a square of truss; the band plays on the floor right in front of the booth,
the drums on a riser beside it. A neon waveform hangs on the back wall; the way in is a concrete
stair in the front corner and an old steel door.
"""
import math

import bmesh

import kit as K

HALF, BACK, FRONT, H = 8.0, -11.0, 11.0, 4.6
PIER_Z = (-8, -4, 0, 4, 8)
PIER_FACE = 7.2
BEAM = 0.4
PLAT = 0.3
TRUSS_Y, TRUSS_R = 4.0, 3.0
SIGN_Y = 2.9

# Colours for the preview renders only.
PREVIEW = {'Rust': (0.33, 0.17, 0.1), 'Cloth': (0.035, 0.035, 0.04), 'Concrete': (0.4, 0.39, 0.37), 'Floor': (0.2, 0.2, 0.19)}


def wall(x=None, z=None, face=1):
    """A wall's frame: (u along it, v up, d out into the room) -> a point, and the yaw facing the room."""
    if x is not None:
        return (lambda u, v, d=0.0: (x + face * d, v, u)), face * math.pi / 2
    return (lambda u, v, d=0.0: (u, v, z + face * d)), (0.0 if face > 0 else math.pi)


WALLS = {'back': wall(z=BACK), 'front': wall(z=FRONT, face=-1), 'left': wall(x=-HALF), 'right': wall(x=HALF, face=-1)}
PIERS = {-1: wall(x=-PIER_FACE), 1: wall(x=PIER_FACE, face=-1)}


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


def taped(k, pts, y=0.0, tape='Cloth', every=0.9):
    """A cable flat on the floor through (x, z) points, taped down across it every so often."""
    for a, c in zip(pts, pts[1:]):
        dx, dz = c[0] - a[0], c[1] - a[1]
        length = math.hypot(dx, dz)
        yaw = math.atan2(dx, dz)
        box(k, 'Rubber', (0.035, 0.012, length + 0.03), ((a[0] + c[0]) / 2, y + 0.006, (a[1] + c[1]) / 2), yaw)
        n = int(length / every)
        for i in range(n):
            t = (i + 0.5) / n
            box(k, tape, (0.22, 0.016, 0.055), (a[0] + dx * t, y + 0.008, a[1] + dz * t), yaw)


def formwork(k, w, u0, u1, n, rows=4, top=H):
    """The marks of the shuttering: slabs a little proud of the wall, joints between, tie holes."""
    p, yaw = w
    width, height = (u1 - u0) / n, top / rows
    for i in range(n):
        for j in range(rows):
            u, v = u0 + (i + 0.5) * width, (j + 0.5) * height
            box(k, 'Concrete', (width - 0.03, height - 0.03, 0.03), p(u, v, 0.015), yaw)
            for du in (-width * 0.3, width * 0.3):
                disc(k, 'Dark', 0.02, p(u + du, v, 0.031), yaw, 0, 6)


def cage_lamp(k, w, u, v):
    """An old well-glass lamp in its wire cage, on an arm off the wall, its conduit running up."""
    p, yaw = w
    on(k, w, 'Rust', u, v + 0.12, (0.1, 0.1, 0.03), 0, 0.008)
    k.rod('Rust', p(u, v + 0.12, 0.03), p(u, v + 0.12, 0.16), 0.012, 6)
    k.rod('Steel', p(u, v + 0.17, 0.015), p(u, v + 1.0, 0.015), 0.009, 5)
    c = p(u, v, 0.16)
    k.drum('Rust', 0.048, 0.08, (c[0], c[1] + 0.045, c[2]), 10)
    k.sphere('Glow.Cage', 0.05, c, 8, 6)
    k.drum('Glow.Cage', 0.04, 0.05, (c[0], c[1] - 0.075, c[2]), 8, radius2=0.047)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        tube(k, 'Rust', [(c[0] + math.cos(a) * r, c[1] + y, c[2] + math.sin(a) * r) for r, y in ((0.05, 0.05), (0.07, 0.0), (0.07, -0.05), (0.045, -0.09), (0.0, -0.105))], 0.004, 4)
    torus(k, 'Rust', 0.07, 0.004, (c[0], c[1] - 0.025, c[2]), 0, 0, 10, 4)


def fuse_box(k, w, u, v, width, height):
    """A steel distribution box: door with a seam, hinges and a handle, a warning plate, conduit up."""
    p, yaw = w
    on(k, w, 'Rust', u, v, (width, height, 0.16), 0, 0.012)
    on(k, w, 'Steel', u, v, (width - 0.07, height - 0.07, 0.008), 0.16)
    on(k, w, 'Steel', u + width / 2 - 0.07, v, (0.025, 0.12, 0.03), 0.168, 0.006)
    for dv in (-height * 0.3, height * 0.3):
        k.rod('Steel', p(u - width / 2 + 0.03, v + dv - 0.04, 0.172), p(u - width / 2 + 0.03, v + dv + 0.04, 0.172), 0.01, 6, cap=True)
    on(k, w, 'Hazard', u - 0.04, v + height * 0.22, (0.14, 0.1, 0.004), 0.168)
    for i, du in enumerate((-0.12, 0.0, 0.12)):
        k.rod('Steel', p(u + du, v + height / 2, 0.06), p(u + du, H - BEAM - 0.3, 0.06), 0.012 + 0.003 * (i % 2), 6)
        on(k, w, 'Steel', u + du, v + height / 2 + 0.5, (0.05, 0.02, 0.085))


def combo(k, at, yaw, size=1.0):
    """A small combo amp: cabinet, grille cloth, the control panel along the top with its knobs, a handle."""
    p = K.frame(at, yaw)
    w, h, d = 0.62 * size, 0.5 * size, 0.28 * size
    box(k, 'Black', (w, h, d), p(0, h / 2 + 0.02, 0), yaw, 0, 0.02)
    k.panel('Grille', w - 0.08, h - 0.16, p(0, h / 2 - 0.02, d / 2 + 0.002), yaw)
    box(k, 'Alu', (w - 0.08, 0.06, 0.01), p(0, h - 0.04, d / 2 + 0.002), yaw)
    for i in range(6):
        k.rod('Black', p(-w / 2 + 0.1 + i * (w - 0.2) / 5, h - 0.04, d / 2), p(-w / 2 + 0.1 + i * (w - 0.2) / 5, h - 0.04, d / 2 + 0.025), 0.012, 6, cap=True)
    box(k, 'Glow.Red', (0.014, 0.014, 0.008), p(w / 2 - 0.07, h - 0.04, d / 2 + 0.009), yaw)
    tube(k, 'Black', [p(-0.1, h + 0.02, 0), p(-0.08, h + 0.05, 0), p(0.08, h + 0.05, 0), p(0.1, h + 0.02, 0)], 0.01, 5)
    for x in (-1, 1):
        for z in (-1, 1):
            k.drum('Rubber', 0.02, 0.02, p(x * (w / 2 - 0.05), 0, z * (d / 2 - 0.04)), 6)


def mic(k, at, lean):
    k.mic_stand(at, lean)
    top = (at[0], at[1] + 1.45, at[2] + lean)
    k.rod('Dark', top, (top[0], top[1] + 0.05, top[2] - 0.12 * (1 if lean < 0 else -1)), 0.016, 6, cap=True)
    k.sphere('Alu', 0.026, (top[0], top[1] + 0.06, top[2] - 0.14 * (1 if lean < 0 else -1)), 8, 6)


def build(k):
    for name, colour in PREVIEW.items():
        K.mat(name).diffuse_color = (*colour, 1)
    keep = []

    def clear(x, z, r):
        keep.append([round(x, 2), round(z, 2), r])

    # ------------------------------------------------------------- the sound and the booth
    # (first, while the meshes are small: the kit's own bevels look through all of a mesh)
    k.dj_booth((0, PLAT, 0), 0, 3.4, 'booth')
    k.mark('dj', (0, PLAT, -0.75))
    clear(0, -0.5, 3.2)
    for side in (-1, 1):
        x = side * 7.3
        for z in (-6, -2, 2, 6):
            k.speaker_stack((x, 0, z), math.atan2(-x, -z * 0.35), 3, 2)
            clear(x, z, 0.95)
        # Monitor stacks at the DJ's back corners, turned in to him.
        mx, mz = side * 2.75, -2.65
        k.speaker_stack((mx, 0, mz), math.atan2(-mx, -0.75 - mz), 2, 1)
        clear(mx, mz, 0.9)
    for mx, mz, sx, sz, syaw in ((-6.7, -9.8, -5.3, -10.4, 0.0), (6.7, -9.8, 5.3, -10.4, 0.0), (-6.7, 9.8, -5.3, 10.4, math.pi), (5.75, 9.05, 4.25, 9.35, math.pi)):
        k.speaker_stack((mx, 0, mz), math.atan2(-mx, -mz), 3, 2)
        k.speaker_stack((sx, 0, sz), syaw, 3, 0)
        clear(mx, mz, 1.0)
        clear(sx, sz, 0.85)
    k.road_cases((1.3, 0, 10.45), math.pi, 3, 5)
    for x in (0.6, -0.8, -2.2):
        clear(x, 10.45, 0.9)

    # ------------------------------------------------------------- the room
    k.grid('Floor', HALF * 2, FRONT - BACK, 32, 44, (0, 0, 0), 0, -math.pi / 2)
    k.grid('Concrete', HALF * 2, FRONT - BACK, 16, 22, (0, H, 0), 0, math.pi / 2)
    k.grid('Concrete', HALF * 2, H, 16, 5, (0, H / 2, BACK))
    k.grid('Concrete', HALF * 2, H, 16, 5, (0, H / 2, FRONT), math.pi)
    for side in (-1, 1):
        k.grid('Concrete', FRONT - BACK, H, 22, 5, (side * HALF, H / 2, 0), -side * math.pi / 2)
    formwork(k, WALLS['back'], -HALF, HALF, 10)
    formwork(k, WALLS['front'], -HALF, HALF, 10)
    edges = [BACK] + [z + s * 0.45 for z in PIER_Z for s in (-1, 1)] + [FRONT]
    for name in ('left', 'right'):
        for a, c in zip(edges[::2], edges[1::2]):
            formwork(k, WALLS[name], a, c, 2)
            on(k, WALLS[name], 'Concrete', (a + c) / 2, 0.06, (c - a, 0.12, 0.14))
    for name in ('back', 'front'):
        on(k, WALLS[name], 'Concrete', 0, 0.06, (HALF * 2, 0.12, 0.14))
    # Piers with a corbel under each beam, steel guards on their corners; the beams across.
    for z in PIER_Z:
        box(k, 'Concrete', (HALF * 2, BEAM, 0.7), (0, H - BEAM / 2, z), 0, 0, 0.03)
        for side in (-1, 1):
            box(k, 'Concrete', (0.8, H - BEAM, 0.9), (side * 7.6, (H - BEAM) / 2, z), 0, 0, 0.04)
            box(k, 'Concrete', (1.15, 0.32, 0.9), (side * 7.43, H - BEAM - 0.16, z), 0, 0, 0.03)
            box(k, 'Concrete', (0.92, 0.16, 1.02), (side * 7.6, 0.08, z), 0, 0, 0.02)
            for s in (-1, 1):
                box(k, 'Hazard', (0.07, 1.15, 0.07), (side * (PIER_FACE - 0.012), 0.75, z + s * 0.428))
            clear(side * 7.6, z, 0.75)
    # Old openings walled up with brick under a concrete lintel.
    for name, u in (('left', -2.0), ('right', 2.0)):
        on(k, WALLS[name], 'Brick', u, 1.25, (2.6, 2.5, 0.035), 0.03)
        on(k, WALLS[name], 'Concrete', u, 2.63, (3.0, 0.26, 0.09), 0.02, 0.012)
    # Saw cuts in the slab and the drains.
    for z in (-8, -4, 4, 8):
        k.floor('Dark', HALF * 2, 0.018, (0, 0.003, z + 0.6))
    for x in (-4, 4):
        k.floor('Dark', 0.018, FRONT - BACK, (x, 0.003, 0))
    for x, z in ((-3.2, 6.2), (3.6, -5.6), (0.4, 8.6), (-5.2, -6.4)):
        box(k, 'Rust', (0.36, 0.008, 0.36), (x, 0.004, z))
        k.floor('Grille', 0.29, 0.29, (x, 0.0095, z))
        for i in range(5):
            box(k, 'Rust', (0.29, 0.004, 0.012), (x, 0.011, z - 0.116 + i * 0.058))
    box(k, 'Rust', (0.2, 0.008, 5.0), (-7.0, 0.004, 4.0 - 4.0))
    k.floor('Grille', 0.14, 4.9, (-7.0, 0.0095, 0))

    # ------------------------------------------------------------- the lights of the place
    k.proto('tube', 'Glow.Tube', lambda b: k.rod('Glow.Tube', (-0.7, 0, 0), (0.7, 0, 0), 0.019, 8, cap=True, b=b))
    for x in (-5, 0, 5):
        k.rod('Steel', (x + 0.45, H - 0.02, -9.5), (x + 0.45, H - 0.02, 9.5), 0.011, 5)
        for z in (-9.5, -6, -2, 2, 6, 9.5):
            box(k, 'Steel', (1.56, 0.05, 0.13), (x, H - 0.025, z), 0, 0, 0.008)
            box(k, 'Alu', (1.42, 0.004, 0.1), (x, H - 0.052, z))
            for s in (-1, 1):
                box(k, 'Dark', (0.035, 0.075, 0.06), (x + s * 0.72, H - 0.085, z), 0, 0, 0.006)
            k.instance('tube', (x, H - 0.09, z))
    for z in PIER_Z:
        for side in (-1, 1):
            cage_lamp(k, PIERS[side], z, 2.6)
    cage_lamp(k, WALLS['front'], -4.2, 2.45)
    cage_lamp(k, WALLS['front'], 7.4, 4.0)
    cage_lamp(k, WALLS['back'], -6.2, 3.2)
    cage_lamp(k, WALLS['back'], 6.9, 3.2)

    # ------------------------------------------------------------- overhead: tray, ducts, pipes
    # The cable tray down the left side: a ladder on threaded rod, the cables lying in it.
    tx, ty = -6.3, 4.05
    for s in (-1, 1):
        box(k, 'Steel', (0.012, 0.06, 21.8), (tx + s * 0.18, ty, 0))
    for i in range(55):
        box(k, 'Steel', (0.36, 0.012, 0.03), (tx, ty - 0.022, -10.8 + i * 0.4))
    for i, (dx, r) in enumerate(((-0.13, 0.016), (-0.09, 0.012), (-0.03, 0.02), (0.04, 0.014), (0.09, 0.012), (0.13, 0.017))):
        k.rod('Rubber' if i % 2 else 'Black', (tx + dx, ty - 0.016 + r, -10.9), (tx + dx, ty - 0.016 + r, 10.9), r, 6)
    for z in range(-10, 11, 2):
        box(k, 'Steel', (0.5, 0.025, 0.04), (tx, ty - 0.045, z))
        for s in (-1, 1):
            k.rod('Steel', (tx + s * 0.23, ty - 0.05, z), (tx + s * 0.23, H, z), 0.006, 4)
    # The supply duct down the right side with its flanges, hangers and grilles into every bay,
    # and a round branch along the back wall.
    dx_ = 6.2
    box(k, 'Steel', (0.6, 0.44, 19.9), (dx_, 3.92, -0.95), 0, 0, 0.012)
    z = -10.2
    while z < 9.0:
        box(k, 'Steel', (0.66, 0.5, 0.025), (dx_, 3.92, z))
        z += 1.5
    for z in (-9.6, -6, -2, 2, 6):
        box(k, 'Alu', (0.012, 0.34, 0.98), (dx_ - 0.302, 3.92, z))
        k.panel('Grille', 0.9, 0.26, (dx_ - 0.31, 3.92, z), -math.pi / 2)
        for i in range(4):
            box(k, 'Alu', (0.016, 0.012, 0.9), (dx_ - 0.314, 3.83 + i * 0.06, z), 0, 0)
    for z in range(-10, 9, 2):
        box(k, 'Steel', (0.76, 0.03, 0.04), (dx_, 3.685, z))
        for s in (-1, 1):
            k.rod('Steel', (dx_ + s * 0.35, 3.685, z), (dx_ + s * 0.35, H, z), 0.006, 4)
    box(k, 'Steel', (0.5, 0.36, 0.02), (dx_, 3.92, 9.01))
    k.panel('Grille', 0.44, 0.3, (dx_, 3.92, 9.022))
    k.rod('Steel', (dx_ - 0.3, 3.92, -10.65), (-5.4, 3.92, -10.65), 0.2, 14, cap=True)
    x = -5.0
    while x < 5.9:
        torus(k, 'Steel', 0.203, 0.012, (x, 3.92, -10.65), math.pi / 2, math.pi / 2, 14, 4)
        x += 1.2
    for x in (-4.4, -1.5, 1.5, 4.4):
        box(k, 'Steel', (0.03, 0.5, 0.012), (x, 4.36, -10.65))
        box(k, 'Steel', (0.03, 0.012, 0.44), (x, 4.125, -10.78))
    disc(k, 'Grille', 0.18, (-5.402, 3.92, -10.65), -math.pi / 2, 0, 14)
    # Two old water pipes: up the back wall with a valve and a gauge, round the corner and down
    # the left wall in front of the piers, on brackets.
    for i, (px, py, r) in enumerate(((-4.25, 3.25, 0.05), (-4.02, 3.05, 0.035))):
        dz = 0.1 - i * 0.02
        tube(k, 'Rust', [(px, 0, BACK + dz), (px, py, BACK + dz), (-7.03 + i * 0.0, py, BACK + dz), (-7.03, py, 10.97)], r, 10)
        for y in (0.9, 2.3):
            k.rod('Rust', (px, y - 0.03, BACK + dz), (px, y + 0.03, BACK + dz), r + 0.022, 10, cap=True)
            on(k, WALLS['back'], 'Rust', px, y + 0.3, (0.16, 0.04, dz))
        for z in (-6, -2, 2, 6):
            k.rod('Rust', (-7.03, py, z - 0.03), (-7.03, py, z + 0.03), r + 0.022, 10, cap=True)
        k.drum('Rust', r + 0.03, 0.04, (px, 0, BACK + dz), 10)
    for z in PIER_Z:
        on(k, PIERS[-1], 'Rust', z, 3.15, (0.05, 0.42, 0.12))
        for py in (3.25, 3.05):
            on(k, PIERS[-1], 'Rust', z, py - 0.065, (0.07, 0.02, 0.24))
    # The valve with its wheel, the gauge on a stub.
    vy = 1.45
    box(k, 'Rust', (0.16, 0.2, 0.14), (-4.25, vy, BACK + 0.1), 0, 0, 0.02)
    k.rod('Rust', (-4.25, vy, BACK + 0.1), (-4.25, vy, BACK + 0.3), 0.016, 6)
    torus(k, 'Hazard', 0.1, 0.012, (-4.25, vy, BACK + 0.3), 0, math.pi / 2, 16, 5)
    for i in range(3):
        a = i * math.tau / 3
        k.rod('Hazard', (-4.25, vy, BACK + 0.3), (-4.25 + math.cos(a) * 0.1, vy + math.sin(a) * 0.1, BACK + 0.3), 0.007, 4)
    gy = 1.75
    tube(k, 'Rust', [(-4.02, gy - 0.12, BACK + 0.08), (-4.02, gy - 0.12, BACK + 0.2), (-4.02, gy - 0.06, BACK + 0.2)], 0.012, 6)
    k.rod('Steel', (-4.02, gy, BACK + 0.17), (-4.02, gy, BACK + 0.215), 0.07, 14, cap=True)
    disc(k, 'Alu', 0.06, (-4.02, gy, BACK + 0.217), 0, 0, 14)
    box(k, 'Black', (0.006, 0.05, 0.002), (-4.008, gy + 0.015, BACK + 0.219), 0, 0)
    # Conduit round the room at the top of the walls with its saddles, and drops to switches.
    for name in ('left', 'right'):
        p, yaw = WALLS[name]
        k.rod('Steel', p(BACK + 0.2, 3.72, 0.02), p(FRONT - 0.2, 3.72, 0.02), 0.012, 5)
    p, yaw = WALLS['back']
    k.rod('Steel', p(3.95, 1.25, 0.05), p(7.9, 1.25, 0.05), 0.011, 5)
    for u in (4.4, 4.75):
        on(k, WALLS['back'], 'Steel', u, 1.25, (0.09, 0.09, 0.06), 0.03, 0.008)
        for dv in (-0.016, 0.016):
            disc(k, 'Black', 0.006, p(u, 1.25 + dv, 0.092), 0, 0, 6)

    # ------------------------------------------------------------- fuse boxes
    fuse_box(k, PIERS[1], -4, 1.55, 0.5, 0.7)
    fuse_box(k, PIERS[-1], 4, 1.55, 0.5, 0.7)
    fuse_box(k, WALLS['front'], -2.9, 1.6, 0.6, 0.9)
    fuse_box(k, WALLS['front'], -2.2, 1.75, 0.4, 0.5)

    # ------------------------------------------------------------- what was left down here
    # Old drums by the stair, a stack of crates, chains on ceiling hooks, cable coiled on the piers,
    # the house telephone by the door.
    for bx, bz, bh in ((7.45, 9.3, 0.88), (6.92, 9.52, 0.88), (7.42, 8.78, 0.6)):
        k.drum('Rust', 0.29, bh, (bx, 0, bz), 18)
        for y in (0.02, bh * 0.34, bh * 0.66, bh - 0.02):
            torus(k, 'Rust', 0.292, 0.012, (bx, y, bz), 0, 0, 18, 4)
        k.drum('Steel', 0.03, 0.02, (bx + 0.15, bh, bz), 8)
        clear(bx, bz, 0.4)
    for cx, cy, cz, yaw in ((-7.62, 0, 7.3, 0.0), (-7.62, 0.285, 7.3, 0.12), (-7.62, 0.57, 7.3, -0.08), (-7.2, 0, 7.33, 0.05)):
        box(k, 'Dark', (0.4, 0.28, 0.3), (cx, cy + 0.14, cz), yaw, 0, 0.012)
        box(k, 'Black', (0.14, 0.05, 0.304), (cx, cy + 0.22, cz), yaw)
    for cx, cz, length in ((-2.2, -6.4, 0.9), (3.4, 6.3, 1.3), (-5.6, 5.4, 0.7)):
        box(k, 'Steel', (0.12, 0.012, 0.12), (cx, H - 0.006, cz))
        k.rod('Chrome', (cx, H, cz), (cx, H - length, cz), 0.011, 5)
        torus(k, 'Rust', 0.05, 0.012, (cx, H - length - 0.05, cz), 0.4, math.pi / 2, 12, 5, math.pi * 1.5)
    for side, u in ((1, 4.0), (-1, -8.0), (1, 0.3)):
        p, yaw = PIERS[side]
        k.rod('Steel', p(u, 1.75, 0), p(u, 1.78, 0.12), 0.012, 6, cap=True)
        for j in range(4):
            torus(k, 'Rubber' if j % 2 else 'Black', 0.19 - j * 0.004, 0.014, p(u, 1.58, 0.03 + j * 0.026), yaw, math.pi / 2, 20, 5)
    w = WALLS['front']
    p, yaw = w
    on(k, w, 'Dark', -5.25, 1.45, (0.16, 0.24, 0.07), 0, 0.012)
    on(k, w, 'Black', -5.31, 1.45, (0.05, 0.2, 0.04), 0.07, 0.01)
    tube(k, 'Black', [p(-5.31, 1.35, 0.09), p(-5.33, 1.1, 0.07), p(-5.27, 1.0, 0.07), p(-5.22, 1.33, 0.05)], 0.006, 5)
    k.rod('Steel', p(-5.25, 1.57, 0.03), p(-5.25, 3.72, 0.03), 0.01, 5)
    on(k, w, 'Hazard', -5.25, 1.72, (0.14, 0.08, 0.004), 0)
    k.rod('Steel', p(-7.9, 3.72, 0.03), p(3.2, 3.72, 0.03), 0.012, 5)
    for u in range(-7, 4, 2):
        on(k, w, 'Steel', u, 3.72, (0.05, 0.02, 0.045))
    for name in ('left', 'right'):
        for z in (-9.5, -6, -2, 2, 6, 9.5):
            on(k, WALLS[name], 'Steel', z, 3.72, (0.05, 0.02, 0.045))

    # ------------------------------------------------------------- the steel door (front wall)
    w = WALLS['front']
    p, yaw = w
    du = -4.2
    on(k, w, 'Steel', du, 1.07, (1.2, 2.14, 0.06), 0.03, 0.012)
    on(k, w, 'Rust', du, 1.04, (1.0, 2.04, 0.05), 0.07, 0.012)
    for v in (0.62, 1.42):
        on(k, w, 'Rust', du, v, (0.92, 0.07, 0.02), 0.12, 0.008)
    for u in (du - 0.44, du + 0.44):
        for j in range(8):
            disc(k, 'Steel', 0.012, p(u, 0.2 + j * 0.25, 0.1215), yaw, 0, 6)
    for v in (0.3, 1.04, 1.78):
        k.rod('Steel', p(du + 0.53, v - 0.08, 0.11), p(du + 0.53, v + 0.08, 0.11), 0.02, 8, cap=True)
    on(k, w, 'Steel', du - 0.4, 1.05, (0.06, 0.22, 0.012), 0.12, 0.004)
    tube(k, 'Steel', [p(du - 0.4, 1.09, 0.13), p(du - 0.4, 1.09, 0.18), p(du - 0.26, 1.09, 0.18)], 0.011, 6)
    disc(k, 'Black', 0.012, p(du - 0.4, 0.99, 0.133), yaw, 0, 8)
    on(k, w, 'Steel', du, 0.15, (0.94, 0.24, 0.006), 0.12)
    k.panel('Grille', 0.42, 0.2, p(du, 0.42, 0.124), yaw)
    on(k, w, 'Steel', du, 0.42, (0.48, 0.26, 0.004), 0.12)
    on(k, w, 'Hazard', du, 1.72, (0.32, 0.2, 0.004), 0.12)
    box(k, 'Hazard', (1.2, 0.012, 0.14), p(du, 0.006, 0.07), yaw)
    on(k, w, 'Steel', du - 0.85, 1.25, (0.09, 0.09, 0.06), 0, 0.008)
    k.rod('Steel', p(du - 0.85, 1.3, 0.03), p(du - 0.85, 3.72, 0.03), 0.01, 5)
    box(k, 'Black', (0.02, 0.035, 0.012), p(du - 0.85, 1.25, 0.066), yaw)

    # ------------------------------------------------------------- the stair in the front corner
    rise, tread, steps = 0.175, 0.28, 12
    land_y, land_x = rise * steps, 6.8
    box(k, 'Concrete', (HALF - land_x, land_y, 1.1), ((HALF + land_x) / 2, land_y / 2, 10.45))
    for i in range(steps - 1):
        x = land_x - (steps - 1 - i) * tread + tread / 2
        y = (i + 1) * rise
        box(k, 'Concrete', (tread, y, 1.1), (x, y / 2, 10.45))
        box(k, 'Steel', (0.03, 0.014, 1.1), (x - tread / 2 + 0.015, y + 0.002, 10.45))
        if i in (0, steps - 2):
            box(k, 'Hazard', (0.08, 0.006, 1.08), (x - tread / 2 + 0.08, y + 0.003, 10.45))
    box(k, 'Hazard', (0.08, 0.006, 1.08), (land_x + 0.07, land_y + 0.003, 10.45))
    foot_x = land_x - (steps - 1) * tread
    rz = 9.95
    slope = [(foot_x + tread / 2, rise, rz), (land_x - tread / 2, land_y - rise, rz)]
    for hgt, r in ((0.95, 0.022), (0.5, 0.014)):
        tube(k, 'Rust', [(slope[0][0] - 0.3, slope[0][1] + hgt, rz), (slope[0][0], slope[0][1] + hgt, rz), (slope[1][0] + 0.3, land_y + hgt, rz), (HALF - 0.05, land_y + hgt, rz)], r, 8)
    for i in (0, 3, 6, 9):
        x = foot_x + i * tread + tread / 2
        k.rod('Rust', (x, (i + 1) * rise, rz), (x, (i + 1) * rise + 0.95 + (0.0 if i else 0.0), rz), 0.018, 6)
        box(k, 'Rust', (0.09, 0.008, 0.09), (x, (i + 1) * rise + 0.004, rz))
    for x in (land_x + 0.1, 7.4, HALF - 0.08):
        k.rod('Rust', (x, land_y, rz), (x, land_y + 0.95, rz), 0.018, 6)
    k.rod('Rust', (foot_x - 0.16, 0, rz), (foot_x - 0.16, rise + 0.95, rz), 0.022, 8, cap=True)
    k.sphere('Rust', 0.035, (foot_x - 0.16, rise + 0.97, rz), 8, 6)
    # The wall-side rail on its brackets.
    tube(k, 'Rust', [(foot_x + 0.1, rise + 0.9, 10.9), (land_x - 0.2, land_y + 0.72, 10.9), (land_x + 0.2, land_y + 0.9, 10.9), (7.7, land_y + 0.9, 10.9)], 0.018, 8)
    for t in (0.1, 0.5, 0.9):
        x = foot_x + 0.1 + (land_x - 0.3 - foot_x) * t
        y = rise + 0.9 + (land_y - 0.18 - rise) * t
        k.rod('Rust', (x, y - 0.02, 10.9), (x, y - 0.02, 10.97), 0.008, 5)
    for x in (4.2, 5.4, 6.6, 7.4):
        clear(x, 10.45, 1.0)
    # The door at the head of the stair, the lit sign over it.
    w = WALLS['right']
    p, yaw = w
    on(k, w, 'Steel', 10.42, land_y + 1.02, (1.12, 2.04, 0.06), 0.03, 0.012)
    on(k, w, 'Rust', 10.42, land_y + 0.99, (0.94, 1.94, 0.05), 0.07, 0.012)
    on(k, w, 'Steel', 10.42, land_y + 1.0, (0.8, 0.05, 0.05), 0.14, 0.01)
    for u in (10.07, 10.77):
        on(k, w, 'Steel', u, land_y + 1.0, (0.04, 0.09, 0.07), 0.12)
    for v in (0.3, 1.0, 1.7):
        k.rod('Steel', p(9.92, land_y + v - 0.07, 0.11), p(9.92, land_y + v + 0.07, 0.11), 0.018, 8, cap=True)
    on(k, w, 'Steel', 10.42, land_y + 0.13, (0.88, 0.2, 0.006), 0.12)
    on(k, w, 'Dark', 10.42, land_y + 2.25, (0.62, 0.22, 0.07), 0.03, 0.01)
    on(k, w, 'Glow.Exit', 10.42, land_y + 2.25, (0.54, 0.15, 0.012), 0.1)

    # ------------------------------------------------------------- the booth's platform and the rig
    box(k, 'Black', (5.4, PLAT, 2.6), (0, PLAT / 2 - 0.004, -0.5), 0, 0, 0.012)
    k.floor('Rubber', 3.0, 0.9, (0, PLAT + 0.003, -1.05))
    box(k, 'Alu', (5.4, 0.02, 0.03), (0, PLAT - 0.006, 0.8))
    fold = lambda x, y: 0.018 * math.sin(x * 19) + 0.008 * math.sin(x * 47 + 1.3)
    k.grid('Cloth', 5.44, PLAT - 0.02, 110, 2, (0, PLAT / 2 - 0.012, 0.825), 0, 0, fold)
    for side in (-1, 1):
        k.grid('Cloth', 2.62, PLAT - 0.02, 54, 2, (side * 2.725, PLAT / 2 - 0.012, -0.5), side * math.pi / 2, 0, fold)
    k.grid('Cloth', 5.44, PLAT - 0.02, 110, 2, (0, PLAT / 2 - 0.012, -1.825), math.pi, 0, fold)
    box(k, 'Black', (1.0, 0.15, 0.32), (0, 0.075, -2.0), 0, 0, 0.012)
    box(k, 'Hazard', (1.0, 0.004, 0.05), (0, 0.152, -2.13))

    # The truss square on its chains.
    c = TRUSS_R
    for a, b_ in (((-c, -c), (c, -c)), ((c, -c), (c, c)), ((c, c), (-c, c)), ((-c, c), (-c, -c))):
        k.truss('Alu', (a[0], TRUSS_Y, a[1]), (b_[0], TRUSS_Y, b_[1]), 0.3)
    for x in (-c, c):
        for z in (-c, c):
            box(k, 'Alu', (0.36, 0.36, 0.36), (x, TRUSS_Y, z), 0, 0, 0.02)
            k.rod('Chrome', (x, TRUSS_Y + 0.18, z), (x, H - 0.03, z), 0.012, 5)
            torus(k, 'Chrome', 0.035, 0.008, (x, TRUSS_Y + 0.215, z), 0.6, math.pi / 2, 10, 4)
            box(k, 'Steel', (0.16, 0.02, 0.16), (x, H - 0.01, z))
            torus(k, 'Steel', 0.03, 0.008, (x, H - 0.045, z), 0.6, math.pi / 2, 10, 4)
    k.proto('strobe', 'Glow.Strobe', lambda b: k.box('Glow.Strobe', (0.5, 0.17, 0.02), (0, 0, 0.01), b=b))
    for i in range(4):
        yaw = i * math.pi / 2
        out = (math.sin(yaw), math.cos(yaw))
        along = (math.cos(yaw), -math.sin(yaw))
        # Two heads either side of a strobe on every run, a tube light each side on the outer face.
        for s in (-1, 1):
            hx, hz = out[0] * c + along[0] * s * 1.5, out[1] * c + along[1] * s * 1.5
            k.moving_head((hx, TRUSS_Y - 0.42, hz), (hx * 0.16, -1, hz * 0.16), 'Truss', 5, 0.1)
            box(k, 'Steel', (0.06, 0.08, 0.06), (hx, TRUSS_Y - 0.13, hz))
            tx_, tz_ = out[0] * (c + 0.21) + along[0] * s * 0.82, out[1] * (c + 0.21) + along[1] * s * 0.82
            box(k, 'Dark', (1.5, 0.05, 0.035), (tx_ - out[0] * 0.035, TRUSS_Y, tz_ - out[1] * 0.035), yaw)
            for e in (-1, 1):
                box(k, 'Dark', (0.035, 0.07, 0.07), (tx_ + along[0] * e * 0.72, TRUSS_Y, tz_ + along[1] * e * 0.72), yaw)
            k.instance('tube', (tx_, TRUSS_Y, tz_), yaw)
        sx, sz = out[0] * c, out[1] * c
        box(k, 'Black', (0.6, 0.25, 0.2), (sx, TRUSS_Y - 0.29, sz), yaw, 0, 0.02)
        box(k, 'Steel', (0.05, 0.05, 0.05), (sx, TRUSS_Y - 0.15, sz))
        k.instance('strobe', (sx + out[0] * 0.101, TRUSS_Y - 0.29, sz + out[1] * 0.101), yaw)
    # Cables from the tray to the rig, and the multicore down a pier to the floor.
    tube(k, 'Rubber', [(-6.3, 4.06, 2.4), (-5.2, 3.9, 2.6), (-4.0, 3.92, 2.9), (-3.05, 4.1, 2.95)], 0.018, 6)
    tube(k, 'Black', [(-6.3, 4.06, -2.4), (-5.2, 3.86, -2.6), (-4.0, 3.9, -2.9), (-3.05, 4.1, -2.95)], 0.014, 6)
    tube(k, 'Rubber', [(-6.3, 4.06, 0.56), (-7.1, 4.02, 0.56), (-7.17, 3.7, 0.52), (-7.17, 0.1, 0.52), (-7.05, 0.02, 0.56)], 0.02, 6)
    for y in (0.5, 1.4, 2.3, 3.5):
        on(k, PIERS[-1], 'Steel', 0.52, y, (0.07, 0.02, 0.05))

    # The back wall: two heads up high, laser heads in the corners, the neon waveform.
    for side in (-1, 1):
        k.moving_head((side * 4.6, 3.3, -10.15), (0, -0.12, 1), 'Back', 14, 0.12)
        k.rod('Steel', (side * 4.6, 3.63, BACK), (side * 4.6, 3.63, -10.0), 0.02, 6, cap=True)
        k.rod('Steel', (side * 4.6, 3.2, BACK + 0.03), (side * 4.6, 3.63, -10.5), 0.012, 5)
        lx = side * 7.3
        on(k, WALLS['back'], 'Steel', lx, 4.3, (0.08, 0.06, 0.3))
        box(k, 'Dark', (0.3, 0.2, 0.36), (lx, 4.3, -10.52), 0, 0, 0.02)
        disc(k, 'Glow.Green', 0.03, (lx, 4.3, -10.338), 0, 0, 10)
        k.source('laser', (lx, 4.3, -10.33))

    def envelope(x):
        e = 0.07 + 0.72 * math.exp(-((x + 2.05) / 0.55) ** 2) + 0.5 * math.exp(-((x - 0.1) / 0.75) ** 2) + 0.78 * math.exp(-((x - 2.3) / 0.42) ** 2)
        edge = min(1.0, max(0.0, (3.5 - abs(x)) / 0.5))
        return min(e, 0.8) * edge

    wave = [(-3.5 + 7.0 * i / 420, SIGN_Y + envelope(-3.5 + 7.0 * i / 420) * math.sin((-3.5 + 7.0 * i / 420) * math.tau / 0.33), BACK + 0.17) for i in range(421)]
    k.own('Move_sign', 'Glow.Sign', lambda b: tube(k, 'Glow.Sign', wave, 0.022, 6, b=b))
    box(k, 'Dark', (7.7, 2.0, 0.03), (0, SIGN_Y, BACK + 0.085), 0, 0, 0.01)
    for x in (-3.7, -1.25, 1.25, 3.7):
        for y in (-0.88, 0.88):
            k.rod('Chrome', (x, SIGN_Y + y, BACK + 0.02), (x, SIGN_Y + y, BACK + 0.112), 0.018, 8, cap=True)
    for i in range(0, 421, 14):
        k.rod('Chrome', (wave[i][0], wave[i][1], BACK + 0.1), wave[i], 0.006, 4)
    box(k, 'Dark', (0.3, 0.22, 0.12), (4.2, 1.72, BACK + 0.09), 0, 0, 0.012)
    box(k, 'Glow.Green', (0.012, 0.012, 0.006), (4.3, 1.78, BACK + 0.152))
    tube(k, 'Black', [(4.1, 1.83, BACK + 0.09), (4.05, 2.2, BACK + 0.06), (3.9, 2.35, BACK + 0.06), (3.8, 2.4, BACK + 0.1)], 0.01, 5)
    tube(k, 'Black', [(4.3, 1.61, BACK + 0.09), (4.4, 1.4, BACK + 0.07), (4.4, 1.3, BACK + 0.07)], 0.008, 5)

    # ------------------------------------------------------------- the band, on the floor
    band = {'vox': (0, 0, 2.6), 'lead': (-2.8, 0, 2.0), 'bass': (2.8, 0, 2.0), 'drums': (-4.2, PLAT, -0.6)}
    for name, at in band.items():
        k.mark(name, at)
    # The drum riser with its rug.
    box(k, 'Black', (2.3, PLAT, 2.2), (-4.25, PLAT / 2 - 0.004, -0.5), 0, 0, 0.015)
    k.grid('Cloth', 2.1, 2.0, 6, 6, (-4.25, PLAT + 0.002, -0.5), 0, -math.pi / 2)
    for z in (-1.6, 0.6):
        box(k, 'Alu', (2.3, 0.02, 0.025), (-4.25, PLAT - 0.008, z))
    clear(-4.25, -0.5, 1.65)
    combo(k, (-3.75, 0, 1.25), 0.1)
    combo(k, (3.75, 0, 1.2), -0.1, 1.25)
    clear(-3.75, 1.25, 0.45)
    clear(3.75, 1.2, 0.5)
    for x, z in ((0, 3.45), (-2.8, 2.9), (2.8, 2.9)):
        k.wedge((x, 0, z), 0)
        k.panel('Grille', 0.54, 0.56, (x, 0.284, z - 0.002), 0, -math.pi / 2 - 0.4366)
        clear(x, z, 0.45)
    mic(k, (0, 0, 2.98), -0.15)
    mic(k, (-2.25, 0, 2.45), -0.12)
    mic(k, (2.25, 0, 2.45), -0.12)
    # A pedalboard at the guitarist's feet.
    box(k, 'Dark', (0.56, 0.03, 0.24), (-2.95, 0.015, 2.42), 0.05, 0, 0.008)
    for i, glow in enumerate(('Glow.Red', 'Glow.Green', 'Glow.Amber', 'Glow.Red')):
        px = -3.16 + i * 0.14
        box(k, 'Alu' if i % 2 else 'Steel', (0.1, 0.035, 0.15), (px, 0.047, 2.42), 0.05, 0, 0.006)
        k.drum('Chrome', 0.012, 0.012, (px, 0.064, 2.45), 6)
        box(k, glow, (0.008, 0.004, 0.008), (px, 0.066, 2.38))
    # Cables taped across the floor: from the booth to the wedges and microphones, the amps, the
    # drums, and the feeds from the wall.
    taped(k, [(0.45, 0.83), (0.45, 3.0), (0.25, 3.3)])
    taped(k, [(-0.3, 0.83), (-0.3, 2.85), (-0.05, 2.98)], tape='Hazard', every=1.2)
    taped(k, [(-2.3, 0.83), (-2.3, 1.7), (-2.65, 2.2), (-2.75, 2.75)])
    taped(k, [(-2.6, 0.83), (-3.2, 1.05), (-3.6, 1.12)])
    taped(k, [(2.3, 0.83), (2.3, 1.7), (2.65, 2.2), (2.75, 2.75)])
    taped(k, [(2.6, 0.83), (3.2, 1.0), (3.6, 1.08)])
    taped(k, [(-7.05, 0.56), (-5.7, 0.9), (-3.0, 0.9), (-2.74, 0.7)], tape='Hazard', every=1.3)
    taped(k, [(7.15, -3.55), (3.3, -3.55), (3.3, -1.3), (2.74, -1.3)])
    k.rod('Steel', (7.17, 0.02, -3.55), (7.17, 1.2, -3.55), 0.012, 5)
    # Set lists taped to the floor, cups and bottles by the wedges, a power strip, a DI box.
    for x, z, yaw in ((0.42, 3.05, 0.1), (-2.35, 2.75, -0.2), (3.2, 2.5, 0.25)):
        k.panel('Alu', 0.21, 0.3, (x, 0.004, z), yaw, -math.pi / 2)
        for sx, sz in ((-1, -1), (1, 1)):
            box(k, 'Cloth', (0.06, 0.003, 0.03), (x + sx * 0.09 * math.cos(yaw) + sz * 0.13 * math.sin(yaw), 0.006, z - sx * 0.09 * math.sin(yaw) + sz * 0.13 * math.cos(yaw)), yaw + 0.7)
    for x, z, tall in ((-0.42, 3.4, True), (-0.52, 3.3, False), (2.3, 2.95, True), (-3.3, 2.95, False), (-4.9, 0.85, True), (3.3, 1.45, False), (3.42, 1.38, True)):
        if tall:
            k.drum('Alu', 0.03, 0.2, (x, 0, z), 8)
            k.drum('Black', 0.014, 0.03, (x, 0.2, z), 6)
        else:
            k.drum('Alu', 0.032, 0.11, (x, 0, z), 8, radius2=0.042)
    for x, z, yaw in ((-3.2, 1.3, 0.3), (3.2, 1.25, -0.2)):
        box(k, 'Dark', (0.34, 0.045, 0.06), (x, 0.023, z), yaw, 0, 0.006)
        box(k, 'Glow.Red', (0.025, 0.006, 0.02), (x + 0.13 * math.cos(yaw), 0.047, z - 0.13 * math.sin(yaw)), yaw)
    for x, z in ((2.55, 2.3), (-0.75, 0.95)):
        box(k, 'Hazard', (0.12, 0.05, 0.14), (x, 0.025, z), 0.3, 0, 0.006)
    # A crate of records and a flight case behind the DJ.
    box(k, 'Dark', (0.36, 0.3, 0.34), (1.9, PLAT + 0.15, -1.45), 0.1, 0, 0.012)
    for i in range(12):
        box(k, 'Alu' if i % 4 == 0 else 'Black', (0.31, 0.31, 0.008), (1.9 + 0.012 * (i - 6), PLAT + 0.17, -1.58 + i * 0.022), 0.1, -0.08)
    box(k, 'Black', (0.7, 0.42, 0.42), (-1.85, PLAT + 0.21, -1.45), -0.06, 0, 0.012)
    for y in (0.0, 0.42):
        box(k, 'Alu', (0.72, 0.025, 0.44), (-1.85, PLAT + y, -1.45), -0.06)
    for sx in (-0.2, 0.2):
        box(k, 'Chrome', (0.06, 0.06, 0.012), (-1.85 + sx, PLAT + 0.3, -1.238), -0.06)
    torus(k, 'Black', 0.085, 0.014, (-1.85, PLAT + 0.445, -1.45), 0.4, 0.2, 14, 5, math.pi)
    for s in (-1, 1):
        k.drum('Black', 0.045, 0.035, (-1.85 + s * 0.085 * math.cos(0.4), PLAT + 0.435, -1.45 - s * 0.085 * math.sin(0.4)), 10)

    # Smoke machines before the platform, confetti cannons beside it.
    for side in (-1, 1):
        sx = side * 2.0
        box(k, 'Dark', (0.5, 0.2, 0.3), (sx, 0.13, 1.08), 0, 0, 0.02)
        k.rod('Alu', (sx, 0.13, 1.23), (sx, 0.14, 1.3), 0.035, 8, cap=True)
        tube(k, 'Black', [(sx - 0.18, 0.23, 1.08), (sx - 0.16, 0.29, 1.08), (sx + 0.16, 0.29, 1.08), (sx + 0.18, 0.23, 1.08)], 0.01, 5)
        box(k, 'Glow.Amber', (0.012, 0.012, 0.006), (sx + 0.2, 0.19, 1.232))
        for fx in (-0.2, 0.2):
            box(k, 'Rubber', (0.04, 0.03, 0.26), (sx + fx, 0.015, 1.08))
        k.source('smoke', (sx, 0.14, 1.32))
        clear(sx, 1.08, 0.4)
        cx = side * 3.0
        box(k, 'Dark', (0.34, 0.1, 0.34), (cx, 0.05, 0.95), 0, 0, 0.015)
        k.rod('Dark', (cx, 0.1, 0.95), (cx + side * 0.1, 0.62, 1.05), 0.075, 10, cap=True)
        k.rod('Alu', (cx + side * 0.098, 0.61, 1.048), (cx + side * 0.104, 0.64, 1.054), 0.08, 10)
        k.source('confetti', (cx + side * 0.1, 0.64, 1.05))
        clear(cx, 0.95, 0.35)

    return {
        'ao': 1.5,
        'room': {'half': HALF, 'z0': BACK, 'z1': FRONT, 'h': H},
        'keep_clear': keep,
        'views': {
            'front': ((0.2, 1.95, 5.5), (0, 1.3, -1), 88),
            'hero': ((5.0, 3.5, 9.2), (-1.5, 1.2, -3), 84),
            'booth': ((1.9, 1.9, 2.7), (0, 1.25, -0.3), 62),
            'back': ((0.6, 2.3, -3.6), (0, 1.0, 3), 84),
            'left': ((3.5, 1.8, 3.0), (-8, 2.2, -4), 80),
            'stair': ((-1.5, 1.8, 5.5), (6, 1.6, 10.5), 70),
            'sign': ((0, 2.4, -5.5), (-1.5, 2.6, -11), 80),
        },
    }
