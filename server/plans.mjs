// Mission planning maps: a field's mat with numbered pins on the missions and
// the robot's trips between them, which the team prints to plan a match.
// Team strategy, so it lives in TEAM_DIR with the missions, not in the public
// library, and only coaches and signed-in students can read it.
//
//   plans/<id>.json   { title, field, pins, trips, notes, created, updated, by }
//
// Pins and trip points are in mm from the mat's center, like a mission's start.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_PINS = 40;
const MAX_TRIPS = 12;
const MAX_POINTS = 60;
const COLOR = /^#[0-9a-f]{6}$/i;

function text(value, limit) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function point(value) {
    const { x, z } = value && typeof value === 'object' ? value : {};
    if (![x, z].every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
    if (Math.abs(x) > 5000 || Math.abs(z) > 5000) return undefined;
    return { x: Math.round(x), z: Math.round(z) };
}

/**
 * Check and tidy a plan from the browser.
 * @returns {{ error?: string, plan?: object }}
 */
export function cleanPlan(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { error: 'A plan must be a JSON object' };
    }
    const title = text(input.title, 80);
    if (!title) return { error: 'Give the map a name' };
    const field = text(input.field, 200);
    if (!field.toLowerCase().endsWith('.spk')) {
        return { error: '"field" must be a field (.spk) from the library' };
    }
    const pins = Array.isArray(input.pins) ? input.pins : [];
    const trips = Array.isArray(input.trips) ? input.trips : [];
    if (pins.length > MAX_PINS) return { error: `A map can have up to ${MAX_PINS} pins` };
    if (trips.length > MAX_TRIPS) return { error: `A map can have up to ${MAX_TRIPS} trips` };
    const cleanPins = [];
    for (const pin of pins) {
        const at = point(pin);
        const number = Number(pin?.number);
        if (!at || !Number.isInteger(number) || number < 0 || number > 99) {
            return { error: 'Each pin needs a place on the mat and a number from 0 to 99' };
        }
        cleanPins.push({ ...at, number, label: text(pin.label, 60) });
    }
    const cleanTrips = [];
    for (const trip of trips) {
        const points = Array.isArray(trip?.points) ? trip.points : [];
        if (points.length > MAX_POINTS) {
            return { error: `A trip can have up to ${MAX_POINTS} points` };
        }
        const cleaned = points.map(point);
        if (cleaned.some((p) => !p)) return { error: 'Each trip point needs a place on the mat' };
        cleanTrips.push({
            name: text(trip.name, 60),
            color: COLOR.test(trip.color ?? '') ? trip.color.toLowerCase() : '#2563eb',
            notes: text(trip.notes, 300),
            points: cleaned
        });
    }
    return {
        plan: {
            title,
            field,
            pins: cleanPins,
            trips: cleanTrips,
            notes: text(input.notes, 2000)
        }
    };
}

export function createPlans({ teamDir, sendJson, readBody }) {
    const root = path.join(teamDir, 'plans');
    const validId = (id) => typeof id === 'string' && /^[a-z0-9-]{4,40}$/.test(id);
    const fileOf = (id) => path.join(root, `${id}.json`);

    async function load(id) {
        if (!validId(id)) return undefined;
        try {
            return { ...JSON.parse(await fsp.readFile(fileOf(id), 'utf8')), id };
        } catch {
            return undefined;
        }
    }

    async function list() {
        if (!fs.existsSync(root)) return [];
        const plans = [];
        for (const name of await fsp.readdir(root)) {
            if (!name.endsWith('.json')) continue;
            const plan = await load(name.slice(0, -5));
            if (plan) plans.push(plan);
        }
        return plans.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    }

    async function save(input, by, id) {
        const old = id ? await load(id) : undefined;
        if (id && !old) return { error: 'No such map', status: 404 };
        const { error, plan } = cleanPlan(input);
        if (error) return { error, status: 400 };
        const newId = old?.id ?? crypto.randomUUID().slice(0, 13);
        const now = new Date().toISOString();
        const stored = { ...plan, created: old?.created ?? now, updated: now, by };
        await fsp.mkdir(root, { recursive: true });
        await fsp.writeFile(fileOf(newId) + '.tmp', JSON.stringify(stored, null, 2));
        await fsp.rename(fileOf(newId) + '.tmp', fileOf(newId));
        return { plan: { ...stored, id: newId } };
    }

    async function remove(id) {
        if (!validId(id) || !fs.existsSync(fileOf(id))) return false;
        await fsp.unlink(fileOf(id));
        return true;
    }

    async function readJson(req) {
        try {
            return JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch {
            return undefined;
        }
    }

    // /api/student/plans and /api/admin/plans: everyone on the team can draw,
    // change and delete maps. `by` is a first name or "Coach".
    async function handle(req, res, parts, by, who) {
        if (parts.length === 0 && req.method === 'GET') {
            sendJson(res, 200, { plans: await list() });
            return;
        }
        if (parts.length === 0 && req.method === 'POST') {
            const result = await save(await readJson(req), by);
            if (!result.error) console.log(`${who} added planning map "${result.plan.title}"`);
            sendJson(res, result.error ? result.status : 200, result);
            return;
        }
        if (parts.length === 1 && req.method === 'PUT') {
            const result = await save(await readJson(req), by, parts[0]);
            sendJson(res, result.error ? result.status : 200, result);
            return;
        }
        if (parts.length === 1 && req.method === 'DELETE') {
            const removed = await remove(parts[0]);
            if (removed) console.log(`${who} deleted planning map ${parts[0]}`);
            sendJson(
                res,
                removed ? 200 : 404,
                removed ? { deleted: parts[0] } : { error: 'No such map' }
            );
            return;
        }
        sendJson(res, 404, { error: 'Not found' });
    }

    async function handleAdmin(req, res, parts, who) {
        await handle(req, res, parts, 'Coach', who);
    }

    async function handleStudent(req, res, parts, student) {
        if (!student) {
            sendJson(res, 401, { error: 'Sign in with your team code to see the maps' });
            return;
        }
        const firstName = String(student.name ?? '').split(/\s+/)[0] || 'A teammate';
        await handle(req, res, parts, firstName, `Student ${student.id.slice(0, 8)}`);
    }

    return { list, load, save, remove, handleAdmin, handleStudent };
}
