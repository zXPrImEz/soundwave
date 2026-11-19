"""
Warehouse: a disused factory hall at night (see build.py).

Bare concrete and old brick, tall iron-framed windows, a floor wet enough to mirror the show, an
old gantry crane over the floor, galleries along both walls with stairs up to them, pipes, chains
and paint. On the stage the band plays at the front with their amps and wedges; behind them a DJ
on a raised riser at a booth before a wall of LEDs on scaffolding, with LED columns either side.
Over the floor hang rows of light bars on winches, moving heads on every truss, line arrays and
strobes; stacks, road cases, a crowd barrier and the mixing desk stand on the floor.
"""
import math

import bmesh

import kit as K

HALF, BACK, FRONT, HEIGHT = 25.0, -20.0, 74.0, 14.0
STAGE_FRONT, DECK = -8.0, 1.4
DJ_FRONT, DJ_RISE = -12.2, 1.1
GALLERY, GALLERY_Y = 4.2, 5.2
BAR_X = (-15.5, 0, 15.5)
BAR_Z = tuple(range(0, 61, 6))
BAR_TOP = 13.6
PILLARS = [(x, z) for x in (-17, 17) for z in range(-2, int(FRONT) - 3, 8)]


def build(k):
    # ------------------------------------------------------------- the hall
    k.floor('Floor', HALF * 2, FRONT - BACK, (0, 0, (FRONT + BACK) / 2))
    k.panel('Concrete', HALF * 2, HEIGHT, (0, HEIGHT / 2, BACK))
    k.panel('Concrete', HALF * 2, HEIGHT, (0, HEIGHT / 2, FRONT), math.pi)
    k.panel('Black', HALF * 2, FRONT - BACK, (0, HEIGHT, (FRONT + BACK) / 2), 0, math.pi / 2)
    # A plinth of concrete round the foot of every wall.
    for side in (-1, 1):
        k.box('Concrete', (0.3, 0.6, FRONT - BACK), (side * (HALF - 0.15), 0.3, (FRONT + BACK) / 2))
    # The roller door and the fire door in the front wall.
    k.panel('Panels', 7, 6, (-9, 3, FRONT - 0.05), math.pi)
    for y in range(0, 6):
        k.box('Steel', (7.2, 0.04, 0.06), (-9, 0.5 + y, FRONT - 0.08))
    k.box('Steel', (7.6, 0.6, 0.6), (-9, 6.3, FRONT - 0.3))
    k.panel('Panels', 1.2, 2.3, (8, 1.15, FRONT - 0.05), math.pi)
    k.box('Glow.Exit', (0.9, 0.3, 0.06), (8, 2.6, FRONT - 0.08))
    for side in (-1, 1):
        sx = side * HALF
        k.panel('Brick', FRONT - BACK, HEIGHT, (sx, HEIGHT / 2, (FRONT + BACK) / 2), -side * math.pi / 2)
        # Old paint down the lower wall, from the stage to the back.
        k.panel('Graffiti', FRONT - BACK - 14, 4.4, (sx - side * 0.04, 2.8, (FRONT + BACK + 14) / 2), -side * math.pi / 2)
        # Tall factory windows with iron frames and a sill, night outside.
        for z in range(-12, int(FRONT) - 5, 8):
            k.panel('Glass', 4.2, 5.6, (sx - side * 0.05, 8.7, z), -side * math.pi / 2)
            for i in range(-1, 2):
                k.box('Steel', (0.12, 5.7, 0.1), (sx - side * 0.1, 8.7, z + i * 1.4))
            for y in (5.9, 7.3, 8.7, 10.1, 11.5):
                k.box('Steel', (0.12, 0.1, 4.3), (sx - side * 0.1, y, z))
            k.box('Concrete', (0.5, 0.18, 4.6), (sx - side * 0.2, 5.82, z))
            k.box('Concrete', (0.4, 0.4, 4.8), (sx - side * 0.15, 11.75, z))
        # Sodium lamps on brackets between the windows.
        for z in range(-8, int(FRONT) - 8, 16):
            k.box('Steel', (0.6, 0.12, 0.12), (sx - side * 0.3, 9.6, z))
            k.box('Dark', (0.5, 0.28, 0.8), (sx - side * 0.6, 9.45, z), bevel=0.03)
            k.box('Glow.Sodium', (0.36, 0.05, 0.62), (sx - side * 0.6, 9.29, z))
        # Pipes along the wall, with brackets, and a pipe that drops into the floor.
        for y, r in ((4.0, 0.16), (4.45, 0.09), (12.6, 0.3)):
            k.rod('Steel', (sx - side * 0.4, y, BACK), (sx - side * 0.4, y, FRONT), r, 12)
        for z in range(-18, int(FRONT), 4):
            k.box('Steel', (0.5, 0.06, 0.08), (sx - side * 0.25, 3.8, z))
        k.tube('Steel', [(sx - side * 0.4, 4.0, FRONT - 2), (sx - side * 0.4, 3.6, FRONT - 1.6), (sx - side * 0.4, 0, FRONT - 1.5)], 0.16, 12)
        # Fuse boxes and a fire extinguisher by the door.
        for z in (-4.5, 14.5):
            k.box('Panels', (0.25, 1.2, 0.8), (sx - side * 0.14, 1.8, z), bevel=0.02)
        k.drum('Glow.Red', 0.09, 0.55, (sx - side * 0.3, 0.6, FRONT - 5), 12)
        k.box('Glow.Exit', (0.06, 0.32, 0.9), (sx - side * 0.07, 3.2, FRONT - 4))

        # The gallery: a grated floor on posts, a rail with a hazard edge, stairs at the back.
        inner = side * (HALF - GALLERY)
        z0, z1 = -2.0, FRONT - 4.0
        length, mid = z1 - z0, (z0 + z1) / 2
        k.box('Steel', (GALLERY, 0.25, length), (side * (HALF - GALLERY / 2), GALLERY_Y - 0.125, mid))
        k.box('Steel', (0.3, 0.55, length), (inner, GALLERY_Y - 0.4, mid))
        k.box('Hazard', (0.04, 0.2, length), (inner - side * 0.17, GALLERY_Y - 0.05, mid))
        z = z0
        while z <= z1 + 1e-3:
            k.rod('Steel', (inner + side * 0.15, 0, z), (inner + side * 0.15, GALLERY_Y - 0.3, z), 0.13, 10)
            k.rod('Steel', (inner + side * 0.1, GALLERY_Y, z), (inner + side * 0.1, GALLERY_Y + 1.1, z), 0.03, 6)
            k.box('Steel', (GALLERY, 0.3, 0.2), (side * (HALF - GALLERY / 2), GALLERY_Y - 0.4, z))
            z += 4
        for y in (0.55, 1.1):
            k.rod('Steel', (inner + side * 0.1, GALLERY_Y + y, z0), (inner + side * 0.1, GALLERY_Y + y, z1), 0.025, 6)
        for i in range(16):
            k.box('Steel', (1.2, 0.08, 0.32), (inner - side * 0.7, (i + 1) * GALLERY_Y / 16, z1 + 0.3 * (16 - i)))
        k.rod('Steel', (inner - side * 1.3, 1.0, z1 + 4.8), (inner - side * 1.3, GALLERY_Y + 1.0, z1), 0.025, 6)
        # Lamps along the gallery's underside.
        for z in range(2, int(FRONT) - 5, 8):
            k.box('Glow.Sodium', (0.3, 0.04, 0.3), (side * (HALF - GALLERY / 2), GALLERY_Y - 0.27, z))

    # Roof: trusses across the hall, ducts along it, skylights between the trusses.
    z = -16.0
    while z <= FRONT - 2:
        k.truss('Steel', (-HALF, HEIGHT - 0.6, z), (HALF, HEIGHT - 0.6, z), 0.9)
        z += 7
    for x in (-10, 10):
        k.rod('Steel', (x, HEIGHT - 1.8, BACK), (x, HEIGHT - 1.8, FRONT), 0.45, 16)
        for z in range(-18, int(FRONT), 6):
            k.box('Steel', (1.0, 0.08, 0.08), (x, HEIGHT - 1.3, z))
            k.rod('Steel', (x, HEIGHT - 1.3, z), (x, HEIGHT, z), 0.02, 4)
    for z in (-6.5, 7.5, 21.5, 35.5, 49.5, 63.5):
        k.panel('Glass', 18, 4.5, (0, HEIGHT - 0.02, z), 0, math.pi / 2)

    # Pillars down both sides, with hazard bands and a red light on each.
    for x, z in PILLARS:
        k.box('Concrete', (0.9, HEIGHT, 0.9), (x, HEIGHT / 2, z), bevel=0.03)
        k.box('Hazard', (0.94, 1.1, 0.94), (x, 0.55, z))
        k.box('Glow.Red', (0.12, 0.12, 0.05), (x, 3.1, z + 0.47))
        k.box('Steel', (1.2, 0.5, 1.2), (x, HEIGHT - 1.6, z))

    # The old gantry crane: rails on brackets along both walls, a bridge across the hall with its
    # trolley and hoist, the hook hanging on chains.
    for side in (-1, 1):
        k.box('Crane', (0.5, 0.7, FRONT - BACK), (side * (HALF - 0.7), 10.6, (FRONT + BACK) / 2))
        for z in range(int(BACK) + 4, int(FRONT), 8):
            k.box('Steel', (1.0, 0.3, 0.3), (side * (HALF - 0.5), 10.1, z))
            k.rod('Steel', (side * (HALF - 0.2), 9.6, z), (side * (HALF - 0.8), 10.1, z), 0.06, 6)
    k.box('Crane', (HALF * 2 - 1.4, 1.1, 0.9), (0, 11.2, 27), bevel=0.03)
    k.box('Crane', (HALF * 2 - 1.4, 1.1, 0.9), (0, 11.2, 28.6), bevel=0.03)
    for x in (-HALF + 1, HALF - 1):
        k.box('Crane', (1.2, 1.4, 2.6), (x, 11.0, 27.8), bevel=0.03)
    k.box('Hazard', (HALF * 2 - 1.6, 0.25, 0.04), (0, 10.78, 26.53))
    k.box('Crane', (2.0, 1.0, 2.4), (-4, 11.9, 27.8), bevel=0.03)
    k.box('Dark', (1.2, 1.0, 1.0), (-4, 10.4, 27.8), bevel=0.03)
    k.drum('Steel', 0.35, 0.9, (-4, 10.0, 27.8), 16)
    for dx in (-0.12, 0.12):
        k.rod('Chrome', (-4 + dx, 10.0, 27.8), (-4 + dx, 6.8, 27.8), 0.022, 5)
    k.box('Hazard', (0.9, 0.5, 0.5), (-4, 6.55, 27.8), bevel=0.04)
    k.torus('Steel', 0.24, 0.07, (-4, 6.0, 27.8), 0, math.pi / 2, 20, 8, math.pi * 1.5)
    # Chains hanging from the roof here and there.
    for x, z, length in ((-12, 4, 4), (9, 14, 3), (-6, 33, 5), (14, 36, 3.5), (-19, 18, 2.5), (-11, 47, 4), (12, 57, 3), (-16, 66, 3.5)):
        k.rod('Chrome', (x, HEIGHT - 0.6, z), (x, HEIGHT - 0.6 - length, z), 0.02, 4)
        k.torus('Chrome', 0.08, 0.02, (x, HEIGHT - 0.7 - length, z), 0, math.pi / 2, 12, 5)

    # ------------------------------------------------------------- the stage
    k.box('Black', (26, DECK, STAGE_FRONT - BACK), (0, DECK / 2, (STAGE_FRONT + BACK) / 2))
    k.floor('Wood', 25.9, STAGE_FRONT - BACK - 0.2, (0, DECK + 0.005, (STAGE_FRONT + BACK) / 2))
    k.box('Alu', (26, 0.05, 0.06), (0, DECK, STAGE_FRONT + 0.01))
    k.own('LED_lip', 'LED.lip', lambda b: k.panel('LED.lip', 25.6, 0.32, (0, DECK - 0.22, STAGE_FRONT + 0.02), b=b))
    k.data['screens']['LED.lip'] = {'w': 25.6, 'h': 0.32}
    # Stairs up the side of the stage.
    for i in range(5):
        k.box('Black', (1.4, DECK / 5 * (i + 1), 0.32), (13.7, DECK / 10 * (i + 1), STAGE_FRONT - 2 - i * 0.32))
    # The LED wall on its scaffolding, columns of LEDs either side.
    x = -13.5
    while x <= 13.6:
        k.rod('Steel', (x, 0, BACK + 2.0), (x, 12.2, BACK + 2.0), 0.06, 6)
        x += 3
    for y in (1.6, 11.6):
        k.truss('Steel', (-13.6, y, BACK + 1.9), (13.6, y, BACK + 1.9), 0.35)
    k.box('Black', (26.6, 10.1, 0.3), (0, 6.75, BACK + 2.2))
    k.own('LED_wall', 'LED.wall', lambda b: k.panel('LED.wall', 26, 9.5, (0, 6.75, BACK + 2.37), b=b))
    k.data['screens']['LED.wall'] = {'w': 26, 'h': 9.5}
    for side, name in ((-1, 'LED_column_L'), (1, 'LED_column_R')):
        yaw = side * -0.35
        cx, cz = side * 15.6, BACK + 2.6
        k.box('Black', (3.5, 11.6, 0.35), (cx, 6.3, cz), yaw)
        k.truss('Steel', (cx - math.cos(yaw) * 1.8, 0, cz + math.sin(yaw) * 1.8 - 0.4), (cx - math.cos(yaw) * 1.8, 12.4, cz + math.sin(yaw) * 1.8 - 0.4), 0.3)
        k.own(name, 'LED.column', lambda b, cx=cx, cz=cz, yaw=yaw: k.panel('LED.column', 3.2, 11.2, (cx + math.sin(yaw) * 0.18, 6.3, cz + math.cos(yaw) * 0.18), yaw, b=b))
    k.data['screens']['LED.column'] = {'w': 3.2, 'h': 11.2}

    # The DJ's riser with steps and a lit edge, the booth on it.
    k.box('Black', (7, DJ_RISE, 4), (0, DECK + DJ_RISE / 2, DJ_FRONT - 2))
    k.floor('Wood', 6.9, 3.9, (0, DECK + DJ_RISE + 0.005, DJ_FRONT - 2))
    k.box('Glow.Edge', (7, 0.03, 0.03), (0, DECK + DJ_RISE - 0.02, DJ_FRONT + 0.01))
    for i in range(4):
        k.box('Black', (1.4, DJ_RISE / 4 * (i + 1), 0.3), (4.3, DECK + DJ_RISE / 8 * (i + 1), DJ_FRONT - 0.15 - (3 - i) * 0.3))
    k.dj_booth((0, DECK + DJ_RISE, DJ_FRONT - 0.9), 0, 3.6, 'booth')
    k.mark('dj', (0, DECK + DJ_RISE, DJ_FRONT - 1.65))

    # The band at the front, each player on a podium the game lifts with the music: singer in the
    # middle, guitar and bass either side with their amps, drums at the back left, wedges along
    # the front.
    k.podium('vox', (0, DECK, -10.1), 1.05, 1.05, 0.3, 0.9)
    for side, part in ((-1, 'lead'), (1, 'bass')):
        k.podium(part, (side * 4.6, DECK, -10.4), 1.0, 1.0, 0.3, 0.7, pedals=True)
    k.podium('drums', (-8.6, DECK, -14.1), 1.8, 1.4, 0.5, 0.6, mic=False)
    for side in (-1, 1):
        k.amp((side * 6.0, DECK, -12.3), side * -0.15)
        k.amp((side * 6.9, DECK, -12.5), side * -0.2, 1)
    for x in (-4.6, -0.6, 0.6, 4.6):
        k.wedge((x, DECK, STAGE_FRONT - 0.7), 0)
    # Cable runs across the deck.
    for x in (-4.6, 0, 4.6):
        k.tube('Rubber', [(x * 0.8, DECK + 0.02, -11.5), (x * 0.4, DECK + 0.02, -15.5)], 0.015, 5)

    # The rig: the main truss over the stage's front on legs, the back truss over the wall.
    k.truss('Steel', (-14, 11, STAGE_FRONT - 0.5), (14, 11, STAGE_FRONT - 0.5), 0.55)
    k.truss('Steel', (-14, 12.2, BACK + 3.2), (14, 12.2, BACK + 3.2), 0.55)
    for x in (-14, 14):
        k.truss('Steel', (x, 0, STAGE_FRONT - 0.5), (x, 11, STAGE_FRONT - 0.5), 0.55)
        k.box('Steel', (1.2, 0.08, 1.2), (x, 0.04, STAGE_FRONT - 0.5))
        k.truss('Steel', (x, 11, STAGE_FRONT - 0.5), (x, 12.2, BACK + 3.2), 0.4)
    # Strobes along the main truss: housings here, their faces the game flashes.
    k.proto('strobe', 'Glow.Strobe', lambda b: k.box('Glow.Strobe', (0.82, 0.3, 0.04), (0, 0, 0.03), b=b))
    for i in range(14):
        x = -13 + 26 * i / 13
        k.box('Black', (0.95, 0.42, 0.22), (x, 10.55, STAGE_FRONT - 0.3), bevel=0.02)
        k.instance('strobe', (x, 10.55, STAGE_FRONT - 0.18))
    # Moving heads: on the main truss into the crowd, on the back truss over it, along the deck's
    # front pointing up.
    for i in range(12):
        x = -12.5 + 25 * i / 11
        k.moving_head((x, 10.45, STAGE_FRONT - 0.5), (x * 0.02, -0.55, 0.83), 'Front', 30, 0.05)
    for i in range(10):
        x = -12 + 24 * i / 9
        k.moving_head((x, 11.7, BACK + 3.2), (x * 0.025, 0.05, 1), 'Back', 52, 0.022)
    for i in range(8):
        x = -10.5 + 3 * i
        k.moving_head((x, DECK + 0.3, STAGE_FRONT - 0.45), (x * 0.03, 1, 0.25), 'Floor', 13, 0.06)
    # Laser heads on the deck's front and the main truss.
    for x in (-10, -6, -2, 2, 6, 10):
        k.box('Dark', (0.35, 0.2, 0.3), (x, DECK + 0.1, STAGE_FRONT - 0.25), bevel=0.02)
        k.box('Glow.Green', (0.12, 0.05, 0.01), (x, DECK + 0.12, STAGE_FRONT - 0.09))
        k.source('laser.deck', (x, DECK + 0.25, STAGE_FRONT - 0.2))
    for x in (-12, -5, 5, 12):
        k.box('Dark', (0.4, 0.25, 0.35), (x, 10.85, STAGE_FRONT - 0.3), bevel=0.02)
        k.source('laser.truss', (x, 10.7, STAGE_FRONT - 0.3))
    k.source('laser.wall', (0, 6.2, BACK + 2.6))
    # More laser heads for the show: on top of the back truss, on the side walls between the
    # windows, under the spine and high on the hall's back wall, aimed at the stage.
    def laser_head(at, size=(0.4, 0.22, 0.4)):
        k.box('Dark', size, at, bevel=0.02)
        k.box('Glow.Green', (0.1, 0.04, 0.1), (at[0], at[1] - size[1] / 2 - 0.01, at[2]))
    for x in (-8, -8 / 3, 8 / 3, 8):
        k.box('Dark', (0.4, 0.22, 0.4), (x, 12.6, BACK + 3.2), bevel=0.02)
        k.source('laser.back', (x, 12.75, BACK + 3.2))
    for side in (-1, 1):
        for z in (0, 16, 32, 48):
            k.box('Steel', (0.5, 0.06, 0.3), (side * (HALF - 0.25), 8.82, z))
            laser_head((side * (HALF - 0.4), 9.0, z), (0.3, 0.3, 0.4))
            k.source('laser.side', (side * (HALF - 0.6), 9.0, z))
    for z in (5, 21, 37, 53):
        k.box('Steel', (2.6, 0.08, 0.08), (0, 12.6, z))
        laser_head((0, 12.45, z))
        k.source('laser.spine', (0, 12.25, z))
    for x in (-4, 4):
        k.box('Steel', (0.6, 0.06, 0.5), (x, 9.82, FRONT - 0.25))
        laser_head((x, 10.0, FRONT - 0.3), (0.4, 0.3, 0.3))
        k.source('laser.rear', (x, 10.0, FRONT - 0.5))

    # The light bars over the floor: trusses on chains from the roof, a moving head pair on each,
    # the bars themselves (repeated by the game, which winches them up and down) and their cables.
    for z in BAR_Z:
        k.truss('Steel', (-20, BAR_TOP, z), (20, BAR_TOP, z), 0.35)
        for x in (-20, 20):
            k.rod('Chrome', (x, BAR_TOP, z), (x, HEIGHT - 0.6, z), 0.015, 4)
        for x in (-12, 0, 12):
            k.moving_head((x + (4 if z % 12 else -4), BAR_TOP - 0.42, z), (0, -1, 0.05), 'Rig', 16, 0.06)
        for x in BAR_X:
            k.instance('bar', (x, 10, z))
            for dx in (-2.4, 2.4):
                k.box('Dark', (0.18, 0.18, 0.18), (x + dx, BAR_TOP - 0.25, z), bevel=0.02)
    k.proto('bar', 'Glow.Bar', lambda b: (k.box('Glow.Bar', (5.0, 0.07, 0.07), (0, 0, 0), b=b)))
    k.proto('barcase', 'Dark', lambda b: [k.box('Dark', (5.2, 0.12, 0.12), (0, 0.06, 0), b=b), k.box('Dark', (0.14, 0.2, 0.14), (-2.4, 0.12, 0), b=b), k.box('Dark', (0.14, 0.2, 0.14), (2.4, 0.12, 0), b=b)])
    k.proto('cable', 'Black', lambda b: k.rod('Black', (0, 0, 0), (0, 1, 0), 0.012, 4, b=b))
    # The spine: two trusses down the middle of the hall, hung on chains, heads along both.
    for x in (-1.3, 1.3):
        k.truss('Steel', (x, 12.7, -6), (x, 12.7, FRONT - 6), 0.45)
        for z in range(-4, int(FRONT) - 5, 8):
            k.rod('Chrome', (x, 12.9, z), (x, HEIGHT - 0.6, z), 0.015, 4)
        for i, z in enumerate(range(-4, int(FRONT) - 6, 6)):
            k.moving_head((x, 12.25, z + (1 if x > 0 else -1)), (x * 0.25, -1, -0.12), 'Spine', 15, 0.035)
    for z in range(-4, int(FRONT) - 5, 6):
        k.box('Steel', (2.6, 0.08, 0.08), (0, 12.7, z))
    # LED cubes hanging in two rows down the hall, either side of the spine.
    def cube(b, at):
        # Each of the four sides is a screen of its own: a panel facing out, its uvs 0..1.
        for yaw, dx, dz in ((0, 0, 1.3), (math.pi / 2, 1.3, 0), (math.pi, 0, -1.3), (-math.pi / 2, -1.3, 0)):
            k.panel('LED.cube', 2.6, 2.6, (at[0] + dx, at[1], at[2] + dz), yaw, b=b)
    n = 0
    for x in (-8.2, 8.2):
        for z in (3, 11, 19, 27, 35, 43, 51, 59):
            y = 9.6
            k.own('LED_cube_%d' % n, 'LED.cube', lambda b, at=(x, y, z): cube(b, at))
            n += 1
            k.box('Black', (2.75, 0.12, 2.75), (x, y + 1.36, z))
            k.box('Black', (2.75, 0.12, 2.75), (x, y - 1.36, z))
            for dx, dz in ((-1.2, -1.2), (1.2, -1.2), (-1.2, 1.2), (1.2, 1.2)):
                k.rod('Chrome', (x + dx, y + 1.4, z + dz), (x + dx, HEIGHT - 0.6, z + dz), 0.012, 4)
    k.data['screens']['cube'] = {'w': 2.6, 'h': 2.6}
    # The emblem before the wall: a ring of glowing bars, long and short, like a sound wave bent
    # into a circle.
    def emblem(b):
        for i in range(48):
            a = i / 48 * math.tau
            length = 1.0 + 2.6 * abs(math.sin(i * 0.5) * math.cos(i * 1.3 + 0.4)) + (1.2 if i % 12 == 0 else 0)
            r0, r1 = 1.5, 1.5 + length
            c, s_ = math.cos(a), math.sin(a)
            k.rod('Glow.Emblem', (c * r0, 6.9 + s_ * r0, BACK + 2.75), (c * r1, 6.9 + s_ * r1, BACK + 2.75), 0.045, 6, cap=True, b=b)
        k.torus('Glow.Emblem', 1.25, 0.05, (0, 6.9, BACK + 2.75), 0, math.pi / 2, 48, 6, b=b)
    k.own('Move_emblem', 'Glow.Emblem', emblem)
    # The moon through the windows (beams without bodies).
    for side in (-1, 1):
        for z in (-4, 12, 28, 44, 60):
            k.moving_head((side * (HALF - 0.4), 9.5, z), (-side * 0.75, -0.62, 0.15), 'Moon', 26, 0.09, body=False)

    # Rows of small lamps along the edges: the galleries' rails, the crane's bridge, the stage's
    # lip, the main truss, the wall's frame (the game lights them, see Bulbs).
    k.proto('bulb', 'Glow.Bulb', lambda b: k.sphere('Glow.Bulb', 0.06, (0, 0, 0), 8, 5, b=b))
    for side in (-1, 1):
        z = -2.0
        while z <= FRONT - 4:
            k.instance('bulb', (side * (HALF - GALLERY) - side * 0.2, GALLERY_Y - 0.22, z))
            z += 0.5
    x = -HALF + 1.5
    while x <= HALF - 1.5:
        k.instance('bulb', (x, 10.6, 26.5))
        x += 0.5
    x = -12.8
    while x <= 12.8:
        k.instance('bulb', (x, DECK + 0.06, STAGE_FRONT + 0.06))
        k.instance('bulb', (x, 11.35, STAGE_FRONT - 0.2))
        k.instance('bulb', (x, 11.75, BACK + 2.45))
        x += 0.4
    for sx in (-13.25, 13.25):
        y = 2.0
        while y <= 11.5:
            k.instance('bulb', (sx, y, BACK + 2.45))
            y += 0.4
    # ------------------------------------------------------------- the floor
    k.barrier((-15, 0, STAGE_FRONT + 2.6), (15, 0, STAGE_FRONT + 2.6))
    for side in (-1, 1):
        k.speaker_stack((side * 15.2, 0, STAGE_FRONT + 0.6), side * -0.15, 3, 2)
        k.speaker_stack((side * 16.6, 0, STAGE_FRONT + 0.2), side * -0.2, 3, 0)
        k.road_cases((side * 20.5 - (3.5 if side > 0 else 0), 0, BACK + 1.2), 0, 5, side + 3)
        k.road_cases((side * 22.5, 0, FRONT - 6), math.pi / 2 * side, 4, side + 7)
        k.line_array((side * 16.5, 11.6, STAGE_FRONT + 0.3), side * -0.15, 9, 1.0, 2.2)
    k.foh((0, 0, 30), math.pi, roof=False)
    # Cold sparks along the deck's front, CO2 jets, confetti from the wings.
    for x in (-11, -6.5, -2.2, 2.2, 6.5, 11):
        k.box('Dark', (0.4, 0.15, 0.4), (x, DECK + 0.075, STAGE_FRONT - 0.3), bevel=0.02)
        k.source('sparks', (x, DECK, STAGE_FRONT - 0.3))
    for x in (-12, -7, 7, 12):
        k.drum('Dark', 0.12, 0.4, (x, DECK, STAGE_FRONT - 0.6), 12)
        k.source('co2', (x, DECK, STAGE_FRONT - 0.6))
    for side in (-1, 1):
        k.rod('Dark', (side * 13, 9, STAGE_FRONT), (side * 12.8, 9.3, STAGE_FRONT + 0.3), 0.12, 10, cap=True)
        k.source('confetti', (side * 13, 9, STAGE_FRONT))

    return {
        'ao': 2.5,
        'views': {
            'front': ((0, 3.2, 30), (0, 5.5, -14), 70),
            'hero': ((4.5, 7.2, 68), (-1, 4.5, -10), 56),
            'stage': ((0, 4, 2), (0, 3, -12), 70),
            'booth': ((1.6, 4.0, DJ_FRONT + 2.4), (0, DECK + DJ_RISE + 0.9, DJ_FRONT - 1), 56),
            'gallery': ((-HALF + 2.2, GALLERY_Y + 1.7, 30), (2, 3, -8), 70),
        },
    }
