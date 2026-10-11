// A small zip reader for lesson packages and scene files, so the server
// stays free of dependencies. Supports stored and deflated entries.

import zlib from 'node:zlib';

/**
 * Lists the files in a zip. Each entry's read() returns its contents.
 *
 * @param {Buffer} data
 * @returns {{ name: string, size: number, read: () => Buffer }[]}
 */
export function unzip(data) {
    let end = -1;
    for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
        if (data.readUInt32LE(i) === 0x06054b50) {
            end = i;
            break;
        }
    }
    if (end < 0) throw new Error('Not a zip file');
    const count = data.readUInt16LE(end + 10);
    let offset = data.readUInt32LE(end + 16);
    const entries = [];
    for (let n = 0; n < count; n++) {
        if (data.readUInt32LE(offset) !== 0x02014b50) throw new Error('Damaged zip file');
        const method = data.readUInt16LE(offset + 10);
        const compressed = data.readUInt32LE(offset + 20);
        const size = data.readUInt32LE(offset + 24);
        const nameLength = data.readUInt16LE(offset + 28);
        const extraLength = data.readUInt16LE(offset + 30);
        const commentLength = data.readUInt16LE(offset + 32);
        const local = data.readUInt32LE(offset + 42);
        const name = data.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
        offset += 46 + nameLength + extraLength + commentLength;
        if (name.endsWith('/')) continue;
        entries.push({
            name,
            size,
            read: () => {
                if (data.readUInt32LE(local) !== 0x04034b50) throw new Error('Damaged zip file');
                const start =
                    local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
                const raw = data.subarray(start, start + compressed);
                if (method === 0) return Buffer.from(raw);
                if (method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: 64e6 });
                throw new Error(`Unsupported zip compression in ${name}`);
            }
        });
    }
    return entries;
}

/**
 * The mat size of a scene (.spk) file in mm, and where the robot starts
 * (heading 0 = up the mat, 90 = right).
 *
 * @param {Buffer} data
 * @returns {{ width: number, height: number, start?: { x: number, z: number, heading: number } } | undefined}
 */
export function sceneMatSize(data) {
    try {
        const entry = unzip(data).find((e) => e.name === 'scene.json');
        if (!entry) return undefined;
        const scene = JSON.parse(entry.read().toString('utf8'));
        const width = typeof scene.matWidth === 'number' ? scene.matWidth : 2360;
        const height = typeof scene.matHeight === 'number' ? scene.matHeight : 1140;
        const p = scene.robot?.position;
        const start =
            p && typeof p.x === 'number' && typeof p.z === 'number'
                ? {
                      x: Math.round(p.x),
                      z: Math.round(p.z),
                      heading: Math.round((((180 - (scene.robot.rotation ?? 0)) % 360) + 360) % 360)
                  }
                : undefined;
        return { width, height, start };
    } catch {
        // not a readable scene
    }
    return undefined;
}
