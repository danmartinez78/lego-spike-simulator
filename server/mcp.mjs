// MCP server for coaches' AI assistants (Claude and other MCP clients):
//   POST /mcp    MCP over HTTP (stateless "streamable HTTP", JSON replies only)
//
// Every call needs a signed-in coach, the same as /api/admin: a Cloudflare
// Access token (people sign in through Access's Managed OAuth; scripts can use
// a service token) or a direct LAN connection. What an assistant saves is
// stamped with that coach's identity and starts as a draft, so publishing stays
// a click on the coach page, and an assistant can only replace or delete its
// own coach's drafts. Lessons and challenges work the same way.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `Tools for coaches using the LEGO SPIKE simulator.
Lessons are step-by-step activities; challenges are short goals with hints and no steps. Both can have a check that the simulator runs over five runs.
To write either: read get_lesson_guide first (it explains both formats and lists this site's fields with their mat sizes, robots, programs, lessons and challenges), write the JSON, run check_lesson or check_challenge until there are no errors, then save_lesson or save_challenge. Saved work is a draft that students can't see until a coach publishes it on the coach page (/coach).`;

/** @param {Record<string, unknown>} properties @param {string[]} [required] */
const object = (properties, required = []) => ({ type: 'object', properties, required });

// Lessons and challenges get the same four tools each.
const KINDS = {
    lessons: {
        one: 'lesson',
        example: 'Drive a square.json',
        tab: 'Lessons',
        schema: 'lesson-v1.json'
    },
    challenges: {
        one: 'challenge',
        example: 'target-a.json',
        tab: 'Challenges',
        schema: 'challenge-v1.json'
    }
};

const kindTools = Object.values(KINDS).flatMap((k) => [
    {
        name: `get_${k.one}`,
        description: `Get one ${k.one} from the library as JSON, by its file name from list_library.`,
        inputSchema: object(
            { name: { type: 'string', description: `File name, e.g. "${k.example}"` } },
            ['name']
        ),
        annotations: { readOnlyHint: true }
    },
    {
        name: `check_${k.one}`,
        description: `Check a ${k.one} without saving it. Returns errors (must be fixed) and warnings (worth reading), the same checks the coach page and save_${k.one} use.`,
        inputSchema: object({ [k.one]: { type: 'object', description: `The ${k.one} JSON` } }, [
            k.one
        ]),
        annotations: { readOnlyHint: true }
    },
    {
        name: `save_${k.one}`,
        description:
            `Save a ${k.one} to the library as a draft, which students can't see until a coach publishes it on the coach page. ` +
            `The file name comes from the title unless given${k.one == 'challenge' ? " (a challenge's id is its file name without .json)" : ''}. ` +
            `Refuses to replace a published ${k.one} or another coach's draft; set replace to true to update your own draft.`,
        inputSchema: object(
            {
                [k.one]: { type: 'object', description: `The ${k.one} JSON` },
                name: {
                    type: 'string',
                    description: 'File name to save as (optional, defaults to the title)'
                },
                replace: {
                    type: 'boolean',
                    description: 'Replace your own draft with the same name'
                }
            },
            [k.one]
        )
    },
    {
        name: `delete_${k.one}`,
        description: `Delete a draft ${k.one} you saved. Published ${k.one}s and other coaches’ ${k.one}s can only be removed on the coach page.`,
        inputSchema: object({ name: { type: 'string', description: 'File name' } }, ['name']),
        annotations: { destructiveHint: true }
    }
]);

const TOOLS = [
    {
        name: 'whoami',
        description: 'Show which coach this connection is signed in as.',
        inputSchema: object({}),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'get_lesson_guide',
        description:
            "How to write lessons and challenges (Markdown): both formats, the check rules, and this site's fields with their mat sizes and robot start positions, robots, programs, lessons and challenges. Read this first.",
        inputSchema: object({}),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'get_lesson_schema',
        description: 'The JSON schema for a lesson (spike-lesson/1).',
        inputSchema: object({}),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'get_challenge_schema',
        description:
            'The JSON schema for a challenge (spike-challenge/1). Its check is the same as a lesson’s.',
        inputSchema: object({}),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'list_library',
        description:
            'List what is in the shared library: lessons and challenges (with title, draft state and author), fields (scenes), robots and example programs.',
        inputSchema: object({}),
        annotations: { readOnlyHint: true }
    },
    ...kindTools
];

class ToolError extends Error {}

/** A file name from a title. Lessons keep the title, like libraryFileName() in
 *  src/lib/library.ts; challenges use a short id like "target-a". */
function fileNameFor(kind, title) {
    let clean = String(title).trim();
    if (kind === 'challenges') {
        clean = clean
            .replace(/\.json$/i, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
        if (!clean) clean = 'challenge';
    } else {
        clean = clean.replace(/[^\w .()+-]/g, '_').slice(0, 90);
        if (!/^\w/.test(clean)) clean = 'lesson ' + clean;
    }
    if (!clean.toLowerCase().endsWith('.json')) clean += '.json';
    return clean;
}

export function createMcp({
    libraryDir,
    schemasDir,
    writer,
    listLibrary,
    lessonsApi,
    lessonProblems,
    challengeProblems,
    safeName,
    sendJson,
    send,
    readBody
}) {
    const problems = { lessons: lessonProblems, challenges: challengeProblems };

    async function readItem(kind, name) {
        const file = safeName(kind, name);
        if (!file) throw new ToolError(`"${name}" is not a ${KINDS[kind].one} file name`);
        try {
            const text = await fsp.readFile(path.join(libraryDir, kind, file), 'utf8');
            return { file, item: JSON.parse(text) };
        } catch {
            return { file, item: undefined };
        }
    }

    function summary(kind, e) {
        const item = kind === 'lessons' ? e.lesson : e.challenge;
        return {
            name: e.name,
            title: item?.title,
            ...(kind === 'lessons'
                ? { topic: item?.topic }
                : { id: e.name.replace(/\.json$/, ''), skill: item?.skill, level: item?.level }),
            draft: !!item?.draft,
            author: item?.author,
            field: item?.field,
            hasCheck: !!item?.check,
            modified: e.modified
        };
    }

    async function save(kind, item, name, replace, who) {
        const { one, tab } = KINDS[kind];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new ToolError(`${one} must be a JSON object`);
        }
        const { errors, warnings } = problems[kind](item, await lessonsApi.context());
        if (errors.length > 0) {
            return { saved: false, errors, warnings };
        }
        const fileName = safeName(kind, fileNameFor(kind, name || item.title));
        if (!fileName) {
            throw new ToolError(`Can't use "${name ?? item.title}" as a file name`);
        }
        const existing = (await readItem(kind, fileName)).item;
        if (fs.existsSync(path.join(libraryDir, kind, fileName))) {
            if (!existing || !existing.draft) {
                throw new ToolError(
                    `${fileName} is already a published ${one}. Save under another name; a coach can replace it on the coach page.`
                );
            }
            if (existing.author !== who) {
                throw new ToolError(
                    `${fileName} is another coach's draft. Save under another name.`
                );
            }
            if (!replace) {
                throw new ToolError(
                    `You already have a draft called ${fileName}. Set replace to true to update it, or pick another name.`
                );
            }
        }
        const saved = { ...item, draft: true, author: who };
        const file = path.join(libraryDir, kind, fileName);
        await fsp.writeFile(file + '.tmp', JSON.stringify(saved, null, 4));
        await fsp.rename(file + '.tmp', file);
        console.log(`${who} saved ${kind}/${fileName} through MCP`);
        return {
            saved: true,
            name: fileName,
            ...(kind === 'challenges' ? { id: fileName.replace(/\.json$/, '') } : {}),
            draft: true,
            warnings,
            next: `A coach can review it and press Publish on the coach page, ${tab} tab: /coach`
        };
    }

    async function remove(kind, name, who) {
        const { one } = KINDS[kind];
        const { file, item } = await readItem(kind, name);
        if (!item) throw new ToolError(`There is no ${one} called ${name}`);
        if (!item.draft || item.author !== who) {
            throw new ToolError(
                'You can only delete your own drafts here. Use the coach page for anything else.'
            );
        }
        await fsp.rm(path.join(libraryDir, kind, file), { force: true });
        console.log(`${who} deleted ${kind}/${file} through MCP`);
        return { deleted: file };
    }

    const tools = {
        whoami: async (_args, who) => ({ signedInAs: who }),

        get_lesson_guide: async () => lessonsApi.guide(),

        get_lesson_schema: async () =>
            fsp.readFile(path.join(schemasDir, KINDS.lessons.schema), 'utf8'),

        get_challenge_schema: async () =>
            fsp.readFile(path.join(schemasDir, KINDS.challenges.schema), 'utf8'),

        list_library: async () => {
            const library = await listLibrary();
            return {
                lessons: library.lessons.map((e) => summary('lessons', e)),
                challenges: library.challenges.map((e) => summary('challenges', e)),
                scenes: library.scenes.map((e) => e.name),
                robots: library.robots.map((e) => e.name),
                programs: library.programs.map((e) => ({ name: e.name, title: e.card?.title })),
                defaults: library.defaults
            };
        },

        check_lesson: async ({ lesson }) => {
            const result = await lessonsApi.checkUpload(
                Buffer.from(JSON.stringify(lesson ?? null))
            );
            return {
                ok: result.errors.length === 0,
                errors: result.errors,
                warnings: result.warnings
            };
        },

        check_challenge: async ({ challenge }) => {
            const result = await lessonsApi.checkChallenge(
                Buffer.from(JSON.stringify(challenge ?? null))
            );
            return {
                ok: result.errors.length === 0,
                errors: result.errors,
                warnings: result.warnings
            };
        }
    };
    for (const [kind, { one }] of Object.entries(KINDS)) {
        tools[`get_${one}`] = async (args) => {
            const { item } = await readItem(kind, args.name);
            if (!item) throw new ToolError(`There is no ${one} called ${args.name}`);
            return item;
        };
        tools[`save_${one}`] = async (args, who) =>
            save(kind, args[one], args.name, args.replace, who);
        tools[`delete_${one}`] = async (args, who) => remove(kind, args.name, who);
    }

    async function callTool(params, who) {
        const tool = tools[params?.name];
        if (!tool) return { error: { code: -32602, message: `Unknown tool: ${params?.name}` } };
        try {
            const value = await tool(params.arguments ?? {}, who);
            const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
            const result = { content: [{ type: 'text', text }] };
            if (typeof value !== 'string') result.structuredContent = value;
            return { result };
        } catch (e) {
            if (!(e instanceof ToolError)) console.log('MCP tool failed', params.name, e);
            const message = e instanceof ToolError ? e.message : 'The tool failed on the server';
            return { result: { content: [{ type: 'text', text: message }], isError: true } };
        }
    }

    async function answer(message, who) {
        const { id, method, params } = message ?? {};
        const isRequest = id !== undefined && id !== null;
        let outcome;
        if (typeof method !== 'string') {
            outcome = { error: { code: -32600, message: 'Invalid request' } };
        } else if (method === 'initialize') {
            const asked = params?.protocolVersion;
            outcome = {
                result: {
                    protocolVersion: PROTOCOL_VERSIONS.includes(asked)
                        ? asked
                        : PROTOCOL_VERSIONS[0],
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: {
                        name: 'spike-simulator',
                        title: 'LEGO SPIKE Simulator',
                        version: '1.0.0'
                    },
                    instructions: INSTRUCTIONS
                }
            };
        } else if (method === 'ping') {
            outcome = { result: {} };
        } else if (method === 'tools/list') {
            outcome = { result: { tools: TOOLS } };
        } else if (method === 'tools/call') {
            outcome = await callTool(params, who);
        } else if (method.startsWith('notifications/')) {
            return undefined;
        } else {
            outcome = { error: { code: -32601, message: `Method not found: ${method}` } };
        }
        return isRequest ? { jsonrpc: '2.0', id, ...outcome } : undefined;
    }

    async function handle(req, res) {
        // Browsers send Origin; refuse pages on other sites (DNS rebinding).
        const origin = req.headers.origin;
        if (origin) {
            let host;
            try {
                host = new URL(String(origin)).host;
            } catch {
                host = '';
            }
            if (host !== req.headers.host) {
                sendJson(res, 403, { error: 'Cross-site requests are not allowed' });
                return;
            }
        }
        if (req.method !== 'POST') {
            // No server-to-client stream: every reply comes back on the POST.
            send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8', { Allow: 'POST' });
            return;
        }
        const who = await writer(req);
        if (!who) {
            sendJson(res, 401, { error: 'Sign in as a coach to use this server' });
            return;
        }
        let body;
        try {
            body = JSON.parse((await readBody(req)).toString('utf8'));
        } catch {
            sendJson(res, 400, {
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: 'Parse error' }
            });
            return;
        }
        const batch = Array.isArray(body);
        const replies = [];
        for (const message of batch ? body : [body]) {
            const reply = await answer(message, who);
            if (reply) replies.push(reply);
        }
        if (replies.length === 0) {
            res.writeHead(202);
            res.end();
            return;
        }
        sendJson(res, 200, batch ? replies : replies[0]);
    }

    return { handle };
}
