// Team settings the head coach chooses on the coach page (Settings tab), kept
// in TEAM_DIR/settings.json. Everything here is safe to show to anyone: the
// privacy page reads it to tell families what the site does.
//
// HEAD_COACHES (comma-separated emails) limits who can change them. Without
// it, any signed-in coach can. Writers on the home network always can.

import fsp from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_SETTINGS = {
    teamName: '',
    // What coaches' AI assistants see of students: team statistics per lesson
    // ('stats'), or each student's name and progress as well ('names').
    aiStudentNames: 'stats',
    // Sign a student out after this many minutes without using the site (0: never).
    signOutAfterMinutes: 0
};

const AI_CHOICES = ['stats', 'names'];
const SIGN_OUT_CHOICES = [0, 30, 60, 120];

export function createSettings({ teamDir, sendJson, readBody }) {
    const file = path.join(teamDir, 'settings.json');
    const headCoaches = (process.env.HEAD_COACHES ?? '')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x.length > 0);
    let cache;

    async function load() {
        if (cache) return cache;
        let saved = {};
        try {
            saved = JSON.parse(await fsp.readFile(file, 'utf8'));
        } catch {
            saved = {};
        }
        cache = clean(saved, DEFAULT_SETTINGS);
        return cache;
    }

    function text(value, max) {
        return String(value ?? '')
            .replace(/[<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, max);
    }

    function clean(input, base) {
        const result = { ...base };
        if (input.teamName !== undefined) result.teamName = text(input.teamName, 60);
        if (AI_CHOICES.includes(input.aiStudentNames)) result.aiStudentNames = input.aiStudentNames;
        if (SIGN_OUT_CHOICES.includes(Number(input.signOutAfterMinutes))) {
            result.signOutAfterMinutes = Number(input.signOutAfterMinutes);
        }
        return result;
    }

    function canEdit(who) {
        if (!who) return false;
        if (headCoaches.length === 0 || who.startsWith('lan ')) return true;
        return headCoaches.includes(who.toLowerCase());
    }

    // GET /api/settings: public.
    async function handlePublic(req, res) {
        if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'Method not allowed' });
            return;
        }
        sendJson(res, 200, await load());
    }

    // /api/admin/settings: coaches read, head coaches change.
    async function handleAdmin(req, res, who) {
        if (req.method === 'GET') {
            sendJson(res, 200, {
                settings: await load(),
                canEdit: canEdit(who),
                headCoaches: headCoaches.length > 0
            });
            return;
        }
        if (req.method !== 'PUT') {
            sendJson(res, 405, { error: 'Method not allowed' });
            return;
        }
        if (!canEdit(who)) {
            sendJson(res, 403, { error: 'Only a head coach can change the team settings' });
            return;
        }
        let input;
        try {
            input = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch {
            sendJson(res, 400, { error: 'Bad request' });
            return;
        }
        const next = clean(input ?? {}, await load());
        await fsp.mkdir(teamDir, { recursive: true });
        await fsp.writeFile(file + '.tmp', JSON.stringify(next, null, 2));
        await fsp.rename(file + '.tmp', file);
        cache = next;
        console.log(`${who} changed the team settings`);
        sendJson(res, 200, { settings: next, canEdit: true, headCoaches: headCoaches.length > 0 });
    }

    return { load, canEdit, handlePublic, handleAdmin };
}
