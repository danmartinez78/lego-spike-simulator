// Recording robot paths over several runs of the same program, so the
// spread caused by real-world imperfections can be drawn on the mat.

import { writable } from 'svelte/store';

export interface PathPoint {
    x: number;
    z: number;
    rotation: number;
}

export interface RunPath {
    seed: number | undefined;
    points: PathPoint[];
    timedOut: boolean;
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

export function recordPoint(path: RunPath, x: number, z: number, rotation: number) {
    const last = path.points[path.points.length - 1];
    if (last) {
        const dx = last.x - x;
        const dz = last.z - z;
        if (dx * dx + dz * dz < 4.0 && Math.abs(last.rotation - rotation) < 2.0) {
            return;
        }
    }
    path.points.push({ x, z, rotation });
}
