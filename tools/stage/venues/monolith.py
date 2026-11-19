"""
Monolith: a brutalist open-air stage on the shore of a lake (see build.py).

Four freestanding concrete portals stand in a row across the stage, each two square piers one
behind the other under a lintel slab of the same width and length: one clean block, nothing
reaching past it. One long block of LEDs runs through all four between the piers, lit on every
face and ending flush with the outer portals. The deck lies before the portals: the band plays at
its front, the DJ on a riser under the block of light. Behind the stage a tiered guest terrace
stands on stilts over the water, reached by gangways from both sides; pontoons with fireworks and a
row of buoys float beyond it, and a dark treeline closes
the far shore. The crowd stands on the field in front, with the mixing desk, two delay towers,
stalls at the far sides and flags along the back.
"""
import math

import bmesh
from mathutils import Matrix, Vector

import kit as K

# Colours for the preview renders only (the kit knows the gear's and the older venues' roles).
K.PREVIEW.update({
    'Joint': (0.05, 0.05, 0.05), 'Deck': (0.035, 0.035, 0.04), 'Ground': (0.2, 0.24, 0.14), 'Water': (0.05, 0.14, 0.22),
    'Trees': (0.03, 0.07, 0.04), 'Canvas': (0.75, 0.72, 0.65),
})

PORTALS = (-30, -10, 10, 30)
PIER, PIER_TOP = 3.0, 17.0
PZ = -17.0                                  # the middle of a portal, front to back
GAP = 2.4                                   # clear between a portal's two piers
PIER_Z = (PZ + GAP / 2 + PIER / 2, PZ - GAP / 2 - PIER / 2)   # front pier, back pier
LINTEL_W, LINTEL_Z0, LINTEL_Z1 = PIER, PIER_Z[0] + PIER / 2, PIER_Z[1] - PIER / 2   # flush with the piers
LINTEL_Y, LINTEL_BACK, LINTEL_FRONT = PIER_TOP + 0.02, 19.0, 19.0
DECK_FRONT, DECK_BACK, DECK_HALF, DECK = -10.0, -23.0, 35.0, 2.4
BAND_Y, BAND_H, BAND_LEN, BAND_Z = 11.0, 4.0, (PORTALS[-1] + PIER / 2) * 2, PZ
BAND_D = GAP - 0.1                          # the block fills the gap between the piers
DJ_Z, DJ_RISE = -16.0, 1.0
WATER = -0.4
T_X, T_Z0, T_DEPTH, T_STEPS, T_Y0, T_RISE = 30.0, -26.0, 2.4, 5, 3.0, 0.8
SHORE, LAND = -18.0, 60.0                   # the quay's line, half the promontory's width
BAY = 20.0                                  # the bays either side reach this far forward
PROM, PROM_BACK = 40.0, -23.6               # the block of quay the stage stands on
GANG_X = 46.0


def lintel_top(z):
    return LINTEL_BACK + (LINTEL_FRONT - LINTEL_BACK) * (z - LINTEL_Z1) / (LINTEL_Z0 - LINTEL_Z1)


def hexa(k, material, x0, x1, z0, z1, y0, ya, yb=None, bevel=0.0):
    """A block from x0..x1 and z0..z1 standing on y0, its top at `ya` over z0 and `yb` over z1."""
    yb = ya if yb is None else yb
    b = k.bm(material)
    v = [b.verts.new(p) for p in ((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (x0, ya, z0), (x1, ya, z0), (x1, yb, z1), (x0, yb, z1))]
    faces = [b.faces.new([v[i] for i in q]) for q in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0))]
    if bevel > 0:
        edges = list({e for f in faces for e in f.edges})
        bmesh.ops.bevel(b, geom=edges, offset=bevel, segments=2, profile=0.5, affect='EDGES', clamp_overlap=True)


def dot(k, material, at, normal, radius=0.04, sides=8):
    """A flat disc on a surface (a tie hole, a bolt's washer), facing along `normal`."""
    d = Vector(normal).normalized()
    m = Matrix.Translation(Vector(at) + d * 0.004) @ K.UP.rotation_difference(d).to_matrix().to_4x4() @ Matrix.Rotation(-math.pi / 2, 4, 'X')
    bmesh.ops.create_circle(k.bm(material), cap_ends=True, cap_tris=False, segments=sides, radius=radius, matrix=m)


def plane(k, material, xs, zs, y, uvbox, b=None):
    """A floor of quads at the lines `xs` and `zs`, facing up, its uvs 0..1 across `uvbox` (x0, x1, z0, z1)."""
    b = b or k.bm(material)
    uv = b.loops.layers.uv.verify()
    u0, u1, v0, v1 = uvbox
    grid = [[b.verts.new((x, y, z)) for z in zs] for x in xs]
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            f = b.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
            for loop in f.loops:
                loop[uv].uv = ((loop.vert.co.x - u0) / (u1 - u0), (loop.vert.co.z - v0) / (v1 - v0))


def steps(a, c, step):
    n = max(1, round((c - a) / step))
    return [a + (c - a) * i / n for i in range(n + 1)]


def facing(b, points, toward):
    """A face through `points`, turned to look at `toward`."""
    f = b.faces.new([b.verts.new(p) for p in points])
    f.normal_update()
    if f.normal.dot(Vector(toward) - f.calc_center_median()) < 0:
        f.normal_flip()
    return f


def bolt(k, at, radius=0.035, height=0.045):
    k.drum('Steel', radius, height, at, 6)


def along(a, c):
    """The frame of a run from a to c (local x along it) and its length."""
    a, c = Vector(a), Vector(c)
    yaw = math.atan2(c.x - a.x, c.z - a.z) - math.pi / 2
    mid = (a + c) / 2
    return K.frame((mid.x, a.y, mid.z), yaw), yaw, (c - a).length


def glass_rail(k, a, c, h=1.1):
    """A glass balustrade from a to c (level): steel posts, panes between them, a handrail."""
    p, yaw, length = along(a, c)
    n = max(1, round(length / 2.0))
    seg = length / n
    for i in range(n + 1):
        k.box('Steel', (0.05, h, 0.07), p(-length / 2 + i * seg, h / 2, 0), yaw)
        k.box('Steel', (0.14, 0.012, 0.14), p(-length / 2 + i * seg, 0.006, 0), yaw)
    for i in range(n):
        x = -length / 2 + (i + 0.5) * seg
        k.box('Glass', (seg - 0.12, h - 0.22, 0.014), p(x, h / 2 + 0.03, 0), yaw)
        for dx in (-seg / 2 + 0.1, seg / 2 - 0.1):
            k.box('Steel', (0.06, 0.06, 0.04), p(x + dx, 0.16, 0), yaw)
    k.box('Alu', (length + 0.06, 0.035, 0.07), p(0, h + 0.017, 0), yaw)


def steel_rail(k, a, c, h=1.05, every=2.0):
    """A plain rail from a to c, which may climb: posts, a top rail and a knee rail."""
    a, c = Vector(a), Vector(c)
    n = max(1, round((c - a).length / every))
    for i in range(n + 1):
        q = a.lerp(c, i / n)
        k.rod('Steel', q, q + Vector((0, h, 0)), 0.022, 6)
    for y in (h, h * 0.5):
        k.rod('Steel', a + Vector((0, y, 0)), c + Vector((0, y, 0)), 0.022 if y == h else 0.014, 6)


def bulbs(k, a, c, every):
    """A row of small lamps from a to c, the game's to light (see the 'bulb' proto)."""
    a, c = Vector(a), Vector(c)
    n = max(1, round((c - a).length / every))
    for i in range(n + 1):
        k.instance('bulb', a.lerp(c, i / n))


def portal(k, px):
    inner = -1 if px > 0 else 1                                # toward the middle of the stage
    for pz in PIER_Z:
        x0, x1, z0, z1 = px - PIER / 2, px + PIER / 2, pz - PIER / 2, pz + PIER / 2
        # The pier, poured in lifts 2.5 m high: every lift a block with chamfered edges, the joint
        # between two lifts a shadow gap down to a dark core.
        hexa(k, 'Joint', x0 + 0.03, x1 - 0.03, z0 + 0.03, z1 - 0.03, 1.0, LINTEL_Y)
        lifts = [2.0, 4.9, 7.4, 9.9, 12.4, 14.9, PIER_TOP]
        for n in range(len(lifts) - 1):
            y0, y1 = lifts[n] + 0.015, lifts[n + 1] - 0.015
            hexa(k, 'Concrete', x0, x1, z0, z1, y0, y1, bevel=0.05)
            ya, yb = max(y0, DECK), y1
            # The formwork's vertical joint (staggered lift by lift) and the tie holes, on all four faces.
            off = (-0.75, 0.75)[n % 2]
            for nx, nz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                fx, fz = px + nx * (PIER / 2 + 0.002), pz + nz * (PIER / 2 + 0.002)
                k.box('Joint', (0.006 if nx else 0.025, yb - ya - 0.1, 0.025 if nx else 0.006), (fx + nz * off, (ya + yb) / 2, fz + nx * off))
                for t in (-1.1, -0.35, 0.35, 1.1):
                    for y in (ya + 0.55, yb - 0.55):
                        dot(k, 'Joint', (fx + nz * t, y, fz + nx * t), (nx, 0, nz), 0.035)
        # The base plate on the deck: a steel collar round the pier's foot, bolted down.
        k.box('Steel', (PIER + 0.5, 0.05, PIER + 0.5), (px, DECK + 0.025, pz), bevel=0.012)
        k.box('Steel', (PIER + 0.12, 0.22, PIER + 0.12), (px, DECK + 0.11, pz), bevel=0.012)
        for i in range(6):
            t = -1.55 + i * 0.62
            for sx, sz in ((t, 1.64), (t, -1.64), (1.64, t), (-1.64, t)):
                bolt(k, (px + sx, DECK + 0.05, pz + sz))
        # A bearing pad between the pier's head and the lintel.
        k.box('Rubber', (PIER - 0.5, 0.05, PIER - 0.5), (px, PIER_TOP + 0.005, pz))

    # The lintel: a slab on both piers, cantilevering to the front and the back, poured in bays
    # 2.5 m long, its top falling to the back.
    x0, x1 = px - LINTEL_W / 2, px + LINTEL_W / 2
    hexa(k, 'Joint', x0 + 0.03, x1 - 0.03, LINTEL_Z1 + 0.03, LINTEL_Z0 - 0.03, LINTEL_Y + 0.03, LINTEL_BACK - 0.03, LINTEL_FRONT - 0.03)
    bays = [LINTEL_Z1, PZ - 3.75, PZ - 1.25, PZ + 1.25, PZ + 3.75, LINTEL_Z0]
    for n in range(len(bays) - 1):
        z0, z1 = bays[n] + (0.015 if n else 0), bays[n + 1] - (0.015 if n < 4 else 0)
        hexa(k, 'Concrete', x0, x1, z0, z1, LINTEL_Y, lintel_top(z0), lintel_top(z1), bevel=0.06)
        for side in (-1, 1):
            for z in (z0 + 0.5, z1 - 0.5):
                for y in (LINTEL_Y + 0.5, LINTEL_Y + 1.3):
                    dot(k, 'Joint', (px + side * (LINTEL_W / 2 + 0.002), y, z), (side, 0, 0), 0.035)
    for z, nz in ((LINTEL_Z0, 1), (LINTEL_Z1, -1)):
        for t in (-1.1, -0.35, 0.35, 1.1):
            for y in (LINTEL_Y + 0.5, LINTEL_Y + 1.3):
                dot(k, 'Joint', (px + t, y, z + nz * 0.002), (0, 0, nz), 0.035)
        k.box('Joint', (0.025, 1.6, 0.006), (px, LINTEL_Y + 0.9, z + nz * 0.002))
    # The drip edge: a groove round the underside, a hand in from the edge.
    for side in (-1, 1):
        k.box('Joint', (0.03, 0.008, LINTEL_Z0 - LINTEL_Z1 - 0.3), (px + side * (LINTEL_W / 2 - 0.15), LINTEL_Y - 0.002, PZ))
    for z in (LINTEL_Z0 - 0.15, LINTEL_Z1 + 0.15):
        k.box('Joint', (LINTEL_W - 0.3, 0.008, 0.03), (px, LINTEL_Y - 0.002, z))

    # Strobes let into the soffit over the gap, flashing down past the block of light; heads let into
    # the lintel's front face rake the crowd. Nothing hangs off the concrete.
    for i in range(8):
        k.instance('strobe', (px - 1.05 + (i % 4) * 0.7, LINTEL_Y, PZ + (0.6 if i < 4 else -0.6)))
    for i in range(6):
        x = px - 1.25 + i * 0.5
        k.moving_head((x, LINTEL_Y + 0.5, LINTEL_Z0), ((x - px) * 0.03, -0.72, 0.69), 'Lintel', 50, 0.03, body=False)
    # A row of small lamps set into the front face, along its lower edge.
    bulbs(k, (x0 + 0.15, LINTEL_Y + 0.14, LINTEL_Z0 + 0.02), (x1 - 0.15, LINTEL_Y + 0.14, LINTEL_Z0 + 0.02), 0.15)
    # On top nothing stands out of the slab: two beams into the sky from heads let into it, and the
    # fireworks leave from its top.
    for z, lean in ((-12.6, 0.12), (-21.4, -0.12)):
        k.moving_head((px, lintel_top(z), z), (px / 30 * 0.12, 1, lean), 'Sky', 150, 0.01, body=False)
    k.source('fireworks', (px, lintel_top(PZ) + 0.1, PZ))

    # The speaker hang: a steel arm off the front pier's inner face, braced back to the concrete.
    fz = PIER_Z[0]
    face = px + inner * PIER / 2
    az, ay = fz + 0.9, 16.2
    k.box('Steel', (0.04, 1.5, 1.0), (face + inner * 0.02, ay - 0.35, az - 0.2), bevel=0.008)
    for dy in (-0.95, -0.35, 0.25):
        for dz in (-0.6, 0.2):
            dot(k, 'Chrome', (face + inner * 0.04, ay + dy, az + dz), (inner, 0, 0), 0.04, 6)
    k.box('Steel', (2.5, 0.36, 0.26), (face + inner * 1.25, ay, az), bevel=0.012)
    k.box('Steel', (0.03, 0.44, 0.34), (face + inner * 2.5, ay, az))
    k.rod('Steel', (face + inner * 0.04, ay - 1.0, az), (face + inner * 2.1, ay - 0.16, az), 0.06, 8)
    hx = face + inner * 1.75
    for dx in (-0.75, 0.75):
        k.torus('Chrome', 0.05, 0.014, (hx + dx, ay - 0.22, az), 0, math.pi / 2, 10, 5)
    k.line_array((hx, ay - 1.0, az), inner * -0.12, 10, 1.5, 0.8)
    # A confetti blower on the arm's tip.
    k.rod('Dark', (face + inner * 2.3, ay + 0.3, az), (face + inner * 2.45, ay + 0.55, az + 0.5), 0.13, 10, cap=True)
    k.box('Dark', (0.3, 0.14, 0.3), (face + inner * 2.3, ay + 0.25, az))
    k.source('confetti', (face + inner * 2.45, ay + 0.55, az + 0.5))

    # Washes on both piers' inner faces, 8 m up on a bar, down onto the deck.
    for pz in PIER_Z:
        k.box('Steel', (0.3, 0.08, 2.7), (face + inner * 0.15, 8.34, pz), bevel=0.008)
        for dz in (-1.2, 1.2):
            k.box('Steel', (0.03, 0.3, 0.2), (face + inner * 0.015, 8.3, pz + dz))
            dot(k, 'Chrome', (face + inner * 0.03, 8.22, pz + dz), (inner, 0, 0), 0.03, 6)
        for dz in (-1.05, -0.35, 0.35, 1.05):
            k.moving_head((face + inner * 0.3, 8.0, pz + dz), (inner * 0.45, -1, 0.12 - dz * 0.1), 'Wash', 14, 0.09)
    # Uplights at the piers' feet, washing the concrete: before the front pier, beside the back one.
    for side in (-1, 1):
        k.moving_head((px + side * 0.8, DECK + 0.355, PIER_Z[0] + PIER / 2 + 0.45), (0, 1, 0), 'Pier', 20, 0.08)
        k.moving_head((px + side * (PIER / 2 + 0.5), DECK + 0.355, PIER_Z[1]), (0, 1, 0), 'Pier', 20, 0.08)
    # The two beams between the piers that carry the band's truss and the catwalk.
    for dx in (-1.0, 1.0):
        k.box('Steel', (0.24, 0.4, GAP), (px + dx, 8.1, PZ), bevel=0.01)
        for z, nz in ((PZ + GAP / 2, -1), (PZ - GAP / 2, 1)):
            k.box('Steel', (0.5, 0.6, 0.03), (px + dx, 8.1, z + nz * 0.015))
            for bx in (-0.19, 0.19):
                for by in (-0.22, 0.22):
                    dot(k, 'Chrome', (px + dx + bx, 8.1 + by, z + nz * 0.03), (0, 0, nz), 0.03, 6)


def band(k):
    """The block of light: one long box of LEDs through the portals, between their piers, flush
    with the outer ones, lit on every face. Heads and lasers are let into its edges."""
    half, d = BAND_LEN / 2, BAND_D
    y0, y1, z0, z1 = BAND_Y - BAND_H / 2, BAND_Y + BAND_H / 2, BAND_Z - d / 2, BAND_Z + d / 2

    # The long faces are the screen; the top, the underside and the ends a screen of their own, which
    # the game runs dimmer so the block reads as a solid.
    def faces(b):
        k.panel('LED.band', BAND_LEN, BAND_H, (0, BAND_Y, z1), b=b)
        k.panel('LED.band', BAND_LEN, BAND_H, (0, BAND_Y, z0), math.pi, b=b)

    def edges(b):
        k.panel('LED.edge', BAND_LEN, d, (0, y1, BAND_Z), 0, -math.pi / 2, b=b)
        k.panel('LED.edge', BAND_LEN, d, (0, y0, BAND_Z), 0, math.pi / 2, b=b)
        for side in (-1, 1):
            k.panel('LED.edge', d, BAND_H, (side * half, BAND_Y, BAND_Z), side * math.pi / 2, b=b)

    k.own('LED_band', 'LED.band', faces)
    k.own('LED_bandedge', 'LED.edge', edges)
    k.data['screens']['band'] = {'w': BAND_LEN, 'h': BAND_H}
    k.data['screens']['bandedge'] = {'w': BAND_LEN, 'h': d}
    # Heads along the top front edge, through the haze toward the crowd; laser heads along the bottom one.
    for x in (-26, -22, -18, -14, -6, -2.5, 2.5, 6, 14, 18, 22, 26):
        k.moving_head((x, y1, z1), (x * 0.02, -0.08, 1), 'Back', 70, 0.02, body=False)
    for x in (-24, -16, -5, 5, 16, 24):
        k.source('laser.band', (x, y0 - 0.05, z1))


def deck(k):
    depth, mid = DECK_FRONT - DECK_BACK, (DECK_FRONT + DECK_BACK) / 2
    k.box('Black', (DECK_HALF * 2, DECK, depth), (0, DECK / 2, mid))
    plane(k, 'Deck', steps(-DECK_HALF + 0.03, DECK_HALF - 0.03, 2.5), steps(DECK_BACK + 0.03, DECK_FRONT - 0.03, 2.2), DECK + 0.005,
          (-DECK_HALF, DECK_HALF, DECK_BACK, DECK_FRONT))
    k.box('Alu', (DECK_HALF * 2, 0.05, 0.06), (0, DECK, DECK_FRONT + 0.01))
    for side in (-1, 1):
        k.box('Alu', (0.06, 0.05, depth), (side * (DECK_HALF + 0.01), DECK, mid))
    # The LED fascia across the deck's front, in a frame.
    k.own('LED_fascia', 'LED.fascia', lambda b: k.panel('LED.fascia', 69.4, 1.3, (0, 1.6, DECK_FRONT + 0.03), b=b))
    k.data['screens']['fascia'] = {'w': 69.4, 'h': 1.3}
    for y in (0.92, 2.28):
        k.box('Dark', (69.6, 0.05, 0.05), (0, y, DECK_FRONT + 0.03))
    # A row of small lamps along the front edge, over the fascia.
    k.box('Dark', (DECK_HALF * 2 - 0.2, 0.05, 0.03), (0, DECK - 0.07, DECK_FRONT + 0.015))
    bulbs(k, (-DECK_HALF + 0.25, DECK - 0.07, DECK_FRONT + 0.09), (DECK_HALF - 0.25, DECK - 0.07, DECK_FRONT + 0.09), 0.25)
    # Subs in a row along the front, on the ground.
    for i in range(25):
        k.speaker_stack((-31.2 + i * 2.6, 0, DECK_FRONT + 0.55), 0, 1, 0)
    # A rail along the back, over the water.
    steel_rail(k, (-DECK_HALF + 0.1, DECK, DECK_BACK + 0.1), (DECK_HALF - 0.1, DECK, DECK_BACK + 0.1), 1.1, 2.5)
    for side in (-1, 1):
        # Stairs at the end, with a rail, and a cable ramp down the deck's side behind them.
        sx = side * (DECK_HALF + 0.85)
        for i in range(12):
            k.box('Black', (1.6, 0.2 * (i + 1), 0.3), (sx, 0.1 * (i + 1), DECK_FRONT - 0.35 - i * 0.3))
            k.box('Alu', (1.6, 0.012, 0.04), (sx, 0.2 * (i + 1) + 0.006, DECK_FRONT - 0.22 - i * 0.3))
        k.box('Black', (1.6, DECK, 1.0), (sx, DECK / 2, DECK_FRONT - 4.3))
        ox = side * (DECK_HALF + 1.62)
        steel_rail(k, (ox, 0.2, DECK_FRONT - 0.35), (ox, DECK, DECK_FRONT - 3.65), 1.0, 1.2)
        steel_rail(k, (ox, DECK, DECK_FRONT - 3.8), (ox, DECK, DECK_FRONT - 4.8), 1.0, 1.0)
        steel_rail(k, (side * (DECK_HALF - 0.1), DECK, DECK_FRONT - 5.0), (side * (DECK_HALF - 0.1), DECK, DECK_BACK + 0.1), 1.1, 2.0)
        rx = side * (DECK_HALF + 0.5)
        k.box('Rubber', (0.9, 0.06, 6.6), (rx, DECK / 2, -19.6), 0, -math.atan2(DECK, 6.2))
        k.box('Hazard', (0.5, 0.07, 6.5), (rx, DECK / 2 + 0.01, -19.6), 0, -math.atan2(DECK, 6.2))
        for dx in (-0.12, 0, 0.12):
            k.tube('Rubber', [(rx + dx, 0.03, -22.9), (rx + dx * 2, 0.03, -24.0), (side * 37.6, 0.03, -18.2)], 0.018, 5)
        # Cable protectors across the wings.
        for z in (-12.0, -20.5):
            k.box('Rubber', (4.0, 0.06, 0.8), (side * 31.8, DECK + 0.03, z), bevel=0.02)
            k.box('Hazard', (3.9, 0.02, 0.45), (side * 31.8, DECK + 0.065, z))
        # Road cases in the wings.
        k.road_cases((side * 33.2 - (2.6 if side > 0 else 0), DECK, -21.6), 0, 3, side + 5)

    # The DJ's riser under the LED band, with steps and a lit edge, the booth on it.
    top = DECK + DJ_RISE
    k.box('Black', (6, DJ_RISE, 4), (0, DECK + DJ_RISE / 2, DJ_Z), bevel=0.015)
    plane(k, 'Deck', steps(-2.97, 2.97, 1.5), steps(DJ_Z - 1.97, DJ_Z + 1.97, 1.3), top + 0.005, (-3, 3, DJ_Z - 2, DJ_Z + 2))
    k.box('Glow.Edge', (6, 0.03, 0.03), (0, top - 0.03, DJ_Z + 2.01))
    for i in range(5):
        k.box('Black', (0.3, DJ_RISE / 5 * (i + 1), 1.2), (3.15 + (4 - i) * 0.3, DECK + DJ_RISE / 10 * (i + 1), DJ_Z - 1.2))
    k.dj_booth((0, top, DJ_Z), 0, 3.6, 'booth')
    k.mark('dj', (0, top, DJ_Z - 0.75))

    # The band at the front: singer in the middle, guitar and bass either side with their amps,
    # drums on a riser behind the guitar, wedges along the front.
    for name, at in {'vox': (0, DECK, -11.2), 'lead': (-4.2, DECK, -11.8), 'bass': (4.2, DECK, -11.8), 'drums': (-5.4, DECK + 0.5, -14.5)}.items():
        k.mark(name, at)
    k.box('Black', (3.2, 0.5, 2.8), (-5.4, DECK + 0.25, -14.4), bevel=0.015)
    k.floor('Rubber', 2.9, 2.5, (-5.4, DECK + 0.506, -14.4))
    k.box('Alu', (3.2, 0.03, 0.03), (-5.4, DECK + 0.5, -12.99))
    for side in (-1, 1):
        k.amp((side * 6.7, DECK, -12.68), side * -0.1)
        k.amp((side * 7.6, DECK, -12.66), side * -0.18, 1)
        k.tube('Rubber', [(side * 4.2, DECK + 0.02, -11.6), (side * 5.6, DECK + 0.02, -11.9), (side * 6.7, DECK + 0.02, -12.4)], 0.012, 5)
        k.mic_stand((side * 4.9, DECK, -11.15), -0.12)
        k.box('Dark', (0.12, 0.05, 0.05), (side * 4.9, DECK + 1.47, -11.3))
        # A pedal board at the player's feet.
        k.box('Dark', (0.7, 0.04, 0.32), (side * 4.2, DECK + 0.02, -11.0), 0, 0.08)
        for i in range(4):
            k.box(('Glow.Red', 'Glow.Green', 'Glow.Amber', 'Alu')[i], (0.09, 0.03, 0.13), (side * 4.2 - 0.24 + i * 0.16, DECK + 0.055, -11.0))
    for x in (-4.2, -0.6, 0.6, 4.2):
        k.wedge((x, DECK, DECK_FRONT - 0.75), 0)
    k.mic_stand((0, DECK, -10.85), -0.15)
    k.box('Dark', (0.05, 0.05, 0.16), (0, DECK + 1.47, -10.95))
    for x in (-4.2, 0, 4.2):
        k.tube('Rubber', [(x, DECK + 0.02, -10.9), (x * 0.9 + 1.2, DECK + 0.02, -12.6), (x * 0.5 + 3.4, DECK + 0.02, -13.6), (3.6, DECK + 0.02, -18.4)], 0.015, 5)
    # A stage box and the set lists taped to the deck.
    k.box('Dark', (0.5, 0.14, 0.34), (3.6, DECK + 0.07, -18.5), bevel=0.01)
    for x in (-4.2, 0.35, 4.2):
        k.box('Canvas', (0.21, 0.004, 0.3), (x + 0.5, DECK + 0.008, -10.95), 0.2)

    # Along the front edge: flame jets, cold sparks, CO2 jets and low fog machines.
    for i in range(10):
        x = -31.5 + i * 7
        k.box('Dark', (0.5, 0.3, 0.4), (x, DECK + 0.15, DECK_FRONT - 0.35), bevel=0.02)
        k.drum('Steel', 0.06, 0.1, (x, DECK + 0.3, DECK_FRONT - 0.35), 10)
        k.source('flames', (x, DECK + 0.4, DECK_FRONT - 0.35))
    for x in (-28, -21, -14, -7, 7, 14, 21, 28):
        k.drum('Dark', 0.16, 0.22, (x, DECK, DECK_FRONT - 0.3), 14, 0.13)
        k.source('sparks', (x, DECK + 0.22, DECK_FRONT - 0.3))
    for x in (-33.25, -26.25, -19.25, -12.25, 12.25, 19.25, 26.25, 33.25):
        k.box('Dark', (0.3, 0.1, 0.3), (x, DECK + 0.05, DECK_FRONT - 0.6))
        k.drum('Dark', 0.07, 0.4, (x, DECK + 0.1, DECK_FRONT - 0.6), 10)
        k.source('co2', (x, DECK + 0.5, DECK_FRONT - 0.6))
    smoke = [(x, DECK_FRONT - 0.9) for x in (-30, -16, 16, 30)] + [(x, PIER_Z[0] + PIER / 2 + 0.5) for x in (-10, 10)]
    for x, z in smoke:
        k.box('Dark', (0.5, 0.24, 0.62), (x, DECK + 0.12, z), bevel=0.02)
        k.box('Black', (0.3, 0.1, 0.06), (x, DECK + 0.1, z + 0.33))
        k.source('smoke', (x, DECK + 0.1, z + 0.38))


def terrace(k):
    """The guests' terrace behind the stage: five rising steps on stilts over the water."""
    back = T_Z0 - T_STEPS * T_DEPTH
    stairs = (-15.0, 0.0, 15.0)
    for i in range(T_STEPS):
        y, z0 = T_Y0 + i * T_RISE, T_Z0 - i * T_DEPTH
        zc = z0 - T_DEPTH / 2
        k.box('Wood', (T_X * 2, 0.1, T_DEPTH), (0, y - 0.05, zc))
        k.box('Steel', (T_X * 2, 0.32, 0.14), (0, y - 0.26, z0 - 0.07))
        k.box('Steel', (T_X * 2, 0.32, 0.14), (0, y - 0.26, z0 - T_DEPTH + 0.07))
        bulbs(k, (-T_X + 0.3, y - 0.26, z0 + 0.09), (T_X - 0.3, y - 0.26, z0 + 0.09), 0.6)
        if i:
            k.box('Dark', (T_X * 2, T_RISE - 0.1, 0.04), (0, y - T_RISE / 2 - 0.05, z0 + 0.02))
        x = -T_X
        while x <= T_X + 1e-3:
            k.box('Steel', (0.14, 0.26, T_DEPTH), (x, y - 0.23, zc))
            k.rod('Steel', (x, -2.4, zc), (x, y - 0.36, zc), 0.13, 10)
            k.box('Steel', (0.5, 0.03, 0.5), (x, y - 0.375, zc))
            x += 6
        # The balustrade along the step's front, open where the stairs come up; glass down both ends.
        cuts = [-T_X] + [c for s in stairs for c in (s - 0.9, s + 0.9)] + [T_X] if i else [-T_X, T_X]
        for n in range(0, len(cuts), 2):
            glass_rail(k, (cuts[n], y, z0 - 0.06), (cuts[n + 1], y, z0 - 0.06))
        for side in (-1, 1):
            if i:
                glass_rail(k, (side * (T_X - 0.04), y, z0 - 0.1), (side * (T_X - 0.04), y, z0 - T_DEPTH))
        if i:
            for s in stairs:
                for n in range(3):
                    k.box('Wood', (1.7, 0.04, 0.3), (s, y - T_RISE + (n + 1) * 0.2 - 0.02, z0 + 0.95 - n * 0.3))
                    k.box('Steel', (1.7, 0.2 * (n + 1), 0.04), (s, y - T_RISE + (n + 1) * 0.1 - 0.02, z0 + 0.82 - n * 0.3))
    top = T_Y0 + (T_STEPS - 1) * T_RISE
    glass_rail(k, (-T_X, top, back + 0.06), (T_X, top, back + 0.06), 1.2)
    # Bracing between the stilts, across the front row and the back row.
    for z, y in ((T_Z0 - T_DEPTH / 2, T_Y0), (back + T_DEPTH / 2, top)):
        x = -T_X
        while x < T_X - 1e-3:
            k.rod('Steel', (x, 0.2, z), (x + 6, y - 0.5, z), 0.035, 6)
            k.rod('Steel', (x + 6, 0.2, z), (x, y - 0.5, z), 0.035, 6)
            x += 12
    # A bar on the top step, lamps on posts along the back.
    k.box('Dark', (6, 1.1, 0.7), (0, top + 0.55, back + 0.8), bevel=0.015)
    k.box('Wood', (6.2, 0.05, 0.9), (0, top + 1.125, back + 0.8), bevel=0.01)
    k.box('Glow.Warm', (5.8, 0.03, 0.02), (0, top + 0.98, back + 1.16))
    for x in range(-27, 28, 9):
        k.rod('Steel', (x, top, back + 0.2), (x, top + 2.6, back + 0.2), 0.03, 6)
        k.box('Dark', (0.3, 0.06, 0.3), (x, top + 2.6, back + 0.3))
        k.box('Glow.Lamp', (0.22, 0.012, 0.22), (x, top + 2.565, back + 0.3))

    # The gangways: from the quay either side a ramp climbs over the water to a bridge, the bridge
    # runs in to the lowest step.
    z1, g0 = T_Z0 - T_DEPTH, -8.0
    for side in (-1, 1):
        gx = side * GANG_X
        run = g0 - T_Z0
        pitch = math.atan2(T_Y0 - 0.05, run)
        mid_y, mid_z = (T_Y0 + 0.05) / 2, (g0 + T_Z0) / 2
        length = math.hypot(run, T_Y0 - 0.05)
        k.box('Wood', (1.6, 0.06, length), (gx, mid_y - 0.03, mid_z), 0, pitch)
        for dx in (-0.78, 0.78):
            k.box('Steel', (0.08, 0.28, length), (gx + dx, mid_y - 0.12, mid_z), 0, pitch)
            steel_rail(k, (gx + dx, 0.05, g0), (gx + dx, T_Y0, T_Z0), 1.05, 2.0)
        n = 0
        while n * 0.5 < length:
            t = n * 0.5 / length
            k.box('Steel', (1.5, 0.02, 0.04), (gx, 0.05 + (T_Y0 - 0.05) * t + 0.01, g0 - run * t), 0, pitch)
            n += 1
        for z in (-12.5, -17.0, -21.5):
            y = 0.05 + (T_Y0 - 0.05) * (g0 - z) / run
            for dx in (-0.7, 0.7):
                k.rod('Steel', (gx + dx, -2.4 if z < SHORE else 0, z), (gx + dx, y - 0.25, z), 0.07, 8)
            k.box('Steel', (1.7, 0.12, 0.12), (gx, y - 0.3, z))
        k.box('Steel', (2.2, 0.04, 0.6), (gx, 0.02, g0 + 0.2))
        # The bridge at the lowest step's level.
        x0, x1 = side * T_X, side * (GANG_X + 0.8)
        bx, bw = (x0 + x1) / 2, abs(x1 - x0)
        k.box('Wood', (bw, 0.1, T_DEPTH), (bx, T_Y0 - 0.05, T_Z0 - T_DEPTH / 2))
        for z in (T_Z0 - 0.07, z1 + 0.07):
            k.box('Steel', (bw, 0.32, 0.14), (bx, T_Y0 - 0.26, z))
        for x in (side * 35.5, side * 41, side * 46.5):
            k.rod('Steel', (x, -2.4, T_Z0 - T_DEPTH / 2), (x, T_Y0 - 0.36, T_Z0 - T_DEPTH / 2), 0.13, 10)
            k.box('Steel', (0.14, 0.26, T_DEPTH), (x, T_Y0 - 0.23, T_Z0 - T_DEPTH / 2))
        glass_rail(k, (x0, T_Y0, z1 + 0.06), (x1, T_Y0, z1 + 0.06))
        glass_rail(k, (x0, T_Y0, T_Z0 - 0.06), (side * (GANG_X - 0.8), T_Y0, T_Z0 - 0.06))
        glass_rail(k, (x1 - side * 0.04, T_Y0, T_Z0 - 0.1), (x1 - side * 0.04, T_Y0, z1 + 0.1))
        for x in (side * 33, side * 39, side * 45):
            k.box('Glow.Lamp', (0.3, 0.03, 0.02), (x, T_Y0 + 0.12, z1 + 0.1))


def shore(k):
    """The ground, the quay round the promontory the stage stands on, the lake and its far shore."""
    box = (-200, 200, SHORE, 282)
    far = [60, 97, 134, 171, 208, 245, 282]
    plane(k, 'Ground', steps(-LAND, LAND, 2), steps(SHORE, 60, 2) + far[1:], 0, box)
    for side in (-1, 1):
        xs = [side * x for x in (60, 95, 130, 165, 200)]
        plane(k, 'Ground', xs if side > 0 else xs[::-1], steps(BAY, 60, 2) + far[1:], 0, box)
    plane(k, 'Ground', steps(-PROM, PROM, 2), [PROM_BACK, -21.6, -19.6, SHORE], 0, box)
    k.own('Move_water', 'Water', lambda b: k.floor('Water', 800, 700, (0, WATER, -50), b=b))

    # The quay: a concrete wall down into the water, a coping along its top, joints every 5 m.
    runs = [((-PROM, PROM_BACK), (PROM, PROM_BACK)), ((PROM, PROM_BACK), (PROM, SHORE)), ((-PROM, SHORE), (-PROM, PROM_BACK)),
            ((PROM, SHORE), (LAND, SHORE)), ((-LAND, SHORE), (-PROM, SHORE)), ((LAND, SHORE), (LAND, BAY)), ((-LAND, BAY), (-LAND, SHORE)),
            ((LAND, BAY), (200, BAY)), ((-200, BAY), (-LAND, BAY))]
    n = 0
    for (ax, az), (cx, cz) in runs:
        p, yaw, length = along((ax, 0, az), (cx, 0, cz))
        k.box('Concrete', (length + 0.5, 2.6, 0.5), p(0, -1.3, 0), yaw)
        k.box('Concrete', (length + 0.9, 0.3, 0.9), p(0, 0.15, 0), yaw, bevel=0.03)
        x = -length / 2 + 5
        while x < length / 2 - 1:
            k.box('Joint', (0.03, 2.2, 0.51), p(x, -1.1, 0), yaw)
            k.box('Joint', (0.03, 0.306, 0.906), p(x, 0.15, 0), yaw)
            x += 5
        if length > 150:
            continue
        # Mooring bollards on the coping, a life ring on a post by every other run.
        x = -length / 2 + 2.5
        while x < length / 2 - 1:
            at = p(x, 0.3, 0)
            k.drum('Steel', 0.2, 0.04, at, 12)
            k.drum('Steel', 0.13, 0.42, at, 12, 0.11)
            k.drum('Steel', 0.2, 0.1, (at[0], at[1] + 0.42, at[2]), 12, 0.17)
            x += 7.5
        if n % 2 == 0 or length > 30:
            for x in ([-length / 4, length / 4] if length > 30 else [0.6]):
                at = p(x, 0.3, 0)
                k.rod('Steel', at, (at[0], at[1] + 1.5, at[2]), 0.035, 6)
                k.box('Dark', (0.75, 0.75, 0.05), (at[0], at[1] + 1.25, at[2]), yaw)
                for face in (-0.07, 0.07):
                    q = p(x, 1.55, face)
                    k.torus('Hazard', 0.26, 0.065, q, yaw, math.pi / 2, 20, 6)
        n += 1
    # Ladders down the quay to the water, either side of the stage.
    for side in (-1, 1):
        for dx in (-0.22, 0.22):
            k.rod('Steel', (side * 44 + dx, -1.6, SHORE - 0.3), (side * 44 + dx, 0.9, SHORE - 0.3), 0.02, 6)
        for i in range(7):
            k.rod('Steel', (side * 44 - 0.22, -1.4 + i * 0.3, SHORE - 0.3), (side * 44 + 0.22, -1.4 + i * 0.3, SHORE - 0.3), 0.012, 5)

    # The far shore, 300 to 400 m away round the lake: hills, and before them two ragged rows of trees.
    b = k.bm('Trees')
    eye = (0, 60, 0)
    segs = 120

    def at(i, radius, y):
        a = -0.4 + (math.pi + 0.8) * i / segs
        return (math.cos(a) * radius, y, SHORE - math.sin(a) * radius)

    def hill(i):
        return 16 + 12 * math.sin(i * 0.11 + 1.0) + 7 * math.sin(i * 0.37) + 4 * math.sin(i * 0.9 + 2)

    for i in range(segs):
        j = i + 1
        facing(b, (at(i, 322, WATER - 0.2), at(j, 322, WATER - 0.2), at(j, 350, hill(j) * 0.55), at(i, 350, hill(i) * 0.55)), eye)
        facing(b, (at(i, 350, hill(i) * 0.55), at(j, 350, hill(j) * 0.55), at(j, 395, hill(j) + 10), at(i, 395, hill(i) + 10)), eye)
    for radius, base, wave, teeth in ((312, 9, 5, 4), (320, 14, 8, 3)):
        for i in range(segs * teeth):
            def crown(n):
                t = n / teeth
                return base + wave * abs(math.sin(n * 1.7 + radius)) + 3 * math.sin(t * 0.5) + (0 if n % 2 else -base * 0.45)
            j = i + 1
            facing(b, (at(i / teeth, radius, WATER - 0.2), at(j / teeth, radius, WATER - 0.2), at(j / teeth, radius + 2, crown(j)), at(i / teeth, radius + 2, crown(i))), eye)

    # Two pontoons with fireworks, and a row of buoys beyond the terrace.
    for side in (-1, 1):
        px, pz = side * 64, -40
        k.box('Dark', (9, 0.9, 6), (px, WATER + 0.15, pz), bevel=0.04)
        k.box('Alu', (8.8, 0.03, 5.8), (px, WATER + 0.615, pz))
        top = WATER + 0.63
        for dx in (-4.52, 4.52):
            for dz in (-2, 0, 2):
                k.rod('Rubber', (px + dx, WATER - 0.1, pz + dz), (px + dx, WATER + 0.5, pz + dz), 0.14, 8, cap=True)
        for dx in (-4, 4):
            for dz in (-2.6, 2.6):
                k.drum('Steel', 0.09, 0.3, (px + dx, top, pz + dz), 8)
        for dx in (-2.6, 2.6):
            k.box('Dark', (1.3, 0.14, 0.7), (px + dx, top + 0.07, pz + 1.2), bevel=0.015)
            for i in range(5):
                k.drum('Dark', 0.07, 0.5, (px + dx - 0.5 + i * 0.25, top + 0.12, pz + 1.2), 10)
            k.source('fireworks', (px + dx, top + 0.7, pz + 1.2))
        k.box('Dark', (1.2, 0.9, 0.8), (px, top + 0.45, pz - 1.8), bevel=0.02)
        # Moored to the quay's corner.
        k.tube('Rubber', [(px - side * 4, top + 0.2, pz + 2.6), (px - side * 2, WATER - 0.3, -30), (side * LAND, 0.4, SHORE)], 0.02, 5)
    for i in range(11):
        x, z = -80 + i * 16, -58 - 3 * math.sin(i * 1.3)
        k.drum('Hazard', 0.5, 0.5, (x, WATER - 0.2, z), 12)
        k.drum('Hazard', 0.5, 0.8, (x, WATER + 0.3, z), 12, 0.12)
        k.rod('Steel', (x, WATER + 1.1, z), (x, WATER + 1.5, z), 0.02, 5)
        k.sphere('Glow.Red', 0.09, (x, WATER + 1.55, z), 8, 5)


def field(k):
    k.barrier((-40, 0, -6), (40, 0, -6))
    # The mixing desk under its roof, fenced in; the cable run from it to the stage under ramps.
    k.foh((0, 0, 50), math.pi, True)
    for a, c in (((-3.3, 0, 47.4), (3.3, 0, 47.4)), ((-3.3, 0, 52.6), (3.3, 0, 52.6)), ((-3.3, 0, 47.4), (-3.3, 0, 52.6)), ((3.3, 0, 47.4), (3.3, 0, 52.6))):
        k.barrier(a, c)
    k.box('Rubber', (0.9, 0.06, 55), (2.2, 0.03, 19.8))
    z = -7.2
    while z < 47:
        k.box('Hazard', (0.5, 0.025, 0.92), (2.2, 0.065, z))
        z += 1.0
    # Two delay towers: a truss mast on a ballasted base, a small hang on an arm toward the back.
    for side in (-1, 1):
        x, z = side * 28, 45
        k.box('Steel', (2.4, 0.1, 2.4), (x, 0.05, z), bevel=0.01)
        for dx, dz in ((-0.8, -0.8), (0.8, -0.8), (-0.8, 0.8), (0.8, 0.8)):
            k.box('Concrete', (0.7, 0.5, 0.7), (x + dx, 0.35, z + dz), bevel=0.03)
            k.rod('Steel', (x + dx * 1.4, 0.1, z + dz * 1.4), (x + dx * 0.3, 2.4, z + dz * 0.3), 0.03, 6)
        k.truss('Steel', (x, 0.1, z), (x, 9.6, z), 0.6)
        k.box('Steel', (0.3, 0.3, 2.0), (x, 9.5, z + 0.6), bevel=0.01)
        k.line_array((x, 8.9, z + 1.3), 0, 4, 0.8, 0.5)
        k.box('Glow.Red', (0.08, 0.08, 0.08), (x, 9.75, z))
    # Stalls far back at the sides, open toward the field, warm inside.
    for side in (-1, 1):
        for z in (58, 68, 78):
            yaw = -side * math.pi / 2
            p = K.frame((side * 54, 0, z), yaw)
            k.box('Dark', (5, 2.6, 2.6), p(0, 1.3, 0), yaw, bevel=0.02)
            k.panel('Glow.Warm', 4.4, 1.3, p(0, 1.78, 1.31), yaw)
            k.box('Wood', (4.8, 0.08, 0.7), p(0, 1.06, 1.55), yaw, bevel=0.01)
            k.box('Wood', (4.8, 1.02, 0.06), p(0, 0.51, 1.62), yaw)
            k.box('Canvas', (5.3, 0.1, 3.0), p(0, 2.68, 0.1), yaw)
            k.box('Canvas', (5.3, 0.04, 1.9), p(0, 2.42, 2.45), yaw, 0.22)
            for dx in (-2.55, 2.55):
                k.rod('Alu', p(dx, 0, 3.3), p(dx, 2.22, 3.3), 0.025, 6)
            for i in range(9):
                k.sphere('Glow.Lamp', 0.05, p(-2.4 + i * 0.6, 2.12 - 0.06 * math.sin(i / 8 * math.pi), 3.3), 6, 4, False)
            k.rod('Black', p(-2.55, 2.2, 3.3), p(2.55, 2.2, 3.3), 0.006, 4)
            k.box('Dark', (1.6, 0.5, 0.06), p(0, 3.0, 1.3), yaw)
            k.panel('Glow.Warm', 1.4, 0.34, p(0, 3.0, 1.335), yaw)
    # Flags along the back of the field.
    for i in range(11):
        x, z = -60 + i * 12, 110
        k.drum('Alu', 0.07, 12, (x, 0, z), 10, 0.04)
        k.drum('Steel', 0.2, 0.06, (x, 0, z), 10)
        k.sphere('Alu', 0.07, (x, 12.05, z), 8, 5)

        def wave(u, v, phase=i):
            return 0.12 * math.sin((u + 0.5) * 6 + phase) * (u + 0.5)

        k.grid('Canvas', 1.3, 4.2, 4, 6, (x + 0.72, 9.7, z), 0, 0, wave)
        k.grid('Canvas', 1.3, 4.2, 4, 6, (x + 0.72, 9.7, z - 0.01), math.pi, 0, lambda u, v, w=wave: -w(-u, v))


def build(k):
    k.proto('strobe', 'Glow.Strobe', lambda b: k.box('Glow.Strobe', (0.42, 0.03, 0.3), (0, -0.015, 0), b=b))
    k.proto('bulb', 'Glow.Bulb', lambda b: k.sphere('Glow.Bulb', 0.08, (0, 0, 0), 8, 5, b=b))
    shore(k)
    deck(k)
    for px in PORTALS:
        portal(k, px)
    band(k)
    terrace(k)
    field(k)

    assert len(k.data['fixtures']) == 24 + 16 + 8 + 12 + 32, len(k.data['fixtures'])
    want = {'flames': 10, 'co2': 8, 'sparks': 8, 'confetti': 4, 'fireworks': 8, 'laser.band': 6, 'smoke': 6}
    assert {n: len(v) for n, v in k.data['sources'].items()} == want, k.data['sources']
    assert len(k.data['instances']['strobe']) == 32
    assert 500 <= len(k.data['instances']['bulb']) <= 1000, len(k.data['instances']['bulb'])

    return {
        'ao': 4.0,
        'deck': {'front': DECK_FRONT, 'half': DECK_HALF, 'y': DECK, 'back': DECK_BACK},
        'band': {'y': BAND_Y, 'h': BAND_H, 'len': BAND_LEN, 'z': BAND_Z},
        'water': WATER,
        'terrace': {'x0': -T_X, 'x1': T_X, 'z0': T_Z0, 'depth': T_DEPTH, 'steps': T_STEPS, 'y0': T_Y0, 'rise': T_RISE},
        'portals': {'x': list(PORTALS), 'pierZ': list(PIER_Z), 'pier': PIER, 'top': PIER_TOP, 'lintel': {'w': LINTEL_W, 'z0': LINTEL_Z1, 'z1': LINTEL_Z0, 'y': LINTEL_Y}},
        'obstacles': [
            {'name': 'foh', 'pos': [0, 0, 50], 'radius': 4.6},
            {'name': 'delay', 'pos': [-28, 0, 45], 'radius': 2.2},
            {'name': 'delay', 'pos': [28, 0, 45], 'radius': 2.2},
            *[{'name': 'stall', 'pos': [s * 53, 0, z], 'radius': 4.5} for s in (-1, 1) for z in (58, 68, 78)],
        ],
        'views': {
            'front': ((0, 5, 60), (0, 10, -18), 72),
            'hero': ((55, 22, 70), (-5, 9, -16), 56),
            'close': ((6, 5.2, 0), (-1, 7.5, -16), 74),
            'under': ((6.2, 4.0, -8.6), (10.4, 17, -14.5), 80),
            'lake': ((84, 10, -56), (0, 6, -24), 58),
            'terrace': ((-20, 8.5, -44), (6, 6, -16), 70),
            'portal': ((17, 9, -2), (10, 11, -15), 60),
            'deck': ((-3, 4.6, -6.5), (-3, 3.2, -14), 70),
            'top': ((0, 150, -10), (0, 0, -12), 60),
        },
    }
