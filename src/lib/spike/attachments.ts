// Parts of a robot that a motor turns, such as an arm. A robot file marks
// them with `0 !SPIKE_ROTATES main <port> <pivot x y z> <axis x y z> [ratio]`
// just before the part's line (see docs/robots.md). The robot is drawn as a
// chassis without them, and each one is drawn again turned by its motor.

import type { Model, Subpart, Vertex } from '$lib/ldraw/components';
import type { CompiledModel, WebGL, WebGLCompiler } from '$lib/ldraw/gl';
import type { SceneObject } from '$lib/spike/scene';
import * as m4 from '$lib/ldraw/m4';

export interface MovingPart {
    id: number;
    port: string;
    ratio: number;
    // In the robot's drawn frame (mm, y up, centered like the whole robot).
    pivot: Vertex;
    axis: Vertex;
    compiled: CompiledModel;
    // The part's shape for bumping: one box per brick (or per piece drawn
    // right in the file), so a block can sit under a hook's beam.
    boxes: Box[];
}

export interface Box {
    min: Vertex;
    max: Vertex;
}

export interface RobotParts {
    chassis: CompiledModel;
    parts: MovingPart[];
}

interface Rotating {
    subpart: Subpart;
    parent: m4.Matrix4;
}

function findRotating(model: Model, parent: m4.Matrix4, found: Rotating[]) {
    for (const subpart of model.subparts) {
        if (subpart.rotates && subpart.model) {
            found.push({ subpart, parent });
        } else if (subpart.model) {
            findRotating(subpart.model, m4.multiply(parent, subpart.matrix), found);
        }
    }
    return found;
}

export function hasMovingParts(model: Model | undefined) {
    return model ? findRotating(model, m4.identity(), []).length > 0 : false;
}

// Move a model compiled without recentering by the whole robot's recenter
// offset, so all the pieces line up with the robot as it is usually drawn.
function shift(model: CompiledModel, offset: Vertex): CompiledModel {
    const v = model.vertices;
    let min = { x: Infinity, y: Infinity, z: Infinity };
    let max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let i = 0; i < v.length; i += 4) {
        v[i] += offset.x;
        v[i + 1] += offset.y;
        v[i + 2] += offset.z;
        min = {
            x: Math.min(min.x, v[i]),
            y: Math.min(min.y, v[i + 1]),
            z: Math.min(min.z, v[i + 2])
        };
        max = {
            x: Math.max(max.x, v[i]),
            y: Math.max(max.y, v[i + 1]),
            z: Math.max(max.z, v[i + 2])
        };
    }
    if (v.length == 0) {
        min = { x: 0, y: 0, z: 0 };
        max = { x: 0, y: 0, z: 0 };
    }
    const c = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
    let radius = 0;
    for (let i = 0; i < v.length; i += 4) {
        const r = (v[i] - c.x) ** 2 + (v[i + 1] - c.y) ** 2 + (v[i + 2] - c.z) ** 2;
        radius = Math.max(radius, r);
    }
    model.bbox = { min, max, radius };
    model.recenter = { ...offset };
    return model;
}

type Mat = m4.Matrix4 | number[];

function growBox(box: Box | undefined, p: ArrayLike<number>): Box {
    if (!box) {
        return { min: { x: p[0], y: p[1], z: p[2] }, max: { x: p[0], y: p[1], z: p[2] } };
    }
    box.min = {
        x: Math.min(box.min.x, p[0]),
        y: Math.min(box.min.y, p[1]),
        z: Math.min(box.min.z, p[2])
    };
    box.max = {
        x: Math.max(box.max.x, p[0]),
        y: Math.max(box.max.y, p[1]),
        z: Math.max(box.max.z, p[2])
    };
    return box;
}

// Every corner of a model's own triangles and quads, and of everything
// inside it, in the frame given by matrix.
function allPoints(model: Model, matrix: Mat, add: (p: ArrayLike<number>) => void) {
    const corner = (v: Vertex) => add(m4.transformVector(matrix as m4.Matrix4, [v.x, v.y, v.z, 1]));
    for (const t of model.triangles) {
        corner(t.p1);
        corner(t.p2);
        corner(t.p3);
    }
    for (const q of model.quads) {
        corner(q.p1);
        corner(q.p2);
        corner(q.p3);
        corner(q.p4);
    }
    for (const sub of model.subparts) {
        if (sub.model) {
            allPoints(sub.model, m4.multiply(matrix as m4.Matrix4, sub.matrix), add);
        }
    }
}

// One box per LEGO part (.dat), and one for the pieces a file draws itself.
function collectBoxes(model: Model, matrix: Mat, boxes: Box[]) {
    let own: Box | undefined;
    allPoints({ ...model, subparts: [] }, matrix, (p) => (own = growBox(own, p)));
    if (own) {
        boxes.push(own);
    }
    for (const sub of model.subparts) {
        if (!sub.model) {
            continue;
        }
        const m = m4.multiply(matrix as m4.Matrix4, sub.matrix);
        if (sub.modelNumber.toLowerCase().endsWith('.dat')) {
            let box: Box | undefined;
            allPoints(sub.model, m, (p) => (box = growBox(box, p)));
            if (box) {
                boxes.push(box);
            }
        } else {
            collectBoxes(sub.model, m, boxes);
        }
    }
}

// full is the whole robot compiled as usual (recentered, not rescaled).
export function compileRobotParts(
    compiler: WebGLCompiler,
    model: Model,
    full: CompiledModel
): RobotParts {
    const rotating = findRotating(model, m4.identity(), []);
    if (rotating.length == 0) {
        return { chassis: full, parts: [] };
    }
    const exclude = new Set(rotating.map((r) => r.subpart.id));
    const chassis = shift(
        compiler.compileModel(model, { rescale: false, recenter: false, exclude }),
        full.recenter
    );
    // The same frame compileModel draws in: LDraw is y down, in 0.4 mm units.
    const base = m4.multiply(m4.xRotation(Math.PI), m4.scaling(0.4, 0.4, 0.4));
    const parts: MovingPart[] = [];
    for (const r of rotating) {
        const single: Model = {
            name: r.subpart.modelNumber,
            subparts: [
                { ...r.subpart, matrix: Array.from(m4.multiply(r.parent, r.subpart.matrix)) }
            ],
            lines: [],
            triangles: [],
            quads: [],
            optionalLines: []
        };
        const compiled = shift(
            compiler.compileModel(single, { rescale: false, recenter: false }),
            full.recenter
        );
        const frame = m4.multiply(base, r.parent);
        const shift3 = (b: Box): Box => ({
            min: {
                x: b.min.x + full.recenter.x,
                y: b.min.y + full.recenter.y,
                z: b.min.z + full.recenter.z
            },
            max: {
                x: b.max.x + full.recenter.x,
                y: b.max.y + full.recenter.y,
                z: b.max.z + full.recenter.z
            }
        });
        // The base frame only flips and scales, so a box stays a box.
        const raw: Box[] = [];
        collectBoxes(single, base, raw);
        const boxes = raw.map((b) =>
            shift3({
                min: {
                    x: Math.min(b.min.x, b.max.x),
                    y: Math.min(b.min.y, b.max.y),
                    z: Math.min(b.min.z, b.max.z)
                },
                max: {
                    x: Math.max(b.min.x, b.max.x),
                    y: Math.max(b.min.y, b.max.y),
                    z: Math.max(b.min.z, b.max.z)
                }
            })
        );
        const rot = r.subpart.rotates!;
        const p = m4.transformVector(frame, [rot.pivot.x, rot.pivot.y, rot.pivot.z, 1]);
        const a = m4.transformVector(frame, [rot.axis.x, rot.axis.y, rot.axis.z, 0]);
        const length = Math.hypot(a[0], a[1], a[2]) || 1;
        parts.push({
            id: r.subpart.id,
            port: rot.port,
            ratio: rot.ratio,
            pivot: {
                x: p[0] + full.recenter.x,
                y: p[1] + full.recenter.y,
                z: p[2] + full.recenter.z
            },
            axis: { x: a[0] / length, y: a[1] / length, z: a[2] / length },
            compiled,
            boxes
        });
    }
    return { chassis, parts };
}

// The part's turn (degrees) for the motor's degrees turned so far.
export function partAngle(part: MovingPart, motorDegrees: number) {
    return motorDegrees * part.ratio;
}

// T(pivot) * R(axis, angle) * T(-pivot), in the robot's drawn frame.
export function partMatrix(part: MovingPart, degrees: number): m4.Matrix4 {
    let m = m4.translation(part.pivot.x, part.pivot.y, part.pivot.z);
    m = m4.axisRotate(m, [part.axis.x, part.axis.y, part.axis.z], (degrees * Math.PI) / 180);
    return m4.translate(m, -part.pivot.x, -part.pivot.y, -part.pivot.z);
}

// The part's boxes at its angle, as boxes lined up with the robot (mm, the
// robot's drawn frame). A part with no boxes uses its whole outline.
export function partBoxes(part: MovingPart, degrees: number): Box[] {
    const m = partMatrix(part, degrees);
    const boxes = part.boxes.length > 0 ? part.boxes : [part.compiled.bbox];
    return boxes.map((b) => {
        let out: Box | undefined;
        for (const x of [b.min.x, b.max.x]) {
            for (const y of [b.min.y, b.max.y]) {
                for (const z of [b.min.z, b.max.z]) {
                    out = growBox(out, m4.transformVector(m, [x, y, z, 1]));
                }
            }
        }
        return out!;
    });
}

// The lowest point (mm, robot's drawn frame) of a part turned by degrees.
export function partBottom(part: MovingPart, degrees: number) {
    return Math.min(...partBoxes(part, degrees).map((b) => b.min.y));
}

// Draw a robot, with its arms where their motors have turned them.
export function drawRobot(gl: WebGL, robot: SceneObject) {
    if (robot.chassis && robot.moving && robot.moving.length > 0) {
        gl.drawCompiled(robot.chassis);
        robot.moving.forEach((part, i) => {
            gl.pushMatrix();
            gl.multMatrix(partMatrix(part, robot.partAngles?.[i] ?? 0));
            gl.drawCompiled(part.compiled);
            gl.popMatrix();
        });
    } else if (robot.compiled) {
        gl.drawCompiled(robot.compiled);
    } else {
        gl.drawBox(100, 100, 100);
    }
}

// Move every piece of a robot by d (mm), for a robot drawn around another origin.
export function offsetRobotParts(parts: RobotParts, d: Vertex) {
    const models = new Set([parts.chassis, ...parts.parts.map((p) => p.compiled)]);
    for (const model of models) {
        const v = model.vertices;
        for (let i = 0; i < v.length; i += 4) {
            v[i] += d.x;
            v[i + 1] += d.y;
            v[i + 2] += d.z;
        }
        const b = model.bbox;
        b.min = { x: b.min.x + d.x, y: b.min.y + d.y, z: b.min.z + d.z };
        b.max = { x: b.max.x + d.x, y: b.max.y + d.y, z: b.max.z + d.z };
    }
    for (const part of parts.parts) {
        part.pivot = { x: part.pivot.x + d.x, y: part.pivot.y + d.y, z: part.pivot.z + d.z };
        part.boxes = part.boxes.map((b) => ({
            min: { x: b.min.x + d.x, y: b.min.y + d.y, z: b.min.z + d.z },
            max: { x: b.max.x + d.x, y: b.max.y + d.y, z: b.max.z + d.z }
        }));
    }
}
