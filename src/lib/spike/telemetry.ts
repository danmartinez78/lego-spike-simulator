// Records sensor and motor readings while the simulation runs, for the
// live sensor graph.

import { writable } from 'svelte/store';
import { allPorts, type Hub } from '$lib/spike/vm';

export interface Series {
    id: string;
    label: string;
    unit: string;
    colour: string;
    // Fixed range for sensors with a known scale; motors scale to their data.
    min?: number;
    max?: number;
    // Shown only when switched on, to keep the graph short.
    optional?: boolean;
    values: number[];
}

export interface Telemetry {
    times: number[];
    series: Series[];
    running: boolean;
}

// Readings per simulated second, and how much history to keep.
const sampleRate = 20;
const maxSamples = 150 * sampleRate;

export const telemetryStore = writable<Telemetry>({ times: [], series: [], running: false });
export const graphOpen = writable(false);

let times: number[] = [];
let series: Series[] = [];
let lastSample = -1;
let notify = 0;

function seriesFor(hub: Hub): Series[] {
    const result: Series[] = [
        {
            id: 'yaw',
            label: 'Yaw angle',
            unit: '°',
            colour: '#7c3aed',
            values: []
        }
    ];
    for (const port of allPorts) {
        const attachment = hub.ports[port];
        if (attachment.type == 'light') {
            result.push({
                id: `${port}-light`,
                label: `${port} reflected light`,
                unit: '%',
                colour: '#0891b2',
                min: 0,
                max: 100,
                values: []
            });
        } else if (attachment.type == 'distance') {
            result.push({
                id: `${port}-distance`,
                label: `${port} distance`,
                unit: 'cm',
                colour: '#059669',
                min: 0,
                max: 200,
                values: []
            });
        } else if (attachment.type == 'force') {
            result.push({
                id: `${port}-force`,
                label: `${port} force`,
                unit: 'N',
                colour: '#d97706',
                min: 0,
                max: 10,
                values: []
            });
        } else if (attachment.type == 'motor') {
            result.push({
                id: `${port}-motor`,
                label: `${port} motor degrees`,
                unit: '°',
                colour: '#2563eb',
                optional: true,
                values: []
            });
        }
    }
    return result;
}

function reading(hub: Hub, s: Series): number {
    if (s.id == 'yaw') {
        return hub.yaw;
    }
    const [port, kind] = s.id.split('-') as [keyof Hub['ports'], string];
    const attachment = hub.ports[port];
    if (kind == 'light') {
        return attachment.measure.reflected * 100;
    } else if (kind == 'distance') {
        return Math.min(attachment.measure.distance, 2000) / 10;
    } else if (kind == 'force') {
        return attachment.measure.force;
    } else if (kind == 'motor') {
        return attachment.motor?.relativePosition ?? 0;
    }
    return 0;
}

function publish(running: boolean) {
    telemetryStore.set({ times, series, running });
}

export function startTelemetry(hub: Hub) {
    times = [];
    series = seriesFor(hub);
    lastSample = -1;
    publish(true);
}

export function recordTelemetry(hub: Hub, simSeconds: number) {
    if (series.length == 0 || simSeconds - lastSample < 1 / sampleRate) {
        return;
    }
    lastSample = simSeconds;
    times.push(simSeconds);
    for (const s of series) {
        const value = reading(hub, s);
        s.values.push(Number.isFinite(value) ? value : 0);
    }
    if (times.length > maxSamples) {
        times.shift();
        for (const s of series) {
            s.values.shift();
        }
    }
    // Redraw a few times a second rather than every sample.
    notify++;
    if (notify % 4 == 0) {
        publish(true);
    }
}

export function stopTelemetry() {
    publish(false);
}
