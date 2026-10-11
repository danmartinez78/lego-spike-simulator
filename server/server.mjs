// Small dependency-free server for self-hosting the simulator.
//
// Serves:
//   /                  the built app (DIST_DIR)
//   /coach             the same app, showing the coach tools page
//   /ldraw/...         an extracted LDraw parts library (LDRAW_DIR), with parts.lst
//   /api/library       list of shared robots and scenes (LIBRARY_DIR)
//   /api/library/{robots|scenes}/<file>   download one entry
//   /api/admin/...     write operations (upload, delete, rename, set default, roster)
//   /api/student/...   student sign-in with a roster code (TEAM_DIR)
//   /api/lessons/...   lesson authoring guide, schema and checker (read-only)
//
// Writes are accepted from:
//   - clients whose address starts with one of LAN_WRITE_PREFIXES
//     (e.g. "192.168.0.") when they connect directly, not through a proxy;
//   - requests carrying a valid Cloudflare Access token
//     (CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD);
//   - anyone, when ALLOW_UNAUTHENTICATED_WRITES=1 (only sensible on a private LAN).

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTeam } from './team.mjs';
import { createHomework } from './homework.mjs';
import { lessonProblems } from './lesson-rules.mjs';
import { createLessonsApi } from './lessons-api.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT ?? 8080);
const DIST_DIR = path.resolve(process.env.DIST_DIR ?? path.join(here, '..', 'dist'));
const LDRAW_DIR = path.resolve(process.env.LDRAW_DIR ?? path.join(here, '..', 'ldraw'));
const LIBRARY_DIR = path.resolve(process.env.LIBRARY_DIR ?? path.join(here, '..', 'library'));
const TEAM_DIR = path.resolve(process.env.TEAM_DIR ?? path.join(path.dirname(LIBRARY_DIR), 'team'));
const SEED_DIR = path.resolve(process.env.SEED_DIR ?? path.join(here, '..', 'presets'));
const MAX_UPLOAD = +(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
const CF_TEAM = (process.env.CF_ACCESS_TEAM_DOMAIN ?? '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
const CF_AUD = process.env.CF_ACCESS_AUD ?? '';
const ALLOW_OPEN_WRITES = process.env.ALLOW_UNAUTHENTICATED_WRITES === '1';
const LAN_PREFIXES = (process.env.LAN_WRITE_PREFIXES ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

const KINDS = {
    robots: ['.mpd', '.ldr'],
    scenes: ['.spk'],
    // Example programs, each with an optional lesson card in <name>.llsp3.json
    programs: ['.llsp3', '.json'],
    // Lessons: <name>.json following schemas/lesson-v1.json
    lessons: ['.json']
};

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.lst': 'text/plain; charset=utf-8',
    '.dat': 'text/plain; charset=utf-8',
    '.ldr': 'text/plain; charset=utf-8',
    '.mpd': 'text/plain; charset=utf-8',
    '.spk': 'application/zip',
    '.zip': 'application/zip',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
};

// ---------------------------------------------------------------------------
// Library storage

async function ensureLibrary() {
    for (const kind of Object.keys(KINDS)) {
        await fsp.mkdir(path.join(LIBRARY_DIR, kind), { recursive: true });
    }
    if (!fs.existsSync(SEED_DIR)) return;
    // Copy bundled presets that this library has never seen. Remembering what
    // was seeded means a preset someone deleted doesn't come back on restart.
    const seededFile = path.join(LIBRARY_DIR, '.seeded.json');
    let seeded = [];
    try {
        seeded = JSON.parse(await fsp.readFile(seededFile, 'utf8'));
    } catch {
        seeded = [];
    }
    const defaultsFile = path.join(LIBRARY_DIR, 'defaults.json');
    const firstStart = !fs.existsSync(defaultsFile);
    for (const kind of Object.keys(KINDS)) {
        const from = path.join(SEED_DIR, kind);
        if (!fs.existsSync(from)) continue;
        for (const name of await fsp.readdir(from)) {
            const key = `${kind}/${name}`;
            if (!safeName(kind, name) || seeded.includes(key)) continue;
            const target = path.join(LIBRARY_DIR, kind, name);
            if (!fs.existsSync(target)) {
                await fsp.copyFile(path.join(from, name), target);
            }
            seeded.push(key);
        }
    }
    await fsp.writeFile(seededFile, JSON.stringify(seeded, null, 2));
    const seedDefaults = path.join(SEED_DIR, 'defaults.json');
    if (firstStart && fs.existsSync(seedDefaults)) {
        await fsp.copyFile(seedDefaults, defaultsFile);
    }
}

function safeName(kind, name) {
    if (!KINDS[kind]) return undefined;
    const base = path.basename(String(name)).trim();
    if (!/^[\w][\w .()+-]{0,100}$/.test(base)) return undefined;
    const ext = path.extname(base).toLowerCase();
    if (!KINDS[kind].includes(ext)) return undefined;
    return base;
}

async function readDefaults() {
    try {
        return JSON.parse(await fsp.readFile(path.join(LIBRARY_DIR, 'defaults.json'), 'utf8'));
    } catch {
        return {};
    }
}

async function writeDefaults(defaults) {
    const file = path.join(LIBRARY_DIR, 'defaults.json');
    await fsp.writeFile(file + '.tmp', JSON.stringify(defaults, null, 2));
    await fsp.rename(file + '.tmp', file);
}

async function listLibrary() {
    const result = {
        robots: [],
        scenes: [],
        programs: [],
        lessons: [],
        defaults: await readDefaults()
    };
    for (const kind of Object.keys(KINDS)) {
        const dir = path.join(LIBRARY_DIR, kind);
        const names = fs.existsSync(dir) ? await fsp.readdir(dir) : [];
        for (const name of names.sort((a, b) => a.localeCompare(b))) {
            if (!safeName(kind, name)) continue;
            if (kind !== 'lessons' && name.toLowerCase().endsWith('.json')) continue;
            const stat = await fsp.stat(path.join(dir, name));
            const entry = { name, size: stat.size, modified: stat.mtime.toISOString() };
            if (kind === 'lessons') {
                try {
                    entry.lesson = JSON.parse(await fsp.readFile(path.join(dir, name), 'utf8'));
                } catch {
                    continue;
                }
            }
            if (kind === 'programs') {
                try {
                    entry.card = JSON.parse(
                        await fsp.readFile(path.join(dir, name + '.json'), 'utf8')
                    );
                } catch {
                    // no lesson card
                }
            }
            result[kind].push(entry);
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// Cloudflare Access verification

let certCache = { keys: [], fetched: 0 };

async function accessKeys() {
    if (Date.now() - certCache.fetched < 60 * 60 * 1000 && certCache.keys.length > 0) {
        return certCache.keys;
    }
    const response = await fetch(`https://${CF_TEAM}/cdn-cgi/access/certs`);
    const body = await response.json();
    certCache = { keys: body.keys ?? [], fetched: Date.now() };
    return certCache.keys;
}

function b64url(input) {
    return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function verifyAccessToken(token) {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return undefined;
    const header = JSON.parse(b64url(h).toString('utf8'));
    const payload = JSON.parse(b64url(p).toString('utf8'));
    const jwk = (await accessKeys()).find((k) => k.kid === header.kid);
    if (!jwk || header.alg !== 'RS256') return undefined;
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, b64url(s));
    if (!ok) return undefined;
    const now = Date.now() / 1000;
    if (payload.exp && payload.exp < now) return undefined;
    if (payload.nbf && payload.nbf > now + 60) return undefined;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(CF_AUD)) return undefined;
    if (payload.iss && payload.iss !== `https://${CF_TEAM}`) return undefined;
    return payload.email ?? payload.sub ?? 'unknown';
}

function cookie(req, name) {
    const header = req.headers.cookie ?? '';
    for (const part of header.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name) return v.join('=');
    }
    return undefined;
}

function lanClient(req) {
    // Anything that came through a proxy (Nginx Proxy Manager, Cloudflare) is not local.
    if (req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']) return undefined;
    const address = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    return LAN_PREFIXES.some((prefix) => address.startsWith(prefix)) ? `lan ${address}` : undefined;
}

async function writer(req) {
    const lan = lanClient(req);
    if (lan) return lan;
    if (CF_TEAM && CF_AUD) {
        const token = req.headers['cf-access-jwt-assertion'] ?? cookie(req, 'CF_Authorization');
        if (!token) return undefined;
        try {
            return await verifyAccessToken(String(token));
        } catch (e) {
            console.log('Access token check failed', e);
            return undefined;
        }
    }
    return ALLOW_OPEN_WRITES ? 'anonymous' : undefined;
}

// ---------------------------------------------------------------------------
// HTTP helpers

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
    res.writeHead(status, { 'Content-Type': type, ...extra });
    res.end(body);
}

function sendJson(res, status, value) {
    send(res, status, JSON.stringify(value), MIME['.json'], { 'Cache-Control': 'no-store' });
}

async function sendFile(res, file, cache = 'no-cache') {
    try {
        const stat = await fsp.stat(file);
        if (!stat.isFile()) throw new Error('not a file');
        const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': type,
            'Content-Length': stat.size,
            'Cache-Control': cache
        });
        fs.createReadStream(file).pipe(res);
    } catch {
        send(res, 404, 'Not found');
    }
}

function within(root, relative) {
    const file = path.resolve(root, '.' + path.posix.normalize('/' + relative));
    return file.startsWith(root + path.sep) || file === root ? file : undefined;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_UPLOAD) {
                reject(new Error('too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

// ---------------------------------------------------------------------------
// Routes

async function handleAdmin(req, res, parts) {
    const who = await writer(req);
    // Visiting /api/admin/login in a browser goes through Cloudflare Access,
    // then lands back on the app (or the coach page, with ?to=coach) signed in.
    if (parts[0] === 'login' && req.method === 'GET') {
        const to = new URL(req.url ?? '/', 'http://localhost').searchParams.get('to');
        res.writeHead(302, { Location: to === 'coach' ? '/coach' : '/' });
        res.end();
        return;
    }
    if (parts[0] === 'whoami' && req.method === 'GET') {
        sendJson(res, 200, { writer: who ?? null });
        return;
    }
    if (!who) {
        sendJson(res, 401, { error: 'Sign in to change the library' });
        return;
    }

    if (parts[0] === 'roster') {
        await team.handleAdmin(req, res, parts.slice(1), who);
        return;
    }
    if (parts[0] === 'homework' || parts[0] === 'progress') {
        await homework.handleAdmin(req, res, parts[0] === 'homework' ? parts.slice(1) : parts, who);
        return;
    }

    if (parts[0] === 'rename' && req.method === 'POST') {
        let body;
        try {
            body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch {
            sendJson(res, 400, { error: 'Bad request' });
            return;
        }
        const kind = String(body.kind ?? '');
        const from = safeName(kind, body.from ?? '');
        const to = safeName(kind, body.to ?? '');
        if (
            !from ||
            !to ||
            from.toLowerCase().endsWith('.json') ||
            to.toLowerCase().endsWith('.json')
        ) {
            sendJson(res, 400, { error: 'Bad library name or file type' });
            return;
        }
        const dir = path.join(LIBRARY_DIR, kind);
        if (!fs.existsSync(path.join(dir, from))) {
            sendJson(res, 404, { error: `${from} is not in the library` });
            return;
        }
        if (from !== to && fs.existsSync(path.join(dir, to))) {
            sendJson(res, 409, { error: `There is already something called ${to}` });
            return;
        }
        await fsp.rename(path.join(dir, from), path.join(dir, to));
        if (kind === 'programs' && fs.existsSync(path.join(dir, from + '.json'))) {
            const cardFile = path.join(dir, to + '.json');
            await fsp.rename(path.join(dir, from + '.json'), cardFile);
            try {
                const card = JSON.parse(await fsp.readFile(cardFile, 'utf8'));
                if (card.file) {
                    card.file = to;
                    await fsp.writeFile(cardFile, JSON.stringify(card, null, 2));
                }
            } catch {
                // not a readable lesson card
            }
        }
        // Keep the defaults and the lesson cards that point at a renamed scene.
        const defaults = await readDefaults();
        const field = kind === 'robots' ? 'robot' : kind === 'scenes' ? 'scene' : undefined;
        if (field && defaults[field] === from) {
            defaults[field] = to;
            await writeDefaults(defaults);
        }
        if (kind === 'scenes') {
            const programs = path.join(LIBRARY_DIR, 'programs');
            for (const name of await fsp.readdir(programs)) {
                if (!name.toLowerCase().endsWith('.json')) continue;
                const cardFile = path.join(programs, name);
                try {
                    const card = JSON.parse(await fsp.readFile(cardFile, 'utf8'));
                    if (card.scene === from) {
                        card.scene = to;
                        await fsp.writeFile(cardFile, JSON.stringify(card, null, 2));
                    }
                } catch {
                    // not a readable lesson card
                }
            }
        }
        console.log(`${who} renamed ${kind}/${from} to ${to}`);
        sendJson(res, 200, { name: to });
        return;
    }

    if (parts[0] === 'defaults' && req.method === 'PUT') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const defaults = await readDefaults();
        for (const [field, kind] of [
            ['robot', 'robots'],
            ['scene', 'scenes']
        ]) {
            if (body[field] === null) {
                delete defaults[field];
            } else if (body[field] !== undefined) {
                const name = safeName(kind, body[field]);
                if (!name || !fs.existsSync(path.join(LIBRARY_DIR, kind, name))) {
                    sendJson(res, 400, { error: `Unknown ${field}` });
                    return;
                }
                defaults[field] = name;
            }
        }
        await writeDefaults(defaults);
        sendJson(res, 200, defaults);
        return;
    }

    const [kind, rawName] = parts;
    const name = safeName(kind, rawName ?? '');
    if (!name || parts.length !== 2) {
        sendJson(res, 400, { error: 'Bad library path or file type' });
        return;
    }
    const file = path.join(LIBRARY_DIR, kind, name);
    if (req.method === 'PUT') {
        let body;
        try {
            body = await readBody(req);
        } catch {
            sendJson(res, 413, { error: 'File too large' });
            return;
        }
        const isCard = name.toLowerCase().endsWith('.json');
        if (!isCard && kind !== 'robots' && body.subarray(0, 2).toString('latin1') !== 'PK') {
            sendJson(res, 400, { error: 'Scenes and programs must be zip files' });
            return;
        }
        if (isCard) {
            let json;
            try {
                json = JSON.parse(body.toString('utf8'));
            } catch {
                sendJson(res, 400, { error: 'Lesson card must be JSON' });
                return;
            }
            if (kind === 'lessons') {
                const { errors } = lessonProblems(json, await lessonsApi.context());
                if (errors.length > 0) {
                    sendJson(res, 400, { error: errors[0], errors });
                    return;
                }
            }
        }
        await fsp.writeFile(file + '.tmp', body);
        await fsp.rename(file + '.tmp', file);
        console.log(`${who} saved ${kind}/${name} (${body.length} bytes)`);
        sendJson(res, 200, { name });
    } else if (req.method === 'DELETE') {
        await fsp.rm(file, { force: true });
        if (kind === 'programs') {
            await fsp.rm(file + '.json', { force: true });
        }
        const defaults = await readDefaults();
        const field = kind === 'robots' ? 'robot' : 'scene';
        if ((kind === 'robots' || kind === 'scenes') && defaults[field] === name) {
            delete defaults[field];
            await writeDefaults(defaults);
        }
        console.log(`${who} deleted ${kind}/${name}`);
        sendJson(res, 200, { deleted: name });
    } else {
        sendJson(res, 405, { error: 'Method not allowed' });
    }
}

async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = decodeURI(url.pathname);
    const parts = pathname.split('/').filter((x) => x.length > 0);

    if (parts[0] === 'api' && parts[1] === 'admin') {
        await handleAdmin(req, res, parts.slice(2));
        return;
    }
    if (parts[0] === 'api' && parts[1] === 'student') {
        if (parts[2] === 'signin' || parts[2] === 'me') {
            await team.handleStudent(req, res, parts.slice(2));
            return;
        }
        const { student, blocked } = await team.studentFor(req);
        if (blocked) {
            sendJson(res, 429, { error: 'Too many tries. Wait 10 minutes, then try again.' });
            return;
        }
        await homework.handleStudent(req, res, parts.slice(2), student);
        return;
    }
    if (parts[0] === 'api' && parts[1] === 'lessons') {
        await lessonsApi.handle(req, res, parts.slice(2));
        return;
    }
    if (parts[0] === 'api' && parts[1] === 'library') {
        if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'Method not allowed' });
            return;
        }
        if (parts.length === 2) {
            sendJson(res, 200, await listLibrary());
            return;
        }
        const name = safeName(parts[2], parts[3] ?? '');
        if (!name || parts.length !== 4) {
            send(res, 404, 'Not found');
            return;
        }
        await sendFile(res, path.join(LIBRARY_DIR, parts[2], name));
        return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(res, 405, 'Method not allowed');
        return;
    }
    // The coach page is the same single-file app; it picks the page from the path.
    // Keep it at /coach (no trailing slash) so the app's relative URLs still work.
    if (parts[0] === 'coach' && parts.length === 1) {
        if (pathname.endsWith('/')) {
            res.writeHead(301, { Location: '/coach' });
            res.end();
        } else {
            await sendFile(res, path.join(DIST_DIR, 'index.html'));
        }
        return;
    }
    if (parts[0] === 'ldraw') {
        const file = within(LDRAW_DIR, parts.slice(1).join('/'));
        if (file) {
            await sendFile(res, file, 'public, max-age=604800');
        } else {
            send(res, 404, 'Not found');
        }
        return;
    }
    const file = within(DIST_DIR, parts.length === 0 ? 'index.html' : parts.join('/'));
    if (file) {
        await sendFile(res, file);
    } else {
        send(res, 404, 'Not found');
    }
}

const team = createTeam({
    teamDir: TEAM_DIR,
    sendJson,
    readBody,
    onRemove: (id) => homework.removeStudent(id)
});
const homework = createHomework({ teamDir: TEAM_DIR, team, sendJson, send, readBody });
const lessonsApi = createLessonsApi({
    libraryDir: LIBRARY_DIR,
    docsDir: path.join(here, '..', 'docs'),
    schemaFile: path.join(here, '..', 'schemas', 'lesson-v1.json'),
    sendJson,
    send,
    readBody
});

await ensureLibrary();
http.createServer((req, res) => {
    handle(req, res).catch((e) => {
        console.log(e);
        if (!res.headersSent) send(res, 500, 'Server error');
        else res.end();
    });
}).listen(PORT, () => {
    console.log(`Serving ${DIST_DIR} on port ${PORT}`);
    console.log(`Library: ${LIBRARY_DIR}  LDraw: ${LDRAW_DIR}`);
    if (CF_TEAM && CF_AUD) console.log(`Writes require Cloudflare Access (${CF_TEAM})`);
    else if (ALLOW_OPEN_WRITES) console.log('WARNING: library writes are open to anyone');
    else console.log('No Cloudflare Access configured for library writes');
    if (LAN_PREFIXES.length > 0)
        console.log(`Direct LAN writes allowed from ${LAN_PREFIXES.join(', ')}`);
});
