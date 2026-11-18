"""
Arena 360: an indoor arena show in the round (see build.py).

A round hall under a steel dome: radial ribs from a compression ring out to the wall, ring purlins
and bracing between them, a great ring of lights round the rim. Fourteen tiers of seats all round
with stairways, vomitories, a cross aisle under an LED ribbon, a concourse wall, a ring of boxes
behind glass. In the middle a round island with a glossy top and a band of LEDs round its edge: the
DJ on a plinth at its centre, the band at its front edge. Over it hangs the rig: a wheel of truss
carrying two circular halos, the lantern at the centre and the speaker hangs; four racetrack halos
hang further out at different heights. Catwalks with follow spots run under the dome.

Angles here run from +z (the crowd's side of the island, a = 0) toward +x.
"""
import math

import bmesh
from mathutils import Matrix, Vector

import kit as K

TAU = math.tau
PI = math.pi
STEP = TAU / 96

FLOOR_R, WALL_R = 34.0, 35.5
STAGE_R, DECK = 7.0, 1.6
PLINTH_R, PLINTH_H = 2.6, 0.9
PIT_R = 10.0
T_R0, T_Y0, T_D, T_H, T_N = 35.5, 2.0, 1.9, 1.45, 14
TOP_R = T_R0 + T_D * T_N
TOP_Y = T_Y0 + T_H * (T_N - 1)
AISLES = [PI / 8 + i * PI / 4 for i in range(8)]
VOMS = [i * PI / 4 for i in range(8)]
VOM_TIER, VOM_HALF = 3, 1.6
CROSS = 6  # the seventh tier is a cross aisle under the ribbon, without seats
BOX_Y, BOX_TOP, SPRING_Y = 24.6, 27.9, 30.0
DOME_R, DOME_RISE, HUB_R, RIB_R = 63.0, 14.0, 6.0, 62.0
RIM_R, RIM_Y = 45.0, 24.0
CAT_R, CAT_Y = 28.0, 28.0
GRID_R, GRID_Y = 11.0, 22.0
HALO_Y, INNER_R, INNER_Y = 15.5, 6.0, 12.5
CORE_Y = 12.9
FOH_Z = 31.2


def P(r, a, y=0.0):
    return (r * math.sin(a), y, r * math.cos(a))


def tr(i):
    return T_R0 + i * T_D


def ty(i):
    return T_Y0 + i * T_H


def dome_y(r):
    return SPRING_Y + DOME_RISE * (1 - (r / DOME_R) ** 2)


def rib_top(r):
    return dome_y(r) - 0.2


def rib_bot(r):
    return rib_top(r) - (1.0 + 1.4 * math.sin(PI * (r - HUB_R) / (RIB_R - HUB_R)))


def spans(gaps):
    """The arcs left of the full circle between gaps given as (centre, half width), sorted."""
    if not gaps:
        return [(0.0, TAU)]
    out = []
    for i, (c, h) in enumerate(gaps):
        nc, nh = gaps[(i + 1) % len(gaps)]
        out.append((c + h, nc - nh + (TAU if i == len(gaps) - 1 else 0)))
    return out


def arc(r, y, a0=0.0, a1=TAU, step=STEP):
    n = max(1, math.ceil((a1 - a0) / step - 1e-6))
    return [P(r, a0 + (a1 - a0) * i / n, y) for i in range(n + 1)]


def band(k, material, p0, p1, a0=0.0, a1=TAU, toward='in', uv=None, b=None, step=STEP):
    """A strip of a surface of revolution between two (radius, height) points, facing `toward`."""
    b = b or k.bm(material)
    n = max(1, math.ceil((a1 - a0) / step - 1e-6))
    nr, ny = p1[1] - p0[1], p0[0] - p1[0]  # the normal of (lo i, lo i+1, hi i+1, hi i)
    keep = {'in': nr < 0, 'out': nr > 0, 'up': ny > 0, 'down': ny < 0}[toward]
    layer = b.loops.layers.uv.active
    lo = [b.verts.new(P(p0[0], a0 + (a1 - a0) * i / n, p0[1])) for i in range(n + 1)]
    hi = [b.verts.new(P(p1[0], a0 + (a1 - a0) * i / n, p1[1])) for i in range(n + 1)]
    for i in range(n):
        quad = [(lo[i], i / n, 0), (lo[i + 1], (i + 1) / n, 0), (hi[i + 1], (i + 1) / n, 1), (hi[i], i / n, 1)]
        if not keep:
            quad.reverse()
        f = b.faces.new([q[0] for q in quad])
        f.smooth = True
        if uv:
            for loop, q in zip(f.loops, quad):
                loop[layer].uv = (uv(q[1]), q[2])
    if b.faces:
        f.normal_update()
        want = {'in': -1, 'out': 1}.get(toward)
        c = f.calc_center_median()
        assert (f.normal.y > 0) == (toward == 'up') if want is None else (f.normal.x * c.x + f.normal.z * c.z) * want > 0, 'band faces the wrong way'


def rail(k, material, r, y, a0=0.0, a1=TAU, radius=0.025, sides=4):
    pts = arc(r, y, a0, a1)
    full = a1 - a0 >= TAU - 1e-6
    k.tube(material, pts[:-1] if full else pts, radius, sides, closed=full)


def disc(k, material, r, y, segments=96):
    bmesh.ops.create_circle(k.bm(material), cap_ends=True, cap_tris=False, segments=segments, radius=r,
                            matrix=Matrix.Translation((0, y, 0)) @ Matrix.Rotation(-PI / 2, 4, 'X'))


def pbox(k, material, size, r, a, y, bevel=0.0, turn=0.0, pitch=0.0):
    """A box at radius r, angle a: its size is (along the circle, up, along the radius)."""
    k.box(material, size, P(r, a, y), a + turn, pitch, bevel)


def facing(k, material, w, h, r, a, y):
    """A panel on a wall at radius r, facing the centre."""
    k.panel(material, w, h, P(r, a, y), a + PI)


def truss_ring(k, material, r, y, segments, steps):
    length = 2 * r * math.sin(PI / segments)
    size = length / (steps * 1.4) - 1e-3
    for j in range(segments):
        k.truss(material, P(r, j * TAU / segments, y), P(r, (j + 1) * TAU / segments, y), size)
    return size


def hoist(k, low, high):
    """A chain from `low` up to `high` with the motor and its chain bag on it."""
    low, high = Vector(low), Vector(high)
    k.rod('Chrome', low, high, 0.014, 4)
    k.box('Black', (0.24, 0.4, 0.24), low + Vector((0, 0.75, 0)))
    k.box('Hazard', (0.25, 0.05, 0.25), low + Vector((0, 0.78, 0)))
    k.box('Dark', (0.18, 0.28, 0.18), low + Vector((0.2, 0.5, 0)))


def open_box(b, size, at, pitch):
    """A box without its underside (a seat's shell)."""
    m = K.place(at, 0, pitch, scale=size)
    made = bmesh.ops.create_cube(b, size=1.0, matrix=m)
    down = (m.to_3x3() @ Vector((0, -1, 0))).normalized()
    faces = {f for v in made['verts'] for f in v.link_faces}
    bmesh.ops.delete(b, geom=[max(faces, key=lambda f: f.normal.dot(down))], context='FACES_ONLY')


def seat(b):
    open_box(b, (0.46, 0.54, 0.05), (0, 0.66, -0.2), -0.13)
    open_box(b, (0.44, 0.42, 0.07), (0, 0.5, -0.1), -0.2)


# ---------------------------------------------------------------------------- the island
def island(k):
    for r0, r1 in ((0.4, STAGE_R), (STAGE_R, PIT_R), (PIT_R, 16), (16, 22), (22, 28), (28, FLOOR_R), (FLOOR_R, WALL_R)):
        band(k, 'Floor', (r0, 0), (r1, 0), toward='up')
    band(k, 'Hazard', (FLOOR_R, 0.004), (FLOOR_R + 0.14, 0.004), toward='up')

    band(k, 'Black', (STAGE_R, 0), (STAGE_R, DECK), toward='out')
    disc(k, 'Stage', STAGE_R, DECK)
    k.torus('Alu', STAGE_R, 0.035, (0, DECK - 0.01, 0), segments=96, sides=6)
    k.own('LED_edge', 'LED.edge', lambda b: band(k, 'LED.edge', (STAGE_R + 0.03, 0.3), (STAGE_R + 0.03, 1.3), -PI, PI, 'out', uv=lambda t: t, b=b))
    k.data['screens']['edge'] = {'w': round(TAU * (STAGE_R + 0.03), 2), 'h': 1.0}
    for y in (0.27, 1.33):
        k.torus('Alu', STAGE_R + 0.04, 0.022, (0, y, 0), segments=96, sides=4)
    k.torus('Rubber', STAGE_R + 0.03, 0.05, (0, 0.05, 0), segments=96, sides=4)

    for j in range(96):
        k.instance('bulb', P(STAGE_R + 0.07, (j + 0.5) * STEP, DECK - 0.1))
    for j in range(32):
        k.instance('bulb', P(PLINTH_R + 0.06, (j + 0.5) * TAU / 32, DECK + PLINTH_H - 0.12))
    k.proto('bulb', 'Glow.Bulb', lambda b: k.sphere('Glow.Bulb', 0.07, (0, 0, 0), 8, 5, b=b))

    # Two stairways up the island's back, with handrails.
    for a in (PI * 5 / 6, -PI * 5 / 6):
        f = K.frame((0, 0, 0), a)
        for j in range(1, 9):
            pbox(k, 'Black', (1.2, j * 0.2, 0.26), STAGE_R + (8.5 - j) * 0.26, a, j * 0.1)
            pbox(k, 'Alu', (1.2, 0.02, 0.03), STAGE_R + (9 - j) * 0.26 - 0.015, a, j * 0.2 + 0.005)
        for x in (-0.62, 0.62):
            k.rod('Alu', f(x, 1.1, STAGE_R + 2.0), f(x, 2.55, STAGE_R + 0.1), 0.022, 6)
            for z, y0 in ((STAGE_R + 2.0, 0.2), (STAGE_R + 1.05, 0.9), (STAGE_R + 0.1, 1.6)):
                k.rod('Alu', f(x, y0, z), f(x, y0 + 0.92, z), 0.018, 5)

    # The DJ's plinth, lit round its rim, steps at its back, the booth on it.
    top = DECK + PLINTH_H
    band(k, 'Black', (PLINTH_R, DECK), (PLINTH_R, top), toward='out')
    disc(k, 'Stage', PLINTH_R, top, 64)
    k.torus('Glow.Edge', PLINTH_R + 0.012, 0.018, (0, top - 0.03, 0), segments=64, sides=4)
    k.torus('Glow.Edge', PLINTH_R + 0.012, 0.018, (0, DECK + 0.04, 0), segments=64, sides=4)
    k.torus('Alu', PLINTH_R, 0.025, (0, top, 0), segments=64, sides=4)
    for j in range(1, 5):
        pbox(k, 'Black', (1.2, j * 0.225, 0.28), PLINTH_R + (4.5 - j) * 0.28, PI, DECK + j * 0.1125)
        pbox(k, 'Alu', (1.2, 0.02, 0.03), PLINTH_R + (5 - j) * 0.28 - 0.015, PI, DECK + j * 0.225 + 0.005)
    k.dj_booth((0, top, 0.5), 0, 3.4, 'booth')
    k.mark('dj', (0, top, -0.25))

    # Big wedges round the plinth, turned out to the players.
    for a in (0.49, -0.49, PI / 2, -PI / 2, 2.65, -2.65):
        at, yaw = P(3.1, a, DECK), a + PI
        k.prism('Black', [(-0.45, 0), (0.45, 0), (0.45, 0.2), (-0.45, 0.62)], 0.95, at, yaw + PI / 2)
        f = K.frame(at, yaw)
        k.panel('Grille', 0.85, 0.9, f(0, 0.421, -0.005), yaw + PI, -1.134)
        for x in (-0.476, 0.476):
            k.box('Alu', (0.012, 0.05, 0.3), f(x, 0.12, 0.2), yaw)

    # The band at the island's front edge: singer in the middle, guitar and bass either side
    # turned outward, the drums on a low riser to the left, behind them and clear of the DJ.
    marks = {'vox': (0, DECK, 5.2), 'lead': (-3.3, DECK, 4.3), 'bass': (3.3, DECK, 4.3), 'drums': (-4.9, DECK + 0.4, 0.3)}
    for name, at in marks.items():
        k.mark(name, at)
    k.box('Black', (2.6, 0.4, 2.4), (-4.9, DECK + 0.2, 0.3), bevel=0.02)
    k.floor('Carpet', 2.4, 2.2, (-4.9, DECK + 0.405, 0.3))
    k.box('Alu', (2.62, 0.03, 0.03), (-4.9, DECK + 0.39, 1.5))
    k.wedge((-3.95, DECK + 0.4, 0.9), -1.2)
    for side in (-1, 1):
        k.amp((side * 5.0, DECK, 2.2), side * 0.5)
        k.amp((side * 4.2, DECK, 2.95), side * 0.3, 1)
        k.wedge((side * 0.62, DECK, 6.05), side * 0.1)
        k.wedge(P(6.15, side * 0.654, DECK), side * 0.654)
        k.mic_stand(P(5.85, side * 0.59, DECK), -0.1)
        # Pedal boards and a guitar on its stand.
        k.box('Dark', (0.7, 0.05, 0.35), P(5.75, side * 0.72, DECK + 0.025), side * 0.72, bevel=0.01)
        for i in range(4):
            k.box('Glow.Red' if i % 2 else 'Glow.Green', (0.02, 0.01, 0.02), P(5.75, side * (0.68 + i * 0.027), DECK + 0.056))
        k.tube('Rubber', [(side * 4.8, DECK + 0.02, 2.4), (side * 4.6, DECK + 0.02, 3.8), (side * 3.9, DECK + 0.02, 4.6), P(5.75, side * 0.72, DECK + 0.02)], 0.014, 5)
        k.tube('Rubber', [(side * 4.7, DECK + 0.02, 2.0), (side * 3.6, DECK + 0.02, 1.9), (side * 2.4, DECK + 0.02, 1.4)], 0.016, 5)
    k.mic_stand((0, DECK, 5.55), -0.15)
    # The monitor desk opposite the drums: a console on two cases, a rack beside it.
    for x in (4.3, 5.2):
        k.box('Black', (0.86, 0.7, 0.7), (x, DECK + 0.35, 0.3), bevel=0.02)
        k.box('Alu', (0.88, 0.03, 0.72), (x, DECK + 0.7, 0.3))
    k.box('Dark', (1.5, 0.16, 0.62), (4.75, DECK + 0.82, 0.3), 0, 0.12, bevel=0.02)
    k.panel('Glow.Screen', 0.5, 0.24, (4.75, DECK + 1.08, 0.08), 0, -0.3)
    for i in range(16):
        k.box('Glow.Green' if i % 4 == 0 else 'Alu', (0.025, 0.02, 0.06), (4.12 + i * 0.084, DECK + 0.93, 0.45))
    k.box('Black', (0.6, 1.1, 0.6), (5.9, DECK + 0.55, -0.5), -0.4, bevel=0.02)
    for i in range(4):
        k.box('Glow.Amber' if i % 2 else 'Glow.Green', (0.03, 0.015, 0.01), (5.9 + 0.305 * math.sin(-0.4) - 0.15 + i * 0.1, DECK + 0.95, -0.5 + 0.305 * math.cos(-0.4)))
    # The loom from the plinth across the deck and down into the cable ramp.
    k.tube('Rubber', [(0.9, DECK + 0.03, 2.7), (1.3, DECK + 0.03, 4.4), (0.5, DECK + 0.03, 6.3), (0.25, DECK + 0.03, 6.95), (0.25, DECK - 0.1, 7.12), (0.25, 0.12, 7.14), (0.2, 0.05, 7.7)], 0.04, 6)
    k.tube('Rubber', [(0, DECK + 0.02, 5.5), (-0.5, DECK + 0.02, 4.4), (-0.4, DECK + 0.02, 2.75)], 0.012, 5)

    # Round the island's edge: moving heads pointing up and out, lasers, sparks, CO2.
    for i in range(16):
        a = i * TAU / 16
        k.moving_head(P(6.72, a, DECK + 0.3), (0.35 * math.sin(a), 1, 0.35 * math.cos(a)), 'Floor', 18, 0.06)
    for i in range(8):
        a = i * TAU / 8
        pbox(k, 'Dark', (0.35, 0.2, 0.3), 6.72, a + 10 * STEP, DECK + 0.1, 0.02)
        pbox(k, 'Glow.Green', (0.12, 0.05, 0.01), 6.875, a + 10 * STEP, DECK + 0.12)
        k.source('laser.edge', P(6.72, a + 10 * STEP, DECK + 0.25))
        pbox(k, 'Dark', (0.4, 0.15, 0.4), 6.25, a + 6 * STEP, DECK + 0.075, 0.02)
        k.drum('Steel', 0.06, 0.03, P(6.25, a + 6 * STEP, DECK + 0.15), 10)
        k.source('sparks', P(6.25, a + 6 * STEP, DECK))
        k.drum('Dark', 0.12, 0.4, P(6.72, a + 2 * STEP, DECK), 12)
        k.drum('Steel', 0.05, 0.1, P(6.72, a + 2 * STEP, DECK + 0.4), 8)
        k.source('co2', P(6.72, a + 2 * STEP, DECK))


# ---------------------------------------------------------------------------- the floor
def floor(k):
    # The pit: subs and flame jets at the island's foot, the barrier ring.
    for i in (1, 2, 3, 5, 7, 8, 9):
        k.speaker_stack(P(8.05, i * TAU / 10, 0), i * TAU / 10, 1, 0)
    for i in range(10):
        a = (i + 0.5) * TAU / 10
        pbox(k, 'Dark', (0.5, 0.3, 0.5), 8.5, a, 0.15, 0.03)
        k.drum('Steel', 0.08, 0.14, P(8.5, a, 0.3), 10)
        pbox(k, 'Hazard', (0.5, 0.05, 0.01), 8.755, a, 0.2)
        k.source('flames', P(8.5, a, 0.45))
        k.tube('Rubber', [P(8.25, a, 0.02), P(7.6, a + 0.04, 0.02), P(7.12, a + 0.05, 0.02)], 0.015, 5)
    for j in range(32):
        k.barrier(P(PIT_R, j * TAU / 32), P(PIT_R, (j + 1) * TAU / 32))

    # The mixing desk at the floor's edge, fenced, its loom to the island under cable ramps.
    k.foh((0, 0, FOH_Z), PI, roof=False)
    k.barrier((-3.1, 0, FOH_Z - 2.3), (3.1, 0, FOH_Z - 2.3))
    k.barrier((3.1, 0, FOH_Z - 2.3), (3.1, 0, FOH_Z + 1.8))
    k.barrier((-3.1, 0, FOH_Z + 1.8), (-3.1, 0, FOH_Z - 2.3))
    for x in (-1.5, 1.5):
        k.box('Black', (0.9, 0.5, 0.6), (x, 0.7, FOH_Z + 1.1), bevel=0.02)
    z = 7.6
    while z < FOH_Z - 2.5:
        k.box('Rubber', (0.9, 0.07, 0.96), (0.2, 0.035, z + 0.5), bevel=0.015)
        for x in (-0.1, 0.5):
            k.box('Hazard', (0.22, 0.012, 0.9), (x, 0.073, z + 0.5))
        z += 1.0

    # The wall round the floor: pilasters, boards, four gates, cases, extinguishers.
    for j in range(32):
        a = (j + 0.5) * TAU / 32
        pbox(k, 'Concrete', (0.5, 2.0, 0.24), WALL_R - 0.12, a, 1.0, 0.03)
        pbox(k, 'Glow.Amber', (0.16, 0.05, 0.02), WALL_R - 0.25, a, 0.25)
        a = j * TAU / 32
        if j % 8:
            pbox(k, 'Dark', (5.2, 1.0, 0.05), WALL_R - 0.2, a, 1.15)
            for y in (0.63, 1.67):
                pbox(k, 'Alu', (5.3, 0.05, 0.07), WALL_R - 0.2, a, y)
        else:
            facing(k, 'Black', 3.6, 1.72, WALL_R - 0.03, a, 0.86)
            for s in (-1, 1):
                pbox(k, 'Steel', (0.22, 1.95, 0.3), WALL_R - 0.12, a + s * 1.92 / WALL_R, 0.975, 0.02)
                pbox(k, 'Hazard', (0.23, 0.5, 0.31), WALL_R - 0.12, a + s * 1.92 / WALL_R, 0.25)
                k.drum('Glow.Red', 0.08, 0.5, P(WALL_R - 0.4, a + s * 2.5 / WALL_R, 0.15), 10)
            pbox(k, 'Steel', (4.1, 0.2, 0.3), WALL_R - 0.12, a, 1.85)
            pbox(k, 'Glow.Exit', (1.0, 0.16, 0.05), WALL_R - 0.29, a, 1.85)
    for a0, seed in ((PI / 2 + 0.45, 3), (PI - 0.45, 5)):
        k.road_cases(P(34.75, a0), a0 + PI, 5, seed)
        k.road_cases(P(34.75, -a0 + 0.17), -a0 + 0.17 + PI, 5, seed)


# ---------------------------------------------------------------------------- the stands
def vomitory(k, c):
    """A tunnel mouth in the fourth tier: a trench between parapets, the mouth under the fifth."""
    h = VOM_HALF / tr(VOM_TIER)
    y0, r_a, r_b, r_c, top = ty(VOM_TIER - 1), tr(VOM_TIER), tr(VOM_TIER + 1), tr(VOM_TIER + 1) + 3.4, ty(VOM_TIER + 1) - 0.25
    band(k, 'Concrete', (r_a, y0), (r_c, y0), c - h, c + h, 'up')
    band(k, 'Black', (r_c, y0), (r_c, top), c - h, c + h, 'in')
    band(k, 'Black', (r_b, top), (r_c, top), c - h, c + h, 'down')
    band(k, 'Concrete', (r_b, top), (r_b, top + 0.25), c - h, c + h, 'in')
    for s in (-1, 1):
        a = c + s * h
        k.panel('Black', r_c - r_b, top - y0, P((r_b + r_c) / 2, a, (y0 + top) / 2), a - s * PI / 2)
        k.box('Concrete', (0.25, ty(VOM_TIER) + 1.1 - y0, T_D), P(r_a + T_D / 2, a + s * 0.125 / r_a, (y0 + ty(VOM_TIER) + 1.1) / 2), a, bevel=0.03)
        k.rod('Steel', P(r_a + 0.05, a + s * 0.125 / r_a, ty(VOM_TIER) + 1.16), P(r_b, a + s * 0.125 / r_a, ty(VOM_TIER) + 1.16), 0.03, 6)
        k.rod('Steel', P(r_b + 0.05, a, ty(VOM_TIER + 1)), P(r_b + 0.05, a, ty(VOM_TIER + 1) + 1.05), 0.03, 6)
    facing(k, 'Glow.Warm', 1.8, 2.1, r_c - 0.04, c, y0 + 1.05)
    pbox(k, 'Dark', (0.9, 2.1, 0.06), r_c - 0.08, c - 0.45 / r_c, y0 + 1.05)
    pbox(k, 'Glow.Exit', (0.9, 0.3, 0.06), r_b - 0.04, c, top - 0.2)
    pbox(k, 'Dark', (1.0, 0.06, 0.1), r_b, c, top - 0.02)
    pbox(k, 'Glow.Lamp', (0.5, 0.03, 0.2), r_b + 1.4, c, top - 0.02)
    # A glass rail over the mouth, before the seats above it.
    for side in ('in', 'out'):
        band(k, 'Glass', (r_b + 0.05, ty(VOM_TIER + 1) + 0.08), (r_b + 0.05, ty(VOM_TIER + 1) + 1.0), c - h, c + h, side)
    rail(k, 'Steel', r_b + 0.05, ty(VOM_TIER + 1) + 1.05, c - h, c + h, 0.03, 6)
    pbox(k, 'Hazard', (VOM_HALF * 2, 0.012, 0.1), r_a + 0.06, c, y0 + 0.006)


def stands(k):
    vh = VOM_HALF / tr(VOM_TIER)
    cut = [(c, vh) for c in VOMS]
    for i in range(T_N):
        r, y = tr(i), ty(i)
        for a0, a1 in spans(cut if i in (VOM_TIER, VOM_TIER + 1) else []):
            band(k, 'Concrete', (r, ty(i - 1) if i else 0.0), (r, y), a0, a1, 'in')
        for a0, a1 in spans(cut if i == VOM_TIER else []):
            band(k, 'Concrete', (r, y), (r + T_D, y), a0, a1, 'up')
        # Seats against the riser behind, in blocks between the stairways (and the tunnel mouths).
        if i == CROSS:
            continue
        rs = r + T_D - 0.3
        gaps = [(a, 0.82 / rs) for a in AISLES] + ([(c, (VOM_HALF + 0.45) / rs) for c in VOMS] if i in (VOM_TIER - 1, VOM_TIER) else [])
        for a0, a1 in spans(sorted(gaps)):
            n = int((a1 - a0) * rs / 0.55)
            for j in range(n):
                a = a0 + (a1 - a0) * (j + 0.5) / n
                k.instance('seat', P(rs, a, y), (a + PI + PI) % TAU - PI)
            # The beam the row's seats are bolted to.
            rail(k, 'Steel', rs + 0.2, y + 0.36, a0, a1, 0.03, 4)
    k.proto('seat', 'Seats', seat)
    for c in VOMS:
        vomitory(k, c)

    # Stairways: three steps to every tier with a marked nosing, a rail down the middle, lights.
    for a in AISLES:
        f = K.frame((0, 0, 0), a)
        for i in range(T_N - 1):
            r1, y = tr(i + 1), ty(i)
            for j in (1, 2, 3):
                pbox(k, 'Concrete', (1.4, j * T_H / 4, 0.475), r1 - (3.5 - j) * 0.475, a, y + j * T_H / 8)
                pbox(k, 'Hazard', (1.4, 0.015, 0.05), r1 - (4 - j) * 0.475 + 0.025, a, y + j * T_H / 4 + 0.005)
            pbox(k, 'Hazard', (1.4, 0.015, 0.05), r1 + 0.025, a, y + T_H + 0.005)
            if i != CROSS:
                slope = T_H / T_D
                lo, hi = r1 - 1.45, r1 - 0.45
                k.rod('Steel', f(0, y + T_H + (lo - r1) * slope + 0.95, lo), f(0, y + T_H + (hi - r1) * slope + 0.95, hi), 0.025, 5)
                k.rod('Steel', f(0, y, lo), f(0, y + T_H + (lo - r1) * slope + 0.95, lo), 0.02, 4)
                k.rod('Steel', f(0, y + 1.0, hi), f(0, y + T_H + (hi - r1) * slope + 0.95, hi), 0.02, 4)
            for s in (-1, 1):
                k.box('Glow.Amber', (0.03, 0.05, 0.16), f(s * 0.74, y + T_H + 0.1, r1 + 0.12), a)

    # The balustrade before the first tier: an upstand, glass, a steel rail on posts.
    r, y = T_R0, T_Y0
    band(k, 'Concrete', (r, y), (r, y + 0.3), toward='in')
    band(k, 'Concrete', (r, y + 0.3), (r + 0.2, y + 0.3), toward='up')
    band(k, 'Concrete', (r + 0.2, y), (r + 0.2, y + 0.3), toward='out')
    for side in ('in', 'out'):
        band(k, 'Glass', (r + 0.1, y + 0.3), (r + 0.1, y + 1.05), toward=side)
    rail(k, 'Steel', r + 0.1, y + 1.08, radius=0.035, sides=6)
    for j in range(96):
        k.rod('Steel', P(r + 0.1, j * STEP, y + 0.3), P(r + 0.1, j * STEP, y + 1.08), 0.02, 4)
    band(k, 'Dark', (r - 0.02, y - 0.45), (r - 0.02, y - 0.05), toward='in')
    for j in range(192):
        k.instance('bulb', P(r - 0.08, (j + 0.5) * TAU / 192, y - 0.25))

    # The cross aisle's rail and the ribbon board over it.
    r, y = tr(CROSS), ty(CROSS)
    for a0, a1 in spans([(a, 0.8 / r) for a in AISLES]):
        for h in (0.55, 1.05):
            rail(k, 'Steel', r + 0.06, y + h, a0, a1, 0.025, 5)
        n = round((a1 - a0) / STEP * 2)
        for j in range(n + 1):
            k.rod('Steel', P(r + 0.06, a0 + (a1 - a0) * j / n, y), P(r + 0.06, a0 + (a1 - a0) * j / n, y + 1.05), 0.02, 4)
    r = tr(CROSS + 1) - 0.06
    k.own('LED_ribbon', 'LED.ribbon', lambda b: band(k, 'LED.ribbon', (r, y + 0.45), (r, y + 1.4), toward='in', uv=lambda t: 1 - t, b=b))
    k.data['screens']['ribbon'] = {'w': round(TAU * r, 2), 'h': 0.95}
    for y0, y1 in ((y + 0.37, y + 0.45), (y + 1.4, y + 1.46)):
        band(k, 'Dark', (r - 0.02, y0), (r - 0.02, y1), toward='in')


def concourse(k):
    # The wall behind the top tier: pilasters, doors at the head of every stairway, signs, lamps,
    # a cable tray.
    r = TOP_R
    band(k, 'Concrete', (r, TOP_Y), (r, BOX_Y), toward='in')
    band(k, 'Steel', (r - 0.28, BOX_Y - 0.5), (r - 0.28, BOX_Y - 0.35), toward='in')
    band(k, 'Steel', (r - 0.28, BOX_Y - 0.5), (r, BOX_Y - 0.5), toward='down')
    rail(k, 'Rubber', r - 0.14, BOX_Y - 0.44, radius=0.05, sides=5)
    for j in range(64):
        a = j * TAU / 64
        if j % 8 == 4:
            facing(k, 'Dark', 2.4, 2.5, r - 0.04, a, TOP_Y + 1.25)
            for s in (-1, 1):
                pbox(k, 'Steel', (0.14, 2.6, 0.16), r - 0.08, a + s * 1.27 / r, TOP_Y + 1.3)
            pbox(k, 'Steel', (2.7, 0.14, 0.16), r - 0.08, a, TOP_Y + 2.57)
            pbox(k, 'Steel', (0.05, 2.5, 0.06), r - 0.07, a, TOP_Y + 1.25)
            pbox(k, 'Glow.Exit', (1.0, 0.32, 0.06), r - 0.1, a, TOP_Y + 2.95)
        else:
            pbox(k, 'Concrete', (0.55, BOX_Y - TOP_Y - 0.5, 0.3), r - 0.15, a, (TOP_Y + BOX_Y - 0.5) / 2)
        a = (j + 0.5) * TAU / 64
        pbox(k, 'Dark', (0.7, 0.12, 0.3), r - 0.16, a, BOX_Y - 0.62)
        k.panel('Glow.Lamp', 0.56, 0.2, P(r - 0.16, a, BOX_Y - 0.685), a, PI / 2)
        pbox(k, 'Steel', (0.06, 0.06, 0.3), r - 0.15, a + 0.02, BOX_Y - 0.53)
        if j % 2:
            pbox(k, 'Dark', (1.2, 0.5, 0.08), r - 0.05, a, TOP_Y + 2.3)
            pbox(k, 'Glow.Amber', (1.0, 0.3, 0.02), r - 0.1, a, TOP_Y + 2.3)
        else:
            pbox(k, 'Grille', (1.6, 0.6, 0.06), r - 0.04, a, TOP_Y + 2.2)

    # The ring of boxes: a slab's edge, glass between mullions, inside a carpet, a counter and
    # stools at the glass, a lit back wall and ceiling, walls between the boxes.
    g = r - 0.15
    band(k, 'Dark', (r - 0.2, BOX_Y), (r - 0.2, BOX_Y + 0.5), toward='in')
    band(k, 'Dark', (r - 0.2, BOX_Y), (r, BOX_Y), toward='down')
    band(k, 'Alu', (r - 0.21, BOX_Y + 0.2), (r - 0.21, BOX_Y + 0.26), toward='in')
    band(k, 'Glass', (g, BOX_Y + 0.5), (g, BOX_TOP - 0.4), toward='in')
    band(k, 'Dark', (r - 0.2, BOX_TOP - 0.4), (r - 0.2, BOX_TOP), toward='in')
    band(k, 'Carpet', (g, BOX_Y + 0.5), (r + 4.4, BOX_Y + 0.5), toward='up')
    band(k, 'Dark', (g, BOX_TOP - 0.4), (r + 4.4, BOX_TOP - 0.4), toward='down')
    band(k, 'Dark', (r + 4.4, BOX_Y + 0.5), (r + 4.4, BOX_TOP - 0.4), toward='in')
    band(k, 'Dark', (r + 0.2, BOX_Y + 1.5), (r + 0.65, BOX_Y + 1.5), toward='up')
    band(k, 'Dark', (r + 0.2, BOX_Y + 0.5), (r + 0.2, BOX_Y + 1.5), toward='in')
    for j in range(256):
        k.instance('bulb', P(r - 0.27, (j + 0.5) * TAU / 256, BOX_Y + 0.38))
        k.instance('bulb', P(r - 0.47, (j + 0.5) * TAU / 256, SPRING_Y - 0.42))
    for j in range(128):
        pbox(k, 'Alu', (0.09, BOX_TOP - BOX_Y - 0.9, 0.12), g - 0.02, j * TAU / 128, (BOX_Y + BOX_TOP + 0.1) / 2)
    for j in range(64):
        a = j * TAU / 64
        pbox(k, 'Dark', (0.14, BOX_TOP - BOX_Y - 0.9, 4.4), r + 2.2, a, (BOX_Y + BOX_TOP + 0.1) / 2)
        a = (j + 0.5) * TAU / 64
        facing(k, 'Glow.Warm', 3.6, 0.9, r + 4.36, a, BOX_Y + 2.1)
        facing(k, 'Dark', 1.0, 2.0, r + 4.34, a + 2.2 / r, BOX_Y + 1.5)
        k.panel('Glow.Warm', 2.6, 0.22, P(r + 1.6, a, BOX_TOP - 0.41), a, PI / 2)
        for s in (-1.4, 0, 1.4):
            pbox(k, 'Dark', (0.38, 0.85, 0.38), r + 1.0, a + s / r, BOX_Y + 0.93)

    # Above the boxes: a ledge, the wall with its louvres up to the dome's springing, the ring beam.
    band(k, 'Concrete', (r - 0.2, BOX_TOP), (r, BOX_TOP), toward='up')
    band(k, 'Concrete', (r, BOX_TOP), (r, SPRING_Y + 0.6), toward='in')
    band(k, 'Steel', (r - 0.4, SPRING_Y - 0.35), (r - 0.4, SPRING_Y + 0.25), toward='in')
    band(k, 'Steel', (r - 0.4, SPRING_Y - 0.35), (r, SPRING_Y - 0.35), toward='down')
    for j in range(64):
        a = (j + 0.5) * TAU / 64
        if j % 16 == 7 or j % 16 == 8:
            continue
        pbox(k, 'Grille', (3.8, 0.9, 0.06), r - 0.04, a, BOX_TOP + 0.85)
        for y in (0.38, 1.32):
            pbox(k, 'Alu', (3.9, 0.05, 0.08), r - 0.05, a, BOX_TOP + y)
        pbox(k, 'Glow.Lamp', (0.4, 0.04, 0.12), r - 0.12, a, BOX_TOP + 0.03)


# ---------------------------------------------------------------------------- the dome
def dome(k):
    radii = [HUB_R + (RIB_R - HUB_R) * i / 16 for i in range(17)]
    for j in range(32):
        a = j * TAU / 32
        for i in range(16):
            r0, r1 = radii[i], radii[i + 1]
            k.rod('Steel', P(r0, a, rib_top(r0)), P(r1, a, rib_top(r1)), 0.11, 4)
            k.rod('Steel', P(r0, a, rib_bot(r0)), P(r1, a, rib_bot(r1)), 0.09, 4)
            k.rod('Steel', P(r0, a, rib_bot(r0)), P(r0, a, rib_top(r0)), 0.05, 4)
            if i % 2:
                k.rod('Steel', P(r0, a, rib_top(r0)), P(r1, a, rib_bot(r1)), 0.05, 4)
            else:
                k.rod('Steel', P(r0, a, rib_bot(r0)), P(r1, a, rib_top(r1)), 0.05, 4)
        pbox(k, 'Steel', (0.5, 1.3, 0.5), RIB_R - 0.15, a, rib_top(RIB_R) - 0.55)
        # Purlins from rib to rib, crossed bracing in every bay, a rafter between the ribs.
        b = a + TAU / 32
        for i in range(0, 17, 2):
            r0 = radii[i]
            k.rod('Steel', P(r0, a, rib_top(r0)), P(r0, b, rib_top(r0)), 0.08, 4)
            if i < 16:
                r1 = radii[i + 2]
                k.rod('Steel', P(r0, a, rib_top(r0)), P(r1, b, rib_top(r1)), 0.035, 4)
                k.rod('Steel', P(r0, b, rib_top(r0)), P(r1, a, rib_top(r1)), 0.035, 4)
        for i in (0, 8):
            k.rod('Steel', P(radii[i], a, rib_bot(radii[i])), P(radii[i], b, rib_bot(radii[i])), 0.08, 4)
        m, c = a + TAU / 64, math.cos(TAU / 64)
        for i in range(6, 16, 2):
            r0, r1 = radii[i], radii[i + 2]
            k.rod('Steel', P(r0 * c, m, rib_top(r0)), P(r1 * c, m, rib_top(r1)), 0.06, 4)
        # House lamps under the ribs.
        for i in (5, 10):
            r0 = radii[i]
            pbox(k, 'Dark', (0.7, 0.3, 0.7), r0, a, rib_bot(r0) - 0.25)
            k.panel('Glow.Lamp', 0.5, 0.5, P(r0, a, rib_bot(r0) - 0.405), a, PI / 2)
    # The skin over the steel, the compression ring's cap and lamps.
    for i in range(0, 16, 2):
        band(k, 'Roof', (radii[i], rib_top(radii[i]) + 0.3), (radii[i + 2], rib_top(radii[i + 2]) + 0.3), toward='down', step=TAU / 32)
    band(k, 'Roof', (RIB_R, rib_top(RIB_R) + 0.3), (RIB_R + 2, rib_top(RIB_R) + 0.1), toward='down', step=TAU / 32)
    band(k, 'Roof', (0.3, rib_top(HUB_R) + 0.3), (HUB_R, rib_top(HUB_R) + 0.3), toward='down', step=TAU / 32)
    for y in (rib_top(HUB_R), rib_bot(HUB_R)):
        k.torus('Steel', HUB_R, 0.2, (0, y, 0), segments=32, sides=6)
    for j in range(16):
        a = (j + 0.5) * TAU / 16
        pbox(k, 'Dark', (0.6, 0.25, 0.4), HUB_R - 0.1, a, rib_bot(HUB_R) - 0.3)
        k.panel('Glow.Lamp', 0.45, 0.28, P(HUB_R - 0.1, a, rib_bot(HUB_R) - 0.43), a, PI / 2)


def catwalks(k):
    # A ring catwalk hung from the ribs, four arms out to doors in the wall, follow spots on it.
    r0, r1, y = CAT_R - 0.6, CAT_R + 0.6, CAT_Y
    arms = [PI / 4 + i * PI / 2 for i in range(4)]
    band(k, 'Steel', (r0, y), (r1, y), toward='up')
    band(k, 'Steel', (r0, y - 0.12), (r1, y - 0.12), toward='down')
    band(k, 'Steel', (r0, y - 0.12), (r0, y + 0.1), toward='in')
    band(k, 'Steel', (r1, y - 0.12), (r1, y + 0.1), toward='out')
    band(k, 'Hazard', (r0 - 0.01, y - 0.1), (r0 - 0.01, y + 0.08), toward='in')
    for h in (0.55, 1.1):
        rail(k, 'Steel', r0, y + h, radius=0.025, sides=4)
        for a0, a1 in spans([(a, 0.65 / r1) for a in arms]):
            rail(k, 'Steel', r1, y + h, a0, a1, 0.025, 4)
    for j in range(64):
        a = j * TAU / 64
        k.rod('Steel', P(r0, a, y), P(r0, a, y + 1.1), 0.02, 4)
        if j % 16 != 8:
            k.rod('Steel', P(r1, a, y), P(r1, a, y + 1.1), 0.02, 4)
        if j % 2 == 0:
            for r in (r0, r1):
                k.rod('Steel', P(r, a, y + 1.1), P(r, a, rib_bot(r)), 0.022, 4)
    rail(k, 'Rubber', r1 - 0.12, y + 0.06, radius=0.05, sides=5)
    for a in arms:
        f = K.frame((0, 0, 0), a)
        length = TOP_R - r1
        pbox(k, 'Steel', (1.1, 0.12, length), r1 + length / 2, a, y - 0.06)
        for x in (-0.55, 0.55):
            for h in (0.55, 1.1):
                k.rod('Steel', f(x, y + h, r1), f(x, y + h, TOP_R), 0.025, 4)
            z = r1 + 0.1
            while z < TOP_R:
                k.rod('Steel', f(x, y, z), f(x, y + 1.1, z), 0.02, 4)
                z += 2.4
            for z in (36, 44, 52):
                k.rod('Steel', f(x, y + 1.1, z), f(x, rib_bot(z), z), 0.022, 4)
        k.tube('Rubber', [f(0.42, y + 0.05, r1), f(0.42, y + 0.05, TOP_R - 0.3), f(0.42, y + 1.6, TOP_R - 0.15)], 0.05, 5)
        facing(k, 'Dark', 1.1, 2.0, TOP_R - 0.04, a, y + 1.0)
        pbox(k, 'Glow.Exit', (0.6, 0.2, 0.05), TOP_R - 0.08, a, y + 2.2)
    for i in range(8):
        a = PI / 8 + i * PI / 4
        base = Vector(P(CAT_R - 0.25, a, y))
        head = base + Vector((0, 1.45, 0))
        d = (Vector((0, 3, 0)) - head).normalized()
        k.rod('Black', head - d * 0.5, head + d * 0.7, 0.2, 10, cap=True)
        k.rod('Dark', head + d * 0.7, head + d * 0.95, 0.24, 10)
        q = K.UP.rotation_difference(d).to_matrix().to_4x4() @ Matrix.Rotation(-PI / 2, 4, 'X')
        bmesh.ops.create_circle(k.bm('Glow.Lens'), cap_ends=True, cap_tris=False, segments=10, radius=0.2, matrix=Matrix.Translation(head + d * 0.9) @ q)
        k.rod('Black', base, head - Vector((0, 0.2, 0)), 0.04, 6)
        for n in range(3):
            k.rod('Black', base + Vector((0, 0.5, 0)), base + Vector((math.cos(n * TAU / 3) * 0.4, 0, math.sin(n * TAU / 3) * 0.4)), 0.02, 4)
        pbox(k, 'Black', (0.4, 0.06, 0.4), CAT_R + 0.25, a, y + 0.6)
        k.rod('Black', P(CAT_R + 0.25, a, y), P(CAT_R + 0.25, a, y + 0.6), 0.03, 5)
        pbox(k, 'Dark', (0.5, 0.5, 0.35), CAT_R + 0.3, a + 0.03, y + 0.25)


# ---------------------------------------------------------------------------- the rig
def halo_tube(k, n, points):
    k.own('Move_halo_%d' % n, 'Glow.Halo', lambda b: k.tube('Glow.Halo', points, 0.085, 8, closed=True, b=b))


def racetrack(k, n, centre, yaw, pitch, roll):
    """A halo 14 m by 5 m: a loop of black truss, its glowing tube round the outside, six heads."""
    m = K.place(centre, yaw, pitch, roll)
    length, radius, size = 4.5, 2.5, 0.45

    def loop(r):
        pts = [(-length, r), (length, r)]
        pts += [(length + r * math.sin(i / 8 * PI), r * math.cos(i / 8 * PI)) for i in range(1, 8)]
        pts += [(length, -r), (-length, -r)]
        pts += [(-length - r * math.sin(i / 8 * PI), -r * math.cos(i / 8 * PI)) for i in range(1, 8)]
        return [m @ Vector((x, 0, z)) for x, z in pts]

    frame = loop(radius)
    for i, p in enumerate(frame):
        k.truss('Black', p, frame[(i + 1) % len(frame)], size)
    halo_tube(k, n, loop(radius + size / 2 + 0.11))
    for x in (-4.4, -1.5, 1.5, 4.4):
        for z in (-radius, radius):
            k.box('Black', (0.08, 0.1, size + 0.34), m @ Vector((x, 0, z + (0.1 if z > 0 else -0.1))), yaw, pitch)
    r = radius - size / 2 - 0.08
    lamps = [(-length + 2 * length * (i + 0.5) / 14, r) for i in range(14)] + [(length + r * math.sin((i + 0.5) / 10 * PI), r * math.cos((i + 0.5) / 10 * PI)) for i in range(10)]
    for x, z in lamps + [(-x, -z) for x, z in lamps]:
        k.instance('bulb', m @ Vector((x, -size / 2, z)))
    lean = Vector((-centre[0], 0, -centre[2])) * 0.012
    for x in (-3.9, -1.3, 1.3, 3.9):
        for z in (-radius, radius):
            k.moving_head(m @ Vector((x, -size / 2 - 0.33, z)), Vector((0, -1, 0)) + lean, 'Halo', 16, 0.05)
    for x in (-3.8, 3.8):
        for z in (-radius, radius):
            p = m @ Vector((x, size / 2, z))
            hoist(k, p, (p.x, rib_bot(math.hypot(p.x, p.z)), p.z))
    p = m @ Vector((0, size / 2, radius))
    k.tube('Rubber', [p, p + Vector((0, 2.5, 0)), (p.x * 1.05, p.y + 6, p.z * 1.05), (p.x * 1.1, rib_bot(math.hypot(p.x, p.z) * 1.1), p.z * 1.1)], 0.04, 5)


def core(k):
    """The lantern over the DJ: a faceted crystal with eight glowing blades round it, in a black frame."""
    y = CORE_Y
    rings = [(0.0, -3.0, 0), (0.75, -1.7, 0), (1.05, 0.3, 0.5), (0.6, 2.2, 0), (0.0, 3.0, 0)]
    tall = [(1.2, -2.7), (1.55, -2.9), (3.0, 1.9), (2.5, 2.9), (1.35, 1.4)]
    short = [(1.25, -1.5), (1.6, -1.8), (2.5, 0.9), (2.1, 1.9), (1.35, 1.1)]

    def glow(b):
        rows = [[Vector((r * math.sin((i + t) * TAU / 6), y + h, r * math.cos((i + t) * TAU / 6))) for i in range(6)] for r, h, t in rings[1:-1]]
        made = [[b.verts.new(p) for p in row] for row in rows]
        lo, hi = b.verts.new((0, y + rings[0][1], 0)), b.verts.new((0, y + rings[-1][1], 0))
        for i in range(6):
            j = (i + 1) % 6
            b.faces.new((lo, made[0][j], made[0][i]))
            b.faces.new((hi, made[2][i], made[2][j]))
            b.faces.new((made[0][i], made[0][j], made[1][i]))
            b.faces.new((made[0][j], made[1][j], made[1][i]))
            b.faces.new((made[1][i], made[1][j], made[2][j]))
            b.faces.new((made[1][i], made[2][j], made[2][i]))
        bmesh.ops.recalc_face_normals(b, faces=b.faces[:])
        for i in range(8):
            k.prism('Glow.Core', short if i % 2 else tall, 0.12, (0, y + (0.5 if i % 2 else 0), 0), i * TAU / 8 - PI / 2, b=b)

    k.own('Move_core', 'Glow.Core', glow)
    # The frame: a rod down each blade's inner and outer edge, rings top and bottom, a spine.
    for i in range(8):
        a = i * TAU / 8
        outline, lift = (short, 0.5) if i % 2 else (tall, 0.0)
        for (r0, h0), (r1, h1) in ((outline[0], outline[4]), (outline[1], outline[2]), (outline[4], outline[3])):
            k.rod('Black', P(r0, a, y + lift + h0), P(r1, a, y + lift + h1), 0.035, 4)
        k.rod('Black', P(outline[3][0], a, y + lift + outline[3][1]), P(1.3, a, y + 3.4), 0.03, 4)
        k.rod('Black', P(outline[0][0], a, y + lift + outline[0][1]), P(0.5, a, y - 3.1), 0.03, 4)
    k.torus('Black', 1.3, 0.05, (0, y + 3.4, 0), segments=24, sides=6)
    k.torus('Black', 0.5, 0.04, (0, y - 3.1, 0), segments=16, sides=6)
    k.rod('Black', (0, y - 3.25, 0), (0, y - 3.0, 0), 0.05, 6)
    k.rod('Black', (0, y + 3.0, 0), (0, y + 3.6, 0), 0.05, 6)
    k.drum('Dark', 0.22, 0.2, (0, y - 3.4, 0), 12)
    k.source('laser.core', (0, y - 3.4, 0))
    for i in range(4):
        a = PI / 4 + i * PI / 2
        hoist(k, P(1.3, a, y + 3.4), P(1.5, a, GRID_Y - 0.25))


def rig(k):
    # The wheel: a ring of truss on spokes from a hub, hung from the ribs; everything over the
    # island hangs from it.
    size = truss_ring(k, 'Steel', GRID_R, GRID_Y, 48, 2)
    for i in range(8):
        a = i * TAU / 8
        k.truss('Steel', P(1.7, a, GRID_Y), P(GRID_R - size / 2, a, GRID_Y), 0.5)
        hoist(k, P(INNER_R, a, INNER_Y + 0.21), P(INNER_R, a, GRID_Y - 0.25))
        b = a + TAU / 16
        hoist(k, P(GRID_R, b, HALO_Y + 0.26), P(GRID_R, b, GRID_Y - 0.26))
        # An outrigger and a speaker hang at its end.
        pbox(k, 'Steel', (0.22, 0.26, 3.0), GRID_R + 1.25, b, GRID_Y)
        k.line_array(P(13.3, b, 19.6), b, 8, 1.0, GRID_Y - 19.6)
        if i % 2:
            k.tube('Rubber', [P(1.7, a + 0.03, GRID_Y + 0.3), P(GRID_R, a + 0.03, GRID_Y + 0.32), P(17, a + 0.03, GRID_Y + 1.6), P(23, a + 0.01, CAT_Y - 1.2), P(CAT_R - 0.6, a, CAT_Y - 0.1)], 0.06, 6)
        k.tube('Rubber', [P(GRID_R - 0.2, b + 0.06, GRID_Y - 0.3), P(GRID_R - 0.5, b + 0.07, (GRID_Y + HALO_Y) / 2), P(GRID_R - 0.1, b + 0.06, HALO_Y + 0.3)], 0.035, 5)
    for j in range(16):
        a = j * TAU / 16
        hoist(k, P(GRID_R, a, GRID_Y + 0.26), P(GRID_R, a, rib_bot(GRID_R)))
    k.torus('Steel', 1.7, 0.12, (0, GRID_Y, 0), segments=24, sides=6)
    k.drum('Dark', 0.6, 0.5, (0, GRID_Y - 0.25, 0), 16)

    # The two circular halos over the island and the lantern inside them.
    size = truss_ring(k, 'Black', GRID_R, HALO_Y, 48, 2)
    halo_tube(k, 4, arc(GRID_R + size / 2 + 0.11, HALO_Y)[:-1])
    for i in range(32):
        a = (i + 0.5) * TAU / 32
        k.moving_head(P(GRID_R, a, HALO_Y - size / 2 - 0.33), (0.45 * math.sin(a), -1, 0.45 * math.cos(a)), 'Ring', 22, 0.05)
    for j in range(96):
        k.instance('bulb', P(GRID_R - size / 2 - 0.08, j * STEP, HALO_Y - size / 2))
    for i in range(4):
        a = PI / 4 + i * PI / 2
        k.rod('Dark', P(GRID_R - 0.4, a, HALO_Y - 0.5), P(GRID_R - 0.9, a, HALO_Y - 0.85), 0.12, 10, cap=True)
        k.source('confetti', P(GRID_R - 0.9, a, HALO_Y - 0.85))
    size = truss_ring(k, 'Black', INNER_R, INNER_Y, 32, 2)
    halo_tube(k, 5, arc(INNER_R + size / 2 + 0.11, INNER_Y, step=TAU / 64)[:-1])
    for i in range(16):
        a = (i + 0.5) * TAU / 16
        k.moving_head(P(INNER_R, a, INNER_Y - size / 2 - 0.33), (0.15 * math.sin(a), -1, 0.15 * math.cos(a)), 'Ring', 14, 0.05)
    for j in range(48):
        k.instance('bulb', P(INNER_R - size / 2 - 0.08, j * TAU / 48, INNER_Y - size / 2))
    core(k)

    # Four racetrack halos further out, at different heights, tipped toward the island.
    racetrack(k, 0, P(17, 1.36, 13.5), 1.36, -0.2, 0.06)
    racetrack(k, 1, P(17, -1.36, 13.5), -1.36, -0.2, -0.06)
    racetrack(k, 2, P(19.5, 2.44, 18.0), 2.44, -0.26, -0.08)
    racetrack(k, 3, P(19.5, -2.44, 18.0), -2.44, -0.26, 0.08)

    # The great ring of lights under the dome's rim: truss on chains from every rib, lamps on
    # top of it, moving heads under it aimed at the island.
    size = truss_ring(k, 'Steel', RIM_R, RIM_Y, 64, 4)
    for j in range(32):
        a = j * TAU / 32
        hoist(k, P(RIM_R, a, RIM_Y + size / 2), P(RIM_R, a, rib_bot(RIM_R)))
        for s in (-1, 1):
            at = P(RIM_R, a + s * TAU / 128, RIM_Y - size / 2 - 0.33)
            k.moving_head(at, (-at[0], 2.5 - at[1], -at[2]), 'Rim', 60, 0.02)
            b = a + s * TAU / 256
            pbox(k, 'Black', (0.5, 0.34, 0.4), RIM_R - size / 2 - 0.22, b + TAU / 64, RIM_Y, 0.03, pitch=-0.5)
            k.panel('Glow.Lamp', 0.42, 0.26, P(RIM_R - size / 2 - 0.4, b + TAU / 64, RIM_Y - 0.1), b + TAU / 64 + PI, 0.5)
            pbox(k, 'Black', (0.5, 0.34, 0.4), RIM_R - size / 2 - 0.22, b, RIM_Y, 0.03, pitch=-0.5)
            k.panel('Glow.Lamp', 0.42, 0.26, P(RIM_R - size / 2 - 0.4, b, RIM_Y - 0.1), b + PI, 0.5)
    for j in range(192):
        k.instance('bulb', P(RIM_R - size / 2 - 0.1, (j + 0.5) * TAU / 192, RIM_Y - size / 2 - 0.02))
    rail(k, 'Rubber', RIM_R + 0.1, RIM_Y + size / 2 + 0.06, radius=0.05, sides=5)
    for i in range(4):
        a = PI / 4 + i * PI / 2
        k.tube('Rubber', [P(RIM_R + 0.1, a + 0.02, RIM_Y + size / 2 + 0.06), P(RIM_R + 0.3, a + 0.015, RIM_Y + 2), P(RIM_R + 0.2, a + 0.012, CAT_Y - 0.1)], 0.05, 5)


def build(k):
    island(k)
    floor(k)
    stands(k)
    concourse(k)
    rig(k)
    catwalks(k)
    dome(k)

    seats = k.data['instances']['seat']
    assert 5000 < len(seats) < 8000, len(seats)
    counts = {}
    for fx in k.data['fixtures']:
        counts[fx['group']] = counts.get(fx['group'], 0) + 1
    assert counts == {'Floor': 16, 'Ring': 48, 'Halo': 32, 'Rim': 64}, counts
    assert 600 <= len(k.data['instances']['bulb']) <= 1500, len(k.data['instances']['bulb'])
    assert {n: len(v) for n, v in k.data['sources'].items()} == {'laser.edge': 8, 'sparks': 8, 'co2': 8, 'flames': 10, 'confetti': 4, 'laser.core': 1}

    return {
        'ao': 3.0,
        'views': {
            'front': ((0, 4.2, 30), (0, 6, 0), 70),
            'hero': ((24, 18.6, 49), (0, 6, 0), 62),
            'up': ((0, 4.4, 4.5), (0, 40, -3), 95),
            'stage': ((1.5, 3.6, 13.5), (0, 3.0, 0), 62),
            'stands': ((-5, 5.5, 14), (40, 12, -12), 75),
            'rig': ((0, 9, 26), (0, 19, 0), 75),
            'vomitory': ((3, 8.5, 36), (0, 6.2, 43), 80),
            'boxes': ((0, 23.5, 50), (8, 25, 62), 80),
            'pit': ((6, 2.2, 12.5), (0, 1.6, 4), 70),
            'top': ((0, 27, 20), (0, 0, -4), 100),
        },
        'tiers': {'r0': T_R0, 'y0': T_Y0, 'depth': T_D, 'rise': T_H, 'count': T_N, 'crossAisle': CROSS},
        'floor': FLOOR_R,
        'stage': {'r': STAGE_R, 'y': DECK, 'plinth': {'r': PLINTH_R, 'y': DECK + PLINTH_H}},
        'aisles': [round(a, 4) for a in AISLES],
        'vomitories': [round(a, 4) for a in VOMS],
        'crowd': {
            'inner': PIT_R + 0.6, 'outer': FLOOR_R - 0.6,
            'obstacles': [{'kind': 'box', 'x': 0, 'z': FOH_Z - 0.25, 'w': 7.4, 'd': 5.4}],
        },
        'halos': 6,
    }
