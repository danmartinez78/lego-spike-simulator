// Challenge cards: short goals checked automatically from a batch of runs.

import { get, writable } from 'svelte/store';
import { type PresetName } from '$lib/spike/realism';
import { type RunPath } from '$lib/spike/runs';

export type Target =
    // Robot centre must end inside a circle (mat coordinates, mm).
    | { kind: 'circle'; x: number; z: number; radius: number; label?: string }
    // Robot centre must end inside a rectangle (mat coordinates, mm).
    | { kind: 'box'; x1: number; z1: number; x2: number; z2: number; label?: string };

export interface Challenge {
    id: string;
    title: string;
    level: 1 | 2 | 3;
    skill: string;
    goal: string;
    field: string;
    robot?: string;
    realism: PresetName;
    // How many of the 5 runs must succeed.
    needed: number;
    target: Target;
    // Heading the robot must finish at (0 = up the mat, 90 = right), if any.
    heading?: { value: number; tolerance: number };
    hints: string[];
    example?: string;
}

export const challenges: Challenge[] = [
    {
        id: 'first-square',
        title: 'Back where you started',
        level: 1,
        skill: 'Basics',
        goal: 'Drive a square and finish within 5 cm of where you started, facing the same way (within 10°).',
        field: 'Practice - start box.spk',
        realism: 'ideal',
        needed: 5,
        target: { kind: 'circle', x: -900, z: 300, radius: 50, label: 'start' },
        heading: { value: 0, tolerance: 10 },
        hints: [
            'A square is four sides and four quarter turns.',
            'Steering 100 for 180 degrees turns this robot about a quarter turn.',
            'Use a repeat block so you only write one side.'
        ],
        example: '01 Drive a square.llsp3'
    },
    {
        id: 'target-a',
        title: 'Hit target A',
        level: 1,
        skill: 'Driving',
        goal: 'Stop inside the 6 cm ring of target A, 4 out of 5 times, on Realistic.',
        field: 'Practice - accuracy targets.spk',
        realism: 'realistic',
        needed: 4,
        target: { kind: 'circle', x: -950, z: -150, radius: 60, label: 'A' },
        hints: [
            'Use the measure tool to find how far target A is from the robot.',
            'Measure from the centre of the robot to the centre of the target.',
            'If runs spread sideways, try driving straight with the gyro.'
        ]
    },
    {
        id: 'target-b',
        title: 'Turn to target B',
        level: 2,
        skill: 'Driving',
        goal: 'Reach target B (it needs a turn) and stop inside the 6 cm ring, 4 out of 5 times, on Realistic.',
        field: 'Practice - accuracy targets.spk',
        realism: 'realistic',
        needed: 4,
        target: { kind: 'circle', x: -500, z: -150, radius: 60, label: 'B' },
        hints: [
            'Plan the route with the measure tool: it tells you each drive and turn.',
            'A turn that is a few degrees off sends the robot centimetres off at the end. Try a gyro turn.',
            'Use the DriveStraight and TurnRight My Blocks from the mission template example.'
        ],
        example: '08 Mission template.llsp3'
    },
    {
        id: 'stop-green',
        title: 'Stop on green',
        level: 2,
        skill: 'Sensors',
        goal: 'Drive up lane 1 and stop with the colour sensor on the green patch, every time, on Challenging.',
        field: 'Practice - colour stops.spk',
        realism: 'challenging',
        needed: 5,
        target: { kind: 'box', x1: -960, z1: 170, x2: -840, z2: 215, label: 'green' },
        hints: [
            'Start moving, then wait until the colour sensor sees green, then stop.',
            'Driving a fixed distance will not be reliable on Challenging. Let the sensor decide.',
            'If the robot overshoots, try a slower speed.'
        ],
        example: '03 Stop at a line.llsp3'
    },
    {
        id: 'exact-90',
        title: 'A perfect right angle',
        level: 2,
        skill: 'Gyro',
        goal: 'Turn on the spot to face 90° (right), within 3°, staying within 3 cm of the centre, 4 out of 5 times, on Realistic.',
        field: 'Practice - turn rose.spk',
        realism: 'realistic',
        needed: 4,
        target: { kind: 'circle', x: 0, z: 60, radius: 30, label: 'centre' },
        heading: { value: 90, tolerance: 3 },
        hints: [
            'Reset the yaw angle to 0 first.',
            'Spin with start moving at 20% and -20%, and wait until the yaw angle passes 90.',
            'The robot keeps turning a little after it stops. Stop a degree or two early.'
        ],
        example: '06 Turn with the gyro.llsp3'
    },
    {
        id: 'gyro-highway',
        title: 'Gyro highway',
        level: 3,
        skill: 'Gyro',
        goal: 'Drive 80 cm straight ahead and stop within 6 cm of the finish point, 4 out of 5 times, on Challenging.',
        field: 'Practice - start box.spk',
        realism: 'challenging',
        needed: 4,
        target: { kind: 'circle', x: -900, z: -500, radius: 60, label: 'finish' },
        hints: [
            'A plain move block drifts. Steer with the gyro all the way.',
            "Count the distance with the wheel motor's relative position, not with time.",
            "A crooked start can't be fixed by the gyro. Which way does the robot drift, and why?"
        ],
        example: '07 Drive straight with the gyro.llsp3'
    },
    {
        id: 'wall-stop',
        title: 'Stop before the wall',
        level: 2,
        skill: 'Sensors',
        goal: 'Drive towards the wall and stop with the front of the robot about 10 cm away, every time, on Challenging.',
        field: 'Practice - wall course.spk',
        robot: 'DrivingBase3 with distance sensor.mpd',
        realism: 'challenging',
        needed: 5,
        target: { kind: 'box', x1: -1000, z1: -175, x2: -900, z2: -135, label: '10 cm' },
        hints: [
            'This field needs the robot with the distance sensor (port F). Setting up the challenge loads it.',
            'Start moving, then wait until the distance is less than 10 cm, then stop.',
            'The sensor is at the front of the robot, so the distance is measured from there.'
        ]
    },
    {
        id: 'park-p1',
        title: 'Park in P1',
        level: 3,
        skill: 'Missions',
        goal: 'Leave home and park inside the blue P1 box, 4 out of 5 times, on Realistic.',
        field: 'Practice - mini missions.spk',
        realism: 'realistic',
        needed: 4,
        target: { kind: 'box', x1: 230, z1: -370, x2: 370, z2: -230, label: 'P1' },
        hints: [
            'Plan the route with the measure tool, starting from the robot.',
            'The black guide line can help you line up before the last part of the route.',
            'Build the run from DriveStraight and TurnRight My Blocks.'
        ],
        example: '08 Mission template.llsp3'
    }
];

// ---- Checking ----------------------------------------------------------

export function headingOf(rotation: number) {
    return (((180 - rotation) % 360) + 360) % 360;
}

function angleDiff(a: number, b: number) {
    let d = Math.abs(a - b) % 360;
    if (d > 180) d = 360 - d;
    return d;
}

export interface RunCheck {
    passed: boolean;
    inTarget: boolean;
    headingOk: boolean;
    // How far the robot centre ended from the target, in mm (0 when inside).
    miss: number;
    heading: number;
}

export function checkRun(challenge: Challenge, path: RunPath): RunCheck {
    const end = path.points[path.points.length - 1];
    if (!end) {
        return { passed: false, inTarget: false, headingOk: false, miss: Infinity, heading: 0 };
    }
    const t = challenge.target;
    let miss = 0;
    if (t.kind == 'circle') {
        miss = Math.max(0, Math.hypot(end.x - t.x, end.z - t.z) - t.radius);
    } else {
        const x1 = Math.min(t.x1, t.x2);
        const x2 = Math.max(t.x1, t.x2);
        const z1 = Math.min(t.z1, t.z2);
        const z2 = Math.max(t.z1, t.z2);
        miss = Math.hypot(Math.max(x1 - end.x, 0, end.x - x2), Math.max(z1 - end.z, 0, end.z - z2));
    }
    const inTarget = miss == 0;
    const heading = headingOf(end.rotation);
    const headingOk =
        !challenge.heading ||
        angleDiff(heading, challenge.heading.value) <= challenge.heading.tolerance;
    return { passed: inTarget && headingOk && !path.timedOut, inTarget, headingOk, miss, heading };
}

// ---- Active challenge and progress -------------------------------------

export const activeChallenge = writable<Challenge | undefined>(undefined);

const progressKey = 'spike-sim-challenges';

export interface Progress {
    best: number;
    completed: boolean;
}

function loadProgress(): Record<string, Progress> {
    try {
        return JSON.parse(localStorage.getItem(progressKey) ?? '{}');
    } catch {
        return {};
    }
}

export const progressStore = writable<Record<string, Progress>>(loadProgress());

progressStore.subscribe((value) => {
    try {
        localStorage.setItem(progressKey, JSON.stringify(value));
    } catch {
        // storage unavailable
    }
});

export function recordAttempt(challenge: Challenge, passes: number) {
    const all = get(progressStore);
    const old = all[challenge.id] ?? { best: 0, completed: false };
    progressStore.set({
        ...all,
        [challenge.id]: {
            best: Math.max(old.best, passes),
            completed: old.completed || passes >= challenge.needed
        }
    });
}
