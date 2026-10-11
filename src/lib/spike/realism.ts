// Optional real-world imperfections for the simulator.
//
// With everything at zero ("Ideal") the simulator behaves exactly as before:
// motors turn precisely, wheels never slip and the gyro is perfect. The other
// presets add the kinds of errors a real robot sees, so that programs which
// only count rotations drift, and programs that check sensors do better.
//
// Randomness is seeded per run so a surprising run can be repeated.

import { get, writable } from 'svelte/store';

export interface RealismSettings {
    preset: PresetName;
    // Random offset of the start position, in mm (each axis) and degrees.
    startJitterMm: number;
    startJitterDeg: number;
    // Each wheel's effective diameter differs by up to this percentage,
    // so equal motor rotations no longer drive straight.
    wheelMismatchPct: number;
    // Wheels randomly travel up to this percentage less than they turn.
    wheelSlipPct: number;
    // Motors overshoot by up to this many degrees when they stop (at full speed).
    stopOvershootDeg: number;
    // Gyro yaw drifts by up to this many degrees per minute.
    gyroDriftDegPerMin: number;
    // Random noise on each yaw reading, in degrees.
    gyroNoiseDeg: number;
    // Random noise on reflected light readings, in percent.
    lightNoisePct: number;
    // Random noise on distance readings, in mm.
    distanceNoiseMm: number;
    // Fixed seed for repeatable runs; 0 picks a new seed every run.
    seed: number;
}

export type PresetName = 'ideal' | 'realistic' | 'challenging';

export const presets: Record<PresetName, Omit<RealismSettings, 'preset' | 'seed'>> = {
    ideal: {
        startJitterMm: 0,
        startJitterDeg: 0,
        wheelMismatchPct: 0,
        wheelSlipPct: 0,
        stopOvershootDeg: 0,
        gyroDriftDegPerMin: 0,
        gyroNoiseDeg: 0,
        lightNoisePct: 0,
        distanceNoiseMm: 0
    },
    realistic: {
        startJitterMm: 5,
        startJitterDeg: 1.5,
        wheelMismatchPct: 0.5,
        wheelSlipPct: 2,
        stopOvershootDeg: 4,
        gyroDriftDegPerMin: 1,
        gyroNoiseDeg: 0.5,
        lightNoisePct: 2,
        distanceNoiseMm: 5
    },
    challenging: {
        startJitterMm: 15,
        startJitterDeg: 4,
        wheelMismatchPct: 2,
        wheelSlipPct: 6,
        stopOvershootDeg: 10,
        gyroDriftDegPerMin: 4,
        gyroNoiseDeg: 1.5,
        lightNoisePct: 6,
        distanceNoiseMm: 15
    }
};

export const presetLabels: Record<PresetName, string> = {
    ideal: 'Ideal (perfect robot)',
    realistic: 'Realistic',
    challenging: 'Challenging'
};

// What students should expect in each mode.
export const presetDescriptions: Record<PresetName, string> = {
    ideal: 'A perfect robot. Every run is the same.',
    realistic: 'Like a real robot: small errors each run.',
    challenging: 'A worn robot on a bumpy mat: bigger errors.'
};

// Short names, for buttons and badges.
export function realismName(preset: string) {
    return preset == 'ideal'
        ? 'Ideal'
        : preset == 'realistic'
          ? 'Realistic'
          : preset == 'challenging'
            ? 'Challenging'
            : 'Custom';
}

const storageKey = 'spike-sim-realism';

function fromPreset(name: PresetName, seed = 0): RealismSettings {
    return { ...presets[name], preset: name, seed: seed };
}

function initialSettings(): RealismSettings {
    let settings = fromPreset('ideal');
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Presets may be retuned between versions, so only keep the choice.
            // Older versions also saved custom values and a fixed seed; those
            // fall back to Ideal and a new seed each run.
            if (parsed.preset in presets) {
                settings = fromPreset(parsed.preset);
            }
        }
    } catch {
        // storage unavailable
    }
    try {
        // A link like ?realism=realistic picks a preset for a class.
        const param = new URLSearchParams(window.location.search).get('realism');
        if (param && param in presets) {
            settings = fromPreset(param as PresetName);
        }
    } catch {
        // no window
    }
    return settings;
}

export const realismStore = writable<RealismSettings>(initialSettings());

realismStore.subscribe((settings) => {
    try {
        localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch {
        // storage unavailable
    }
});

export function applyPreset(name: PresetName) {
    realismStore.update((old) => fromPreset(name, old.seed));
}

export function isIdeal(settings: RealismSettings) {
    const values = presets.ideal as Record<string, number>;
    const current = settings as unknown as Record<string, number>;
    return Object.keys(values).every((k) => current[k] == 0);
}

// Small fast seeded generator (mulberry32).
function generator(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// How far a wheel rolls before its slip changes, in mm.
const slipLengthMm = 20;

export class RealismRun {
    settings: RealismSettings;
    seed: number;
    random: () => number;
    wheelScales: Map<number, number>;
    // Each wheel's current slip and how far (mm) it lasts before changing.
    wheelSlips: Map<number, { slip: number; remaining: number }>;
    gyroDriftPerSecond: number;

    constructor(settings: RealismSettings) {
        this.settings = settings;
        this.seed = settings.seed > 0 ? settings.seed : Math.floor(Math.random() * 999999) + 1;
        this.random = generator(this.seed);
        this.wheelScales = new Map();
        this.wheelSlips = new Map();
        this.gyroDriftPerSecond = (this.uniform() * settings.gyroDriftDegPerMin) / 60.0;
    }

    // Uniform in [-1, 1].
    uniform() {
        return this.random() * 2.0 - 1.0;
    }

    // Roughly normal with standard deviation 1 (sum of uniforms).
    gaussian() {
        return (this.random() + this.random() + this.random() + this.random() - 2.0) * 1.732;
    }

    startOffset() {
        return {
            x: this.uniform() * this.settings.startJitterMm,
            z: this.uniform() * this.settings.startJitterMm,
            rotation: this.uniform() * this.settings.startJitterDeg
        };
    }

    // How far a wheel really travels for a given rotation.
    wheelTravel(wheelId: number, distance: number) {
        if (distance == 0) {
            return 0;
        }
        let scale = this.wheelScales.get(wheelId);
        if (scale === undefined) {
            scale = 1.0 + (this.uniform() * this.settings.wheelMismatchPct) / 100.0;
            this.wheelScales.set(wheelId, scale);
        }
        // Slip changes every few centimetres of travel rather than every
        // simulation step: a fresh random value each millisecond would average
        // out to a fixed shortfall, with no effect on where the robot ends up.
        let slip = this.wheelSlips.get(wheelId);
        if (slip === undefined || slip.remaining <= 0) {
            slip = {
                slip: (this.random() * this.settings.wheelSlipPct) / 100.0,
                remaining: slipLengthMm
            };
            this.wheelSlips.set(wheelId, slip);
        }
        slip.remaining -= Math.abs(distance);
        return distance * scale * (1.0 - slip.slip);
    }

    stopOvershoot(speedFraction: number) {
        return this.random() * this.settings.stopOvershootDeg * Math.min(1.0, speedFraction);
    }

    yawNoise() {
        return this.gaussian() * this.settings.gyroNoiseDeg * 0.5;
    }

    // Reflected light is stored as 0 to 1 (shown to programs as 0 to 100%).
    reflected(value: number) {
        const noisy = value + (this.gaussian() * this.settings.lightNoisePct * 0.5) / 100.0;
        return Math.max(0, Math.min(1, noisy));
    }

    distance(value: number) {
        if (value >= 2000) {
            // Out of range stays out of range.
            return value;
        }
        return Math.max(0, value + this.gaussian() * this.settings.distanceNoiseMm * 0.5);
    }
}

// The run currently being simulated, or undefined for an ideal robot.
let activeRun: RealismRun | undefined = undefined;

export function beginRealismRun(): RealismRun | undefined {
    const settings = get(realismStore);
    activeRun = isIdeal(settings) ? undefined : new RealismRun(settings);
    return activeRun;
}

export function realism(): RealismRun | undefined {
    return activeRun;
}
