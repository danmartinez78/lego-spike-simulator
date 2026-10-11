// Builds a field (a .spk scene) from a short JSON description, so an AI
// assistant can make a practice mat without drawing tools: lines, arcs,
// shapes and text on the mat, the robot's start, and walls or blocks to
// detect or push. The format is in docs/fields.md; the drawing follows
// tools/examples/make_fields.py (1 pixel per mm, LEGO colours the colour
// sensor recognises, origin in the middle, x across, z down the mat).

import zlib from 'node:zlib';
import { writeZip } from './zip.mjs';

export const FIELD_SCHEMA = 'spike-field/1';

// Mat colours, as in make_fields.py.
const COLOURS = {
    white: [244, 244, 244],
    black: [0, 0, 0],
    red: [180, 0, 0],
    blue: [30, 90, 168],
    green: [0, 133, 43],
    yellow: [250, 200, 10],
    grey: [150, 150, 150],
    lightgrey: [205, 205, 205]
};
// LDraw colour codes for walls and blocks.
const BRICK_COLOURS = {
    black: 0,
    blue: 1,
    green: 2,
    red: 4,
    yellow: 14,
    white: 15,
    grey: 71,
    darkgrey: 72
};

const SHAPES = ['line', 'arc', 'rect', 'circle', 'polygon', 'text'];
const OBJECTS = ['wall', 'block'];

const num = (v) => typeof v === 'number' && Number.isFinite(v);

function colourOf(value, fallback) {
    if (value === undefined) return COLOURS[fallback];
    const name = String(value)
        .toLowerCase()
        .replace(/[\s_-]/g, '');
    if (COLOURS[name]) return COLOURS[name];
    const hex = /^#([0-9a-f]{6})$/i.exec(String(value));
    if (hex) {
        const n = parseInt(hex[1], 16);
        return [n >> 16, (n >> 8) & 255, n & 255];
    }
    return undefined;
}

const isPoint = (p) => Array.isArray(p) && p.length === 2 && num(p[0]) && num(p[1]);

/** Errors (must fix) and warnings for a field description. */
export function fieldProblems(spec) {
    const errors = [];
    const warnings = [];
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        return { errors: ['The field must be a JSON object'], warnings };
    }
    if (spec.schema !== FIELD_SCHEMA) errors.push(`"schema" must be "${FIELD_SCHEMA}"`);
    const width = spec.width ?? 2360;
    const height = spec.height ?? 1140;
    if (!num(width) || width < 300 || width > 4000) errors.push('"width" must be 300 to 4000 mm');
    if (!num(height) || height < 300 || height > 3000)
        errors.push('"height" must be 300 to 3000 mm');
    if (spec.title !== undefined && (typeof spec.title !== 'string' || spec.title.length > 60))
        errors.push('"title" must be text of up to 60 characters');
    if (spec.background !== undefined && !colourOf(spec.background))
        errors.push(
            `"background" isn't a colour: use ${Object.keys(COLOURS).join(', ')} or #rrggbb`
        );

    const inside = (x, z, margin = 0) =>
        Math.abs(x) <= width / 2 - margin && Math.abs(z) <= height / 2 - margin;
    const start = spec.start;
    if (!start || !num(start.x) || !num(start.z) || !num(start.heading)) {
        errors.push(
            '"start" needs x, z and heading (0 = up the mat, 90 = right), in mm and degrees'
        );
    } else if (!inside(start.x, start.z, 60)) {
        errors.push("The robot's start must be on the mat, at least 60 mm from the edge");
    }

    const shapes = spec.shapes ?? [];
    if (!Array.isArray(shapes)) errors.push('"shapes" must be a list');
    else if (shapes.length > 500) errors.push('Use at most 500 shapes');
    else
        shapes.forEach((s, i) => {
            const where = `shapes[${i}]`;
            if (!s || !SHAPES.includes(s.type)) {
                errors.push(`${where}: "type" must be one of ${SHAPES.join(', ')}`);
                return;
            }
            if (s.colour !== undefined && !colourOf(s.colour))
                errors.push(`${where}: "${s.colour}" isn't a colour`);
            if (
                s.width !== undefined &&
                s.type !== 'rect' &&
                (!num(s.width) || s.width <= 0 || s.width > 500)
            )
                errors.push(`${where}: "width" must be 1 to 500 mm`);
            if (s.outline !== undefined && (!num(s.outline) || s.outline <= 0 || s.outline > 200))
                errors.push(`${where}: "outline" must be 1 to 200 mm`);
            if (s.type === 'line' || s.type === 'polygon') {
                const min = s.type === 'line' ? 2 : 3;
                if (
                    !Array.isArray(s.points) ||
                    s.points.length < min ||
                    s.points.length > 2000 ||
                    !s.points.every(isPoint)
                )
                    errors.push(`${where}: "points" must be ${min} to 2000 [x, z] pairs`);
                else if (!s.points.every(([x, z]) => inside(x, z)))
                    warnings.push(`${where} goes off the mat`);
            } else if (s.type === 'text') {
                if (!num(s.x) || !num(s.z)) errors.push(`${where}: needs x and z`);
                if (typeof s.text !== 'string' || !s.text.trim() || s.text.length > 60)
                    errors.push(`${where}: "text" must be 1 to 60 characters`);
                if (s.size !== undefined && (!num(s.size) || s.size < 10 || s.size > 300))
                    errors.push(`${where}: "size" must be 10 to 300 mm`);
            } else {
                if (!num(s.x) || !num(s.z)) errors.push(`${where}: needs x and z`);
                else if (!inside(s.x, s.z)) warnings.push(`${where} is centred off the mat`);
                if (s.type === 'rect') {
                    if (!num(s.width) || !num(s.height) || s.width <= 0 || s.height <= 0)
                        errors.push(`${where}: needs a width and height in mm`);
                    if (s.angle !== undefined && !num(s.angle))
                        errors.push(`${where}: "angle" must be a number`);
                } else if (!num(s.radius) || s.radius <= 0 || s.radius > 3000) {
                    errors.push(`${where}: needs a radius of 1 to 3000 mm`);
                }
                if (s.type === 'arc' && (!num(s.from) || !num(s.to)))
                    errors.push(`${where}: an arc needs "from" and "to" headings in degrees`);
            }
        });

    const objects = spec.objects ?? [];
    if (!Array.isArray(objects)) errors.push('"objects" must be a list');
    else if (objects.length > 30) errors.push('Use at most 30 objects');
    else
        objects.forEach((o, i) => {
            const where = `objects[${i}]`;
            if (!o || !OBJECTS.includes(o.type)) {
                errors.push(`${where}: "type" must be wall or block`);
                return;
            }
            if (!num(o.x) || !num(o.z)) errors.push(`${where}: needs x and z`);
            else if (!inside(o.x, o.z)) errors.push(`${where} must be on the mat`);
            if (
                o.colour !== undefined &&
                BRICK_COLOURS[String(o.colour).toLowerCase()] === undefined
            )
                errors.push(
                    `${where}: brick colour must be one of ${Object.keys(BRICK_COLOURS).join(', ')}`
                );
            if (o.type === 'wall' && (!num(o.length) || o.length < 64 || o.length > 3000))
                errors.push(`${where}: a wall needs a length of 64 to 3000 mm`);
            if (
                o.layers !== undefined &&
                (!Number.isInteger(o.layers) || o.layers < 1 || o.layers > 12)
            )
                errors.push(`${where}: "layers" must be a whole number from 1 to 12`);
            if (
                num(o.x) &&
                num(o.z) &&
                start &&
                num(start.x) &&
                num(start.z) &&
                Math.hypot(o.x - start.x, o.z - start.z) < 150
            )
                warnings.push(`${where} is very close to the robot's start`);
        });
    if (shapes.length === 0 && objects.length === 0 && Array.isArray(shapes))
        warnings.push('The field is empty: add shapes to the mat or objects on it');
    return { errors, warnings };
}

// ---- Drawing -----------------------------------------------------------

// 5x7 capitals, digits and some punctuation; lower case draws as capitals.
const GLYPHS = {
    A: [14, 17, 17, 31, 17, 17, 17],
    B: [30, 17, 17, 30, 17, 17, 30],
    C: [14, 17, 16, 16, 16, 17, 14],
    D: [30, 17, 17, 17, 17, 17, 30],
    E: [31, 16, 16, 30, 16, 16, 31],
    F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 23, 17, 17, 15],
    H: [17, 17, 17, 31, 17, 17, 17],
    I: [14, 4, 4, 4, 4, 4, 14],
    J: [7, 2, 2, 2, 2, 18, 12],
    K: [17, 18, 20, 24, 20, 18, 17],
    L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17],
    N: [17, 17, 25, 21, 19, 17, 17],
    O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16],
    Q: [14, 17, 17, 17, 21, 18, 13],
    R: [30, 17, 17, 30, 20, 18, 17],
    S: [15, 16, 16, 14, 1, 1, 30],
    T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14],
    V: [17, 17, 17, 17, 17, 10, 4],
    W: [17, 17, 17, 21, 21, 21, 10],
    X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 17, 10, 4, 4, 4],
    Z: [31, 1, 2, 4, 8, 16, 31],
    0: [14, 17, 19, 21, 25, 17, 14],
    1: [4, 12, 4, 4, 4, 4, 14],
    2: [14, 17, 1, 2, 4, 8, 31],
    3: [31, 2, 4, 2, 1, 17, 14],
    4: [2, 6, 10, 18, 31, 2, 2],
    5: [31, 16, 30, 1, 1, 17, 14],
    6: [6, 8, 16, 30, 17, 17, 14],
    7: [31, 1, 2, 4, 8, 8, 8],
    8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 2, 12],
    ' ': [0, 0, 0, 0, 0, 0, 0],
    '.': [0, 0, 0, 0, 0, 12, 12],
    ',': [0, 0, 0, 0, 12, 4, 8],
    '-': [0, 0, 0, 31, 0, 0, 0],
    ':': [0, 12, 12, 0, 12, 12, 0],
    '!': [4, 4, 4, 4, 4, 0, 4],
    '?': [14, 17, 1, 2, 4, 0, 4],
    "'": [4, 4, 8, 0, 0, 0, 0],
    '"': [10, 10, 0, 0, 0, 0, 0],
    '(': [2, 4, 8, 8, 8, 4, 2],
    ')': [8, 4, 2, 2, 2, 4, 8],
    '/': [0, 1, 2, 4, 8, 16, 0],
    '+': [0, 4, 4, 31, 4, 4, 0],
    '%': [24, 25, 2, 4, 8, 19, 3],
    '#': [10, 10, 31, 10, 31, 10, 10],
    '&': [12, 18, 20, 8, 21, 18, 13],
    '=': [0, 0, 31, 0, 31, 0, 0],
    '<': [2, 4, 8, 16, 8, 4, 2],
    '>': [8, 4, 2, 1, 2, 4, 8],
    _: [0, 0, 0, 0, 0, 0, 31],
    '°': [12, 18, 18, 12, 0, 0, 0]
};

class Canvas {
    constructor(width, height, background) {
        this.w = width;
        this.h = height;
        this.pixels = new Uint8Array(width * height * 3);
        for (let i = 0; i < width * height; i++) this.pixels.set(background, i * 3);
    }

    // Mat mm to pixel coordinates.
    px(x) {
        return x + this.w / 2;
    }
    pz(z) {
        return z + this.h / 2;
    }

    // Colour every pixel in the box whose centre passes the test.
    fill(x0, z0, x1, z1, colour, test) {
        const left = Math.max(0, Math.floor(x0));
        const right = Math.min(this.w - 1, Math.ceil(x1));
        const top = Math.max(0, Math.floor(z0));
        const bottom = Math.min(this.h - 1, Math.ceil(z1));
        for (let j = top; j <= bottom; j++) {
            for (let i = left; i <= right; i++) {
                if (!test || test(i + 0.5, j + 0.5)) this.pixels.set(colour, (j * this.w + i) * 3);
            }
        }
    }

    segment(a, b, width, colour) {
        const [ax, az] = [this.px(a[0]), this.pz(a[1])];
        const [bx, bz] = [this.px(b[0]), this.pz(b[1])];
        const r = width / 2;
        const dx = bx - ax;
        const dz = bz - az;
        const len2 = dx * dx + dz * dz;
        this.fill(
            Math.min(ax, bx) - r,
            Math.min(az, bz) - r,
            Math.max(ax, bx) + r,
            Math.max(az, bz) + r,
            colour,
            (x, z) => {
                const t =
                    len2 === 0
                        ? 0
                        : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
                const ex = ax + t * dx - x;
                const ez = az + t * dz - z;
                return ex * ex + ez * ez <= r * r;
            }
        );
    }

    line(points, width, colour, closed = false) {
        for (let i = 1; i < points.length; i++)
            this.segment(points[i - 1], points[i], width, colour);
        if (closed) this.segment(points[points.length - 1], points[0], width, colour);
    }

    polygon(points, colour) {
        const pts = points.map(([x, z]) => [this.px(x), this.pz(z)]);
        const top = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))));
        const bottom = Math.min(this.h - 1, Math.ceil(Math.max(...pts.map((p) => p[1]))));
        for (let j = top; j <= bottom; j++) {
            const y = j + 0.5;
            const xs = [];
            for (let k = 0; k < pts.length; k++) {
                const [x1, y1] = pts[k];
                const [x2, y2] = pts[(k + 1) % pts.length];
                if (y1 <= y !== y2 <= y) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
            }
            xs.sort((a, b) => a - b);
            for (let k = 0; k + 1 < xs.length; k += 2) {
                const from = Math.max(0, Math.ceil(xs[k] - 0.5));
                const to = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
                for (let i = from; i <= to; i++) this.pixels.set(colour, (j * this.w + i) * 3);
            }
        }
    }

    circle(x, z, radius, colour, outline) {
        const cx = this.px(x);
        const cz = this.pz(z);
        const outer = outline ? radius + outline / 2 : radius;
        const inner = outline ? Math.max(0, radius - outline / 2) : 0;
        this.fill(cx - outer, cz - outer, cx + outer, cz + outer, colour, (i, j) => {
            const d2 = (i - cx) ** 2 + (j - cz) ** 2;
            return d2 <= outer * outer && (inner === 0 || d2 >= inner * inner);
        });
    }

    text(x, z, text, size, colour) {
        const cell = size / 7;
        const chars = [...text.toUpperCase()];
        const width = (chars.length * 6 - 1) * cell;
        const left = this.px(x) - width / 2;
        const top = this.pz(z) - size / 2;
        chars.forEach((ch, n) => {
            const glyph = GLYPHS[ch] ?? GLYPHS['?'];
            for (let row = 0; row < 7; row++) {
                for (let col = 0; col < 5; col++) {
                    if (!(glyph[row] & (16 >> col))) continue;
                    const gx = left + (n * 6 + col) * cell;
                    const gz = top + row * cell;
                    this.fill(
                        gx,
                        gz,
                        gx + cell - 1e-6,
                        gz + cell - 1e-6,
                        colour,
                        (i, j) => i >= gx && i < gx + cell && j >= gz && j < gz + cell
                    );
                }
            }
        });
    }

    png() {
        const rowBytes = this.w * 3 + 1;
        const raw = Buffer.alloc(rowBytes * this.h);
        for (let j = 0; j < this.h; j++) {
            raw[j * rowBytes] = 0;
            raw.set(this.pixels.subarray(j * this.w * 3, (j + 1) * this.w * 3), j * rowBytes + 1);
        }
        const chunk = (type, data) => {
            const head = Buffer.alloc(8);
            head.writeUInt32BE(data.length, 0);
            head.write(type, 4, 'latin1');
            const crc = Buffer.alloc(4);
            crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
            return Buffer.concat([head, data, crc]);
        };
        const header = Buffer.alloc(13);
        header.writeUInt32BE(this.w, 0);
        header.writeUInt32BE(this.h, 4);
        header[8] = 8; // bit depth
        header[9] = 2; // RGB
        return Buffer.concat([
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
            chunk('IHDR', header),
            chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
            chunk('IEND', Buffer.alloc(0))
        ]);
    }
}

// Heading h (0 = up the mat, 90 = right) as a unit step in x and z.
const along = (h) => [Math.sin((h * Math.PI) / 180), -Math.cos((h * Math.PI) / 180)];

function arcPoints(s) {
    const steps = Math.max(8, Math.ceil(Math.abs(s.to - s.from) / 3));
    return Array.from({ length: steps + 1 }, (_, i) => {
        const [dx, dz] = along(s.from + ((s.to - s.from) * i) / steps);
        return [s.x + s.radius * dx, s.z + s.radius * dz];
    });
}

function rectPoints(s) {
    const [fx, fz] = along(s.angle ?? 0);
    const [sx, sz] = [-fz, fx];
    const w = s.width / 2;
    const h = s.height / 2;
    // width runs across (sideways), height along the angle.
    return [
        [s.x + sx * w + fx * h, s.z + sz * w + fz * h],
        [s.x - sx * w + fx * h, s.z - sz * w + fz * h],
        [s.x - sx * w - fx * h, s.z - sz * w - fz * h],
        [s.x + sx * w - fx * h, s.z + sz * w - fz * h]
    ];
}

function wallModel(length, layers, colour) {
    const count = Math.max(1, Math.round(length / 64));
    const lines = ['0 FILE main.ldr', '0 main', '0 Name: main.ldr'];
    for (let layer = 0; layer < layers; layer++) {
        for (let i = 0; i < count; i++) {
            const offset = (i - (count - 1) / 2) * 160;
            lines.push(
                `1 ${colour} 0 ${-24 * (layer + 1)} ${+offset.toFixed(3)} 0 0 1 0 1 0 -1 0 0 3008.dat`
            );
        }
    }
    return { model: lines.join('\n') + '\n', count };
}

function blockModel(layers, colour) {
    const lines = ['0 FILE main.ldr', '0 main', '0 Name: main.ldr'];
    for (let layer = 0; layer < layers; layer++) {
        for (const col of [-40, 40]) {
            for (const row of [-60, -20, 20, 60]) {
                lines.push(
                    `1 ${colour} ${col} ${-24 * (layer + 1)} ${row} 1 0 0 0 1 0 0 0 1 3001.dat`
                );
            }
        }
    }
    return lines.join('\n') + '\n';
}

/** Draws the mat and builds the .spk zip. `extra` is stored in field.json
 *  next to the description, e.g. who made it. Check fieldProblems first. */
export function buildField(spec, extra = {}) {
    const width = Math.round(spec.width ?? 2360);
    const height = Math.round(spec.height ?? 1140);
    const canvas = new Canvas(width, height, colourOf(spec.background, 'white'));
    const objects = [];
    const models = [];

    for (const s of spec.shapes ?? []) {
        const colour = colourOf(s.colour, s.type === 'text' ? 'grey' : 'black');
        if (s.type === 'line') canvas.line(s.points, s.width ?? 20, colour);
        else if (s.type === 'arc') canvas.line(arcPoints(s), s.width ?? 20, colour);
        else if (s.type === 'circle') canvas.circle(s.x, s.z, s.radius, colour, s.outline);
        else if (s.type === 'text') canvas.text(s.x, s.z, s.text, s.size ?? 40, colour);
        else {
            const points = s.type === 'rect' ? rectPoints(s) : s.points;
            if (s.outline) canvas.line(points, s.outline, colour, true);
            else canvas.polygon(points, colour);
        }
    }

    for (const [n, o] of (spec.objects ?? []).entries()) {
        const colour =
            BRICK_COLOURS[String(o.colour ?? (o.type === 'wall' ? 'red' : 'blue')).toLowerCase()];
        const name = `${o.type}${n + 1}`;
        if (o.type === 'wall') {
            const layers = o.layers ?? 6;
            const heading = o.heading ?? 0;
            const { model, count } = wallModel(o.length, layers, colour);
            models.push({ name, model });
            // A light footprint shows where the wall stands when seen from above.
            const [dx, dz] = along(heading);
            const half = (count * 64) / 2;
            canvas.segment(
                [o.x - dx * half, o.z - dz * half],
                [o.x + dx * half, o.z + dz * half],
                26,
                COLOURS.lightgrey
            );
            objects.push({
                anchored: true,
                position: { x: o.x, y: (layers * 24 * 0.4) / 2, z: o.z },
                rotation: ((-heading % 360) + 360) % 360,
                name
            });
        } else {
            const layers = o.layers ?? 3;
            models.push({ name, model: blockModel(layers, colour) });
            objects.push({
                anchored: false,
                position: { x: o.x, y: (layers * 24 * 0.4) / 2, z: o.z },
                rotation: 0,
                name
            });
        }
    }

    // The start box and title go on last so nothing covers them.
    const start = spec.start;
    if (start.box !== false) {
        const [fx, fz] = along(start.heading);
        canvas.line(
            rectPoints({ x: start.x, z: start.z, width: 200, height: 220, angle: start.heading }),
            5,
            COLOURS.grey,
            true
        );
        canvas.text(
            start.x - fx * 140,
            start.z - fz * 140,
            start.label ?? 'START',
            30,
            COLOURS.grey
        );
    }
    if (spec.title) canvas.text(0, -height / 2 + 45, spec.title, 46, COLOURS.grey);

    const scene = {
        version: 1,
        robot: {
            anchored: false,
            position: { x: start.x, y: 36.00000047683716, z: start.z },
            rotation: (((180 - start.heading) % 360) + 360) % 360,
            name: '#robot'
        },
        matWidth: width,
        matHeight: height,
        objects
    };
    return writeZip([
        // The simulator always reads the mat from mat.jpg; browsers tell the
        // picture's real format (PNG here) from its contents.
        { name: 'mat.jpg', data: canvas.png() },
        { name: 'scene.json', data: JSON.stringify(scene) },
        { name: 'field.json', data: JSON.stringify({ ...spec, ...extra }, null, 2) },
        ...models.map((m) => ({ name: `bricks-${m.name}`, data: m.model }))
    ]);
}
