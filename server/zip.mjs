// Just enough zip for .spk scenes: write a few files, and read the files of
// a zip someone uploads. No zip64, no encryption, no spanning.

import zlib from 'node:zlib';

/** @param {{ name: string, data: Buffer | string }[]} files */
export function writeZip(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    for (const file of files) {
        const name = Buffer.from(file.name, 'utf8');
        const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
        const packed = zlib.deflateRawSync(data, { level: 9 });
        const crc = zlib.crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4); // version needed
        local.writeUInt16LE(0x0800, 6); // UTF-8 names
        local.writeUInt16LE(8, 8); // deflate
        local.writeUInt32LE(0, 10); // time and date
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(packed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        parts.push(local, name, packed);

        const entry = Buffer.alloc(46);
        entry.writeUInt32LE(0x02014b50, 0);
        entry.writeUInt16LE(20, 4);
        entry.writeUInt16LE(20, 6);
        entry.writeUInt16LE(0x0800, 8);
        entry.writeUInt16LE(8, 10);
        entry.writeUInt32LE(0, 12);
        entry.writeUInt32LE(crc, 16);
        entry.writeUInt32LE(packed.length, 20);
        entry.writeUInt32LE(data.length, 24);
        entry.writeUInt16LE(name.length, 28);
        entry.writeUInt32LE(offset, 42);
        central.push(entry, name);
        offset += local.length + name.length + packed.length;
    }
    const centralSize = central.reduce((n, b) => n + b.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, ...central, end]);
}

/** The files in a zip, by name. Throws if it isn't a zip it can read.
 *  @param {Buffer} zip @param {number} [maxSize] largest total unpacked size */
export function readZip(zip, maxSize = 100 * 1024 * 1024) {
    let end = -1;
    for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
        if (zip.readUInt32LE(i) === 0x06054b50) {
            end = i;
            break;
        }
    }
    if (end < 0) throw new Error('not a zip file');
    const count = zip.readUInt16LE(end + 10);
    let at = zip.readUInt32LE(end + 16);
    const files = new Map();
    let total = 0;
    for (let n = 0; n < count; n++) {
        if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('broken zip directory');
        const method = zip.readUInt16LE(at + 10);
        const packedSize = zip.readUInt32LE(at + 20);
        const size = zip.readUInt32LE(at + 24);
        const nameLength = zip.readUInt16LE(at + 28);
        const extraLength = zip.readUInt16LE(at + 30);
        const commentLength = zip.readUInt16LE(at + 32);
        const localAt = zip.readUInt32LE(at + 42);
        const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
        at += 46 + nameLength + extraLength + commentLength;
        total += size;
        if (total > maxSize) throw new Error('zip unpacks too large');
        if (name.endsWith('/')) continue;
        const dataAt =
            localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
        const packed = zip.subarray(dataAt, dataAt + packedSize);
        if (method === 0) files.set(name, Buffer.from(packed));
        else if (method === 8)
            files.set(name, zlib.inflateRawSync(packed, { maxOutputLength: maxSize }));
        else throw new Error(`unsupported compression in ${name}`);
    }
    return files;
}
