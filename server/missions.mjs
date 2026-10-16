// Team missions: the season's missions with the team's own programs for them.
// Team code, so it lives in TEAM_DIR with the roster and progress, not in the
// public library, and only coaches and signed-in students can read it.
//
//   missions/<id>/mission.json            number, title, goal, notes, video, field...
//   missions/<id>/versions.json           every saved version, oldest first
//   missions/<id>/versions/<version>.llsp3
//
// Versions are never overwritten: students and coaches save new ones, and a
// coach marks the one the team runs (`current`). A mission can also point at
// FIRST's guided mission program, which is public and stays in the library.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_PROGRAM = 5e6;
const TEXT_LIMITS = { title: 80, season: 40, goal: 2000, notes: 4000, video: 500 };

function isText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

export function isWebAddress(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

/**
 * Check and tidy a mission's details (not its versions). `files` lists the
 * library's programs, scenes and robots, for warnings about missing ones.
 * @returns {{ errors: string[], warnings: string[], mission: object }}
 */
export function cleanMission(input, files) {
    const errors = [];
    const warnings = [];
    const mission = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { errors: ['A mission must be a JSON object'], warnings, mission };
    }
    const number = Number(input.number);
    if (!Number.isInteger(number) || number < 1 || number > 99) {
        errors.push('"number" must be the mission number, a whole number from 1 to 99');
    } else {
        mission.number = number;
    }
    for (const [key, limit] of Object.entries(TEXT_LIMITS)) {
        const value = input[key];
        if (value === undefined || value === null || value === '') continue;
        if (typeof value !== 'string') {
            errors.push(`"${key}" must be text`);
        } else if (value.trim().length > limit) {
            errors.push(`"${key}" must be ${limit} characters or fewer`);
        } else if (value.trim()) {
            mission[key] = value.trim();
        }
    }
    if (!mission.title) errors.push('The mission needs a "title", like "Window to the Past"');
    if (mission.video && !isWebAddress(mission.video)) {
        errors.push('"video" must be a web address starting with https://');
    }
    for (const [key, kind, ext] of [
        ['field', 'scenes', '.spk'],
        ['robot', 'robots', ''],
        ['guided', 'programs', '.llsp3']
    ]) {
        const value = input[key];
        if (value === undefined || value === null || value === '') continue;
        if (typeof value !== 'string' || (ext && !value.toLowerCase().endsWith(ext))) {
            errors.push(`"${key}" must be a ${ext || '.mpd or .ldr'} file name from the library`);
            continue;
        }
        mission[key] = value;
        if (files && !files[kind].includes(value)) {
            warnings.push(`"${key}": ${value} isn't in the library`);
        }
    }
    if (!mission.goal) warnings.push('There is no "goal": say what the robot has to do');
    return { errors, warnings, mission };
}

function isProgram(data) {
    return data.subarray(0, 2).toString('latin1') === 'PK' && data.length <= MAX_PROGRAM;
}

export function createMissions({ teamDir, listFiles, sendJson, send, readBody }) {
    const root = path.join(teamDir, 'missions');
    const dirOf = (id) => path.join(root, id);
    const validId = (id) => typeof id === 'string' && /^[a-z0-9-]{4,40}$/.test(id);

    async function readJson(file, fallback) {
        try {
            return JSON.parse(await fsp.readFile(file, 'utf8'));
        } catch {
            return fallback;
        }
    }

    async function writeJson(file, value) {
        await fsp.mkdir(path.dirname(file), { recursive: true });
        await fsp.writeFile(file + '.tmp', JSON.stringify(value, null, 2));
        await fsp.rename(file + '.tmp', file);
    }

    async function load(id) {
        if (!validId(id)) return undefined;
        const mission = await readJson(path.join(dirOf(id), 'mission.json'), undefined);
        if (!mission) return undefined;
        const versions = await readJson(path.join(dirOf(id), 'versions.json'), []);
        return { ...mission, id, versions };
    }

    async function list() {
        if (!fs.existsSync(root)) return [];
        const missions = [];
        for (const id of await fsp.readdir(root)) {
            const mission = await load(id);
            if (mission) missions.push(mission);
        }
        return missions.sort(
            (a, b) => (a.number ?? 0) - (b.number ?? 0) || String(a.title).localeCompare(b.title)
        );
    }

    // Students see a student's first name, as in class, and "Coach" rather
    // than a coach's email.
    function forStudents(mission) {
        return {
            ...mission,
            versions: mission.versions.map((v) => ({
                ...v,
                by:
                    v.by?.kind === 'student'
                        ? {
                              kind: 'student',
                              name: v.by.id
                                  ? String(v.by.name ?? '').split(/\s+/)[0]
                                  : String(v.by.name ?? '')
                          }
                        : { kind: 'coach', name: 'Coach' }
            }))
        };
    }

    async function save(input, files, id) {
        const old = id ? await load(id) : undefined;
        if (id && !old) return { error: `There is no mission with id ${id}` };
        const { errors, warnings, mission } = cleanMission(input, files);
        if (errors.length > 0) return { error: errors[0], errors, warnings };
        const newId = old?.id ?? crypto.randomUUID().slice(0, 13);
        const now = new Date().toISOString();
        const stored = {
            ...mission,
            ...(old?.current ? { current: old.current } : {}),
            created: old?.created ?? now,
            updated: now
        };
        await writeJson(path.join(dirOf(newId), 'mission.json'), stored);
        return { mission: await load(newId), warnings };
    }

    /**
     * Add a version. `by` is { kind: 'student', id, name } or { kind: 'coach', name }.
     * Coaches may give `saved` (YYYY-MM-DD or an ISO time), for a program
     * the team saved on another day.
     */
    async function addVersion(id, data, { note, from, saved, by }) {
        const mission = await load(id);
        if (!mission) return { error: 'No such mission', status: 404 };
        if (!isProgram(data)) return { error: 'That is not a SPIKE program (.llsp3)', status: 400 };
        const cleanNote = String(note ?? '')
            .trim()
            .slice(0, 300);
        if (!cleanNote) {
            return { error: 'Say what changed in this version, in a few words', status: 400 };
        }
        let when = new Date().toISOString();
        if (by.kind === 'coach' && isText(saved)) {
            const date = new Date(saved);
            if (Number.isNaN(date.getTime())) return { error: 'Bad date', status: 400 };
            when = date.toISOString();
        }
        const versionId = crypto.randomUUID().slice(0, 8);
        const file = path.join(dirOf(id), 'versions', versionId + '.llsp3');
        await fsp.mkdir(path.dirname(file), { recursive: true });
        await fsp.writeFile(file + '.tmp', data);
        await fsp.rename(file + '.tmp', file);
        const version = {
            id: versionId,
            number: mission.versions.reduce((n, v) => Math.max(n, v.number ?? 0), 0) + 1,
            note: cleanNote,
            saved: when,
            by,
            ...(mission.versions.some((v) => v.id === from) ? { from } : {})
        };
        await writeJson(path.join(dirOf(id), 'versions.json'), [...mission.versions, version]);
        return { version, mission: await load(id) };
    }

    async function versionFile(id, versionId) {
        const mission = await load(id);
        const version = mission?.versions.find((v) => v.id === versionId);
        if (!version) return undefined;
        const file = path.join(dirOf(id), 'versions', version.id + '.llsp3');
        return fs.existsSync(file) ? { mission, version, file } : undefined;
    }

    async function setCurrent(id, versionId) {
        const mission = await load(id);
        if (!mission) return { error: 'No such mission' };
        if (versionId && !mission.versions.some((v) => v.id === versionId)) {
            return { error: 'No such version' };
        }
        const stored = await readJson(path.join(dirOf(id), 'mission.json'), {});
        if (versionId) stored.current = versionId;
        else delete stored.current;
        await writeJson(path.join(dirOf(id), 'mission.json'), stored);
        return { mission: await load(id) };
    }

    async function removeVersion(id, versionId) {
        const mission = await load(id);
        if (!mission?.versions.some((v) => v.id === versionId)) return false;
        await writeJson(
            path.join(dirOf(id), 'versions.json'),
            mission.versions.filter((v) => v.id !== versionId)
        );
        await fsp.rm(path.join(dirOf(id), 'versions', versionId + '.llsp3'), { force: true });
        if (mission.current === versionId) await setCurrent(id, undefined);
        return true;
    }

    async function remove(id) {
        if (!(await load(id))) return false;
        await fsp.rm(dirOf(id), { recursive: true, force: true });
        return true;
    }

    function downloadName(mission, version) {
        const base = `M${String(mission.number).padStart(2, '0')} ${mission.title} v${version.number}`;
        return base.replace(/[^\w .()+-]/g, '_') + '.llsp3';
    }

    async function sendVersion(res, id, versionId, attachment) {
        const found = await versionFile(id, versionId);
        if (!found) {
            sendJson(res, 404, { error: 'No such version' });
            return;
        }
        send(res, 200, await fsp.readFile(found.file), 'application/zip', {
            'Cache-Control': 'no-store',
            ...(attachment
                ? {
                      'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadName(found.mission, found.version))}"`
                  }
                : {})
        });
    }

    async function readJsonBody(req) {
        try {
            return JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch {
            return undefined;
        }
    }

    async function readProgram(req, res) {
        try {
            return await readBody(req);
        } catch {
            sendJson(res, 413, { error: 'Program too large' });
            return undefined;
        }
    }

    // /api/admin/missions...
    async function handleAdmin(req, res, parts, who) {
        const url = new URL(req.url ?? '/', 'http://x');
        if (parts.length === 0 && req.method === 'GET') {
            sendJson(res, 200, { missions: await list() });
            return;
        }
        if (parts.length === 0 && req.method === 'POST') {
            const result = await save(await readJsonBody(req), await listFiles());
            if (result.error) {
                sendJson(res, 400, result);
                return;
            }
            console.log(`${who} added mission ${result.mission.number} "${result.mission.title}"`);
            sendJson(res, 200, result);
            return;
        }
        const id = parts[0];
        if (parts.length === 1) {
            if (req.method === 'GET') {
                const mission = await load(id);
                if (mission) sendJson(res, 200, { mission });
                else sendJson(res, 404, { error: 'No such mission' });
            } else if (req.method === 'PUT') {
                const result = await save(await readJsonBody(req), await listFiles(), id);
                sendJson(res, result.error ? 400 : 200, result);
            } else if (req.method === 'DELETE') {
                const removed = await remove(id);
                if (removed) console.log(`${who} deleted mission ${id}`);
                sendJson(
                    res,
                    removed ? 200 : 404,
                    removed ? { deleted: id } : { error: 'No such mission' }
                );
            } else {
                sendJson(res, 405, { error: 'Method not allowed' });
            }
            return;
        }
        if (parts[1] === 'current' && parts.length === 2 && req.method === 'PUT') {
            const body = await readJsonBody(req);
            const result = await setCurrent(id, body?.version || undefined);
            sendJson(res, result.error ? 400 : 200, result);
            return;
        }
        if (parts[1] === 'versions' && parts.length === 2 && req.method === 'POST') {
            const data = await readProgram(req, res);
            if (!data) return;
            const result = await addVersion(id, data, {
                note: url.searchParams.get('note'),
                from: url.searchParams.get('from'),
                saved: url.searchParams.get('saved'),
                by: { kind: 'coach', name: who }
            });
            sendJson(
                res,
                result.error ? result.status : 200,
                result.error ? { error: result.error } : result
            );
            return;
        }
        if (parts[1] === 'versions' && parts.length === 3) {
            if (req.method === 'GET') {
                await sendVersion(res, id, parts[2], true);
            } else if (req.method === 'DELETE') {
                const removed = await removeVersion(id, parts[2]);
                sendJson(
                    res,
                    removed ? 200 : 404,
                    removed ? { mission: await load(id) } : { error: 'No such version' }
                );
            } else {
                sendJson(res, 405, { error: 'Method not allowed' });
            }
            return;
        }
        sendJson(res, 404, { error: 'Not found' });
    }

    // /api/student/missions... (signed-in students only)
    async function handleStudent(req, res, parts, student) {
        if (!student) {
            sendJson(res, 401, { error: 'Sign in with your team code to see missions' });
            return;
        }
        const url = new URL(req.url ?? '/', 'http://x');
        if (parts.length === 0 && req.method === 'GET') {
            sendJson(res, 200, { missions: (await list()).map(forStudents) });
            return;
        }
        const id = parts[0];
        if (parts[1] === 'versions' && parts.length === 2 && req.method === 'POST') {
            const data = await readProgram(req, res);
            if (!data) return;
            const result = await addVersion(id, data, {
                note: url.searchParams.get('note'),
                from: url.searchParams.get('from'),
                by: { kind: 'student', id: student.id, name: student.name }
            });
            if (!result.error) {
                console.log(`Student ${student.id.slice(0, 8)} saved a version of mission ${id}`);
            }
            sendJson(
                res,
                result.error ? result.status : 200,
                result.error
                    ? { error: result.error }
                    : (() => {
                          const mission = forStudents(result.mission);
                          return {
                              version: mission.versions.find((v) => v.id === result.version.id),
                              mission
                          };
                      })()
            );
            return;
        }
        if (parts[1] === 'versions' && parts.length === 3 && req.method === 'GET') {
            await sendVersion(res, id, parts[2], false);
            return;
        }
        sendJson(res, 404, { error: 'Not found' });
    }

    // A removed student's versions stay, since they are the team's code, but
    // no longer name them.
    async function removeStudent(studentId) {
        for (const mission of await list()) {
            if (!mission.versions.some((v) => v.by?.id === studentId)) continue;
            await writeJson(
                path.join(dirOf(mission.id), 'versions.json'),
                mission.versions.map((v) =>
                    v.by?.id === studentId
                        ? { ...v, by: { kind: 'student', name: 'A former teammate' } }
                        : v
                )
            );
        }
    }

    return {
        list,
        load,
        save,
        addVersion,
        setCurrent,
        versionFile,
        removeStudent,
        handleAdmin,
        handleStudent
    };
}
