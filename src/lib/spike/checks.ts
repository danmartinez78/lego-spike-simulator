// Checks: the rules a lesson or challenge uses to decide whether a batch of
// runs succeeded. The format is shared with the server (server/lesson-rules.mjs)
// and documented in docs/lessons.md.

import type * as Blockly from 'blockly/core';
import { blockRules } from '../../../server/lesson-rules.mjs';
import type { Check, Point, Zone } from '../../../server/lesson-rules.mjs';
import type { PathPoint, RunPath } from '$lib/spike/runs';

export type { Check, Point, Zone };
export { blockRules };

// 0 = facing up the mat, 90 = right, as students see it.
export function headingOf(rotation: number) {
    return (((180 - rotation) % 360) + 360) % 360;
}

export function angleDiff(a: number, b: number) {
    let d = Math.abs(a - b) % 360;
    if (d > 180) d = 360 - d;
    return d;
}

// Distance from a point to a zone, 0 when inside.
export function zoneMiss(zone: Zone, x: number, z: number) {
    if (zone.kind == 'circle') {
        return Math.max(0, Math.hypot(x - zone.x, z - zone.z) - zone.radius);
    }
    const x1 = Math.min(zone.x1, zone.x2);
    const x2 = Math.max(zone.x1, zone.x2);
    const z1 = Math.min(zone.z1, zone.z2);
    const z2 = Math.max(zone.z1, zone.z2);
    return Math.hypot(Math.max(x1 - x, 0, x - x2), Math.max(z1 - z, 0, z - z2));
}

export function zoneName(zone: Zone, fallback: string) {
    return zone.label?.trim() || fallback;
}

export function cm(mm: number) {
    return `${(mm / 10).toFixed(mm < 100 ? 1 : 0)} cm`;
}

export type RuleKind = 'stop' | 'waypoints' | 'avoid' | 'follow' | 'time' | 'finish';

export interface RuleResult {
    rule: RuleKind;
    ok: boolean;
    // A short sentence for students, e.g. "Stopped 4 cm from the target".
    note: string;
}

export interface RunResult {
    passed: boolean;
    rules: RuleResult[];
    // Where the sensor first left the line, for drawing.
    leftLine?: Point;
    // The sensor's trail, when the check follows a line.
    trail?: Point[];
}

// ---- Following a line --------------------------------------------------

interface Projection {
    distance: number;
    // How far along the line, in mm.
    along: number;
}

function lineLengths(path: Point[]) {
    const lengths = [0];
    for (let i = 1; i < path.length; i++) {
        lengths.push(
            lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z)
        );
    }
    return lengths;
}

// Nearest point on the line to p, looking only between from and to (mm along).
function project(path: Point[], lengths: number[], p: Point, from: number, to: number) {
    let best: Projection = { distance: Infinity, along: 0 };
    for (let i = 1; i < path.length; i++) {
        if (lengths[i] < from || lengths[i - 1] > to) continue;
        const a = path[i - 1];
        const b = path[i];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        let t = len2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2 : 0;
        const segment = lengths[i] - lengths[i - 1];
        const lo = segment > 0 ? (from - lengths[i - 1]) / segment : 0;
        const hi = segment > 0 ? (to - lengths[i - 1]) / segment : 1;
        t = Math.max(Math.max(0, lo), Math.min(Math.min(1, hi), t));
        const distance = Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
        if (distance < best.distance) {
            best = { distance, along: lengths[i - 1] + t * segment };
        }
    }
    return best;
}

// Where the sensor was at each recorded point (the robot centre if there's no sensor).
export function sensorTrail(points: PathPoint[], port: string | undefined): Point[] {
    return points.map((p) => {
        const sensors = p.sensors ?? {};
        const key = port && sensors[port] ? port : Object.keys(sensors).sort()[0];
        const s = key ? sensors[key] : undefined;
        return s ? { x: s[0], z: s[1] } : { x: p.x, z: p.z };
    });
}

export interface FollowResult {
    // Whether the sensor ever reached the start of the line.
    started: boolean;
    reachedEnd: boolean;
    share: number;
    leftAt?: number;
    leftPoint?: Point;
}

export function followLine(follow: NonNullable<Check['follow']>, trail: Point[]): FollowResult {
    const line = follow.path;
    const lengths = lineLengths(line);
    const total = lengths[lengths.length - 1];
    const closed =
        Math.hypot(line[0].x - line[line.length - 1].x, line[0].z - line[line.length - 1].z) <
        follow.width;
    let along: number | undefined = undefined;
    let inside = 0;
    let travelled = 0;
    let outsideRun = 0;
    let reachedEnd = false;
    let leftAt: number | undefined = undefined;
    let leftPoint: Point | undefined = undefined;
    for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        if (along === undefined) {
            // Start once the sensor first reaches the start of the line. On a
            // closed loop the start and end meet, so look near the start only.
            const start = project(line, lengths, p, 0, closed ? total / 4 : total / 2);
            if (start.distance <= follow.width) along = start.along;
            continue;
        }
        const step = Math.hypot(p.x - trail[i - 1].x, p.z - trail[i - 1].z);
        // Follow progress along the line, only looking a little behind and ahead.
        const near = project(line, lengths, p, along - 60, along + 250);
        travelled += step;
        if (near.distance <= follow.width) {
            inside += step;
            outsideRun = 0;
            along = Math.max(along, near.along);
        } else {
            outsideRun += step;
            if (outsideRun > 30 && leftAt === undefined) {
                leftAt = along;
                leftPoint = p;
            }
        }
        if (along >= total - Math.max(follow.width, 30)) {
            reachedEnd = true;
            break;
        }
    }
    return {
        started: along !== undefined,
        reachedEnd,
        share: travelled > 0 ? inside / travelled : 0,
        leftAt,
        leftPoint
    };
}

// ---- Checking a run ------------------------------------------------------

export function checkRun(check: Check, path: RunPath): RunResult {
    const rules: RuleResult[] = [];
    let leftLine: Point | undefined = undefined;
    let trail: Point[] | undefined = undefined;
    const end = path.points[path.points.length - 1];
    if (!end) {
        return {
            passed: false,
            rules: [{ rule: 'finish', ok: false, note: "The robot didn't move" }]
        };
    }
    if (path.timedOut) {
        rules.push({ rule: 'finish', ok: false, note: "The program didn't stop within 150 s" });
    }
    if (check.stop) {
        const miss = zoneMiss(check.stop.zone, end.x, end.z);
        const heading = headingOf(end.rotation);
        const h = check.stop.heading;
        if (miss > 0) {
            rules.push({
                rule: 'stop',
                ok: false,
                note: `Stopped ${cm(miss)} from ${zoneName(check.stop.zone, 'the target')}`
            });
        } else if (h && angleDiff(heading, h.value) > h.tolerance) {
            rules.push({
                rule: 'stop',
                ok: false,
                note: `Stopped in the target but facing ${Math.round(heading)}° (needs ${h.value}° ± ${h.tolerance}°)`
            });
        } else {
            rules.push({ rule: 'stop', ok: true, note: 'Stopped in the target' });
        }
    }
    if (check.waypoints?.length) {
        let next = 0;
        for (const p of path.points) {
            if (next < check.waypoints.length && zoneMiss(check.waypoints[next], p.x, p.z) == 0) {
                next++;
            }
        }
        const total = check.waypoints.length;
        rules.push(
            next == total
                ? { rule: 'waypoints', ok: true, note: `Passed all ${total} waypoints in order` }
                : {
                      rule: 'waypoints',
                      ok: false,
                      note: `Missed waypoint ${zoneName(check.waypoints[next], String(next + 1))}${total > 1 ? ` (passed ${next} of ${total} in order)` : ''}`
                  }
        );
    }
    if (check.avoid?.length) {
        const hit = check.avoid.find((zone) =>
            path.points.some((p) => zoneMiss(zone, p.x, p.z) == 0)
        );
        rules.push(
            hit
                ? {
                      rule: 'avoid',
                      ok: false,
                      note: `Went into the stay-out zone ${zoneName(hit, '')}`.trim()
                  }
                : { rule: 'avoid', ok: true, note: 'Kept out of the stay-out zones' }
        );
    }
    if (check.follow) {
        trail = sensorTrail(path.points, check.follow.sensor);
        const f = followLine(check.follow, trail);
        const share = Math.round(f.share * 100);
        const needed = Math.round(check.follow.share * 100);
        leftLine = f.leftPoint;
        if (!f.reachedEnd) {
            rules.push({
                rule: 'follow',
                ok: false,
                note: !f.started
                    ? 'The colour sensor never reached the start of the line'
                    : f.leftAt !== undefined
                      ? `Lost the line about ${cm(f.leftAt)} along it`
                      : "Didn't get to the end of the line"
            });
        } else if (f.share < check.follow.share) {
            rules.push({
                rule: 'follow',
                ok: false,
                note: `Stayed on the line ${share}% of the way (needs ${needed}%)`
            });
        } else {
            rules.push({
                rule: 'follow',
                ok: true,
                note: `Followed the line to the end, on it ${share}% of the way`
            });
        }
    }
    if (check.timeLimit !== undefined) {
        const seconds = path.seconds ?? Infinity;
        rules.push({
            rule: 'time',
            ok: seconds <= check.timeLimit,
            note: Number.isFinite(seconds)
                ? `Took ${seconds.toFixed(1)} s (limit ${check.timeLimit} s)`
                : `Didn't finish within ${check.timeLimit} s`
        });
    }
    return { passed: rules.every((r) => r.ok), rules, leftLine, trail };
}

// ---- Checking the program's blocks --------------------------------------------

export interface BlockResult {
    ok: boolean;
    notes: string[];
}

// Block types in stacks that run: under an event hat or inside a My Block.
export function programBlockTypes(workspace: Blockly.Workspace | undefined) {
    const types = new Set<string>();
    if (!workspace) return types;
    for (const top of workspace.getTopBlocks(false)) {
        const runs =
            top.type.startsWith('flipperevents_') ||
            top.type == 'event_whenbroadcastreceived' ||
            top.type == 'procedures_definition';
        if (!runs || !top.isEnabled()) continue;
        for (const block of top.getDescendants(false)) {
            if (block.isEnabled()) types.add(block.type);
        }
    }
    return types;
}

export function checkBlocks(check: Check, types: Set<string>): BlockResult {
    const notes: string[] = [];
    const rule = (id: string) => blockRules.find((r) => r.id == id);
    for (const id of check.blocks?.use ?? []) {
        const r = rule(id);
        if (r && !r.types.some((t) => types.has(t))) notes.push(`Your program needs: ${r.label}`);
    }
    for (const id of check.blocks?.avoid ?? []) {
        const r = rule(id);
        if (r && r.types.some((t) => types.has(t))) notes.push(`Solve it without: ${r.label}`);
    }
    return { ok: notes.length == 0, notes };
}

// ---- Describing a check for students ------------------------------------------

function facing(value: number) {
    const words: Record<number, string> = {
        0: 'up the mat',
        90: 'right',
        180: 'down the mat',
        270: 'left'
    };
    const v = ((Math.round(value) % 360) + 360) % 360;
    return words[v] ? `${words[v]} (${v}°)` : `${v}°`;
}

export function describeCheck(check: Check): string[] {
    const lines: string[] = [];
    if (check.follow) {
        lines.push(
            `Follow the orange line to its end, with the colour sensor on it at least ${Math.round(check.follow.share * 100)}% of the way`
        );
    }
    if (check.waypoints?.length) {
        const names = check.waypoints.map((z, i) => zoneName(z, String(i + 1)));
        lines.push(
            check.waypoints.length == 1
                ? `Drive through the blue zone ${names[0]}`
                : `Drive through the blue zones in order: ${names.join(', ')}`
        );
    }
    if (check.avoid?.length) {
        lines.push(`Keep out of the red zone${check.avoid.length == 1 ? '' : 's'}`);
    }
    if (check.stop) {
        const h = check.stop.heading;
        const label = check.stop.zone.label?.trim();
        lines.push(
            `Stop in the green ${label ? `"${label}" ` : ''}zone` +
                (h ? `, facing ${facing(h.value)}, give or take ${h.tolerance}°` : '')
        );
    }
    if (check.timeLimit !== undefined) lines.push(`Finish within ${check.timeLimit} seconds`);
    for (const id of check.blocks?.use ?? []) {
        const r = blockRules.find((b) => b.id == id);
        if (r) lines.push(`Use: ${r.label}`);
    }
    for (const id of check.blocks?.avoid ?? []) {
        const r = blockRules.find((b) => b.id == id);
        if (r) lines.push(`Don't use: ${r.label}`);
    }
    lines.push(`Pass ${check.needed} of 5 runs`);
    return lines;
}
