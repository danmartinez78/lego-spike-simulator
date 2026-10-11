// Public, read-only help for writing lessons, so a person or an AI agent can
// build a lesson package without access to the code:
//   GET  /api/lessons/guide    the authoring guide, plus this site's fields and files
//   GET  /api/lessons/schema   the JSON schema for lesson.json
//   POST /api/lessons/check    check a lesson.json or package (.zip); nothing is saved

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { blockRules, lessonProblems, realismNames } from './lesson-rules.mjs';
import { sceneMatSize, unzip } from './unzip.mjs';

export function createLessonsApi({ libraryDir, docsDir, schemaFile, sendJson, send, readBody }) {
    // Mat sizes of library scenes, cached by file and modification time.
    const matCache = new Map();

    async function listKind(kind, extensions) {
        try {
            return (await fsp.readdir(path.join(libraryDir, kind)))
                .filter((n) => extensions.some((e) => n.toLowerCase().endsWith(e)))
                .sort();
        } catch {
            return [];
        }
    }

    async function libraryMats() {
        const mats = {};
        for (const name of await listKind('scenes', ['.spk'])) {
            const file = path.join(libraryDir, 'scenes', name);
            const stat = await fsp.stat(file);
            const cached = matCache.get(name);
            if (cached && cached.mtime === stat.mtimeMs) {
                if (cached.size) mats[name] = cached.size;
                continue;
            }
            const size = sceneMatSize(await fsp.readFile(file));
            matCache.set(name, { mtime: stat.mtimeMs, size });
            if (size) mats[name] = size;
        }
        return mats;
    }

    // What a lesson can refer to: the library, plus files in the package.
    async function context(extra = { programs: [], scenes: [], robots: [], mats: {} }) {
        const mats = { ...(await libraryMats()), ...extra.mats };
        return {
            mats,
            files: {
                programs: [...(await listKind('programs', ['.llsp3'])), ...extra.programs],
                scenes: [...Object.keys(mats), ...extra.scenes],
                robots: [...(await listKind('robots', ['.mpd', '.ldr'])), ...extra.robots]
            }
        };
    }

    async function guide() {
        let text = '';
        try {
            text = await fsp.readFile(path.join(docsDir, 'lessons.md'), 'utf8');
        } catch {
            text = '# Lessons\n';
        }
        const mats = await libraryMats();
        const lines = [
            '',
            '## This site',
            '',
            'Generated from the live library. A lesson may only use these files, or files it brings in its package.',
            '',
            '### Fields (scenes) and their mat sizes',
            '',
            'Coordinates are in mm with (0, 0) at the centre of the mat. x runs from',
            '-width/2 (left) to width/2 (right); z runs from -height/2 (top edge of the',
            'mat picture) to height/2 (bottom edge).',
            '',
            ...Object.entries(mats).map(
                ([name, m]) =>
                    `- \`${name}\`: ${m.width} x ${m.height} mm (x ${-m.width / 2} to ${m.width / 2}, z ${-m.height / 2} to ${m.height / 2})` +
                    (m.start
                        ? `; the robot starts at x ${m.start.x}, z ${m.start.z}, heading ${m.start.heading}`
                        : '')
            ),
            '',
            'Download a field to look at its mat picture (mat.jpg inside the zip):',
            '`GET /api/library/scenes/<name>`.',
            '',
            '### Robots',
            '',
            ...(await listKind('robots', ['.mpd', '.ldr'])).map((n) => `- \`${n}\``),
            '',
            '### Programs',
            '',
            ...(await listKind('programs', ['.llsp3'])).map((n) => `- \`${n}\``),
            '',
            '### Lessons already here',
            '',
            ...(await listKind('lessons', ['.json'])).map((n) => `- \`${n}\``),
            '',
            '### Check values',
            '',
            `- realism: ${realismNames.map((r) => `\`${r}\``).join(', ')}`,
            '- block rules for `check.blocks.use` and `check.blocks.avoid`:',
            ...blockRules.map((r) => `  - \`${r.id}\`: ${r.label}`),
            ''
        ];
        return text + lines.join('\n');
    }

    async function checkUpload(body) {
        let lesson;
        const extra = { programs: [], scenes: [], robots: [], mats: {} };
        const packaged = [];
        if (body.subarray(0, 2).toString('latin1') === 'PK') {
            let entries;
            try {
                entries = unzip(body);
            } catch (e) {
                return { errors: [`Couldn't read the zip: ${e.message}`], warnings: [] };
            }
            const json = entries.find((e) => /(^|\/)lesson\.json$/.test(e.name));
            if (!json) return { errors: ['The package has no lesson.json'], warnings: [] };
            const root = json.name.slice(0, -'lesson.json'.length);
            try {
                lesson = JSON.parse(json.read().toString('utf8'));
            } catch {
                return { errors: ['lesson.json is not valid JSON'], warnings: [] };
            }
            const folders = { programs: ['.llsp3'], scenes: ['.spk'], robots: ['.mpd', '.ldr'] };
            for (const entry of entries) {
                const rest = entry.name.slice(root.length);
                const [folder, name, more] = rest.split('/');
                if (!name || more !== undefined || !folders[folder]) continue;
                if (!folders[folder].some((e) => name.toLowerCase().endsWith(e))) continue;
                extra[folder].push(name);
                packaged.push(`${folder}/${name}`);
                if (folder === 'scenes') {
                    const size = sceneMatSize(entry.read());
                    if (size) extra.mats[name] = size;
                }
            }
        } else {
            try {
                lesson = JSON.parse(body.toString('utf8'));
            } catch {
                return { errors: ['That is not JSON or a zip package'], warnings: [] };
            }
        }
        const result = lessonProblems(lesson, await context(extra));
        if (lesson?.field && lesson?.check && !(await context(extra)).mats[lesson.field]) {
            result.warnings.push(
                `Couldn't find the mat size of ${lesson.field}, so the check's zones weren't checked against the mat`
            );
        }
        if (lesson && lesson.draft === false) {
            result.warnings.push(
                'Imported lessons start as drafts whatever "draft" says, until a coach publishes them'
            );
        }
        return { ...result, title: lesson?.title, files: packaged };
    }

    async function handle(req, res, parts) {
        if (parts[0] === 'guide' && parts.length === 1 && req.method === 'GET') {
            send(res, 200, await guide(), 'text/markdown; charset=utf-8', {
                'Cache-Control': 'no-store'
            });
            return;
        }
        if (parts[0] === 'schema' && parts.length === 1 && req.method === 'GET') {
            if (!fs.existsSync(schemaFile)) {
                sendJson(res, 404, { error: 'Schema not found' });
                return;
            }
            send(res, 200, await fsp.readFile(schemaFile), 'application/json; charset=utf-8');
            return;
        }
        if (parts[0] === 'check' && parts.length === 1 && req.method === 'POST') {
            let body;
            try {
                body = await readBody(req);
            } catch {
                sendJson(res, 413, { error: 'Too large' });
                return;
            }
            const result = await checkUpload(body);
            sendJson(res, 200, { ok: result.errors.length === 0, ...result });
            return;
        }
        sendJson(res, 404, { error: 'Not found' });
    }

    return { handle, context, guide, checkUpload };
}
