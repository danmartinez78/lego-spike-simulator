// MCP server for coaches' AI assistants (Claude and other MCP clients):
//   POST /mcp    MCP over HTTP (stateless "streamable HTTP", JSON replies only)
//
// Every call needs a signed-in coach, the same as /api/admin: a Cloudflare
// Access token (people sign in through Access's Managed OAuth; scripts can use
// a service token) or a direct LAN connection. What an assistant saves is
// stamped with that coach's identity and starts as a draft, so publishing stays
// a click on the coach page, and an assistant can only replace or delete its
// own coach's drafts.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `Tools for coaches using the LEGO SPIKE simulator.
To write a lesson: read get_lesson_guide first (it lists this site's fields with their mat sizes, robots and programs), write the lesson JSON, run check_lesson until it has no errors, then save_lesson. Saved lessons are drafts that students can't see until a coach publishes them on the coach page (/coach).`;

/** @param {Record<string, unknown>} properties @param {string[]} [required] */
const object = (properties, required = []) => ({ type: 'object', properties, required });

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
            "How to write a lesson (Markdown): the lesson format, the check rules, and this site's fields with their mat sizes and robot start positions, robots, programs and existing lessons. Read this before writing a lesson.",
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
        name: 'list_library',
        description:
            'List what is in the shared library: lessons (with title, draft state and author), fields (scenes), robots and example programs.',
        inputSchema: object({}),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'get_lesson',
        description: 'Get one lesson from the library as JSON, by its file name from list_library.',
        inputSchema: object(
            {
                name: {
                    type: 'string',
                    description: 'Lesson file name, e.g. "Drive a square.json"'
                }
            },
            ['name']
        ),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'check_lesson',
        description:
            'Check a lesson without saving it. Returns errors (must be fixed) and warnings (worth reading), the same checks the coach page and save_lesson use.',
        inputSchema: object({ lesson: { type: 'object', description: 'The lesson JSON' } }, [
            'lesson'
        ]),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'save_lesson',
        description:
            "Save a lesson to the library as a draft, which students can't see until a coach publishes it on the coach page. The file name comes from the title unless given. Refuses to replace a published lesson or another coach's lesson; set replace to true to update your own draft.",
        inputSchema: object(
            {
                lesson: { type: 'object', description: 'The lesson JSON' },
                name: {
                    type: 'string',
                    description: 'File name to save as (optional, defaults to the title)'
                },
                replace: {
                    type: 'boolean',
                    description: 'Replace your own draft with the same name'
                }
            },
            ['lesson']
        )
    },
    {
        name: 'delete_lesson',
        description:
            'Delete a draft lesson you saved. Published lessons and other coaches’ lessons can only be removed on the coach page.',
        inputSchema: object({ name: { type: 'string', description: 'Lesson file name' } }, [
            'name'
        ]),
        annotations: { destructiveHint: true }
    }
];

class ToolError extends Error {}

/** A lesson file name from a title, like libraryFileName() in src/lib/library.ts. */
function lessonFileName(title) {
    let clean = String(title)
        .trim()
        .replace(/[^\w .()+-]/g, '_')
        .slice(0, 90);
    if (!/^\w/.test(clean)) clean = 'lesson ' + clean;
    if (!clean.toLowerCase().endsWith('.json')) clean += '.json';
    return clean;
}

export function createMcp({
    libraryDir,
    schemaFile,
    writer,
    listLibrary,
    lessonsApi,
    lessonProblems,
    safeName,
    sendJson,
    send,
    readBody
}) {
    const lessonsDir = path.join(libraryDir, 'lessons');

    async function readLesson(name) {
        const file = safeName('lessons', name);
        if (!file) throw new ToolError(`"${name}" is not a lesson file name`);
        try {
            return {
                file,
                lesson: JSON.parse(await fsp.readFile(path.join(lessonsDir, file), 'utf8'))
            };
        } catch {
            return { file, lesson: undefined };
        }
    }

    const tools = {
        whoami: async (_args, who) => ({ signedInAs: who }),

        get_lesson_guide: async () => lessonsApi.guide(),

        get_lesson_schema: async () => fsp.readFile(schemaFile, 'utf8'),

        list_library: async () => {
            const library = await listLibrary();
            return {
                lessons: library.lessons.map((e) => ({
                    name: e.name,
                    title: e.lesson?.title,
                    topic: e.lesson?.topic,
                    draft: !!e.lesson?.draft,
                    author: e.lesson?.author,
                    field: e.lesson?.field,
                    hasCheck: !!e.lesson?.check,
                    modified: e.modified
                })),
                scenes: library.scenes.map((e) => e.name),
                robots: library.robots.map((e) => e.name),
                programs: library.programs.map((e) => ({ name: e.name, title: e.card?.title })),
                defaults: library.defaults
            };
        },

        get_lesson: async ({ name }) => {
            const { lesson } = await readLesson(name);
            if (!lesson) throw new ToolError(`There is no lesson called ${name}`);
            return lesson;
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

        save_lesson: async ({ lesson, name, replace }, who) => {
            if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) {
                throw new ToolError('lesson must be a JSON object');
            }
            const { errors, warnings } = lessonProblems(lesson, await lessonsApi.context());
            if (errors.length > 0) {
                return { saved: false, errors, warnings };
            }
            const fileName = safeName('lessons', lessonFileName(name || lesson.title));
            if (!fileName) {
                throw new ToolError(`Can't use "${name ?? lesson.title}" as a file name`);
            }
            const existing = (await readLesson(fileName)).lesson;
            const exists = fs.existsSync(path.join(lessonsDir, fileName));
            if (exists) {
                if (!existing || !existing.draft) {
                    throw new ToolError(
                        `${fileName} is already a published lesson. Save under another name; a coach can replace it on the coach page.`
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
            const saved = { ...lesson, draft: true, author: who };
            const file = path.join(lessonsDir, fileName);
            await fsp.writeFile(file + '.tmp', JSON.stringify(saved, null, 4));
            await fsp.rename(file + '.tmp', file);
            console.log(`${who} saved lessons/${fileName} through MCP`);
            return {
                saved: true,
                name: fileName,
                draft: true,
                warnings,
                next: 'A coach can review it and press Publish on the coach page, Lessons tab: /coach'
            };
        },

        delete_lesson: async ({ name }, who) => {
            const { file, lesson } = await readLesson(name);
            if (!lesson) throw new ToolError(`There is no lesson called ${name}`);
            if (!lesson.draft || lesson.author !== who) {
                throw new ToolError(
                    'You can only delete your own drafts here. Use the coach page for anything else.'
                );
            }
            await fsp.rm(path.join(lessonsDir, file), { force: true });
            console.log(`${who} deleted lessons/${file} through MCP`);
            return { deleted: file };
        }
    };

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
