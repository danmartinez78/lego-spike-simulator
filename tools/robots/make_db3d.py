"""Adds a distance sensor (port F) to Driving Base 3 and embeds the part.

Usage: python make_db3d.py <DrivingBase3.mpd> <ldraw dir> <out.mpd>
"""
import os
import re
import sys

src_path, ldraw, out_path = sys.argv[1:4]
text = open(src_path, encoding='utf-8').read()
lines = text.split('\n')
out = []
for line in lines:
    out.append(line)
    if line.strip() == '1 15 60 -69 -190 0 -1 0 0 0 -1 1 0 0 37308.dat':
        out.append('0 !SPIKE_PORT main F')
        out.append(f'1 15 {sys.argv[4] if len(sys.argv) > 4 else "200 -80 -185 1 0 0 0 1 0 0 0 1"} 37316.dat')

embedded = {m.lower() for m in re.findall(r'^0 FILE (.+?)\s*$', text, re.M)}


def find(name):
    rel = name.replace(chr(92), '/')
    for base in ('parts', 'p'):
        path = os.path.join(ldraw, base, rel)
        if os.path.exists(path):
            return path
        lower = os.path.join(ldraw, base, rel.lower())
        if os.path.exists(lower):
            return lower
    return None


extra = []
queue = ['37316.dat']
while queue:
    name = queue.pop()
    if name.lower() in embedded:
        continue
    path = find(name)
    if not path:
        print('missing', name)
        continue
    embedded.add(name.lower())
    content = open(path, encoding='utf-8', errors='replace').read().replace('\r\n', '\n').strip('\n')
    extra.append(f'0 FILE {name}\n{content}\n')
    for ref in re.findall(r'^\s*1\s+(?:\S+\s+){13}(.+?)\s*$', content, re.M):
        queue.append(ref.strip())

result = '\n'.join(out).rstrip('\n') + '\n\n' + '\n'.join(extra)
open(out_path, 'w', encoding='utf-8', newline='\n').write(result)
print('embedded', len(extra), 'files')
