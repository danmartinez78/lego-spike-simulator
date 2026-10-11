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

// Why a batch of runs was started: checking a challenge or lesson, or an
// experiment to see how consistent the program is.
export type RunPurpose = 'check' | 'experiment';

export interface RunBatch {
    // Number of runs requested; 0 when no batch is in progress.
    total: number;
    purpose: RunPurpose;
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
    purpose: 'experiment',
    active: false,
    completed: [],
    overlayOpen: false
});

export function startBatch(total: number, purpose: RunPurpose) {
    runBatch.set({ total, purpose, active: true, completed: [], overlayOpen: false });
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
    // The batch these came from, so later batches can be told apart from it.
    source?: RunPath[];
}

// Runs kept as "A" so the next batch can be compared with them.
export const pinnedRuns = writable<PinnedRuns | undefined>(undefined);

// Ask the simulator window to start a batch of runs. The number changes on
// each request. The simulator waits for a robot that is still loading.
export const rerunRequest = writable<{ n: number; purpose: RunPurpose }>({
    n: 0,
    purpose: 'experiment'
});

export function requestRuns(purpose: RunPurpose) {
    rerunRequest.update((old) => ({ n: old.n + 1, purpose }));
}

// How far apart the runs ended, in words.
export function spreadWords(summary: RunSummary) {
    if (summary.runs < 2) return 'Only one run finished.';
    if (summary.spread < 5) return `All ${summary.runs} runs ended in the same spot.`;
    return `The ${summary.runs} runs ended up to ${(summary.spread / 10).toFixed(1)} cm apart.`;
}

export function headingWords(summary: RunSummary) {
    if (summary.runs < 2) return '';
    if (summary.headingSpread < 1) return 'They all faced the same way.';
    return `Which way they faced varied by up to ${summary.headingSpread.toFixed(0)}°.`;
}

// Which set of runs ended closer together, in words.
export function compareWords(a: RunSummary, b: RunSummary, nameA: string, nameB: string) {
    if (a.spread < 5 && b.spread < 5) {
        return `Both ${nameA} and ${nameB} ended in the same spot every time.`;
    }
    if (Math.abs(a.spread - b.spread) < Math.max(5, 0.1 * Math.max(a.spread, b.spread))) {
        return `${nameA} and ${nameB} are about as consistent as each other.`;
    }
    const better = b.spread < a.spread ? nameB : nameA;
    const ratio = Math.max(a.spread, b.spread) / Math.max(5, Math.min(a.spread, b.spread));
    const times = ratio >= 10 ? 'more than 10×' : `${ratio.toFixed(1)}×`;
    return `${better} wins: its runs ended ${times} closer together.`;
}
