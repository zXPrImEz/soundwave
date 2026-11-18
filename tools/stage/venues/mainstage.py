"""
Mainstage: the headline stage of an open-air festival, built as a fantasy palace (see build.py).

A gatehouse with a great keyhole arch under a ribbed dome and lantern; inside the arch the main
screen, and before it the DJ on a balcony. Either side a wing: an open arcade on slender columns,
a pavilion framing a screen under its own dome, flanks of lit windows, turrets, kiosks and spires
along the skyline, humpbacked colonnade bridges between the turrets, and a tall round tower with a
gallery at each end. Rocks at the foot of the wings, fans of ribs on columns along the front.
Every arch, rib, cornice and window is drawn in glowing tube (Move_outline_0..4: centre, left wing,
right wing, towers, domes). The band plays at the front of the deck, the singer out on the thrust.
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

import kit as K

K.PREVIEW.update({'Stone': (0.6, 0.48, 0.34), 'Marble': (0.82, 0.8, 0.74), 'Dome': (0.16, 0.42, 0.4), 'Gold': (0.85, 0.6, 0.12),
                  'Rock': (0.3, 0.28, 0.26), 'Ground': (0.1, 0.15, 0.07), 'Deck': (0.035, 0.035, 0.04), 'Canvas': (0.75, 0.72, 0.64)})

TAU, PI = math.tau, math.pi
sin, cos = math.sin, math.cos
DECK_Y, DECK_FRONT, DECK_HALF = 3.0, -12.0, 30.0
ZG, ZW, ZB = -23.0, -25.0, -31.0   # the gatehouse's front, the wings' front, the back of the great arch
TOWER_X, TOWER_Z = 50.0, -26.5

ONION = [(0.8, 0), (1.0, 0.13), (1.05, 0.27), (0.98, 0.42), (0.8, 0.57), (0.53, 0.71), (0.29, 0.82), (0.13, 0.91), (0.04, 1.0)]
HIGH = [(0.95, 0), (1.0, 0.1), (1.0, 0.24), (0.94, 0.4), (0.82, 0.56), (0.63, 0.72), (0.4, 0.86), (0.24, 0.95), (0.2, 1.0)]
CONE = [(1.15, 0), (1.0, 0.05), (0.66, 0.33), (0.36, 0.64), (0.14, 0.88), (0.04, 1.0)]
MERLON = [(-0.32, 0), (0.32, 0), (0.32, 0.34), (0.17, 0.34), (0.17, 0.6), (0, 0.82), (-0.17, 0.6), (-0.17, 0.34), (-0.32, 0.34)]


# ---------------------------------------------------------------------- geometry helpers
def new_bm():
    b = bmesh.new()
    b.loops.layers.uv.new()
    return b


def face(b, pts, toward, m=None):
    """A face through pts, turned to face `toward` (both in the frame of `m` when it is given)."""
    toward = Vector(toward)
    if m is not None:
        pts = [m @ Vector(p) for p in pts]
        toward = m.to_3x3() @ toward
    f = b.faces.new([b.verts.new(p) for p in pts])
    f.normal_update()
    if f.normal.dot(toward) < 0:
        f.normal_flip()
    return f


def tube(b, pts, r=0.05, sides=4, closed=False):
    """A tube along a path, its faces outward (kit.tube's are not)."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    rings, prev = [], None
    for i, p in enumerate(pts):
        a = pts[(i - 1) % n] if (closed or i > 0) else p
        c = pts[(i + 1) % n] if (closed or i < n - 1) else p
        t = (c - a).normalized()
        side = t.cross(K.UP if abs(t.dot(K.UP)) < 0.95 else Vector((1, 0, 0))).normalized()
        if prev is not None and side.dot(prev) < 0:
            side = -side
        prev = side
        up = side.cross(t).normalized()
        rings.append([b.verts.new(p + (side * cos(k / sides * TAU + 0.785) + up * sin(k / sides * TAU + 0.785)) * r) for k in range(sides)])
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        mid = (pts[i] + pts[j]) / 2
        for k in range(sides):
            f = b.faces.new((rings[i][k], rings[j][k], rings[j][(k + 1) % sides], rings[i][(k + 1) % sides]))
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - mid) < 0:
                f.normal_flip()
            f.smooth = sides > 4


def ring_pts(c, r, n=24, rot=0.0):
    return [(c[0] + sin(rot + i / n * TAU) * r, c[1], c[2] + cos(rot + i / n * TAU) * r) for i in range(n)]


def gring(b, c, r, rad=0.05, n=24, rot=0.0):
    tube(b, ring_pts(c, r, n, rot), rad, 4, closed=True)


def bulbs(k, pts, spacing=0.5, closed=False):
    """A string of small lamps along a path: the game repeats Proto_bulb at each place."""
    pts = [Vector(p) for p in pts]
    if closed:
        pts.append(pts[0])
    left = spacing / 2
    for a, c in zip(pts, pts[1:]):
        length = (c - a).length
        while left <= length:
            k.instance('bulb', a.lerp(c, left / length))
            left += spacing
        left -= length


def gbox(b, size, at, yaw=0.0):
    bmesh.ops.create_cube(b, size=1.0, matrix=K.place(at, yaw, scale=size))


def revolve(b, profile, at, segs=24, lobes=False, pinch=0.92, rot=0.0, smooth=True):
    """A profile of (radius, height) turned about the vertical through `at`, facing outward; the
    front is angle 0 (+z). `lobes` pulls every other meridian in, for a gadrooned dome."""
    rings = []
    for r, y in profile:
        rings.append([b.verts.new((at[0] + sin(rot + i / segs * TAU) * r * (pinch if lobes and i % 2 else 1), at[1] + y,
                                   at[2] + cos(rot + i / segs * TAU) * r * (pinch if lobes and i % 2 else 1))) for i in range(segs)])
    axis = Vector((at[0], 0, at[2]))
    for j in range(len(rings) - 1):
        dr, dy = profile[j + 1][0] - profile[j][0], profile[j + 1][1] - profile[j][1]
        for i in range(segs):
            i2 = (i + 1) % segs
            f = b.faces.new((rings[j][i], rings[j][i2], rings[j + 1][i2], rings[j + 1][i]))
            f.normal_update()
            c = f.calc_center_median()
            radial = Vector((c.x - axis.x, 0, c.z - axis.z)).normalized()
            if f.normal.dot(radial * dy + Vector((0, -dr, 0))) < 0:
                f.normal_flip()
            f.smooth = smooth
    for j in range(1, len(rings) - 1):
        a = Vector((profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]))
        c = Vector((profile[j + 1][0] - profile[j][0], profile[j + 1][1] - profile[j][1]))
        if a.length > 1e-6 and c.length > 1e-6 and a.angle(c) > 0.5:
            for i in range(segs):
                e = b.edges.get((rings[j][i], rings[j][(i + 1) % segs]))
                if e:
                    e.smooth = False


def prism(b, outline, depth, m):
    """An outline (anticlockwise, in x-y) pushed `depth` along z about z = 0, placed by `m`."""
    h = depth / 2
    face(b, [(x, y, h) for x, y in outline], (0, 0, 1), m)
    face(b, [(x, y, -h) for x, y in outline], (0, 0, -1), m)
    for i, (x0, y0) in enumerate(outline):
        x1, y1 = outline[(i + 1) % len(outline)]
        face(b, [(x0, y0, h), (x1, y1, h), (x1, y1, -h), (x0, y0, -h)], (y1 - y0, x0 - x1, 0), m)


def sweep(b, pts, w, t):
    """A bar w deep (along z) and t thick (up) along a path."""
    secs = [[Vector(p) + Vector((0, dy, dz)) for dy, dz in ((-t / 2, w / 2), (t / 2, w / 2), (t / 2, -w / 2), (-t / 2, -w / 2))] for p in pts]
    for i in range(len(pts) - 1):
        for j, n in enumerate(((0, 0, 1), (0, 1, 0), (0, 0, -1), (0, -1, 0))):
            j2 = (j + 1) % 4
            face(b, [secs[i][j], secs[i + 1][j], secs[i + 1][j2], secs[i][j2]], n)


def arch(w, ys, kind='round', y0=None, n=12, grow=0.0, rise=None, R=None):
    """The outline of an opening w wide springing at ys, from its left foot (at y0) over to its
    right; with it the height the wall round it fans out from. Kinds: round, pointed, horseshoe
    (a circle of radius R wider than the opening), segment (a flat arc rising `rise`)."""
    h = w / 2
    cyr = ys
    if kind == 'pointed':
        e = h * 0.35
        rg = h + e + grow
        ta = math.acos(-e / rg)
        m = max(2, n // 2)
        left = [(e + rg * cos(PI + (ta - PI) * i / m), ys + rg * sin(PI + (ta - PI) * i / m)) for i in range(m + 1)]
        pts = left + [(-x, y) for x, y in reversed(left[:-1])]
    elif kind == 'horseshoe':
        R = R or 1.08 * h
        cyr = ys + math.sqrt(R * R - h * h)
        a0 = math.asin((cyr - ys) / R)
        pts = [((R + grow) * cos(PI + a0 - (PI + 2 * a0) * i / n), cyr + (R + grow) * sin(PI + a0 - (PI + 2 * a0) * i / n)) for i in range(n + 1)]
    elif kind == 'segment':
        R = (h * h + rise * rise) / (2 * rise)
        cy = ys + rise - R
        phi = math.atan2(ys - cy, h)
        pts = [((R + grow) * cos(PI - phi - (PI - 2 * phi) * i / n), cy + (R + grow) * sin(PI - phi - (PI - 2 * phi) * i / n)) for i in range(n + 1)]
    else:
        pts = [((h + grow) * cos(PI - PI * i / n), ys + (h + grow) * sin(PI - PI * i / n)) for i in range(n + 1)]
    if y0 is not None and y0 < pts[0][1] - 0.01:
        pts = [(pts[0][0], y0)] + pts + [(pts[-1][0], y0)]
    return pts, cyr


def bay(k, material, m, x0, x1, y0, y1, cx, w, ysill, ys, kind='round', depth=0.5, back=None, glow=None, n=12, gr=0.04, **shape):
    """A bay of wall x0..x1 by y0..y1 in the x-y plane of `m`, facing its +z, with an arched
    opening cut through it: the wall round the opening, the reveal `depth` deep, a sill, a panel of
    `back` closing the recess, and the opening drawn in glowing tube."""
    b = k.bm(material)
    pts, cyr = arch(w, ys, kind, ysill, n, **shape)
    pts = [(cx + x, y) for x, y in pts]
    if ysill > y0 + 1e-4:
        face(b, [(x0, y0, 0), (x1, y0, 0), (x1, ysill, 0), (x0, ysill, 0)], (0, 0, 1), m)

    def out(px, py):
        dx, dy = px - cx, py - cyr
        if dy <= 1e-6:
            return (x0 if dx < 0 else x1, py), ('L' if dx < 0 else 'R')
        xt = cx + dx * (y1 - cyr) / dy
        if x0 <= xt <= x1:
            return (xt, y1), 'T'
        side = x0 if dx < 0 else x1
        return (side, cyr + dy * (side - cx) / dx), ('L' if dx < 0 else 'R')

    outs = [out(*p) for p in pts]
    for i in range(len(pts) - 1):
        (o0, e0), (o1, e1) = outs[i], outs[i + 1]
        poly = [pts[i], o0]
        if e0 != e1:
            if e0 == 'L':
                poly.append((x0, y1))
            if e1 == 'R':
                poly.append((x1, y1))
        poly += [o1, pts[i + 1]]
        clean = [p for j, p in enumerate(poly) if (Vector(p) - Vector(poly[j - 1])).length > 1e-5]
        area = sum(clean[j - 1][0] * p[1] - p[0] * clean[j - 1][1] for j, p in enumerate(clean)) / 2
        if len(clean) >= 3 and abs(area) > 1e-6:
            face(b, [(x, y, 0) for x, y in clean], (0, 0, 1), m)
    if depth > 0:
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            mx, my = (ax + bx) / 2, (ay + by) / 2
            face(b, [(ax, ay, 0), (bx, by, 0), (bx, by, -depth), (ax, ay, -depth)], (cx - mx, min(my, cyr) - my, 0), m)
        if ysill > y0 + 1e-4:
            face(b, [(pts[0][0], ysill, 0), (pts[-1][0], ysill, 0), (pts[-1][0], ysill, -depth), (pts[0][0], ysill, -depth)], (0, 1, 0), m)
    if back:
        face(k.bm(back), [(x, y, -depth) for x, y in pts], (0, 0, 1), m)
    if glow is not None:
        gp, _ = arch(w, ys, kind, ysill, n, grow=0.12, **shape)
        tube(glow, [m @ Vector((cx + x, y, 0.08)) for x, y in gp], gr, 4, closed=ysill > y0 + 1e-4)


# ---------------------------------------------------------------------- the palace's parts
def column(k, at, h, r=0.28, sides=10, material='Marble'):
    """A column on a plinth: a moulded base, a shaft that narrows, a bell capital under its abacus."""
    x, y, z = at
    k.box(material, (r * 3.0, 0.16, r * 3.0), (x, y + 0.08, z))
    revolve(k.bm(material), [(r * 1.35, 0.16), (r * 1.35, 0.26), (r * 1.05, 0.36), (r, 0.4), (r * 0.86, h - 0.62), (r * 1.0, h - 0.56),
                             (r * 0.95, h - 0.5), (r * 1.5, h - 0.16)], at, sides)
    k.box(material, (r * 3.3, 0.16, r * 3.3), (x, y + h - 0.08, z))


def balustrade(k, a, c, h=1.0, step=0.4, posts=True, material='Marble'):
    """A rail on turned balusters from a to c (at floor height)."""
    a, c = Vector(a), Vector(c)
    d = c - a
    yaw = math.atan2(-d.z, d.x)
    mid = (a + c) / 2
    k.box(material, (d.length, 0.12, 0.24), mid + Vector((0, 0.06, 0)), yaw)
    k.box(material, (d.length, 0.14, 0.28), mid + Vector((0, h - 0.07, 0)), yaw)
    n = max(1, int(d.length / step))
    for i in range(n):
        revolve(k.bm(material), [(0.06, 0.12), (0.11, 0.3), (0.05, 0.6), (0.08, h - 0.14)], a + d * ((i + 0.5) / n), 6)
    if posts:
        for p in (a, c):
            k.box(material, (0.3, h + 0.12, 0.3), p + Vector((0, (h + 0.12) / 2, 0)), yaw)


def cornice(k, x0, x1, y, z, glow=None, s=1.0, dentils=True, material='Marble'):
    """A stepped cornice along x, standing out from the wall at z: bed mould, dentils, corona, cap.
    Returns the height of its top."""
    length, cx = x1 - x0, (x0 + x1) / 2

    def slab(h, p, yy):
        k.box(material, (length + 2 * p, h, p + 0.3), (cx, yy + h / 2, z + p / 2 - 0.15))
    slab(0.46 * s, 0.16 * s, y)
    if dentils:
        n = max(1, int(length / 0.56))
        for i in range(n):
            k.box(material, (0.28, 0.22 * s, 0.26 * s), (x0 + (i + 0.5) * length / n, y + 0.34 * s, z + 0.29 * s))
    slab(0.3 * s, 0.6 * s, y + 0.46 * s)
    slab(0.14 * s, 0.74 * s, y + 0.76 * s)
    if glow is not None:
        gbox(glow, (length + 1.2 * s, 0.07, 0.07), (cx, y + 0.5 * s, z + 0.6 * s + 0.05))
        if s >= 1:
            bulbs(k, [(x0, y + 0.83 * s, z + 0.74 * s + 0.1), (x1, y + 0.83 * s, z + 0.74 * s + 0.1)], 0.5)
    return y + 0.9 * s


def parapet(k, x0, x1, y, z, glow=None, material='Stone'):
    """A low wall with leaf-shaped merlons along x."""
    length, cx = x1 - x0, (x0 + x1) / 2
    k.box(material, (length, 0.5, 0.3), (cx, y + 0.25, z))
    n = max(1, round(length))
    for i in range(n):
        prism(k.bm(material), MERLON, 0.3, Matrix.Translation((x0 + (i + 0.5) * length / n, y + 0.5, z)))
    if glow is not None:
        gbox(glow, (length, 0.06, 0.06), (cx, y + 0.42, z + 0.19))


def finial(k, at, s=1.0):
    """Gold balls and a spike; returns its tip."""
    x, y, z = at
    k.drum('Gold', 0.13 * s, 0.34 * s, (x, y - 0.04 * s, z), 8)
    k.sphere('Gold', 0.3 * s, (x, y + 0.52 * s, z), 10, 6)
    k.sphere('Gold', 0.17 * s, (x, y + 0.98 * s, z), 8, 5)
    k.drum('Gold', 0.07 * s, 0.9 * s, (x, y + 1.08 * s, z), 6, radius2=0.004)
    return (x, round(y + 1.98 * s, 3), z)


def dome(k, at, r, h, glow, profile=ONION, segs=24, lobes=True, fin=1.0, material='Dome'):
    """A ribbed dome standing on `at`, every rib in glowing tube, a ring of light round its foot.
    Returns the tip of its finial."""
    prof = [(r * a, h * t) for a, t in profile]
    revolve(k.bm(material), prof, at, segs, lobes=lobes)
    ribs = segs // 2
    for i in range(ribs):
        a = i / ribs * TAU
        tube(glow, [(at[0] + sin(a) * (pr + 0.05), at[1] + py, at[2] + cos(a) * (pr + 0.05)) for pr, py in prof], 0.03 + 0.005 * r, 4 if r > 3 else 3)
        if r >= 3:
            bulbs(k, [(at[0] + sin(a + PI / ribs) * (pr * 0.92 + 0.12), at[1] + py, at[2] + cos(a + PI / ribs) * (pr * 0.92 + 0.12)) for pr, py in prof[:-1]], 0.7)
    gring(glow, (at[0], at[1] + 0.03, at[2]), prof[0][0] + 0.1, 0.03 + 0.005 * r, segs)
    top = (at[0], at[1] + h, at[2])
    return finial(k, top, fin) if fin else top


def kiosk(k, at, r, glow, n=8, col_h=2.2, top=ONION, top_h=None, segs=16, fin=0.8, core='Glow.Window'):
    """An open pavilion: a ring of columns round a lit core, an entablature, a dome or a spire."""
    x, y, z = at
    k.drum('Marble', r * 1.15, 0.25, at, segs)
    cr = max(0.09, r * 0.085)
    for i in range(n):
        a = (i + 0.5) / n * TAU
        p = (x + sin(a) * r * 0.9, y + 0.25, z + cos(a) * r * 0.9)
        k.drum('Marble', cr, col_h, p, 8, radius2=cr * 0.85)
        k.box('Marble', (cr * 3, 0.12, cr * 3), (p[0], y + 0.19 + col_h, p[2]), a)
    if core:
        k.drum(core, r * 0.55, col_h, (x, y + 0.25, z), 10)
    ey = y + 0.25 + col_h
    k.drum('Marble', r * 1.08, 0.3, (x, ey, z), segs)
    k.drum('Marble', r * 1.2, 0.12, (x, ey + 0.3, z), segs)
    gring(glow, (x, ey + 0.34, z), r * 1.25, 0.04, segs)
    return dome(k, (x, ey + 0.42, z), r, top_h or r * 1.7, glow, top, segs, top is not CONE, fin)


def window_on(k, c, radius, a, ysill, ys, w, glow, kind='round', frame=True, **shape):
    """A lit window on a round wall about c = (x, z), at angle a from the front."""
    m = K.place((c[0] + sin(a) * radius, 0, c[1] + cos(a) * radius), a)
    pts, _ = arch(w, ys, kind, ysill, 8, **shape)
    face(k.bm('Glow.Window'), [(x, y, 0.04) for x, y in pts], (0, 0, 1), m)
    gp, _ = arch(w, ys, kind, ysill, 8, grow=0.1, **shape)
    if frame:
        tube(k.bm('Marble'), [m @ Vector((x, y, 0.02)) for x, y in gp], 0.11, 4)
        k.box('Marble', (w + 0.5, 0.14, 0.3), m @ Vector((0, ysill - 0.07, 0.1)), a)
    tube(glow, [m @ Vector((x, y, 0.15)) for x, y in gp], 0.035, 3)


def rock(k, at, size, seed):
    """A boulder: a ball cut by a few planes into facets, stretched to `size`."""
    rnd = random.Random(seed)
    b = k.bm('Rock')
    made = bmesh.ops.create_icosphere(b, subdivisions=2, radius=1.0)
    planes = [(Vector((rnd.uniform(-1, 1), rnd.uniform(-0.3, 1), rnd.uniform(-1, 1))).normalized(), rnd.uniform(0.6, 0.9)) for _ in range(8)]
    m = K.place(at, rnd.uniform(0, TAU), rnd.uniform(-0.15, 0.15)) @ Matrix.Diagonal((*size, 1))
    for v in made['verts']:
        p = v.co.copy()
        for normal, d in planes:
            e = p.dot(normal) - d
            if e > 0:
                p -= normal * e
        p *= 1 + 0.07 * sin(p.x * 5.1 + seed) * cos(p.z * 4.3 + seed * 1.7)
        v.co = m @ p


def fan(k, at, col_h, length, glow, n=9, spread=72.0):
    """An open fan of leaves on a column, each leaf's rib and tip in light."""
    x, y, z = at
    column(k, at, col_h, 0.42, 12)
    c = Vector((x, y + col_h + 0.25, z))
    k.sphere('Gold', 0.55, c, 10, 6)
    for i in range(n):
        ang = math.radians(-spread + 2 * spread * i / (n - 1))
        ln = length * (1.0 if i % 2 == 0 else 0.78)
        wd = length * 0.21
        m = Matrix.Translation(c + Vector((0, 0, 0.12 if i % 2 else -0.04))) @ Matrix.Rotation(-ang, 4, 'Z')
        prism(k.bm('Gold' if i % 2 else 'Marble'), [(-0.1 * wd, 0), (0.1 * wd, 0), (0.5 * wd, 0.6 * ln), (0.34 * wd, 0.84 * ln), (0, ln),
                                                     (-0.34 * wd, 0.84 * ln), (-0.5 * wd, 0.6 * ln)], 0.14, m)
        tube(glow, [m @ Vector((0, 0.5, 0.12)), m @ Vector((0, ln * 0.6, 0.12)), m @ Vector((0, ln + 0.05, 0.12))], 0.045, 4)
        tube(glow, [m @ Vector(p) for p in ((-0.5 * wd, 0.6 * ln, 0.12), (-0.34 * wd, 0.84 * ln, 0.12), (0, ln + 0.05, 0.12),
                                            (0.34 * wd, 0.84 * ln, 0.12), (0.5 * wd, 0.6 * ln, 0.12))], 0.03, 3)


def bridge(k, a, c, glow, hump=1.4, bow=0.7, n=7):
    """A humpbacked bridge from a to c, bowed toward the crowd, a colonnade along it."""
    a, c = Vector(a), Vector(c)
    path = [a.lerp(c, i / n) + Vector((0, hump * sin(PI * i / n), bow * sin(PI * i / n))) for i in range(n + 1)]
    top = [p + Vector((0, 2.2, 0)) for p in path]
    marble = k.bm('Marble')
    sweep(marble, path, 1.3, 0.3)
    sweep(marble, top, 1.1, 0.3)
    sweep(marble, [a.lerp(c, i / n) + Vector((0, -1.7 + (hump + 1.5) * sin(PI * i / n), bow * sin(PI * i / n))) for i in range(n + 1)], 0.9, 0.25)
    for p in path:
        for dz in (0.45, -0.45):
            k.rod('Marble', p + Vector((0, 0.15, dz)), p + Vector((0, 2.05, dz)), 0.085, 8)
    for p, q in zip(path, path[1:]):
        tube(glow, [p.lerp(q, j / 6) + Vector((0, 1.45 + 0.55 * sin(PI * j / 6), 0.62)) for j in range(7)], 0.035, 3)
    tube(glow, [p + Vector((0, -0.05, 0.72)) for p in path], 0.045, 4)
    tube(glow, [p + Vector((0, 0.2, 0.62)) for p in top], 0.045, 4)


# ---------------------------------------------------------------------- the gatehouse
def gatehouse(k, G, marks):
    g, gd = G[0], G[4]
    m = Matrix.Translation((0, 0, ZG))
    stone = k.bm('Stone')
    cy, ro, ri = 12.4, 9.2, 8.6
    yso, ysi = cy - math.sqrt(ro * ro - 8.6 ** 2), cy - math.sqrt(ri * ri - 64)
    # The great keyhole arch in two orders: the outer cut through the front, a step, the inner
    # running back as a vault to the wall the screen hangs on.
    bay(k, 'Stone', m, -10, 10, DECK_Y, 23.4, 0, 17.2, DECK_Y, yso, 'horseshoe', 1.2, n=28, R=ro)
    po, _ = arch(17.2, yso, 'horseshoe', DECK_Y, 28, R=ro)
    pi, _ = arch(16, ysi, 'horseshoe', DECK_Y, 28, R=ri)
    for i in range(len(po) - 1):
        face(stone, [(*po[i], ZG - 1.2), (*po[i + 1], ZG - 1.2), (*pi[i + 1], ZG - 1.2), (*pi[i], ZG - 1.2)], (0, 0, 1))
        (ax, ay), (bx, by) = pi[i], pi[i + 1]
        mx, my = (ax + bx) / 2, (ay + by) / 2
        face(stone, [(ax, ay, ZG - 1.2), (bx, by, ZG - 1.2), (bx, by, ZB), (ax, ay, ZB)], (-mx, min(my, cy) - my, 0))
    face(stone, [(x, y, ZB) for x, y in pi], (0, 0, 1))
    for grow, z, r, target in ((0.3, ZG + 0.12, 0.09, g), (1.2, ZG + 0.1, 0.05, g), (0.75, ZG + 0.02, 0.3, k.bm('Marble'))):
        tube(target, [(x, y, z) for x, y in arch(17.2, yso, 'horseshoe', DECK_Y, 40, grow=grow, R=ro)[0]], r, 6)
    bulbs(k, [(x, y, ZG + 0.36) for x, y in arch(17.2, yso, 'horseshoe', DECK_Y, 40, grow=0.75, R=ro)[0]], 0.4)
    tube(g, [(x, y, ZG - 1.1) for x, y in arch(16, ysi, 'horseshoe', DECK_Y, 40, grow=0.12, R=ri)[0]], 0.07, 4)
    for z in (-26.0, -28.6):
        tube(g, [(x, y, z) for x, y in arch(16, ysi, 'horseshoe', DECK_Y, 32, grow=-0.07, R=ri)[0]], 0.05, 4)
    # A frame round the arch, medallions in its spandrels.
    for sx in (-1, 1):
        k.box('Marble', (0.34, 20.0, 0.22), (sx * 9.83, 13.0, ZG + 0.1))
        gbox(g, (0.07, 20.0, 0.07), (sx * 9.83, 13.0, ZG + 0.25))
        disc = [(cos(i / 16 * TAU) * 0.75, sin(i / 16 * TAU) * 0.75) for i in range(16)]
        prism(k.bm('Gold'), disc, 0.12, Matrix.Translation((sx * 7.7, 20.9, ZG + 0.05)))
        tube(g, [(sx * 7.7 + cos(i / 16 * TAU) * 0.98, 20.9 + sin(i / 16 * TAU) * 0.98, ZG + 0.1) for i in range(16)], 0.04, 4, closed=True)
    k.box('Marble', (20.0, 0.34, 0.22), (0, 23.0, ZG + 0.1))
    gbox(g, (20.0, 0.07, 0.07), (0, 23.0, ZG + 0.25))
    # A dwarf gallery of lit arches over it, then the piers either side: a niche with an urn
    # below, a window with its balcony above.
    for i in range(16):
        x0 = -10 + i * 1.25
        bay(k, 'Stone', m, x0, x0 + 1.25, 23.4, 26.0, x0 + 0.625, 0.85, 23.9, 24.8, 'round', 0.3, 'Glow.Window', g, 8, 0.03)
    face(stone, [(-16, 26, ZG), (16, 26, ZG), (16, 27, ZG), (-16, 27, ZG)], (0, 0, 1))
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 10, sx * 14.5))
        px = sx * 12.25
        bay(k, 'Stone', m, x0, x1, DECK_Y, 14.8, px, 2.2, 5.2, 10.4, 'round', 0.7, 'Stone', g)
        bay(k, 'Stone', m, x0, x1, 14.8, 26.0, px, 1.8, 17.0, 21.2, 'pointed', 0.5, 'Glow.Window', g)
        xa, xb = sorted((sx * 14.5, sx * 16))
        face(stone, [(xa, DECK_Y, ZG), (xb, DECK_Y, ZG), (xb, 26, ZG), (xa, 26, ZG)], (0, 0, 1))
        k.box('Marble', (6.2, 0.3, 0.3), (sx * 13, 14.8, ZG + 0.05))
        gbox(g, (4.6, 0.06, 0.06), (sx * 12.3, 14.8, ZG + 0.24))
        revolve(k.bm('Gold'), [(0.3, 0), (0.22, 0.15), (0.12, 0.4), (0.5, 1.0), (0.55, 1.5), (0.3, 1.9), (0.36, 2.1)], (px, 5.2, ZG - 0.35), 10)
        k.box('Marble', (2.6, 0.2, 0.8), (px, 16.9, ZG + 0.3))
        balustrade(k, (px - 1.2, 17.0, ZG + 0.58), (px + 1.2, 17.0, ZG + 0.58), 0.8)
        k.panel('Stone', 14, 25.3, (sx * 16, DECK_Y + 12.65, -30), sx * PI / 2)
    top = cornice(k, -16, 16, 27, ZG, g, 1.4)
    parapet(k, -16, 16, top, ZG + 0.35, g)
    k.floor('Stone', 32, 14, (0, top - 0.05, -30))

    # The turrets at its corners, each under a kiosk and an onion dome.
    for sx in (-1, 1):
        c = (sx * 16.5, ZG - 0.3)
        revolve(k.bm('Stone'), [(2.3, 3), (2.3, 3.6), (2.0, 3.6), (2.0, 28.0)], (c[0], 0, c[1]), 16, rot=PI / 16)
        for y in (14.6, 22.0):
            revolve(k.bm('Marble'), [(2.0, y), (2.2, y), (2.2, y + 0.4), (2.0, y + 0.4)], (c[0], 0, c[1]), 16, rot=PI / 16)
            gring(gd, (c[0], y + 0.2, c[1]), 2.28, 0.04, 16, PI / 16)
        revolve(k.bm('Marble'), [(2.0, 27.6), (2.2, 27.6), (2.75, 28.3), (2.75, 28.6), (2.3, 28.6)], (c[0], 0, c[1]), 16, rot=PI / 16)
        gring(gd, (c[0], 28.45, c[1]), 2.83, 0.04, 16, PI / 16)
        for a in (-0.785, 0, 0.785):
            for ysill, ys in ((6.5, 9.2), (17.0, 19.6), (23.4, 25.6)):
                window_on(k, c, 2.0, a, ysill, ys, 0.6, g, 'pointed')
        marks['fireworks'].append(kiosk(k, (c[0], 28.6, c[1]), 2.2, gd, 8, 2.6, ONION, 4.2))
        k.moving_head((c[0], 31.5 + 0.55, c[1] + 2.45), (sx * 0.05, 1, 0.1), 'Sky', 140, 0.012)
        # Small kiosks on the roof's front corners.
        kiosk(k, (sx * 12.3, top, ZG - 2.2), 1.25, gd, 6, 1.5, ONION, 2.0, 12, 0.5)

    # The drum and the great dome, its lantern and finial.
    dc = (0, top - 0.05, -30.0)
    revolve(k.bm('Stone'), [(6.9, 0), (6.9, 0.5), (6.5, 0.5), (6.5, 4.6)], dc, 32, rot=PI / 32)
    revolve(k.bm('Marble'), [(6.5, 4.6), (6.75, 4.6), (7.1, 5.0), (7.1, 5.25), (6.3, 5.25)], dc, 32, rot=PI / 32)
    gring(gd, (0, dc[1] + 5.12, dc[2]), 7.18, 0.06, 32, PI / 32)
    gring(gd, (0, dc[1] + 0.55, dc[2]), 6.98, 0.05, 32, PI / 32)
    for i in range(16):
        a = i / 16 * TAU
        if cos(a) > -0.3:
            window_on(k, (0, dc[2]), 6.5, a, dc[1] + 2.0, dc[1] + 3.5, 1.1, gd)
            b2 = a + TAU / 32
            k.box('Marble', (0.36, 4.1, 0.2), (sin(b2) * 6.52, dc[1] + 2.55, dc[2] + cos(b2) * 6.52), b2)
    lantern = dome(k, (0, dc[1] + 5.25, dc[2]), 6.6, 7.0, gd, HIGH, 32, True, 0)
    marks['fireworks'].insert(0, kiosk(k, lantern, 1.3, gd, 8, 1.2, ONION, 1.5, 16, 0.65))
    for sx in (-1, 1):
        k.moving_head((sx * 4.2, dc[1] + 5.55, dc[2] + 5.3), (sx * 0.08, 1, 0.12), 'Sky', 140, 0.012)

    # The DJ's balcony under the arch: a slab on a low arcade, a balustrade round it, the booth
    # at its front edge; the main screen behind.
    bz = -20.5
    k.box('Stone', (13, 0.4, bz - ZB), (0, 5.8, (bz + ZB) / 2))
    k.floor('Marble', 12.9, bz - ZB - 0.1, (0, 6.005, (bz + ZB) / 2))
    mb = Matrix.Translation((0, 0, bz))
    for i in range(5):
        x0 = -6.5 + i * 2.6
        bay(k, 'Stone', mb, x0, x0 + 2.6, 4.6, 5.6, x0 + 1.3, 2.1, 4.6, 4.6, 'segment', 0.5, None, g, 8, 0.035, rise=0.75)
    for i in range(6):
        column(k, (-6.5 + i * 2.6, DECK_Y, bz - 0.25), 1.6, 0.2, 8)
    k.panel('Black', 13, 2.6, (0, 4.3, bz - 1.4))
    for sx in (-1, 1):
        k.panel('Stone', 2.5, 2.6, (sx * 6.5, 4.3, bz - 1.25), sx * PI / 2)
        balustrade(k, (sx * 2.7, 6.0, bz - 0.15), (sx * 6.35, 6.0, bz - 0.15))
        balustrade(k, (sx * 6.35, 6.0, bz - 0.15), (sx * 6.35, 6.0, ZG - 1.0))
        for i in range(10):   # the stairs up to it, inside the arch
            k.box('Stone', (1.2, 0.3 * (i + 1), 0.3), (sx * 7.25, DECK_Y + 0.15 * (i + 1), -25 - 0.3 * i))
    k.box('Marble', (13.4, 0.4, 0.5), (0, 5.8, bz + 0.05))
    gbox(g, (13.4, 0.06, 0.06), (0, 5.62, bz + 0.33))
    k.dj_booth((0, 6.0, bz - 0.85), 0, 3.6, 'booth')
    k.mark('dj', (0, 6.0, bz - 1.6))
    k.box('Black', (15.6, 13.6, 0.3), (0, 13.7, ZB + 0.16))
    k.own('LED_main', 'LED.main', lambda b: k.panel('LED.main', 15, 13, (0, 13.7, ZB + 0.33), b=b))
    k.data['screens']['main'] = {'w': 15, 'h': 13}
    k.box('Dark', (0.5, 0.3, 0.4), (0, cy + ri - 0.2, ZG - 0.6), bevel=0.02)
    k.box('Glow.Green', (0.16, 0.06, 0.02), (0, cy + ri - 0.25, ZG - 0.39))
    k.source('laser.arch', (0, cy + ri - 0.4, ZG - 0.5))
    for x in (-8, 8):
        k.box('Dark', (0.4, 0.25, 0.35), (x, top + 1.5, ZG + 0.35), bevel=0.02)
        k.source('laser.top', (x, top + 1.7, ZG + 0.4))
    return top


# ---------------------------------------------------------------------- a wing
def wing(k, s, G, marks):
    g, gd = G[1 if s < 0 else 2], G[4]
    m = Matrix.Translation((0, 0, ZW))
    stone = k.bm('Stone')

    def span(a, b):
        return (s * a, s * b) if s > 0 else (s * b, s * a)

    # Ground storey: an open arcade of pointed arches on columns, a balustrade between them, lit
    # doorways in the wall behind.
    bounds = [18.5, 21.0, 23.5, 26.7, 29.9, 33.1, 36.3, 39.5, 42.0, 44.5]
    for a, b in zip(bounds, bounds[1:]):
        x0, x1 = span(a, b)
        w = b - a - 0.6
        bay(k, 'Stone', m, x0, x1, 7.2, 10.0, (x0 + x1) / 2, w, 7.2, max(7.2, 8.9 - 0.652 * w), 'pointed', 0.7, None, g)
        balustrade(k, (x0 + 0.3, DECK_Y, ZW - 0.35), (x1 - 0.3, DECK_Y, ZW - 0.35), 0.9, 0.45, False)
        door, _ = arch(1.3, 6.3, 'round', DECK_Y, 8)
        face(k.bm('Glow.Window'), [((x0 + x1) / 2 + x, y, ZW - 3.15) for x, y in door], (0, 0, 1))
    for b in bounds:
        column(k, (s * b, DECK_Y, ZW - 0.35), 4.2, 0.26)
    k.panel('Stone', 26, 7, (s * 31.5, 6.5, ZW - 3.2))
    k.panel('Stone', 26, 3.2, (s * 31.5, 9.95, ZW - 1.6), 0, PI / 2)
    terrace = cornice(k, *span(18.5, 44.5), 10.0, ZW, g)
    # Under the outer half the palace stands on a plinth of its own (the deck ends at 30).
    k.box('Stone', (15.2, DECK_Y, 6.8), (s * 37.4, DECK_Y / 2, ZW - 2.6))
    k.box('Marble', (15.4, 0.3, 0.3), (s * 37.4, DECK_Y - 0.15, ZW + 0.85))
    k.box('Marble', (15.4, 0.5, 0.3), (s * 37.4, 0.25, ZW + 0.85))

    # The pavilion: a great flat arch framing the screen, a sunburst in its tympanum, an attic of
    # lit arches, a drum and a dome.
    px0, px1 = span(23.5, 39.5)
    pc = s * 31.5
    rise, spring = 2.2, 20.7
    bay(k, 'Stone', m, px0, px1, terrace, 24.0, pc, 14.4, 11.5, spring, 'segment', 0.7, 'Stone', None, 20, rise=rise)
    tube(g, [(pc + x, y, ZW + 0.1) for x, y in arch(14.4, spring, 'segment', 11.5, 24, grow=0.2, rise=rise)[0]], 0.08, 4, closed=True)
    name = 'LED_wing_L' if s < 0 else 'LED_wing_R'
    k.own(name, 'LED.wing', lambda b: k.panel('LED.wing', 14, 9, (pc, 16.1, ZW - 0.6), b=b))
    k.data['screens']['wing'] = {'w': 14, 'h': 9}
    k.box('Marble', (14.4, 0.16, 0.2), (pc, spring + 0.02, ZW - 0.55))
    radius = (7.2 ** 2 + rise ** 2) / (2 * rise)
    d = spring + 0.1 - (spring + rise - radius)
    for i in range(11):
        a = math.radians(15 + 150 * i / 10)
        t = -d * sin(a) + math.sqrt(max(0.0, d * d * sin(a) ** 2 - d * d + (radius - 0.2) ** 2))
        tube(g, [(pc + cos(a) * 0.9, spring + 0.1 + sin(a) * 0.9 * 0.5, ZW - 0.62), (pc + cos(a) * t, spring + 0.1 + sin(a) * t, ZW - 0.62)], 0.04, 4)
    for sx in (-1, 1):
        k.box('Marble', (0.5, 9.9, 0.26), (pc + sx * 7.6, 16.1, ZW + 0.12))
        k.box('Marble', (0.7, 0.3, 0.36), (pc + sx * 7.6, 21.2, ZW + 0.14))
        k.box('Marble', (0.7, 0.3, 0.36), (pc + sx * 7.6, 11.2, ZW + 0.14))
        k.panel('Stone', 1.5, 24.0 - terrace, (pc + sx * 8, (24.0 + terrace) / 2, ZW - 0.75), sx * PI / 2)
    ptop = cornice(k, px0, px1, 24.0, ZW, g)
    k.floor('Stone', 16, 6, (pc, ptop - 0.03, ZW - 3))
    ma = Matrix.Translation((0, 0, ZW - 0.6))
    for i in range(7):
        x0 = pc - 5.5 + i * 11 / 7
        bay(k, 'Stone', ma, x0, x0 + 11 / 7, ptop, 26.5, x0 + 11 / 14, 0.9, ptop + 0.3, ptop + 0.85, 'round', 0.25, 'Glow.Window', g, 8, 0.03)
    atop = cornice(k, pc - 5.5, pc + 5.5, 26.5, ZW - 0.6, g, 0.6, False)
    k.floor('Stone', 11, 5.4, (pc, atop - 0.02, ZW - 3.3))
    for sx in (-1, 1):
        k.panel('Stone', 5.4, atop - ptop, (pc + sx * 5.5, (atop + ptop) / 2, ZW - 3.3), sx * PI / 2)
    dc = (pc, atop - 0.02, ZW - 4.2)
    revolve(k.bm('Stone'), [(3.7, 0), (3.7, 0.35), (3.4, 0.35), (3.4, 2.9)], dc, 24, rot=PI / 24)
    revolve(k.bm('Marble'), [(3.4, 2.9), (3.6, 2.9), (3.9, 3.2), (3.9, 3.4), (3.3, 3.4)], dc, 24, rot=PI / 24)
    gring(gd, (pc, dc[1] + 3.3, dc[2]), 3.98, 0.045, 24, PI / 24)
    for i in range(12):
        a = i / 12 * TAU
        if cos(a) > -0.3:
            window_on(k, (pc, dc[2]), 3.4, a, dc[1] + 1.3, dc[1] + 2.25, 0.8, gd)
    marks['fireworks'].append(dome(k, (pc, dc[1] + 3.4, dc[2]), 3.5, 4.2, gd, ONION, 24, True, 0.8))
    for sx in (-1, 1):
        k.moving_head((pc + sx * 2.3, dc[1] + 3.4 + 0.3, dc[2] + 2.75), (sx * 0.06, 1, 0.1), 'Sky', 140, 0.012)

    # Slim turrets at the pavilion's corners, each under a spire.
    spires = []
    for tx in (23.3, 39.7):
        c = (s * tx, 0, ZW + 0.1)
        revolve(k.bm('Stone'), [(0.25, terrace - 0.7), (0.9, terrace), (0.9, 27.2)], c, 12)
        for y in (17.3, 23.9, 26.9):
            revolve(k.bm('Marble'), [(0.9, y), (1.05, y), (1.05, y + 0.3), (0.9, y + 0.3)], c, 12)
            gring(gd, (c[0], y + 0.15, c[2]), 1.12, 0.035, 12)
        for ysill, ys in ((13.0, 15.0), (19.3, 21.3)):
            window_on(k, (c[0], c[2]), 0.9, 0, ysill, ys, 0.45, g, 'pointed', False)
        spires.append(dome(k, (c[0], 27.2, c[2]), 0.95, 4.6, gd, CONE, 12, False, 0.6))

    # The flanks: two storeys of windows between pilasters, set back behind a terrace with its
    # balustrade; a parapet of merlons, a kiosk on the roof.
    mf = Matrix.Translation((0, 0, ZW - 1.5))
    for fa, fb, kx, spire in ((18.5, 23.5, 20.6, True), (39.5, 44.5, 42.3, False)):
        x0, x1 = span(fa, fb)
        for i in range(2):
            bx = x0 + i * 2.5
            bay(k, 'Stone', mf, bx, bx + 2.5, terrace, 17.2, bx + 1.25, 1.4, 12.4, 14.6, 'horseshoe', 0.45, 'Glow.Window', g)
            bay(k, 'Stone', mf, bx, bx + 2.5, 17.2, 23.2, bx + 1.25, 1.3, 18.9, 20.9, 'pointed', 0.45, 'Glow.Window', g)
        for i in range(3):
            for y0, y1 in ((terrace, 17.2), (17.6, 23.2)):
                k.box('Marble', (0.4, y1 - y0, 0.16), (x0 + i * 2.5, (y0 + y1) / 2, ZW - 1.42))
                k.box('Marble', (0.56, 0.24, 0.24), (x0 + i * 2.5, y1 - 0.3, ZW - 1.4))
        cornice(k, x0, x1, 17.2, ZW - 1.5, g, 0.45, False)
        ftop = cornice(k, x0, x1, 23.2, ZW - 1.5, g)
        parapet(k, x0, x1, ftop, ZW - 1.15, g)
        k.floor('Stone', 5, 5, ((x0 + x1) / 2, ftop - 0.03, ZW - 4))
        k.floor('Stone', 5, 2.3, ((x0 + x1) / 2, terrace - 0.01, ZW - 0.4))
        balustrade(k, (x0 + 0.2, terrace, ZW + 0.5), (x1 - 0.2, terrace, ZW + 0.5))
        tip = kiosk(k, (s * kx, ftop, ZW - 3.8), 1.7, gd, 8, 2.0, CONE if spire else ONION, 3.8 if spire else 3.2, 16, 0.7)
        if not spire:
            marks['fireworks'].append(tip)
            k.moving_head((s * kx, ftop + 2.25 + 0.42 + 0.3, ZW - 3.8 + 1.85), (s * 0.05, 1, 0.1), 'Sky', 140, 0.012)
        # Confetti cannons on the terrace.
        cx = s * (fa + 0.9 if spire else fb - 0.9)
        k.rod('Dark', (cx, terrace + 0.15, ZW - 0.4), (cx, terrace + 0.75, ZW), 0.14, 10, cap=True)
        k.source('confetti', (cx, terrace + 0.75, ZW))

    # Bridges between the turrets: gatehouse to pavilion, pavilion to tower.
    bridge(k, (s * 18.3, 25.6, ZW + 0.4), (s * 23.3, 25.6, ZW + 0.4), g, 1.3, 0.9, 6)
    bridge(k, (s * 39.7, 25.6, ZW + 0.4), (s * 45.4, 25.6, ZW + 0.4), g, 1.3, 0.9, 6)

    # Moving heads hung on a bar before the top cornice, laser heads on it.
    for x0, x1, y, z in ((18.8, 23.2, 24.45, ZW - 0.45), (24.0, 39.0, ptop + 0.35, ZW + 1.05), (39.8, 44.2, 24.45, ZW - 0.45)):
        k.rod('Black', (s * x0, y, z), (s * x1, y, z), 0.035, 6)
        for x in (x0 + 0.2, (x0 + x1) / 2, x1 - 0.2):
            k.box('Black', (0.08, 0.08, 0.5), (s * x, y, z - 0.25))
    for i in range(12):
        x = 19.6 + i * 2.14
        inner = 23.5 < x < 39.5
        k.moving_head((s * x, (ptop + 0.35 if inner else 24.45) - 0.3, ZW + 1.05 if inner else ZW - 0.45), (-s * x * 0.004, -0.38, 0.92), 'Header', 60, 0.035)
    for x, y, z in ((26.5, ptop, ZW + 0.3), (36.5, ptop, ZW + 0.3), (43.6, 25.4, ZW - 1.2)):
        k.box('Dark', (0.4, 0.25, 0.35), (s * x, y + 0.13, z), bevel=0.02)
        k.source('laser.top', (s * x, y + 0.3, z + 0.05))

    # The PA: a line array hung from a stone pylon that hides its tower.
    px, pz = s * 21.0, -22.6
    k.box('Stone', (1.5, 23.5, 1.5), (px, DECK_Y + 11.75, pz))
    k.box('Marble', (1.9, 0.9, 1.9), (px, DECK_Y + 0.45, pz))
    for y in (14.8, 26.3):
        k.box('Marble', (1.8, 0.35, 1.8), (px, y, pz))
        gring(g, (px, y, pz), 1.32, 0.04, 4, PI / 4)
    for sx in (-1, 1):
        gbox(g, (0.06, 22.4, 0.06), (px + sx * 0.78, DECK_Y + 12.2, pz + 0.78))
    dome(k, (px, 26.5, pz), 0.95, 3.4, gd, CONE, 8, False, 0.5)
    k.box('Black', (0.3, 0.3, 3.2), (px, 25.2, pz + 1.9))
    k.line_array((px, 24.6, pz + 3.1), -s * 0.12, 12, 1.6, 0.6)
    return spires


# ---------------------------------------------------------------------- an end tower
def tower(k, s, G, marks):
    g, gd = G[3], G[4]
    cx, cz = s * TOWER_X, TOWER_Z
    c, rot = (cx, 0, cz), -PI / 24
    revolve(k.bm('Stone'), [(6.0, 0), (5.6, 3.1), (5.2, 3.5), (5.2, 23.6)], c, 24, rot=rot)
    revolve(k.bm('Stone'), [(3.9, 25.0), (3.9, 29.6)], c, 24, rot=rot)
    marble = k.bm('Marble')
    for y in (10.0, 17.0):
        revolve(marble, [(5.2, y), (5.5, y), (5.5, y + 0.5), (5.2, y + 0.5)], c, 24, rot=rot)
        gring(g, (cx, y + 0.25, cz), 5.6, 0.05, 24, rot)
    revolve(marble, [(5.2, 23.6), (5.5, 23.6), (6.4, 24.6), (6.4, 25.0), (3.9, 25.0)], c, 24, rot=rot)
    revolve(marble, [(3.9, 29.6), (5.5, 29.6), (5.5, 30.1), (5.8, 30.1), (5.8, 30.5), (4.7, 30.5)], c, 24, rot=rot)
    gring(g, (cx, 24.8, cz), 6.5, 0.055, 24, rot)
    gring(g, (cx, 30.3, cz), 5.9, 0.055, 24, rot)
    for y, r in ((10.6, 5.6), (17.6, 5.6), (24.82, 6.62), (30.32, 6.02)):
        bulbs(k, ring_pts((cx, y, cz), r, 72), 0.5, True)
    for j in range(-4, 5):
        a = j * PI / 6
        window_on(k, (cx, cz), 5.2, a, 5.2, 7.6, 1.0, g, 'pointed')
        window_on(k, (cx, cz), 5.2, a, 12.0, 14.8, 1.1, g, 'round')
        window_on(k, (cx, cz), 5.2, a, 18.8, 21.6, 1.1, g, 'horseshoe')
    for j in range(12):
        a = j * PI / 6
        column(k, (cx + sin(a) * 5.0, 25.0, cz + cos(a) * 5.0), 4.6, 0.3)
        if cos(a + PI / 12) > -0.6:
            window_on(k, (cx, cz), 3.9, a + PI / 12, 25.05, 27.9, 1.0, g, 'round', False)
    rail = ring_pts((cx, 25.0, cz), 6.15, 24, rot)
    for p, q in zip(rail, rail[1:] + rail[:1]):
        balustrade(k, p, q, 1.0, 0.8, False)
    marks['fireworks'].append(dome(k, (cx, 30.5, cz), 5.0, 6.2, gd, ONION, 24, True, 1.3))
    # Moving heads: four hung under the gallery's roof looking out across the field, two on the
    # roof's ledge pointing up.
    for j in range(4):
        a = -s * (PI / 12 + (j - 1) * PI / 6)
        p = Vector((cx + sin(a) * 5.75, 29.25, cz + cos(a) * 5.75))
        k.moving_head(p, Vector((-s * 14 + s * j * 9, 2, 46)) - p, 'Tower', 70, 0.02)
    for a in (-0.35, 0.35):
        k.moving_head((cx + sin(a) * 5.3, 30.8, cz + cos(a) * 5.3), (sin(a) * 0.2, 1, 0.12), 'Sky', 140, 0.012)


# ---------------------------------------------------------------------- the venue
def build(k):
    if os.environ.get('MAINSTAGE_CULL'):   # previews with back faces culled, to check which way faces point
        bpy.context.scene.display.shading.show_backface_culling = True
    G = [new_bm() for _ in range(5)]   # outlines: centre, left wing, right wing, towers, domes
    marks = {'fireworks': []}

    k.floor('Ground', 600, 600, (0, 0, 0))
    gatehouse(k, G, marks)
    for s in (-1, 1):
        wing(k, s, G, marks)
        tower(k, s, G, marks)
        # Rocks at the foot of the wing and round the tower, fans on columns among them.
        for i, (x, z, size) in enumerate((
                (31.6, -22.4, (2.2, 1.7, 1.6)), (34.3, -21.9, (1.8, 2.5, 1.5)), (36.6, -21.2, (1.3, 1.0, 1.2)), (38.7, -22.3, (2.3, 3.0, 1.7)),
                (40.4, -21.6, (1.3, 1.1, 1.2)), (43.6, -21.9, (1.5, 1.4, 1.3)), (45.7, -20.6, (2.0, 1.8, 1.6)), (48.2, -19.4, (2.5, 2.2, 1.9)),
                (52.2, -19.5, (2.2, 3.3, 1.8)), (55.6, -21.4, (2.8, 2.5, 2.2)), (57.6, -24.6, (2.5, 4.2, 2.4)), (61.0, -22.6, (1.7, 1.4, 1.5)),
                (59.2, -27.6, (3.0, 2.5, 2.6)), (33.0, -20.3, (0.8, 0.6, 0.7)), (50.2, -17.9, (1.0, 0.7, 0.9)), (63.0, -20.0, (0.9, 0.6, 0.8)),
                (46.6, -18.4, (0.9, 0.7, 0.8)), (54.4, -18.6, (1.2, 0.9, 1.0)))):
            rock(k, (s * x, size[1] * 0.3, z), size, i * 13 + (7 if s > 0 else 91))
        for x, y, z, col_h, length in ((12.25, DECK_Y, -21.6, 5.4, 3.6), (42.0, 0, -20.6, 6.6, 3.4), (58.8, 0, -19.6, 5.6, 3.0)):
            if y == 0:
                k.box('Stone', (1.7, 1.2, 1.7), (s * x, 0.6, z))
                k.box('Marble', (1.9, 0.2, 1.9), (s * x, 1.3, z))
            fan(k, (s * x, y if y else 1.4, z), col_h, length, G[0] if x < 15 else G[1 if s < 0 else 2])

    # ------------------------------------------------------------- the deck
    k.box('Black', (DECK_HALF * 2, DECK_Y, 19), (0, DECK_Y / 2, DECK_FRONT - 9.5))
    k.floor('Deck', DECK_HALF * 2, 19, (0, DECK_Y + 0.005, DECK_FRONT - 9.5))
    k.box('Black', (6, DECK_Y, 8), (0, DECK_Y / 2, DECK_FRONT + 4))
    k.floor('Deck', 6, 8, (0, DECK_Y + 0.005, DECK_FRONT + 4))
    edge = [(-30, DECK_FRONT), (-3, DECK_FRONT), (-3, DECK_FRONT + 8), (3, DECK_FRONT + 8), (3, DECK_FRONT), (30, DECK_FRONT)]
    for (x0, z0), (x1, z1) in zip(edge, edge[1:]):
        k.box('Alu', (abs(x1 - x0) + 0.06, 0.06, abs(z1 - z0) + 0.06), ((x0 + x1) / 2, DECK_Y - 0.02, (z0 + z1) / 2))
        k.box('Glow.Edge', (abs(x1 - x0) + 0.1, 0.03, abs(z1 - z0) + 0.1), ((x0 + x1) / 2, DECK_Y - 0.08, (z0 + z1) / 2))
    k.proto('bulb', 'Glow.Bulb', lambda b: k.sphere('Glow.Bulb', 0.09, (0, 0, 0), 8, 5, b=b))
    bulbs(k, [(x + (0.12 if x > 0 else -0.12) * (abs(x) < 29), DECK_Y - 0.16, z + 0.12) for x, z in edge], 0.5)
    path = [(-30, DECK_FRONT + 0.03), (-3.03, DECK_FRONT + 0.03), (-3.03, DECK_FRONT + 8.03), (3.03, DECK_FRONT + 8.03), (3.03, DECK_FRONT + 0.03), (30, DECK_FRONT + 0.03)]
    total = sum(math.dist(p, q) for p, q in zip(path, path[1:]))

    def fascia(b):
        uv = b.loops.layers.uv.verify()
        done = 0.0
        for (x0, z0), (x1, z1) in zip(path, path[1:]):
            f = face(b, [(x0, 1.5, z0), (x1, 1.5, z1), (x1, 2.8, z1), (x0, 2.8, z0)], (0, 0, 1) if z0 == z1 else (x0, 0, 0))
            for loop in f.loops:
                co = loop.vert.co
                loop[uv].uv = ((done + math.dist((x0, z0), (co.x, co.z))) / total, (co.y - 1.5) / 1.3)
            done += math.dist((x0, z0), (x1, z1))
    k.own('LED_fascia', 'LED.fascia', fascia)
    k.data['screens']['fascia'] = {'w': round(total, 2), 'h': 1.3}
    for s in (-1, 1):
        # Stairs down the deck's ends, a loading ramp behind them.
        for i in range(9):
            k.box('Black', (0.36, DECK_Y - 0.3 * (i + 1), 1.8), (s * (30.18 + 0.36 * i), (DECK_Y - 0.3 * (i + 1)) / 2, -13.2))
        for z in (-12.35, -14.05):
            k.rod('Alu', (s * 30.1, DECK_Y + 0.9, z), (s * 33.4, 1.2, z), 0.025, 6)
            for i in range(4):
                k.rod('Alu', (s * (30.1 + i * 1.1), DECK_Y - i * 0.9, z), (s * (30.1 + i * 1.1), DECK_Y + 0.9 - i * 0.9, z), 0.02, 6)
        prism(k.bm('Black'), [(0, 0), (12, 0), (0, DECK_Y)] if s > 0 else [(-12, 0), (0, 0), (0, DECK_Y)], 2.4, Matrix.Translation((s * 30, 0, -17)))

    # The band at the front: the singer out on the thrust, guitar and bass either side with their
    # amps, the drums on a riser behind; wedges, mic stands, cables.
    band = {'vox': (0, DECK_Y, -6.5), 'lead': (-5.5, DECK_Y, -14.0), 'bass': (5.5, DECK_Y, -14.0), 'drums': (0, DECK_Y + 0.6, -17.4)}
    for name, at in band.items():
        k.mark(name, at)
    k.box('Black', (4.2, 0.6, 3.2), (0, DECK_Y + 0.3, -17.4), bevel=0.02)
    k.floor('Wood', 4.0, 3.0, (0, DECK_Y + 0.605, -17.4))
    gbox(k.bm('Glow.Edge'), (4.2, 0.03, 0.03), (0, DECK_Y + 0.57, -15.79))
    for s in (-1, 1):
        k.amp((s * 7.0, DECK_Y, -16.6), -s * 0.15)
        k.amp((s * 7.9, DECK_Y, -16.75), -s * 0.2, 1)
        k.wedge((s * 5.5, DECK_Y, -13.3))
        k.wedge((s * 0.75, DECK_Y, -5.3))
        k.mic_stand((s * 5.5, DECK_Y, -13.65), -0.12)
        tube(k.bm('Rubber'), [(s * 5.5, DECK_Y + 0.02, -13.9), (s * 6.2, DECK_Y + 0.02, -15.2), (s * 7.0, DECK_Y + 0.02, -16.3)], 0.015, 5)
        tube(k.bm('Rubber'), [(s * 7.4, DECK_Y + 0.02, -16.9), (s * 9.5, DECK_Y + 0.02, -18.6), (s * 9.9, DECK_Y + 0.02, -22.5)], 0.015, 5)
        tube(k.bm('Rubber'), [(s * 1.9, DECK_Y + 0.62, -18.0), (s * 2.3, DECK_Y + 0.02, -18.4), (s * 6.0, DECK_Y + 0.02, -19.6), (s * 9.7, DECK_Y + 0.02, -22.4)], 0.015, 5)
    k.mic_stand((0, DECK_Y, -6.05), -0.15)
    tube(k.bm('Rubber'), [(0, DECK_Y + 0.02, -6.2), (0.5, DECK_Y + 0.02, -9.5), (-0.3, DECK_Y + 0.02, -13.0), (2.4, DECK_Y + 0.02, -15.6)], 0.015, 5)

    # Along the deck's front: flame jets, CO2 jets, spark fountains, moving heads pointing up.
    for i in range(12):
        x = (i - 5.5) * 4.6
        k.box('Dark', (0.5, 0.22, 0.4), (x, DECK_Y + 0.11, -12.4), bevel=0.02)
        k.drum('Steel', 0.07, 0.16, (x, DECK_Y + 0.22, -12.4), 8)
        k.source('flames', (x, DECK_Y + 0.38, -12.4))
    for x in (-25, -16, -7.5, 7.5, 16, 25):
        k.drum('Dark', 0.12, 0.45, (x, DECK_Y, -13.4), 12)
        k.source('co2', (x, DECK_Y + 0.45, -13.4))
    for x, z in ((-2.6, -5.0), (2.6, -5.0), (-2.6, -9.6), (2.6, -9.6), (-11.4, -12.45), (11.4, -12.45), (-20.6, -12.45), (20.6, -12.45)):
        k.box('Dark', (0.4, 0.15, 0.4), (x, DECK_Y + 0.075, z), bevel=0.02)
        k.source('sparks', (x, DECK_Y + 0.15, z))
    for i in range(16):
        x = (i - 7.5) * 3.5
        k.moving_head((x, DECK_Y + 0.3, -12.95), (x * 0.02, 1, 0.45), 'Floor', 30, 0.03)

    # ------------------------------------------------------------- the pit and the field
    for a, c in (((-35, -8), (-4.5, -8)), ((-4.5, -8), (-4.5, -2.5)), ((-4.5, -2.5), (4.5, -2.5)), ((4.5, -2.5), (4.5, -8)), ((4.5, -8), (35, -8))):
        k.barrier((a[0], 0, a[1]), (c[0], 0, c[1]))
    for s in (-1, 1):
        for i in range(10):
            k.speaker_stack((s * (5.0 + i * 2.55), 0, -11.4), 0, 2, 0)
        # A delay tower out in the field: a truss mast on a ballast base with a small hang.
        dx, dz = s * 30.0, 55.0
        k.box('Dark', (2.6, 0.5, 2.6), (dx, 0.25, dz), bevel=0.03)
        k.truss('Steel', (dx, 0.5, dz), (dx, 11.5, dz), 0.8)
        for a in range(4):
            k.rod('Steel', (dx + cos(a * PI / 2 + 0.785) * 1.7, 0.5, dz + sin(a * PI / 2 + 0.785) * 1.7), (dx, 4.0, dz), 0.04, 6)
        k.box('Steel', (0.5, 0.3, 2.2), (dx, 11.4, dz + 0.8))
        k.line_array((dx, 10.7, dz + 1.5), 0, 6, 1.0, 0.6)
        gbox(k.bm('Glow.Red'), (0.16, 0.16, 0.16), (dx, 11.75, dz))
    # The mixing desk under its tent.
    k.foh((0, 0, 64), PI, True)
    canvas = k.bm('Canvas')
    for z0, n in ((61.0, (0, 0.6, -1)), (67.0, (0, 0.6, 1))):
        for lift in (0.0, -0.04):
            face(canvas, [(-3.6, 3.5 + lift, z0), (3.6, 3.5 + lift, z0), (3.6, 5.1 + lift, 64), (-3.6, 5.1 + lift, 64)], n if lift == 0 else (0, -1, 0))
    for x in (-3.6, 3.6):
        face(canvas, [(x, 3.5, 61), (x, 3.5, 67), (x, 5.1, 64)], (x, 0, 0))
        for z in (61, 67):
            k.rod('Alu', (x, 0, z), (x, 3.5, z), 0.05, 8)
        k.rod('Alu', (x, 3.5, 61), (x, 3.5, 67), 0.04, 6)
    # In the pit: a camera platform, and a truss bridge carrying the cables from the deck over
    # the pit to the barrier.
    k.box('Black', (2.4, 1.3, 1.8), (-13, 0.65, -9.7), bevel=0.02)
    for x in (-14.15, -11.85):
        for z in (-10.55, -8.85):
            k.rod('Alu', (x, 1.3, z), (x, 2.3, z), 0.02, 6)
    k.rod('Alu', (-14.15, 2.3, -8.85), (-11.85, 2.3, -8.85), 0.02, 6)
    for i in range(3):
        k.rod('Black', (-13, 2.55, -9.9), (-13 + cos(i * TAU / 3) * 0.5, 1.3, -9.9 + sin(i * TAU / 3) * 0.5), 0.02, 5)
    k.box('Dark', (0.3, 0.3, 0.7), (-13, 2.7, -9.9), bevel=0.02)
    k.rod('Black', (-13, 2.7, -9.55), (-13, 2.7, -9.3), 0.1, 10, cap=True)
    for z in (-11.6, -8.5):
        k.truss('Steel', (13, 0, z), (13, 3.6, z), 0.4)
        k.box('Steel', (0.9, 0.06, 0.9), (13, 0.03, z))
    k.truss('Steel', (13, 3.6, -11.8), (13, 3.6, -8.3), 0.4)
    for dx in (-0.1, 0.0, 0.1):
        tube(k.bm('Rubber'), [(13 + dx, DECK_Y + 0.05, -12.3), (13 + dx, 3.85, -11.6), (13 + dx, 3.82, -10.0), (13 + dx, 3.85, -8.5), (13 + dx, 2.0, -8.25), (13 + dx, 0.03, -8.2)], 0.025, 5)

    for i, name in enumerate(('centre', 'left', 'right', 'towers', 'domes')):
        k.objects.append(('Move_outline_%d' % i, 'Glow.Outline', G[i]))

    # Self-check: what the brief counts.
    groups = {}
    for fx in k.data['fixtures']:
        groups[fx['group']] = groups.get(fx['group'], 0) + 1
    assert groups == {'Header': 24, 'Sky': 14, 'Floor': 16, 'Tower': 8}, groups
    k.data['sources']['fireworks'] = [K.r3(p) for p in marks['fireworks']]
    assert 1000 <= len(k.data['instances']['bulb']) <= 2500, len(k.data['instances']['bulb'])
    counts = {name: len(v) for name, v in k.data['sources'].items()}
    assert counts == {'flames': 12, 'co2': 6, 'sparks': 8, 'confetti': 4, 'fireworks': 9, 'laser.top': 8, 'laser.arch': 1}, counts

    return {
        'ao': 4.0,
        'deck': {'front': DECK_FRONT, 'half': DECK_HALF, 'y': DECK_Y},
        'screen': [0, 13.7, ZB + 0.33],
        'thrust': {'half': 3, 'front': DECK_FRONT + 8},
        'outlines': ['centre', 'left', 'right', 'towers', 'domes'],
        'obstacles': [[-30, 55, 2.2], [30, 55, 2.2], [0, 64, 4.5]],
        'views': {
            'front': ((0, 6.5, 62), (0, 15, -20), 74),
            'hero': ((62, 26, 88), (-6, 12, -16), 56),
            'close': ((7.5, 5.6, 1.5), (-0.5, 4.6, -15), 70),
            'dj': ((2.8, 8.4, -15.5), (0, 7.1, -21.5), 56),
            'detail': ((25, 7.5, -11), (33, 10, -25), 62),
            'wing': ((30, 14, 12), (32, 17, -25), 62),
            'top': ((20, 60, 30), (10, 15, -26), 60),
            'tower': ((46, 12, 2), (50, 20, -26), 62),
        },
    }
