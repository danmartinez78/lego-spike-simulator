"""Adds a lifting arm to Driving Base 3: a medium motor on port F lying on top
of the hub, turning an arm that sticks out in front of the robot.

Usage: python make_db3_arm.py <DrivingBase3.mpd> <out.mpd>

The motor is the one Driving Base 3 already embeds (54696). The arm is a
simple box with a paddle at its tip, drawn here in LDraw units in the main
model's coordinates (y is down, the front of the robot is -z). It is marked
with !SPIKE_ROTATES so the simulator turns it with motor F (docs/robots.md).
Running motor F clockwise (positive degrees) lowers the arm.
"""
import math
import sys

src_path, out_path = sys.argv[1:3]
text = open(src_path, encoding='utf-8').read().replace('\r\n', '\n')

# Motor on top of the hub (hub top is y = -158), output axle along +x.
MX, MY, MZ = 158, -188, -100
# Arm: 20 LDU (8 mm) square beam from just behind the axle to 260 LDU in front.
AX0, AX1 = MX + 50, MX + 70
AY0, AY1 = MY - 10, MY + 10
AZ0, AZ1 = MZ - 260, MZ + 20
# Paddle at the tip, hanging down 60 LDU, 100 LDU wide.
PX0, PX1 = (AX0 + AX1) / 2 - 50, (AX0 + AX1) / 2 + 50
PY0, PY1 = AY1, AY1 + 60
PZ0, PZ1 = AZ0, AZ0 + 16


def box(x0, x1, y0, y1, z0, z1):
    v = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    edges = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]
    out = []
    for f in faces:
        out.append('4 16 ' + ' '.join(f'{c:g}' for i in f for c in v[i]))
    for a, b in edges:
        out.append('2 24 ' + ' '.join(f'{c:g}' for c in v[a] + v[b]))
    return out


def holes(x, y_mid, z0, z1):
    # Beam holes drawn as circles on a side face, every 20 LDU (one stud).
    out = []
    z = z0 + 10
    while z <= z1 - 10:
        pts = [(x, y_mid + 6 * math.cos(t * math.pi / 6), z + 6 * math.sin(t * math.pi / 6)) for t in range(13)]
        for a, b in zip(pts, pts[1:]):
            out.append('2 24 ' + ' '.join(f'{c:.3f}' for c in a + b))
        z += 20
    return out


arm = ['0 FILE arm.ldr', '0 Arm', '0 Name: arm.ldr', '0 Author: lego-spike-simulator']
arm += box(AX0, AX1, AY0, AY1, AZ0, AZ1)
arm += holes(AX0 - 0.1, MY, AZ0, AZ1) + holes(AX1 + 0.1, MY, AZ0, AZ1)
arm += box(PX0, PX1, PY0, PY1, PZ0, PZ1)

lines = text.split('\n')
end = lines.index('', 1)  # end of main.ldr
added = [
    '0 !SPIKE_PORT main F',
    f'1 15 {MX} {MY} {MZ} 0 -1 0 1 0 0 0 0 1 54696.dat',
    # Pivot on the motor's axle; turning about +x lowers the front of the arm.
    f'0 !SPIKE_ROTATES main F {MX + 60} {MY} {MZ} 1 0 0 1',
    '1 4 0 0 0 1 0 0 0 1 0 0 0 1 arm.ldr',
]
lines[end:end] = added
lines[0:3] = ['0 FILE main.ldr', '0 Driving Base 3 with arm', '0 Name: main.ldr']
result = '\n'.join(lines).rstrip('\n') + '\n\n' + '\n'.join(arm) + '\n'
open(out_path, 'w', encoding='utf-8', newline='\n').write(result)
print('wrote', out_path)
