// Keeps the robot out of the table walls and the objects on the field, seen
// from above. The robot and each object are boxes (the robot's arms are
// boxes of their own). When the robot ends a step inside something, it is
// pushed back out at the point of contact, which also turns it, so a robot
// that drives into a wall at an angle squares up against it. Loose blocks
// are pushed instead, and stop at walls and other objects.

import * as m4 from '$lib/ldraw/m4';
import { partMatrix } from '$lib/spike/attachments';
import type { SceneObject, SceneStore } from '$lib/spike/scene';

type Point = [number, number];

interface Shape {
    poly: Point[];
    bottom: number;
    top: number;
}

interface Obstacle {
    key: object | string;
    shape: Shape;
    obj?: SceneObject;
}

interface Contact {
    normal: Point; // from the obstacle toward the other shape
    depth: number;
    point: Point;
}

// The FLL table's walls are about 50 mm high.
const tableWallHeight = 50;
const tableWallThickness = 200;

// The same mapping as robotToMat: a point in an object's own frame (mm) to
// the mat, for an object at (x, z) turned by rotation degrees.
function box(
    x: number,
    z: number,
    rotation: number,
    min: { x: number; z: number },
    max: { x: number; z: number }
): Point[] {
    const a = (rotation * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const corners: Point[] = [
        [min.x, min.z],
        [max.x, min.z],
        [max.x, max.z],
        [min.x, max.z]
    ];
    return corners.map(([lx, lz]) => [x + c * lx + s * lz, z - s * lx + c * lz]);
}

function objectShape(obj: SceneObject): Shape | undefined {
    if (!obj.compiled || !obj.position) {
        return undefined;
    }
    const b = obj.compiled.bbox;
    return {
        poly: box(obj.position.x, obj.position.z, obj.rotation ?? 0, b.min, b.max),
        bottom: obj.position.y + b.min.y,
        top: obj.position.y + b.max.y
    };
}

// The robot's chassis, then one box per arm at its current angle.
export function robotShapes(robot: SceneObject): Shape[] {
    const body = robot.chassis ?? robot.compiled;
    if (!body || !robot.position) {
        return [];
    }
    const { x, y, z } = robot.position;
    const rotation = robot.rotation ?? 0;
    const b = body.bbox;
    const shapes: Shape[] = [
        { poly: box(x, z, rotation, b.min, b.max), bottom: y + b.min.y, top: y + b.max.y }
    ];
    (robot.moving ?? []).forEach((part, i) => {
        const pb = part.compiled.bbox;
        const m = partMatrix(part, robot.partAngles?.[i] ?? 0);
        const min = { x: Infinity, y: Infinity, z: Infinity };
        const max = { x: -Infinity, y: -Infinity, z: -Infinity };
        for (const cx of [pb.min.x, pb.max.x]) {
            for (const cy of [pb.min.y, pb.max.y]) {
                for (const cz of [pb.min.z, pb.max.z]) {
                    const p = m4.transformVector(m, [cx, cy, cz, 1]);
                    min.x = Math.min(min.x, p[0]);
                    min.y = Math.min(min.y, p[1]);
                    min.z = Math.min(min.z, p[2]);
                    max.x = Math.max(max.x, p[0]);
                    max.y = Math.max(max.y, p[1]);
                    max.z = Math.max(max.z, p[2]);
                }
            }
        }
        shapes.push({ poly: box(x, z, rotation, min, max), bottom: y + min.y, top: y + max.y });
    });
    return shapes;
}

function obstacles(scene: SceneStore): Obstacle[] {
    const w = scene.mapWidth / 2;
    const h = scene.mapHeight / 2;
    const t = tableWallThickness;
    const wall = (key: string, x0: number, z0: number, x1: number, z1: number): Obstacle => ({
        key,
        shape: {
            poly: [
                [x0, z0],
                [x1, z0],
                [x1, z1],
                [x0, z1]
            ],
            bottom: 0,
            top: tableWallHeight
        }
    });
    const list: Obstacle[] =
        Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
            ? [
                  wall('left', -w - t, -h - t, -w, h + t),
                  wall('right', w, -h - t, w + t, h + t),
                  wall('bottom', -w - t, -h - t, w + t, -h),
                  wall('top', -w - t, h, w + t, h + t)
              ]
            : [];
    for (const obj of scene.objects) {
        const shape = objectShape(obj);
        if (shape) {
            list.push({ key: obj, shape, obj });
        }
    }
    return list;
}

function centroid(poly: Point[]): Point {
    let x = 0;
    let z = 0;
    for (const p of poly) {
        x += p[0];
        z += p[1];
    }
    return [x / poly.length, z / poly.length];
}

function normals(poly: Point[]): Point[] {
    const result: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const length = Math.hypot(dx, dz);
        if (length > 1e-9) {
            result.push([-dz / length, dx / length]);
        }
    }
    return result;
}

function project(poly: Point[], n: Point): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (const p of poly) {
        const d = p[0] * n[0] + p[1] * n[1];
        min = Math.min(min, d);
        max = Math.max(max, d);
    }
    return [min, max];
}

// Separating axis test for two convex shapes seen from above. Returns how to
// push a out of b, and where they touch.
function contact(a: Shape, b: Shape): Contact | undefined {
    if (a.bottom >= b.top || b.bottom >= a.top) {
        return undefined;
    }
    // Most pairs are far apart: compare the boxes around them first.
    const [ax0, ax1] = project(a.poly, [1, 0]);
    const [bx0, bx1] = project(b.poly, [1, 0]);
    if (ax1 <= bx0 || bx1 <= ax0) {
        return undefined;
    }
    const [az0, az1] = project(a.poly, [0, 1]);
    const [bz0, bz1] = project(b.poly, [0, 1]);
    if (az1 <= bz0 || bz1 <= az0) {
        return undefined;
    }
    let depth = Infinity;
    let normal: Point = [0, 0];
    let fromB = true;
    for (const [poly, isB] of [
        [b.poly, true],
        [a.poly, false]
    ] as [Point[], boolean][]) {
        for (const n of normals(poly)) {
            const [amin, amax] = project(a.poly, n);
            const [bmin, bmax] = project(b.poly, n);
            const overlap = Math.min(amax, bmax) - Math.max(amin, bmin);
            if (overlap <= 0) {
                return undefined;
            }
            if (overlap < depth) {
                depth = overlap;
                normal = n;
                fromB = isB;
            }
        }
    }
    const ca = centroid(a.poly);
    const cb = centroid(b.poly);
    if ((ca[0] - cb[0]) * normal[0] + (ca[1] - cb[1]) * normal[1] < 0) {
        normal = [-normal[0], -normal[1]];
    }
    // The touching corner (or the middle of a touching edge): a's points
    // furthest into b, or b's points furthest into a.
    const points = fromB ? a.poly : b.poly;
    const sign = fromB ? 1 : -1;
    let best = Infinity;
    for (const p of points) {
        best = Math.min(best, sign * (p[0] * normal[0] + p[1] * normal[1]));
    }
    let x = 0;
    let z = 0;
    let count = 0;
    for (const p of points) {
        if (sign * (p[0] * normal[0] + p[1] * normal[1]) <= best + 0.05) {
            x += p[0];
            z += p[1];
            count++;
        }
    }
    return { normal, depth, point: [x / count, z / count] };
}

function keyOf(a: object | string, b: object | string, keys: Map<object | string, number>) {
    for (const k of [a, b]) {
        if (!keys.has(k)) {
            keys.set(k, keys.size);
        }
    }
    return `${keys.get(a)}:${keys.get(b)}`;
}

export class Collisions {
    // Pairs that already overlapped when the run started (a robot placed
    // touching a wall, say) are left alone until they come apart.
    private ignored = new Set<string>();
    private keys = new Map<object | string, number>();
    private started = false;
    // Degrees the robot turned by bumping into things in the last solve.
    turned = 0;

    solve(scene: SceneStore): number {
        this.turned = 0;
        const robot = scene.robot;
        if (!robot.position) {
            return 0;
        }
        const list = obstacles(scene);
        const loose = list.filter((o) => o.obj && !o.obj.anchored);
        if (!this.started) {
            this.started = true;
            for (const shape of robotShapes(robot)) {
                for (const o of list) {
                    if (contact(shape, o.shape)) {
                        this.ignored.add(keyOf('robot', o.key, this.keys));
                    }
                }
            }
            for (const block of loose) {
                for (const o of list) {
                    if (o !== block && contact(block.shape, o.shape)) {
                        this.ignored.add(keyOf(block.key, o.key, this.keys));
                    }
                }
            }
        }
        const body = robot.chassis ?? robot.compiled;
        if (!body) {
            return 0;
        }
        const lx = body.bbox.max.x - body.bbox.min.x;
        const lz = body.bbox.max.z - body.bbox.min.z;
        const inertia = Math.max(1, (lx * lx + lz * lz) / 12);
        const stillTouching = new Set<string>();
        // Blocks pushed against something solid in this step, which the
        // robot can't push any further.
        const stuck = new Set<Obstacle>();
        for (let pass = 0; pass < 6; pass++) {
            let moved = false;
            let shapes = robotShapes(robot);
            for (const o of list) {
                const key = keyOf('robot', o.key, this.keys);
                for (const shape of shapes) {
                    const c = contact(shape, o.shape);
                    if (!c) {
                        continue;
                    }
                    if (this.ignored.has(key)) {
                        stillTouching.add(key);
                        continue;
                    }
                    this.pushRobot(robot, o, c, inertia, stuck.has(o));
                    shapes = robotShapes(robot);
                    moved = true;
                    break;
                }
            }
            for (const block of loose) {
                for (const o of list) {
                    if (o === block) {
                        continue;
                    }
                    const c = contact(block.shape, o.shape);
                    if (!c) {
                        continue;
                    }
                    const key = keyOf(block.key, o.key, this.keys);
                    if (this.ignored.has(key)) {
                        stillTouching.add(key);
                        continue;
                    }
                    const solid = !o.obj || o.obj.anchored || stuck.has(o);
                    const share = solid ? 1 : 0.5;
                    moveObject(block, c.normal, c.depth * share);
                    if (solid) {
                        stuck.add(block);
                    } else {
                        moveObject(o, c.normal, -c.depth * share);
                    }
                    moved = true;
                }
            }
            if (!moved) {
                break;
            }
        }
        for (const key of Array.from(this.ignored)) {
            if (!stillTouching.has(key)) {
                this.ignored.delete(key);
            }
        }
        return this.turned;
    }

    private pushRobot(
        robot: SceneObject,
        o: Obstacle,
        c: Contact,
        inertia: number,
        stuck: boolean
    ) {
        if (o.obj && !o.obj.anchored && !stuck) {
            // A loose block is light next to the robot, whose wheels grip the
            // mat: the block moves. If it is stuck against something, the
            // next pass pushes it back and the robot stops behind it.
            moveObject(o, c.normal, -c.depth);
            return;
        }
        const pos = robot.position!;
        const r: Point = [c.point[0] - pos.x, c.point[1] - pos.z];
        // r x n: how much a push along n at that point turns the robot.
        const rn = r[0] * c.normal[1] - r[1] * c.normal[0];
        const lambda = c.depth / (1 + (rn * rn) / inertia);
        pos.x += c.normal[0] * lambda;
        pos.z += c.normal[1] * lambda;
        // Counterclockwise on the mat's x, z axes is a smaller rotation value
        // (see robotToMat).
        const degrees = (-((rn / inertia) * lambda) * 180) / Math.PI;
        robot.rotation = (robot.rotation ?? 0) + degrees;
        this.turned += degrees;
    }
}

function moveObject(o: Obstacle, normal: Point, distance: number) {
    const obj = o.obj!;
    obj.position!.x += normal[0] * distance;
    obj.position!.z += normal[1] * distance;
    o.shape = objectShape(obj)!;
}
