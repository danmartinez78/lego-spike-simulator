"""Builds the practice scenes (mat image + robot start) used by the examples.

Usage: python make_scenes.py <output dir>
"""

import json
import os
import sys
import zipfile

out = sys.argv[1]
mat = open(os.path.join(os.path.dirname(__file__), 'practice-mat.jpg'), 'rb').read()


def scene(name, x, z, rotation):
    s = {
        'version': 1,
        'robot': {
            'anchored': False,
            'position': {'x': x, 'y': 36.00000047683716, 'z': z},
            'rotation': rotation,
            'name': '#robot',
        },
        'matWidth': 2360,
        'matHeight': 1140,
        'objects': [],
    }
    with zipfile.ZipFile(os.path.join(out, name), 'w', zipfile.ZIP_DEFLATED) as z_:
        z_.writestr('mat.jpg', mat)
        z_.writestr('scene.json', json.dumps(s))


# Robot in the start box, facing the stop line.
scene('Practice - start box.spk', -900, 300, 180)
# Robot on the bottom of the oval, facing left along the line.
scene('Practice - line oval.spk', 300, 400, 270)
