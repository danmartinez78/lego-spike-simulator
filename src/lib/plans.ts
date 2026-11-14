// Mission planning maps (server/plans.mjs): a field's mat with numbered pins on
// the missions and the robot's trips between them, printed to plan a match.
// Team strategy, so only coaches and signed-in students can read them.

import { get, writable } from 'svelte/store';
import { studentStore } from '$lib/team';
import { px, pz, type MatView } from '$lib/spike/checkdraw';

export interface PlanPoint {
    // mm from the mat's center, x to the right and z down the mat.
    x: number;
    z: number;
}

export interface PlanPin extends PlanPoint {
    number: number;
    label: string;
}

export interface PlanTrip {
    name: string;
    color: string;
    notes: string;
    // From the launch area, past the missions, and back.
    points: PlanPoint[];
}

export interface Plan {
    id?: string;
    title: string;
    field: string;
    pins: PlanPin[];
    trips: PlanTrip[];
    notes: string;
    updated?: string;
    by?: string;
}

// Easy to tell apart, also when printed.
export const tripColors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2'];

export const planMapOpen = writable(false);

// ---- Server ----------------------------------------------------------------------

// A student's sign-in wins on a shared computer; otherwise a coach signed in to
// the coach page uses the coach API, as in the Missions window.
function request(coach: boolean, method: string, path: string, body?: unknown) {
    const student = get(studentStore);
    const headers: Record<string, string> = {};
    if (!coach && student) headers['X-Student-Code'] = student.code;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`api/${coach ? 'admin' : 'student'}/plans${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
        redirect: 'manual',
        cache: 'no-store'
    }).then(async (response) => {
        if (!response.ok) {
            let message = `${response.status}`;
            try {
                message = (await response.json()).error ?? message;
            } catch {
                message = 'Sign in first';
            }
            throw new Error(message);
        }
        return await response.json();
    });
}

export async function listPlans(coach: boolean): Promise<Plan[]> {
    return (await request(coach, 'GET', '')).plans ?? [];
}

export async function savePlan(coach: boolean, plan: Plan): Promise<Plan> {
    const { id, ...body } = plan;
    return (await request(coach, id ? 'PUT' : 'POST', id ? `/${encodeURIComponent(id)}` : '', body))
        .plan;
}

export async function deletePlan(coach: boolean, id: string) {
    await request(coach, 'DELETE', `/${encodeURIComponent(id)}`);
}

// ---- Drawing ---------------------------------------------------------------------

// Pins a trip passes close to, in the order it reaches them.
export function tripVisits(trip: PlanTrip, pins: PlanPin[], within = 150) {
    const visits: number[] = [];
    for (const p of trip.points) {
        for (const pin of pins) {
            if (Math.hypot(pin.x - p.x, pin.z - p.z) > within) continue;
            if (visits[visits.length - 1] != pin.number) visits.push(pin.number);
        }
    }
    return visits;
}

export function pinRadius(unit: number) {
    return 13 * unit;
}

function arrow(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    size: number
) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    ctx.beginPath();
    ctx.moveTo(mx + Math.cos(angle) * size, my + Math.sin(angle) * size);
    ctx.lineTo(mx + Math.cos(angle + 2.5) * size, my + Math.sin(angle + 2.5) * size);
    ctx.lineTo(mx + Math.cos(angle - 2.5) * size, my + Math.sin(angle - 2.5) * size);
    ctx.closePath();
    ctx.fill();
}

function tag(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    unit: number,
    fill: string,
    color: string
) {
    ctx.font = `600 ${12 * unit}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 10 * unit;
    const h = 18 * unit;
    ctx.fillStyle = fill;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * unit;
    ctx.beginPath();
    ctx.roundRect(x, y - h / 2, w, h, 4 * unit);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 5 * unit, y + 0.5 * unit);
}

/**
 * Draw the trips and pins on a mat picture. `unit` scales lines and text, 1 on
 * screen and larger for a print-size picture. `active` is the trip being drawn.
 */
export function drawPlan(
    ctx: CanvasRenderingContext2D,
    view: MatView,
    plan: Pick<Plan, 'pins' | 'trips'>,
    unit = 1,
    active?: number
) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    plan.trips.forEach((trip, t) => {
        const points = trip.points.map((p) => [px(view, p.x), pz(view, p.z)]);
        if (points.length == 0) return;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 7 * unit;
        ctx.beginPath();
        points.forEach(([x, y], i) => (i == 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
        ctx.strokeStyle = trip.color;
        ctx.lineWidth = (t == active ? 4 : 3) * unit;
        ctx.stroke();
        ctx.fillStyle = trip.color;
        for (let i = 1; i < points.length; i++) {
            const [x1, y1] = points[i - 1];
            const [x2, y2] = points[i];
            if (Math.hypot(x2 - x1, y2 - y1) > 30 * unit) arrow(ctx, x1, y1, x2, y2, 7 * unit);
        }
        points.forEach(([x, y], i) => {
            ctx.beginPath();
            ctx.arc(x, y, (i == 0 ? 6 : 4) * unit, 0, Math.PI * 2);
            ctx.fillStyle = i == 0 ? trip.color : '#ffffff';
            ctx.fill();
            ctx.strokeStyle = trip.color;
            ctx.lineWidth = 2 * unit;
            ctx.stroke();
        });
        const [sx, sy] = points[0];
        tag(
            ctx,
            trip.name || `Trip ${t + 1}`,
            sx + 9 * unit,
            sy - 14 * unit,
            unit,
            '#ffffff',
            trip.color
        );
    });
    const r = pinRadius(unit);
    for (const pin of plan.pins) {
        const x = px(view, pin.x);
        const y = pz(view, pin.z);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#111827';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5 * unit;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${14 * unit}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(pin.number), x, y + 0.5 * unit);
        if (pin.label) tag(ctx, pin.label, x + r + 3 * unit, y, unit, '#ffffffee', '#111827');
    }
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
}
