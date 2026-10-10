"""Builds the skill practice fields (mat image, robot start and obstacles).

Usage: python make_fields.py <output dir>

Mats are drawn at 1 pixel per mm on a 2360 x 1140 mm field, using the
LEGO colours the simulator's colour sensor recognises. Positions use the
simulator's convention: x across, z down the mat image, origin in the middle.
The robot faces up the mat at rotation 180; heading h (0 = up, 90 = right)
is rotation 180 - h.
"""

import io
import json
import math
import os
import sys
import zipfile

from PIL import Image, ImageDraw, ImageFont

W, H = 2360, 1140
WHITE = (244, 244, 244)
BLACK = (0, 0, 0)
RED = (180, 0, 0)
BLUE = (30, 90, 168)
GREEN = (0, 133, 43)
YELLOW = (250, 200, 10)
GREY = (150, 150, 150)
LIGHT = (205, 205, 205)

OUT = sys.argv[1] if len(sys.argv) > 1 else 'fields'
os.makedirs(OUT, exist_ok=True)


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def px(x):
    return x + W / 2


def pz(z):
    return z + H / 2


def rotation(heading):
    return (180 - heading) % 360


class Field:
    def __init__(self, name):
        self.name = name
        self.image = Image.new('RGB', (W, H), WHITE)
        self.draw = ImageDraw.Draw(self.image)
        self.objects = []
        self.models = {}
        self.robot = (0, 0, 0)

    def label(self, x, z, text, size=40, fill=GREY, anchor='mm'):
        self.draw.text((px(x), pz(z)), text, fill=fill, font=font(size), anchor=anchor)

    def title(self, text):
        self.label(0, -H / 2 + 45, text, 46, GREY)

    def start_box(self, x, z, heading, w=200, l=220, label='START'):
        f = (math.sin(math.radians(heading)), -math.cos(math.radians(heading)))
        s = (-f[1], f[0])
        pts = [
            (x + f[0] * a + s[0] * b, z + f[1] * a + s[1] * b)
            for a, b in ((l / 2, w / 2), (l / 2, -w / 2), (-l / 2, -w / 2), (-l / 2, w / 2))
        ]
        self.draw.polygon([(px(a), pz(b)) for a, b in pts], outline=GREY, width=5)
        self.label(x - f[0] * (l / 2 + 30), z - f[1] * (l / 2 + 30), label, 30, GREY)
        self.robot = (x, z, rotation(heading))

    def line(self, points, width=20, fill=BLACK):
        self.draw.line([(px(x), pz(z)) for x, z in points], fill=fill, width=width, joint='curve')
        r = width / 2
        for x, z in (points[0], points[-1]):
            self.draw.ellipse([px(x) - r, pz(z) - r, px(x) + r, pz(z) + r], fill=fill)

    def arc_points(self, cx, cz, radius, start, end, steps=60):
        return [
            (
                cx + radius * math.cos(math.radians(start + (end - start) * i / steps)),
                cz + radius * math.sin(math.radians(start + (end - start) * i / steps)),
            )
            for i in range(steps + 1)
        ]

    def rect(self, x, z, w, h, fill):
        self.draw.rectangle([px(x - w / 2), pz(z - h / 2), px(x + w / 2), pz(z + h / 2)], fill=fill)

    def wall(self, name, x, z, length_mm, heading=0, layers=6, colour=4):
        """A wall of 1x8 bricks, along the given heading (0 = runs up/down)."""
        count = max(1, round(length_mm / 64))
        lines = ['0 FILE main.ldr', '0 main', '0 Name: main.ldr']
        for layer in range(layers):
            for i in range(count):
                offset = (i - (count - 1) / 2) * 160
                # 3008 runs along x; turn it to run along z for an up/down wall.
                lines.append(f'1 {colour} 0 {-24 * (layer + 1)} {offset:g} 0 0 1 0 1 0 -1 0 0 3008.dat')
        self.models[name] = '\n'.join(lines) + '\n'
        # Grey footprint on the mat so the wall's place is visible from above.
        along = (math.sin(math.radians(heading)), -math.cos(math.radians(heading)))
        half = count * 64 / 2
        self.draw.line(
            [
                (px(x - along[0] * half), pz(z - along[1] * half)),
                (px(x + along[0] * half), pz(z + along[1] * half)),
            ],
            fill=LIGHT,
            width=26,
        )
        height = layers * 24 * 0.4
        self.objects.append(
            {
                'anchored': True,
                'position': {'x': x, 'y': height / 2, 'z': z},
                'rotation': (-heading) % 360,
                'name': name,
            }
        )

    def block(self, name, x, z, colour=1, size=2):
        """A cube of 2x4 bricks (about 6.4 cm square, size layers high) to push or detect."""
        lines = ['0 FILE main.ldr', '0 main', '0 Name: main.ldr']
        for layer in range(size + 1):
            for col in (-40, 40):
                for row in (-60, -20, 20, 60):
                    lines.append(f'1 {colour} {col} {-24 * (layer + 1)} {row} 1 0 0 0 1 0 0 0 1 3001.dat')
        self.models[name] = '\n'.join(lines) + '\n'
        self.objects.append(
            {'anchored': False, 'position': {'x': x, 'y': (size + 1) * 24 * 0.4 / 2, 'z': z}, 'rotation': 0, 'name': name}
        )

    def save(self):
        mat = io.BytesIO()
        self.image.save(mat, 'JPEG', quality=92)
        x, z, rot = self.robot
        scene = {
            'version': 1,
            'robot': {
                'anchored': False,
                'position': {'x': x, 'y': 36.00000047683716, 'z': z},
                'rotation': rot,
                'name': '#robot',
            },
            'matWidth': W,
            'matHeight': H,
            'objects': self.objects,
        }
        path = os.path.join(OUT, f'{self.name}.spk')
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('mat.jpg', mat.getvalue())
            zf.writestr('scene.json', json.dumps(scene))
            for name, model in self.models.items():
                zf.writestr(f'bricks-{name}', model)
        print('wrote', path)


# 1. Line course ------------------------------------------------------------
f = Field('Practice - line course')
f.title('LINE COURSE')
f.start_box(-950, 350, 0)
path = [(-950, 230), (-950, -150)]
path += f.arc_points(-750, -150, 200, 180, 270)[1:]  # turn right at the top
path += [(-450, -350)]
path += f.arc_points(-450, -200, 150, 270, 360)[1:]  # curve down
path += [(-300, 50)]
path += f.arc_points(-150, 50, 150, 180, 90, 40)[1:]  # S-bend
path += f.arc_points(-150, 350, 150, 270, 360, 40)[1:]
f.line(path)
# Straight with a gap, then a T-junction
f.line([(0, 350), (0, 380), (250, 380)])
f.line([(330, 380), (650, 380)])  # 8 cm gap before this
f.label(290, 440, 'gap', 28)
f.line([(650, 380), (650, -300)])
f.line([(450, -300), (850, -300)])  # T-junction
f.label(650, -360, 'T-junction', 28)
f.rect(850, -300, 80, 80, GREEN)
f.rect(450, -300, 80, 80, RED)
f.label(950, -300, 'finish', 28, anchor='lm')
f.save()

# 2. Colour stops -----------------------------------------------------------
f = Field('Practice - colour stops')
f.title('COLOUR STOPS')
f.start_box(-900, 380, 0)
lane = [(RED, -150), (BLUE, -350), (GREEN, 0), (YELLOW, 150)]
# Lane 1: coloured patches straight ahead of the start
for colour, z in [(GREEN, 120), (BLUE, -60), (YELLOW, -240), (RED, -420)]:
    f.rect(-900, z, 220, 50, colour)
f.label(-1100, 120, '30 cm', 26)
f.label(-1100, -60, '48 cm', 26)
f.label(-1100, -240, '66 cm', 26)
f.label(-1100, -420, '84 cm', 26)
# Lane 2: count the black lines
f.start_box(-300, 380, 0, label='START 2')
for i in range(6):
    f.rect(-300, 150 - i * 100, 220, 20, BLACK)
f.label(-170, -350, 'count the lines', 28, anchor='lm')
# Lane 3: grey-scale strip for reading reflected light values
f.start_box(400, 380, 0, label='START 3')
for i, shade in enumerate([230, 190, 150, 110, 70, 30]):
    f.rect(400, 170 - i * 110, 220, 100, (shade, shade, shade))
f.label(620, -380, 'light to dark', 28, anchor='lm')
f.save()

# 3. Accuracy targets -------------------------------------------------------
f = Field('Practice - accuracy targets')
f.title('ACCURACY TARGETS')
f.start_box(-950, 300, 0)


def target(x, z, name):
    for r, colour in ((100, (210, 225, 245)), (60, (150, 185, 235)), (30, BLUE)):
        f.draw.ellipse([px(x - r), pz(z - r), px(x + r), pz(z + r)], fill=colour)
    f.draw.ellipse([px(x - 6), pz(z - 6), px(x + 6), pz(z + 6)], fill=BLACK)
    f.label(x, z - 130, name, 34, (60, 60, 60))


targets = [('A', -950, -150), ('B', -500, -150), ('C', -500, 300), ('D', 200, -250), ('E', 800, 200)]
for name, x, z in targets:
    target(x, z, name)
f.label(0, H / 2 - 40, 'rings: 3 cm, 6 cm, 10 cm from the centre', 28)
f.save()

# 4. Turn practice ----------------------------------------------------------
f = Field('Practice - turn rose')
f.title('TURN PRACTICE')
cx, cz = 0, 60
for angle in range(0, 360, 15):
    length = 460 if angle % 90 == 0 else (400 if angle % 45 == 0 else 330)
    width = 8 if angle % 90 == 0 else (5 if angle % 45 == 0 else 3)
    # heading angle: 0 = up, clockwise
    x = cx + length * math.sin(math.radians(angle))
    z = cz - length * math.cos(math.radians(angle))
    f.draw.line([(px(cx), pz(cz)), (px(x), pz(z))], fill=(90, 90, 90), width=width)
    lx = cx + (length + 40) * math.sin(math.radians(angle))
    lz = cz - (length + 40) * math.cos(math.radians(angle))
    if angle % 45 == 0:
        f.label(lx, lz, f'{angle}°', 32, (40, 40, 40))
for r in (150, 300):
    f.draw.ellipse([px(cx - r), pz(cz - r), px(cx + r), pz(cz + r)], outline=LIGHT, width=4)
f.robot = (cx, cz, rotation(0))
f.save()

# 5. Wall course ------------------------------------------------------------
f = Field('Practice - wall course')
f.title('WALL COURSE  (use the robot with a distance sensor)')
f.start_box(-950, 330, 0)
# A wall straight ahead to stop in front of
f.wall('Wall ahead', -950, -330, 400, heading=90)
f.label(-950, -260, 'stop 10 cm before the wall', 26)
# A corridor to drive through
f.wall('Corridor left', -300, 0, 600, heading=0)
f.wall('Corridor right', 0, 0, 600, heading=0)
f.start_box(-150, 380, 0, label='START 2')
# Obstacles to find and avoid
f.block('Obstacle 1', 500, -150, colour=14)
f.block('Obstacle 2', 800, 200, colour=14)
f.label(650, 420, 'find the obstacles', 28)
f.robot = (-950, 330, rotation(0))
f.save()

# 6. Mini mission board -----------------------------------------------------
f = Field('Practice - mini missions')
f.title('MINI MISSIONS')
# Home area like an FLL launch area
f.draw.pieslice([px(-1180 - 450), pz(570 - 450), px(-1180 + 450), pz(570 + 450)], 270, 360, fill=(245, 215, 215))
f.draw.arc([px(-1180 - 450), pz(570 - 450), px(-1180 + 450), pz(570 + 450)], 270, 360, fill=RED, width=10)
f.label(-1000, 480, 'HOME', 34, RED)
f.robot = (-960, 330, rotation(30))
# Guide lines
f.line([(-700, 200), (-200, 200)])
f.line([(-200, 200), (-200, -300)])
# Parking boxes
for name, x, z, colour in (('P1', 300, -300, BLUE), ('P2', 700, 250, GREEN)):
    f.draw.rectangle([px(x - 110), pz(z - 110), px(x + 110), pz(z + 110)], outline=colour, width=10)
    f.label(x, z, f'park {name}', 30, colour)
# Cubes to drive up to and stop beside (the simulator doesn't push objects)
f.block('Cube 1', -450, -120, colour=4, size=1)
f.block('Cube 2', 100, 0, colour=1, size=1)
f.label(-450, -40, 'stop beside cube 1', 24, (120, 120, 120))
f.label(100, 80, 'stop beside cube 2', 24, (120, 120, 120))
f.save()
