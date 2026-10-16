// MCP server for coaches' AI assistants (Claude and other MCP clients):
//   POST /mcp    MCP over HTTP (stateless "streamable HTTP", JSON replies only)
//
// Every call needs a signed-in coach, the same as /api/admin: a Cloudflare
// Access token (people sign in through Access's Managed OAuth; scripts can use
// a service token) or a direct LAN connection. What an assistant saves is
// stamped with that coach's identity and starts as a draft, so publishing stays
// a click on the coach page, and an assistant can only replace or delete its
// own coach's drafts. Lessons, challenges and assignments work the same way.
// Robots, fields (maps) and example programs have no drafts: they go straight
// into the library for everyone, so an assistant can only add new ones and replace or delete
// the ones its coach's assistant added (server/authors.mjs keeps track).

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { buildField, fieldProblems } from './fields.mjs';
import { readZip } from './zip.mjs';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `Tools for coaches using the LEGO SPIKE simulator.
Lessons are step-by-step activities; challenges are short goals with hints and no steps. Both can have a check that the simulator runs over five runs.
To write either: read get_lesson_guide first (it explains both formats and lists this site's fields with their mat sizes, robots, programs, lessons and challenges), write the JSON, run check_lesson or check_challenge until there are no errors, then save_lesson or save_challenge. Saved work is a draft that students can't see until a coach publishes it on the coach page (/coach).
Assignments: list_assignments shows each assignment with team statistics (and each student's progress if the head coach allows it); save_assignment makes a draft assignment of published lessons, optionally typed as practice or prep for the next meeting, that a coach publishes on the Assignments tab.
Fields (maps): read get_field_guide, then check_field and save_field to draw a practice mat from a short JSON description (lines, shapes, text, the robot's start, walls and blocks). upload_field and upload_robot add existing .spk scenes and .mpd/.ldr robot models.
Programs: upload_program adds a .llsp3 program (from the SPIKE app or the simulator) to the program catalog that lessons, challenges and missions use; with an explanation card it is also an example in students' Examples window. These are available to everyone as soon as they are saved.`;

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

const ASSIGNMENT_SCHEMA = object(
    {
        title: { type: 'string' },
        lessons: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lesson file names, e.g. "Sample lesson - Drive a square.json"'
        },
        type: {
            type: 'string',
            enum: ['practice', 'prep'],
            description:
                'What it is for (optional): "practice" (practice what was taught) or "prep" (prepare for the next meeting)'
        },
        due: { type: 'string', description: 'Due date, YYYY-MM-DD (optional)' },
        note: { type: 'string', description: 'Note for students (optional)' },
        checkFirst: {
            type: 'boolean',
            description:
                "Students must pass a lesson's check before they can hand in its program (optional; lessons without a check aren't affected)"
        }
    },
    ['title', 'lessons']
);

const ASSET_TOOLS = [
    {
        name: 'list_assignments',
        description:
            "List assignments (title, type, due date, lessons, draft state, author) with team statistics for each lesson: how many students are done (every step ticked, the check passed if the lesson has one, and a program handed in), started or not started, how many handed in a program or passed the check, and which steps the students still working are on. If the head coach allows it, each student's name and progress are listed too; otherwise there is a privacy note and no per-student data.",
        inputSchema: object({}),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'save_assignment',
        description:
            'Save an assignment as a draft: a title, one or more published lessons (file names from list_library), an optional type ("practice" for practicing what was taught, "prep" for getting ready for the next meeting), an optional due date (YYYY-MM-DD) and a note for students. Students don\'t see it until a coach publishes it on the coach page, Assignments tab. Pass id to update one of your own drafts (send the whole assignment again; it replaces the old one).',
        inputSchema: object(
            {
                assignment: ASSIGNMENT_SCHEMA,
                id: { type: 'string', description: 'Id of your own draft to update (optional)' }
            },
            ['assignment']
        )
    },
    {
        name: 'delete_assignment',
        description: 'Delete a draft assignment you saved, by its id from list_assignments.',
        inputSchema: object({ id: { type: 'string' } }, ['id']),
        annotations: { destructiveHint: true }
    },
    // The old names, so assistants set up before the rename keep working.
    {
        name: 'list_homework',
        description: 'Old name for list_assignments; does the same thing.',
        inputSchema: object({}),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'save_homework',
        description:
            'Old name for save_assignment; does the same thing, with the assignment under "homework".',
        inputSchema: object(
            {
                homework: ASSIGNMENT_SCHEMA,
                id: { type: 'string', description: 'Id of your own draft to update (optional)' }
            },
            ['homework']
        )
    },
    {
        name: 'delete_homework',
        description: 'Old name for delete_assignment; does the same thing.',
        inputSchema: object({ id: { type: 'string' } }, ['id']),
        annotations: { destructiveHint: true }
    },
    {
        name: 'get_field_guide',
        description:
            'How to describe a field (a practice mat with the robot start and objects) as JSON for check_field and save_field (Markdown). Read this before making a field.',
        inputSchema: object({}),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'check_field',
        description:
            'Check a field description without saving it. Returns errors (must be fixed) and warnings.',
        inputSchema: object({ field: { type: 'object', description: 'The field JSON' } }, [
            'field'
        ]),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'save_field',
        description:
            "Draw a field from its description and save it to the library as a .spk scene, for lessons, challenges and students to use. The file name comes from the title unless given. Set replace to true to update a field your coach's assistant made; it never replaces anyone else's.",
        inputSchema: object(
            {
                field: { type: 'object', description: 'The field JSON (spike-field/1)' },
                name: { type: 'string', description: 'File name, e.g. "Line maze.spk" (optional)' },
                replace: { type: 'boolean', description: 'Replace your own field with this name' }
            },
            ['field']
        )
    },
    {
        name: 'get_field',
        description:
            'Describe a field in the library: its mat size, robot start and objects, plus the JSON description it was made from when it was made with save_field (so you can change it and save it again).',
        inputSchema: object({ name: { type: 'string', description: 'Scene file name' } }, ['name']),
        annotations: { readOnlyHint: true }
    },
    {
        name: 'upload_field',
        description:
            "Add an existing .spk scene file (from the simulator's Save → Save scene, or another team) to the library, base64-encoded.",
        inputSchema: object(
            {
                name: { type: 'string', description: 'File name ending in .spk' },
                content_base64: { type: 'string', description: 'The .spk file, base64' },
                replace: { type: 'boolean', description: 'Replace your own field with this name' }
            },
            ['name', 'content_base64']
        )
    },
    {
        name: 'upload_robot',
        description:
            "Add a robot model to the library: an LDraw .mpd or .ldr file (for example exported from BrickLink Studio), as text or base64. It appears in everyone's Robot picker.",
        inputSchema: object(
            {
                name: { type: 'string', description: 'File name ending in .mpd or .ldr' },
                content: { type: 'string', description: 'The model as LDraw text' },
                content_base64: { type: 'string', description: 'Or the file, base64' },
                replace: { type: 'boolean', description: 'Replace your own robot with this name' }
            },
            ['name']
        )
    },
    {
        name: 'upload_program',
        description:
            "Add a SPIKE program (.llsp3, saved from the SPIKE app or the simulator) to the program catalog, base64-encoded. Lessons, challenges and missions can then use it. With a card (an explanation), it is also shown in students' Examples window, unless the card has hidden: true.",
        inputSchema: object(
            {
                name: { type: 'string', description: 'File name ending in .llsp3' },
                content_base64: { type: 'string', description: 'The .llsp3 file, base64' },
                card: {
                    type: 'object',
                    description:
                        'Explanation for students (optional). Without one the program is only in the catalog, not in the Examples window.',
                    properties: {
                        title: { type: 'string', description: 'Shown in the Examples window' },
                        topic: {
                            type: 'string',
                            description: 'Groups examples: Basics, Sensors, Gyro, Missions…'
                        },
                        order: { type: 'number', description: 'Position within the topic' },
                        summary: { type: 'string', description: 'One line under the title' },
                        what: { type: 'string', description: 'What the program does' },
                        why: { type: 'string', description: 'Why it is built this way' },
                        try: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Things to try changing'
                        },
                        scene: { type: 'string', description: 'A field (.spk) to load with it' },
                        hidden: {
                            type: 'boolean',
                            description:
                                'Keep the card but leave the program out of the Examples window'
                        }
                    },
                    required: ['title']
                },
                replace: { type: 'boolean', description: 'Replace your own program with this name' }
            },
            ['name', 'content_base64']
        )
    },
    {
        name: 'delete_program',
        description:
            "Delete an example program your coach's assistant added, with its explanation, if no lesson or challenge uses it.",
        inputSchema: object({ name: { type: 'string' } }, ['name']),
        annotations: { destructiveHint: true }
    },
    {
        name: 'delete_field',
        description:
            "Delete a field your coach's assistant added, if no lesson, challenge or example uses it and it isn't the default.",
        inputSchema: object({ name: { type: 'string' } }, ['name']),
        annotations: { destructiveHint: true }
    },
    {
        name: 'delete_robot',
        description:
            "Delete a robot your coach's assistant added, if no lesson or challenge uses it and it isn't the default.",
        inputSchema: object({ name: { type: 'string' } }, ['name']),
        annotations: { destructiveHint: true }
    }
];
TOOLS.push(...ASSET_TOOLS);

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
    homework,
    authors,
    readDefaults,
    sendJson,
    send,
    readBody
}) {
    const MAX_ASSET = 15 * 1024 * 1024;
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
                scenes: library.scenes.map((e) => ({ name: e.name, author: e.author })),
                robots: library.robots.map((e) => ({ name: e.name, author: e.author })),
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

    // ---- Assignments (homework.mjs) ----------------------------------------

    async function lessonsByName() {
        const library = await listLibrary();
        return Object.fromEntries(library.lessons.map((e) => [e.name, e.lesson]));
    }

    tools.list_assignments = async () => ({
        assignments: await homework.report(await lessonsByName())
    });

    tools.save_assignment = async ({ assignment: input, id }, who) => {
        if (!input || typeof input !== 'object') {
            throw new ToolError('assignment must be an object');
        }
        const lessons = await lessonsByName();
        const names = Array.isArray(input.lessons) ? input.lessons.map(String) : [];
        const missing = names.filter((n) => !lessons[n]);
        if (missing.length > 0) {
            throw new ToolError(
                `No lesson called ${missing.join(', ')}. Use file names from list_library.`
            );
        }
        const warnings = names
            .filter((n) => lessons[n]?.draft)
            .map(
                (n) =>
                    `${n} is a draft: publish it too, or students won't see it in their assignments`
            );
        const result = await homework.saveDraft(input, who, id);
        if (result.error) throw new ToolError(result.error);
        return {
            saved: true,
            assignment: result.assignment,
            warnings,
            next: 'A coach can review it and press Publish on the coach page, Assignments tab: /coach'
        };
    };

    tools.delete_assignment = async ({ id }, who) => {
        const result = await homework.deleteDraft(String(id ?? ''), who);
        if (result.error) throw new ToolError(result.error);
        return result;
    };

    tools.list_homework = tools.list_assignments;
    tools.save_homework = async ({ homework: input, assignment, id }, who) => {
        const result = await tools.save_assignment({ assignment: assignment ?? input, id }, who);
        return { ...result, homework: result.assignment };
    };
    tools.delete_homework = tools.delete_assignment;

    // ---- Fields and robots -----------------------------------------------

    tools.get_field_guide = async () =>
        fsp.readFile(path.join(schemasDir, '..', 'docs', 'fields.md'), 'utf8');

    tools.check_field = async ({ field }) => {
        const { errors, warnings } = fieldProblems(field);
        return { ok: errors.length === 0, errors, warnings };
    };

    // What uses a field or robot, so it isn't deleted from under them.
    async function usersOf(kind, name) {
        const library = await listLibrary();
        if (kind === 'programs') {
            return [
                ...library.lessons
                    .filter((e) => e.lesson?.program === name)
                    .map((e) => `lesson ${e.name}`),
                ...library.challenges
                    .filter((e) => e.challenge?.example === name)
                    .map((e) => `challenge ${e.name}`)
            ];
        }
        const key = kind === 'scenes' ? 'field' : 'robot';
        const users = [
            ...library.lessons
                .filter((e) => e.lesson?.[key] === name)
                .map((e) => `lesson ${e.name}`),
            ...library.challenges
                .filter((e) => e.challenge?.[key] === name)
                .map((e) => `challenge ${e.name}`)
        ];
        if (kind === 'scenes') {
            users.push(
                ...library.programs
                    .filter((e) => e.card?.scene === name)
                    .map((e) => `example ${e.name}`)
            );
        }
        const defaults = await readDefaults();
        if (defaults[kind === 'scenes' ? 'scene' : 'robot'] === name) users.push('the default');
        return users;
    }

    // May this coach's assistant write `name`? New names are fine; existing
    // files only if its coach's assistant added them and replace is set.
    async function checkWrite(kind, name, replace, who) {
        const file = path.join(libraryDir, kind, name);
        if (!fs.existsSync(file)) return;
        const author = await authors.get(kind, name);
        const what = WHAT[kind];
        if (author !== who) {
            throw new ToolError(
                `There is already a ${what} called ${name}. Save under another name; a coach can replace it on the coach page.`
            );
        }
        if (!replace) {
            throw new ToolError(
                `You already added a ${what} called ${name}. Set replace to true to update it, or pick another name.`
            );
        }
    }

    const WHAT = { scenes: 'field', robots: 'robot', programs: 'program' };

    async function writeAsset(kind, name, data, who) {
        await fsp.mkdir(path.join(libraryDir, kind), { recursive: true });
        const file = path.join(libraryDir, kind, name);
        await fsp.writeFile(file + '.tmp', data);
        await fsp.rename(file + '.tmp', file);
        await authors.set(kind, name, who);
        console.log(`${who} saved ${kind}/${name} through MCP (${data.length} bytes)`);
    }

    // A safe file name: robots keep a given .mpd or .ldr, anything else
    // becomes "<cleaned name>.spk", ".llsp3" or ".mpd".
    function assetName(kind, raw, fallbackTitle) {
        const given = String(raw || fallbackTitle || '').trim();
        let name = given;
        if (!(kind === 'robots' && /\.(mpd|ldr)$/i.test(given))) {
            const ext = { scenes: '.spk', programs: '.llsp3', robots: '.mpd' }[kind];
            const prefix = { scenes: 'Field ', programs: 'Program ', robots: 'Robot ' }[kind];
            name = given
                .replace(/\.(spk|mpd|ldr|llsp3)$/i, '')
                .replace(/[^\w .()+-]/g, '_')
                .slice(0, 90);
            if (!/^\w/.test(name)) name = prefix + name;
            name += ext;
        }
        const safe = safeName(kind, name);
        if (!safe) throw new ToolError(`Can't use "${given}" as a file name`);
        return safe;
    }

    function decode(base64) {
        const data = Buffer.from(String(base64 ?? ''), 'base64');
        if (data.length === 0) throw new ToolError('content_base64 is empty or not base64');
        if (data.length > MAX_ASSET) throw new ToolError('That file is too large (15 MB at most)');
        return data;
    }

    tools.save_field = async ({ field, name, replace }, who) => {
        const { errors, warnings } = fieldProblems(field);
        if (errors.length > 0) return { saved: false, errors, warnings };
        const file = assetName('scenes', name, field.title || 'Field');
        await checkWrite('scenes', file, replace, who);
        await writeAsset('scenes', file, buildField(field, { author: who }), who);
        return {
            saved: true,
            name: file,
            warnings,
            next: `Use "${file}" as the field of a lesson or challenge. A coach can see it on the coach page, Robots and maps tab, and open it in the simulator from the Field button.`
        };
    };

    tools.get_field = async ({ name }) => {
        const file = safeName('scenes', name);
        if (!file || !fs.existsSync(path.join(libraryDir, 'scenes', file))) {
            throw new ToolError(`There is no field called ${name}`);
        }
        let files;
        try {
            files = readZip(await fsp.readFile(path.join(libraryDir, 'scenes', file)));
        } catch {
            throw new ToolError(`${file} isn't a readable scene`);
        }
        const scene = JSON.parse(files.get('scene.json')?.toString('utf8') ?? '{}');
        const heading = (((180 - (scene.robot?.rotation ?? 180)) % 360) + 360) % 360;
        const result = {
            name: file,
            author: await authors.get('scenes', file),
            width: scene.matWidth ?? 2360,
            height: scene.matHeight ?? 1140,
            start: {
                x: Math.round(scene.robot?.position?.x ?? 0),
                z: Math.round(scene.robot?.position?.z ?? 0),
                heading
            },
            objects: (scene.objects ?? []).map((o) => ({
                name: o.name,
                x: Math.round(o.position?.x ?? 0),
                z: Math.round(o.position?.z ?? 0),
                anchored: !!o.anchored
            }))
        };
        const spec = files.get('field.json');
        if (spec) {
            const description = JSON.parse(spec.toString('utf8'));
            delete description.author;
            result.description = description;
        } else {
            result.note =
                'This field was not made with save_field, so there is no description to edit; its mat is a picture.';
        }
        return result;
    };

    tools.upload_field = async ({ name, content_base64, replace }, who) => {
        const data = decode(content_base64);
        let files;
        try {
            files = readZip(data);
        } catch {
            throw new ToolError("That isn't a .spk scene (it isn't a zip file)");
        }
        let scene;
        try {
            scene = JSON.parse(files.get('scene.json')?.toString('utf8') ?? '');
        } catch {
            throw new ToolError("That isn't a .spk scene: it has no readable scene.json");
        }
        if (!scene?.robot?.position)
            throw new ToolError("That scene's scene.json has no robot start");
        const file = assetName('scenes', name);
        await checkWrite('scenes', file, replace, who);
        await writeAsset('scenes', file, data, who);
        return {
            saved: true,
            name: file,
            warnings: files.has('mat.jpg') ? [] : ['The scene has no mat picture (mat.jpg)']
        };
    };

    tools.upload_robot = async ({ name, content, content_base64, replace }, who) => {
        let data;
        if (typeof content === 'string' && content.length > 0) {
            data = Buffer.from(content, 'utf8');
            if (data.length > MAX_ASSET)
                throw new ToolError('That model is too large (15 MB at most)');
        } else {
            data = decode(content_base64);
        }
        const text = data.toString('utf8');
        if (text.includes('\0') || !/^\s*1\s/m.test(text)) {
            throw new ToolError(
                "That isn't an LDraw model: it has no part lines (lines starting with 1)"
            );
        }
        const file = assetName('robots', name);
        await checkWrite('robots', file, replace, who);
        await writeAsset('robots', file, data, who);
        return {
            saved: true,
            name: file,
            next: 'Open it in the simulator from the Robot button to check its hub, motors and sensors are on the right ports.'
        };
    };

    tools.upload_program = async ({ name, content_base64, card, replace }, who) => {
        const data = decode(content_base64);
        let files;
        try {
            files = readZip(data);
        } catch {
            throw new ToolError("That isn't a .llsp3 program (it isn't a zip file)");
        }
        let manifest;
        try {
            manifest = JSON.parse(files.get('manifest.json')?.toString('utf8') ?? '');
        } catch {
            throw new ToolError("That isn't a .llsp3 program: it has no readable manifest.json");
        }
        if (manifest?.type !== 'word-blocks' || !files.has('scratch.sb3')) {
            throw new ToolError(
                'Only word-block programs can be examples (a Python program, or one without scratch.sb3, will not open in the simulator)'
            );
        }
        let cardJson;
        if (card !== undefined && card !== null) {
            if (typeof card !== 'object' || typeof card.title !== 'string' || !card.title.trim()) {
                throw new ToolError('The card needs a title');
            }
            const text = (key) =>
                typeof card[key] === 'string' && card[key].trim() ? card[key].trim() : undefined;
            let scene;
            if (text('scene')) {
                scene = safeName('scenes', card.scene);
                if (!scene || !fs.existsSync(path.join(libraryDir, 'scenes', scene))) {
                    throw new ToolError(`There is no field called ${card.scene}`);
                }
            }
            cardJson = {
                title: card.title.trim(),
                topic: text('topic') ?? 'Missions',
                ...(typeof card.order === 'number' ? { order: card.order } : {}),
                ...(text('summary') ? { summary: text('summary') } : {}),
                ...(text('what') ? { what: text('what') } : {}),
                ...(text('why') ? { why: text('why') } : {}),
                ...(Array.isArray(card.try)
                    ? {
                          try: card.try
                              .filter((x) => typeof x === 'string' && x.trim())
                              .map((x) => x.trim())
                      }
                    : {}),
                ...(scene ? { scene } : {}),
                ...(card.hidden === true ? { hidden: true } : {})
            };
        }
        const file = assetName('programs', name, cardJson?.title);
        await checkWrite('programs', file, replace, who);
        await writeAsset('programs', file, data, who);
        const cardFile = path.join(libraryDir, 'programs', file + '.json');
        if (cardJson) {
            await fsp.writeFile(cardFile + '.tmp', JSON.stringify(cardJson, null, 2));
            await fsp.rename(cardFile + '.tmp', cardFile);
        } else {
            await fsp.rm(cardFile, { force: true });
        }
        return {
            saved: true,
            name: file,
            inExamples: !!cardJson && !cardJson.hidden,
            ...(cardJson ? { card: cardJson } : {})
        };
    };

    for (const [kind, what] of [
        ['scenes', 'field'],
        ['robots', 'robot'],
        ['programs', 'program']
    ]) {
        tools[`delete_${what}`] = async ({ name }, who) => {
            const file = safeName(kind, name);
            if (
                !file ||
                (kind === 'programs' && !file.toLowerCase().endsWith('.llsp3')) ||
                !fs.existsSync(path.join(libraryDir, kind, file))
            ) {
                throw new ToolError(`There is no ${what} called ${name}`);
            }
            if ((await authors.get(kind, file)) !== who) {
                throw new ToolError(
                    `You can only delete a ${what} your assistant added. Use the coach page for anything else.`
                );
            }
            const users = await usersOf(kind, file);
            if (users.length > 0) {
                throw new ToolError(`${file} is used by ${users.join(', ')}. Change those first.`);
            }
            await fsp.rm(path.join(libraryDir, kind, file), { force: true });
            if (kind === 'programs') {
                await fsp.rm(path.join(libraryDir, kind, file + '.json'), { force: true });
            }
            await authors.remove(kind, file);
            console.log(`${who} deleted ${kind}/${file} through MCP`);
            return { deleted: file };
        };
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
