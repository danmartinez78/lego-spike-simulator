// Recording robot paths over several runs of the same program, so the
// spread caused by real-world imperfections can be drawn on the mat.

import { writable } from 'svelte/store';

export interface PathPoint {
    x: number;
    z: number;
    rotation: number;
    // Where each colour sensor was on the mat, by port, as [x, z].
    sensors?: Record<string, [number, number]>;
}

export interface RunPath {
    seed: number | undefined;
    points: PathPoint[];
    timedOut: boolean;
    // How long the run took, in simulated seconds (not counting the idle end).
    seconds?: number;
}

export interface RunBatch {
    // Number of runs requested; 0 when no batch is in progress.
    total: number;
    active: boolean;
    completed: RunPath[];
    overlayOpen: boolean;
}

// A run ends once the program has been idle this long (simulated seconds),
// or after a full FIRST LEGO League match.
export const idleSecondsToFinish = 0.5;
export const maxRunSeconds = 150;

export const runBatch = writable<RunBatch>({
    total: 0,
    active: false,
    completed: [],
    overlayOpen: false
});

export function startBatch(total: number) {
    runBatch.set({ total, active: true, completed: [], overlayOpen: false });
}

export function finishRun(path: RunPath) {
    let more = false;
    runBatch.update((old) => {
        const completed = old.completed.concat([path]);
        more = old.active && completed.length < old.total;
        return {
            ...old,
            completed,
            active: more,
            overlayOpen: !more
        };
    });
    return more;
}

export function cancelBatch() {
    runBatch.update((old) => ({
        ...old,
        active: false,
        overlayOpen: old.active && old.completed.length > 0
    }));
}

export function recordPoint(
    path: RunPath,
    x: number,
    z: number,
    rotation: number,
    sensors?: Record<string, [number, number]>
) {
    const last = path.points[path.points.length - 1];
    if (last) {
        const dx = last.x - x;
        const dz = last.z - z;
        if (dx * dx + dz * dz < 4.0 && Math.abs(last.rotation - rotation) < 2.0) {
            return;
        }
    }
    path.points.push(sensors ? { x, z, rotation, sensors } : { x, z, rotation });
}

// A point given in the robot's own frame (mm), placed on the mat. Matches how
// the simulator turns the robot (m4.yRotation).
export function robotToMat(
    local: { x: number; z: number },
    position: { x: number; z: number },
    rotation: number
): [number, number] {
    const a = (rotation * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [position.x + c * local.x + s * local.z, position.z - s * local.x + c * local.z];
}

// ---- Summaries and A vs B comparison -----------------------------------

export interface RunSummary {
    runs: number;
    // Largest distance between any two end points, in mm.
    spread: number;
    // Largest difference between end headings, in degrees.
    headingSpread: number;
    // Average end point.
    centre: { x: number; z: number };
}

function endOf(path: RunPath) {
    return path.points[path.points.length - 1];
}

export function summarise(paths: RunPath[]): RunSummary {
    const ends = paths.map(endOf).filter((p) => p !== undefined);
    let spread = 0;
    let headingSpread = 0;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < ends.length; i++) {
        cx += ends[i].x / ends.length;
        cz += ends[i].z / ends.length;
        for (let j = i + 1; j < ends.length; j++) {
            spread = Math.max(spread, Math.hypot(ends[i].x - ends[j].x, ends[i].z - ends[j].z));
            let d = Math.abs(ends[i].rotation - ends[j].rotation) % 360;
            if (d > 180) d = 360 - d;
            headingSpread = Math.max(headingSpread, d);
        }
    }
    return { runs: ends.length, spread, headingSpread, centre: { x: cx, z: cz } };
}

export interface PinnedRuns {
    label: string;
    paths: RunPath[];
    realism: string;
}

// Runs kept as "A" so the next batch can be compared with them.
export const pinnedRuns = writable<PinnedRuns | undefined>(undefined);

// Ask the simulator window to start another batch of runs.
export const rerunRequest = writable(0);
