// One-time upload links for coaches' AI assistants (server/mcp.mjs):
//   PUT /api/upload/<token>   the raw file, once, before the link expires
//
// MCP tools carry files as base64 text inside the tool call, which is slow for
// an assistant to write out and easy to get wrong for anything bigger than a
// few kilobytes. Instead, the start_upload tool makes a link here; the
// assistant sends the file to it from its own workspace (curl -T), then passes
// the link's upload_id to upload_program, add_mission_version, upload_field or
// upload_robot.
//
// The link is the only key: it is random, made only for a signed-in coach
// (through /mcp), takes one file of at most maxBytes, is only usable by that
// coach's tool calls, and expires after a few minutes. Files are kept in memory
// and dropped when used or expired, so nothing is written until a tool saves it.

import crypto from 'node:crypto';
import { readZip } from './zip.mjs';

const LIFETIME_MS = 10 * 60 * 1000;
const MAX_OPEN_PER_COACH = 20;

export class UploadError extends Error {}

/** @param {Buffer} data */
export function fingerprint(data) {
    return {
        bytes: data.length,
        sha256: crypto.createHash('sha256').update(data).digest('hex')
    };
}

/** A .llsp3 or .spk (zip) file, or an LDraw .mpd/.ldr model (text). */
function looksLikeFile(data) {
    try {
        readZip(data);
        return true;
    } catch {
        const text = data.toString('utf8');
        return !text.includes('\0') && /^\s*1\s/m.test(text);
    }
}

export function createUploads({ maxBytes, sendJson, readBody }) {
    /** @type {Map<string, { who: string, expires: number, data?: Buffer, receiving?: boolean }>} */
    const slots = new Map();

    function sweep() {
        const now = Date.now();
        for (const [token, slot] of slots) if (slot.expires < now) slots.delete(token);
    }

    /** Make a link for a coach. @param {string} who */
    function start(who) {
        sweep();
        const open = [...slots.values()].filter((s) => s.who === who).length;
        if (open >= MAX_OPEN_PER_COACH) {
            throw new UploadError(
                `You have ${open} upload links open. Use them, or wait a few minutes for them to expire.`
            );
        }
        const token = crypto.randomBytes(24).toString('base64url');
        const expires = Date.now() + LIFETIME_MS;
        slots.set(token, { who, expires });
        return { token, expires: new Date(expires).toISOString(), maxBytes };
    }

    /** The uploaded file, for the coach who made the link. @param {string} token @param {string} who */
    function get(token, who) {
        sweep();
        const slot = slots.get(token);
        if (!slot || slot.who !== who) {
            throw new UploadError(
                'There is no upload with that upload_id (links expire after 10 minutes). Use start_upload again.'
            );
        }
        if (!slot.data) {
            throw new UploadError(
                'Nothing has been sent to that upload link yet. Send the file to its url first.'
            );
        }
        return slot.data;
    }

    /** Forget an upload once a tool has saved it. @param {string} token */
    function done(token) {
        slots.delete(token);
    }

    async function handle(req, res, token) {
        if (req.method !== 'PUT' && req.method !== 'POST') {
            sendJson(res, 405, { error: 'Send the file with PUT' });
            return;
        }
        sweep();
        const slot = slots.get(String(token ?? ''));
        if (!slot) {
            sendJson(res, 404, { error: 'This upload link has expired or does not exist' });
            return;
        }
        if (slot.data || slot.receiving) {
            sendJson(res, 409, { error: 'This upload link has already been used' });
            return;
        }
        if (+(req.headers['content-length'] ?? 0) > maxBytes) {
            sendJson(res, 413, { error: `The file is too large (${maxBytes} bytes at most)` });
            return;
        }
        let data;
        slot.receiving = true;
        try {
            data = await readBody(req);
        } catch {
            slot.receiving = false;
            sendJson(res, 413, { error: `The file is too large (${maxBytes} bytes at most)` });
            return;
        }
        slot.receiving = false;
        if (data.length === 0) {
            sendJson(res, 400, { error: 'The file is empty' });
            return;
        }
        if (data.length > maxBytes) {
            sendJson(res, 413, { error: `The file is too large (${maxBytes} bytes at most)` });
            return;
        }
        if (!looksLikeFile(data)) {
            sendJson(res, 400, {
                error: 'That is not a .llsp3 or .spk file (zip) or an LDraw .mpd/.ldr model'
            });
            return;
        }
        slot.data = data;
        sendJson(res, 200, {
            upload_id: token,
            ...fingerprint(data),
            next: 'Pass upload_id to upload_program, add_mission_version, upload_field or upload_robot instead of content_base64.'
        });
    }

    return { start, get, done, handle };
}
