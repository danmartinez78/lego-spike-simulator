// Team roster: students the coach adds, each with a random sign-in code.
// Stored as JSON in TEAM_DIR (next to the library, /data/team in the container).
// Codes are only a light credential: they let a student save their own
// progress, never change the library.

import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Short, friendly words that are hard to mistype or misread.
const WORDS_A = `amber apple arrow badger bamboo basil beacon berry bison blaze bolt breeze brick
cactus canyon cedar cherry cliff clover cobalt comet coral cosmic crane cricket crystal
dolphin dragon eagle ember falcon fern flame forest fox frost galaxy gecko ginger glacier
granite harbor hawk hazel honey island jade jaguar jasper kiwi koala lagoon lemon lily
lotus lunar maple marble meadow mango meteor mint moose nectar nova oak ocean olive orbit
otter panda pepper pine planet plum polar puffin quartz rapid raven reef river rocket
ruby saffron sage salmon sandy silver sky solar spruce storm summit sunny thunder tiger
topaz tulip turbo violet walnut willow wolf zebra`.split(/\s+/);

const WORDS_B = `anchor badge banner beetle blimp bridge buggy cable camera candle castle circuit
compass crown dynamo engine feather flag gadget gear glider hammer helmet jet kayak kite
ladder lantern lever magnet marker meter motor nugget paddle pebble pendant pilot piston
pixel planet plank pulley puzzle quill radar ranger rover sail scooter sensor shuttle
signal sled spark spinner sprocket station sticker tablet tractor trail tunnel turbine
wagon wheel whistle widget winch wizard yacht yo-yo`
    .split(/\s+/)
    .filter((w) => !w.includes('-'));

export function createTeam({ teamDir, sendJson, readBody }) {
    const rosterFile = path.join(teamDir, 'roster.json');
    let cache;

    async function load() {
        if (cache) return cache;
        try {
            cache = JSON.parse(await fsp.readFile(rosterFile, 'utf8'));
        } catch {
            cache = { students: [] };
        }
        cache.students = cache.students ?? [];
        return cache;
    }

    async function save(roster) {
        await fsp.mkdir(teamDir, { recursive: true });
        await fsp.writeFile(rosterFile + '.tmp', JSON.stringify(roster, null, 2));
        await fsp.rename(rosterFile + '.tmp', rosterFile);
        cache = roster;
    }

    function pick(list) {
        return list[crypto.randomInt(list.length)];
    }

    function newCode(roster) {
        for (;;) {
            const code =
                `${pick(WORDS_A)}-${pick(WORDS_B)}-${crypto.randomInt(10, 100)}`.toUpperCase();
            if (!roster.students.some((s) => s.code === code)) return code;
        }
    }

    // Accept codes typed with spaces, lower case or missing dashes.
    function normalise(code) {
        const parts = String(code ?? '')
            .toUpperCase()
            .match(/[A-Z]+|\d+/g);
        return parts ? parts.join('-') : '';
    }

    function cleanName(name) {
        return String(name ?? '')
            .replace(/[<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40);
    }

    async function findByCode(code) {
        const wanted = normalise(code);
        if (!wanted) return undefined;
        return (await load()).students.find((s) => s.code === wanted);
    }

    // ---- Guessing limits: 10 wrong codes per address per 10 minutes.
    const failures = new Map();
    function clientAddress(req) {
        const forwarded = String(
            req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'] ?? ''
        );
        return forwarded.split(',')[0].trim() || (req.socket.remoteAddress ?? '');
    }
    function blocked(req) {
        const entry = failures.get(clientAddress(req));
        return !!entry && entry.count >= 10 && Date.now() - entry.since < 10 * 60 * 1000;
    }
    function failed(req) {
        const key = clientAddress(req);
        const entry = failures.get(key);
        if (!entry || Date.now() - entry.since > 10 * 60 * 1000) {
            failures.set(key, { count: 1, since: Date.now() });
        } else {
            entry.count++;
        }
    }

    async function body(req) {
        try {
            return JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch {
            return undefined;
        }
    }

    // /api/admin/roster...
    async function handleAdmin(req, res, parts, who) {
        const roster = await load();
        if (parts.length === 0 && req.method === 'GET') {
            sendJson(res, 200, roster);
            return;
        }
        if (parts.length === 0 && req.method === 'POST') {
            const input = await body(req);
            const names = (Array.isArray(input?.names) ? input.names : [])
                .map(cleanName)
                .filter((n) => n.length > 0)
                .slice(0, 200);
            if (names.length === 0) {
                sendJson(res, 400, { error: 'Type at least one name' });
                return;
            }
            const added = names.map((name) => {
                const student = {
                    id: crypto.randomUUID(),
                    name,
                    code: newCode(roster),
                    added: new Date().toISOString()
                };
                roster.students.push(student);
                return student;
            });
            await save(roster);
            console.log(`${who} added ${added.length} student(s)`);
            sendJson(res, 200, roster);
            return;
        }
        const student = roster.students.find((s) => s.id === parts[0]);
        if (!student) {
            sendJson(res, 404, { error: 'No such student' });
            return;
        }
        if (parts.length === 2 && parts[1] === 'code' && req.method === 'POST') {
            student.code = newCode(roster);
            await save(roster);
            console.log(`${who} gave ${student.name} a new code`);
            sendJson(res, 200, roster);
        } else if (parts.length === 1 && req.method === 'PATCH') {
            const name = cleanName((await body(req))?.name);
            if (!name) {
                sendJson(res, 400, { error: 'Type a name' });
                return;
            }
            student.name = name;
            await save(roster);
            sendJson(res, 200, roster);
        } else if (parts.length === 1 && req.method === 'DELETE') {
            roster.students = roster.students.filter((s) => s.id !== student.id);
            await save(roster);
            console.log(`${who} removed ${student.name}`);
            sendJson(res, 200, roster);
        } else {
            sendJson(res, 405, { error: 'Method not allowed' });
        }
    }

    // /api/student/...: the code travels in the X-Student-Code header.
    async function handleStudent(req, res, parts) {
        if (parts[0] === 'signin' && req.method === 'POST') {
            if (blocked(req)) {
                sendJson(res, 429, { error: 'Too many tries. Wait 10 minutes, then try again.' });
                return;
            }
            const student = await findByCode((await body(req))?.code);
            if (!student) {
                failed(req);
                sendJson(res, 404, { error: "That code didn't work. Check it with your coach." });
                return;
            }
            sendJson(res, 200, { name: student.name, code: student.code });
            return;
        }
        if (parts[0] === 'me' && req.method === 'GET') {
            const student = await findByCode(req.headers['x-student-code']);
            if (!student) {
                sendJson(res, 401, { error: 'Signed out' });
                return;
            }
            sendJson(res, 200, { name: student.name });
            return;
        }
        sendJson(res, 404, { error: 'Not found' });
    }

    return { handleAdmin, handleStudent };
}
