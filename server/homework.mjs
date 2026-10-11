// Assignments (called homework in the code and files), students' lesson
// progress and handed-in programs. Stored as JSON and .llsp3 files in TEAM_DIR:
//   homework.json                          assignments
//   students/<id>/progress.json            ticked steps and challenge results
//   students/<id>/programs/<lesson>.llsp3  the program handed in for a lesson

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Lesson file names follow the library rules: <name>.json
function lessonBase(name) {
    const base = path.basename(String(name ?? '')).replace(/\.json$/i, '');
    return /^[\w][\w .()+-]{0,100}$/.test(base) ? base : undefined;
}

// What an assignment is for, shown to students as a badge. Optional: older
// assignments have none.
export const ASSIGNMENT_TYPES = ['practice', 'prep'];

function isDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function createHomework({ teamDir, team, settings, sendJson, send, readBody }) {
    const homeworkFile = path.join(teamDir, 'homework.json');
    const studentDir = (id) => path.join(teamDir, 'students', id);

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

    async function loadHomework() {
        const homework = await readJson(homeworkFile, { assignments: [] });
        homework.assignments = homework.assignments ?? [];
        return homework;
    }

    async function loadProgress(id) {
        const progress = await readJson(path.join(studentDir(id), 'progress.json'), {});
        return { lessons: progress.lessons ?? {}, challenges: progress.challenges ?? {} };
    }

    async function listPrograms(id) {
        const dir = path.join(studentDir(id), 'programs');
        if (!fs.existsSync(dir)) return {};
        const result = {};
        for (const name of await fsp.readdir(dir)) {
            if (!name.endsWith('.llsp3')) continue;
            const stat = await fsp.stat(path.join(dir, name));
            result[name.slice(0, -'.llsp3'.length) + '.json'] = stat.mtime.toISOString();
        }
        return result;
    }

    // Newer ticks win per lesson; challenge results only ever improve.
    function mergeProgress(old, incoming) {
        const lessons = { ...old.lessons };
        for (const [name, value] of Object.entries(incoming?.lessons ?? {})) {
            if (!lessonBase(name) || !value || !Array.isArray(value.steps)) continue;
            const steps = value.steps.filter((s) => Number.isInteger(s) && s >= 0 && s < 100);
            const updated = typeof value.updated === 'string' ? value.updated : '';
            const before = lessons[name];
            if (!before || (before.updated ?? '') <= updated) {
                lessons[name] = { steps: [...new Set(steps)], updated };
            }
            // The lesson's check result only ever improves.
            const best = Math.max(
                before?.check?.best ?? 0,
                Math.min(5, Number(value.check?.best) || 0)
            );
            const passed = !!before?.check?.passed || value.check?.passed === true;
            if (best > 0 || passed) lessons[name].check = { best, passed };
        }
        const challenges = { ...old.challenges };
        for (const [id, value] of Object.entries(incoming?.challenges ?? {})) {
            if (!/^[\w-]{1,60}$/.test(id) || !value) continue;
            const before = challenges[id] ?? { best: 0, completed: false };
            challenges[id] = {
                best: Math.max(before.best, Math.min(5, Number(value.best) || 0)),
                completed: before.completed || value.completed === true
            };
        }
        return { lessons, challenges };
    }

    async function body(req) {
        try {
            return JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch {
            return undefined;
        }
    }

    function cleanAssignment(input, old) {
        const title = String(input?.title ?? '')
            .replace(/[<>]/g, '')
            .trim()
            .slice(0, 80);
        if (!title) return { error: 'Give the assignment a title' };
        const lessons = (Array.isArray(input?.lessons) ? input.lessons : [])
            .map((l) => lessonBase(l))
            .filter((l) => l)
            .map((l) => l + '.json');
        if (lessons.length === 0) return { error: 'Pick at least one lesson' };
        if (input.due !== undefined && input.due !== '' && !isDate(input.due)) {
            return { error: 'The due date must look like 2026-10-16' };
        }
        const type = input?.type || undefined;
        if (type !== undefined && !ASSIGNMENT_TYPES.includes(type)) {
            return { error: 'The type must be "practice" or "prep" (or left out)' };
        }
        return {
            assignment: {
                id: old?.id ?? crypto.randomUUID(),
                title,
                note: String(input?.note ?? '')
                    .trim()
                    .slice(0, 1000),
                due: input.due || undefined,
                type,
                lessons: [...new Set(lessons)],
                created: old?.created ?? new Date().toISOString(),
                // An assignment from an AI assistant is a draft until a coach publishes it.
                draft:
                    typeof input?.draft === 'boolean'
                        ? input.draft || undefined
                        : old?.draft || undefined,
                author: old?.author
            }
        };
    }

    // /api/admin/homework... and /api/admin/progress...
    async function handleAdmin(req, res, parts, who) {
        if (parts[0] === 'progress') {
            if (parts.length === 1 && req.method === 'GET') {
                const roster = await team.load();
                const students = [];
                for (const s of roster.students) {
                    students.push({
                        id: s.id,
                        name: s.name,
                        progress: await loadProgress(s.id),
                        programs: await listPrograms(s.id)
                    });
                }
                sendJson(res, 200, { students });
                return;
            }
            // /api/admin/progress/<student id>/programs/<lesson>.json
            const lesson = lessonBase(parts[3]);
            const student = (await team.load()).students.find((s) => s.id === parts[1]);
            if (parts.length === 4 && parts[2] === 'programs' && lesson && student) {
                const file = path.join(studentDir(student.id), 'programs', lesson + '.llsp3');
                if (!fs.existsSync(file)) {
                    sendJson(res, 404, { error: 'Nothing handed in yet' });
                    return;
                }
                send(res, 200, await fsp.readFile(file), 'application/zip', {
                    'Content-Disposition': `attachment; filename="${encodeURIComponent(`${student.name} - ${lesson}.llsp3`)}"`,
                    'Cache-Control': 'no-store'
                });
                return;
            }
            sendJson(res, 404, { error: 'Not found' });
            return;
        }

        const homework = await loadHomework();
        if (parts.length === 0 && req.method === 'GET') {
            sendJson(res, 200, homework);
            return;
        }
        if (parts.length === 0 && req.method === 'POST') {
            const result = cleanAssignment(await body(req));
            if (result.error) {
                sendJson(res, 400, { error: result.error });
                return;
            }
            homework.assignments.push(result.assignment);
            await writeJson(homeworkFile, homework);
            console.log(`${who} added assignment "${result.assignment.title}"`);
            sendJson(res, 200, homework);
            return;
        }
        const index = homework.assignments.findIndex((a) => a.id === parts[0]);
        if (index < 0 || parts.length !== 1) {
            sendJson(res, 404, { error: 'No such assignment' });
            return;
        }
        if (req.method === 'PUT') {
            const result = cleanAssignment(await body(req), homework.assignments[index]);
            if (result.error) {
                sendJson(res, 400, { error: result.error });
                return;
            }
            homework.assignments[index] = result.assignment;
        } else if (req.method === 'DELETE') {
            homework.assignments.splice(index, 1);
        } else {
            sendJson(res, 405, { error: 'Method not allowed' });
            return;
        }
        await writeJson(homeworkFile, homework);
        sendJson(res, 200, homework);
    }

    // /api/student/homework, /progress, /programs/<lesson>.json (signed in)
    async function handleStudent(req, res, parts, student) {
        if (parts[0] === 'homework' && parts.length === 1 && req.method === 'GET') {
            const homework = await loadHomework();
            homework.assignments = homework.assignments.filter((a) => !a.draft);
            sendJson(res, 200, homework);
            return;
        }
        if (!student) {
            sendJson(res, 401, { error: 'Signed out' });
            return;
        }
        const progressFile = path.join(studentDir(student.id), 'progress.json');
        if (parts[0] === 'progress' && parts.length === 1) {
            if (req.method === 'GET') {
                sendJson(res, 200, {
                    ...(await loadProgress(student.id)),
                    programs: await listPrograms(student.id)
                });
            } else if (req.method === 'PUT') {
                const merged = mergeProgress(await loadProgress(student.id), await body(req));
                await writeJson(progressFile, merged);
                sendJson(res, 200, { ...merged, programs: await listPrograms(student.id) });
            } else {
                sendJson(res, 405, { error: 'Method not allowed' });
            }
            return;
        }
        const lesson = lessonBase(parts[1]);
        if (parts[0] === 'programs' && parts.length === 2 && lesson) {
            const file = path.join(studentDir(student.id), 'programs', lesson + '.llsp3');
            if (req.method === 'GET') {
                if (!fs.existsSync(file)) {
                    sendJson(res, 404, { error: 'Nothing handed in yet' });
                    return;
                }
                send(res, 200, await fsp.readFile(file), 'application/zip', {
                    'Cache-Control': 'no-store'
                });
            } else if (req.method === 'PUT') {
                let data;
                try {
                    data = await readBody(req);
                } catch {
                    sendJson(res, 413, { error: 'Program too large' });
                    return;
                }
                if (data.subarray(0, 2).toString('latin1') !== 'PK' || data.length > 5e6) {
                    sendJson(res, 400, { error: 'That is not a SPIKE program' });
                    return;
                }
                await fsp.mkdir(path.dirname(file), { recursive: true });
                await fsp.writeFile(file + '.tmp', data);
                await fsp.rename(file + '.tmp', file);
                console.log(`Student ${student.id.slice(0, 8)} handed in ${lesson}`);
                sendJson(res, 200, { handedIn: new Date().toISOString() });
            } else {
                sendJson(res, 405, { error: 'Method not allowed' });
            }
            return;
        }
        sendJson(res, 404, { error: 'Not found' });
    }

    // A removed student's progress and programs go with them.
    async function removeStudent(id) {
        await fsp.rm(studentDir(id), { recursive: true, force: true });
    }

    // For the MCP server: an assistant's assignment is always a draft stamped with
    // its coach, and it can only change or delete its own drafts.
    async function saveDraft(input, who, id) {
        const homework = await loadHomework();
        const index = id ? homework.assignments.findIndex((a) => a.id === id) : -1;
        if (id && index < 0) return { error: `There is no assignment with id ${id}` };
        const old = index >= 0 ? homework.assignments[index] : undefined;
        if (old && (!old.draft || old.author !== who)) {
            return {
                error: 'You can only change your own draft assignments. A coach can edit the rest on the coach page.'
            };
        }
        const result = cleanAssignment({ ...input, draft: true }, old);
        if (result.error) return result;
        result.assignment.author = who;
        if (old) homework.assignments[index] = result.assignment;
        else homework.assignments.push(result.assignment);
        await writeJson(homeworkFile, homework);
        console.log(`${who} saved draft assignment "${result.assignment.title}" through MCP`);
        return result;
    }

    async function deleteDraft(id, who) {
        const homework = await loadHomework();
        const index = homework.assignments.findIndex((a) => a.id === id);
        if (index < 0) return { error: `There is no assignment with id ${id}` };
        const old = homework.assignments[index];
        if (!old.draft || old.author !== who) {
            return {
                error: 'You can only delete your own draft assignments. Use the coach page for anything else.'
            };
        }
        homework.assignments.splice(index, 1);
        await writeJson(homeworkFile, homework);
        console.log(`${who} deleted draft assignment "${old.title}" through MCP`);
        return { deleted: id };
    }

    // Each student's status on each lesson of each assignment, worked out the
    // same way as lessonStatus() in src/lib/lessons.ts. `lessons` maps a lesson
    // file name to its JSON.
    // For AI assistants: by default team statistics per lesson, which say where
    // the team is and where it gets stuck without naming anyone. The head coach
    // can choose to share each student's name and progress instead.
    async function report(lessons) {
        const homework = await loadHomework();
        const roster = await team.load();
        const { aiStudentNames } = await settings.load();
        const students = [];
        for (const s of roster.students) {
            students.push({
                name: s.name,
                progress: await loadProgress(s.id),
                programs: await listPrograms(s.id)
            });
        }
        function status(student, name) {
            const lesson = lessons[name];
            if (!lesson) return { status: 'lesson missing' };
            const mine = student.progress.lessons[name];
            const steps = Array.isArray(lesson.steps) ? lesson.steps.length : 0;
            const tickedSteps = (mine?.steps ?? []).filter((n) => n < steps);
            const ticked = tickedSteps.length;
            const checkDone = !lesson.check || !!mine?.check?.passed;
            const handedIn = !!student.programs[name];
            const done = ticked >= steps && checkDone && handedIn;
            const started = ticked > 0 || !!mine?.check || handedIn;
            let nextStep = -1;
            for (let i = 0; i < steps; i++) {
                if (!tickedSteps.includes(i)) {
                    nextStep = i;
                    break;
                }
            }
            return {
                status: done ? 'done' : started ? 'started' : 'not started',
                steps: `${ticked}/${steps}`,
                ...(lesson.check ? { checkPassed: !!mine?.check?.passed } : {}),
                ...(student.programs[name] ? { handedIn: student.programs[name] } : {}),
                // For the statistics only.
                _nextStep: nextStep,
                _checkTried: !!mine?.check
            };
        }
        function stats(rows, name) {
            const lesson = lessons[name];
            const all = rows.map((r) => r.lessons[name]);
            const count = (f) => all.filter(f).length;
            const result = {
                students: all.length,
                done: count((x) => x.status === 'done'),
                started: count((x) => x.status === 'started'),
                notStarted: count((x) => x.status === 'not started'),
                handedIn: count((x) => !!x.handedIn)
            };
            if (lesson?.check) {
                result.checkPassed = count((x) => x.checkPassed);
                result.checkTriedNotPassed = count((x) => x._checkTried && !x.checkPassed);
            }
            // Where students who started but haven't finished are up to.
            const stuck = {};
            for (const x of all) {
                if (x.status !== 'started' || x._nextStep < 0) continue;
                stuck[x._nextStep] = (stuck[x._nextStep] ?? 0) + 1;
            }
            const steps = Array.isArray(lesson?.steps) ? lesson.steps : [];
            result.workingOnStep = Object.entries(stuck)
                .sort((a, b) => b[1] - a[1])
                .map(([i, n]) => ({
                    step: Number(i) + 1,
                    text: String(steps[i]?.text ?? '').slice(0, 80),
                    students: n
                }));
            return result;
        }
        const clean = (status) => {
            const { _nextStep, _checkTried, ...rest } = status;
            return rest;
        };
        return homework.assignments.map((a) => {
            const rows = students.map((s) => ({
                name: s.name,
                lessons: Object.fromEntries(a.lessons.map((l) => [l, status(s, l)]))
            }));
            const lessonStats = Object.fromEntries(a.lessons.map((l) => [l, stats(rows, l)]));
            if (aiStudentNames === 'names') {
                return {
                    ...a,
                    stats: lessonStats,
                    students: rows.map((r) => ({
                        name: r.name,
                        lessons: Object.fromEntries(
                            Object.entries(r.lessons).map(([l, x]) => [l, clean(x)])
                        )
                    }))
                };
            }
            return {
                ...a,
                stats: lessonStats,
                privacy:
                    "Team statistics only: the head coach chose not to share individual students' names or progress with AI assistants."
            };
        });
    }

    return { handleAdmin, handleStudent, removeStudent, saveDraft, deleteDraft, report };
}
