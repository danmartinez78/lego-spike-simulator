// Lessons: step-by-step activities stored in the shared library, with each
// student's progress kept in their browser. A lesson travels as a zip package:
// lesson.json (schemas/lesson-v1.json) plus the files it uses in programs/,
// scenes/ and robots/.

import { get, writable } from 'svelte/store';
import JSZip from 'jszip';
import {
    fetchEntry,
    libraryFileName,
    libraryStore,
    saveEntry,
    saveLesson,
    type LibraryEntry,
    type LibraryKind,
    type Lesson
} from '$lib/library';
import { challenges } from '$lib/spike/challenges';

export const lessonsOpen = writable(false);

export const topicOrder = ['Basics', 'Sensors', 'Gyro', 'Missions'];

// Topic colours follow the block categories each topic mostly uses.
const topicColours: Record<string, string> = {
    Basics: '#ff4ccd',
    Sensors: '#3fccf1',
    Gyro: '#9b6af6',
    Missions: '#f5a623'
};

export function topicColour(topic: string | undefined) {
    return topicColours[topic ?? ''] ?? '#9ca3af';
}

export function groupLessons(entries: LibraryEntry[]) {
    const groups = new Map<string, LibraryEntry[]>();
    for (const entry of entries) {
        if (!entry.lesson) continue;
        const topic = entry.lesson.topic || 'Other';
        groups.set(topic, [...(groups.get(topic) ?? []), entry]);
    }
    const rank = (t: string) => {
        const i = topicOrder.indexOf(t);
        return i < 0 ? topicOrder.length : i;
    };
    return [...groups.entries()]
        .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
        .map(([topic, list]) => ({
            topic,
            entries: list.sort(
                (a, b) =>
                    (a.lesson?.order ?? 999) - (b.lesson?.order ?? 999) ||
                    (a.lesson?.title ?? '').localeCompare(b.lesson?.title ?? '')
            )
        }));
}

// ---- Progress (per browser) ---------------------------------------------

const progressKey = 'spike-sim-lessons';

export interface LessonProgress {
    // Indexes of the steps the student ticked.
    steps: number[];
    // When the ticks last changed, so the newest copy wins when syncing.
    updated?: string;
}

function loadProgress(): Record<string, LessonProgress> {
    try {
        return JSON.parse(localStorage.getItem(progressKey) ?? '{}');
    } catch {
        return {};
    }
}

export const lessonProgress = writable<Record<string, LessonProgress>>(loadProgress());

lessonProgress.subscribe((value) => {
    try {
        localStorage.setItem(progressKey, JSON.stringify(value));
    } catch {
        // storage unavailable
    }
});

export function toggleStep(lessonName: string, step: number) {
    const all = get(lessonProgress);
    const steps = all[lessonName]?.steps ?? [];
    lessonProgress.set({
        ...all,
        [lessonName]: {
            steps: steps.includes(step) ? steps.filter((s) => s != step) : [...steps, step],
            updated: new Date().toISOString()
        }
    });
}

export type LessonStatus = 'new' | 'started' | 'done';

// Done means every step ticked and, if the lesson has a challenge, the challenge passed.
export function lessonStatus(
    name: string,
    lesson: Lesson,
    progress: Record<string, LessonProgress>,
    passed: Record<string, { completed: boolean }>
): LessonStatus {
    const ticked = progress[name]?.steps.filter((s) => s < lesson.steps.length).length ?? 0;
    const challengeDone = !lesson.challenge || !!passed[lesson.challenge]?.completed;
    if (ticked >= lesson.steps.length && challengeDone) return 'done';
    if (ticked > 0 || (lesson.challenge && passed[lesson.challenge])) return 'started';
    return 'new';
}

export function challengeFor(lesson: Lesson | undefined) {
    return lesson?.challenge ? challenges.find((c) => c.id == lesson.challenge) : undefined;
}

// ---- Checking a lesson ----------------------------------------------------

// Returns what is wrong with a lesson, or undefined. Matches the server's checks.
export function lessonProblem(value: unknown): string | undefined {
    const lesson = value as Partial<Lesson> | undefined;
    if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) {
        return 'A lesson must be a JSON object';
    }
    if (lesson.schema !== 'spike-lesson/1') return 'The lesson needs "schema": "spike-lesson/1"';
    if (typeof lesson.title !== 'string' || lesson.title.trim() == '') {
        return 'The lesson needs a title';
    }
    if (!Array.isArray(lesson.steps) || lesson.steps.length == 0) {
        return 'The lesson needs at least one step';
    }
    for (const [i, step] of lesson.steps.entries()) {
        if (!step || typeof step.text !== 'string' || step.text.trim() == '') {
            return `Step ${i + 1} needs some text`;
        }
    }
    for (const field of ['topic', 'summary', 'program', 'field', 'robot', 'challenge'] as const) {
        if (lesson[field] !== undefined && typeof lesson[field] !== 'string') {
            return `"${field}" must be text`;
        }
    }
    if (lesson.challenge && !challenges.some((c) => c.id == lesson.challenge)) {
        return `There is no challenge called "${lesson.challenge}"`;
    }
    return undefined;
}

// Library files the lesson points at that the library doesn't have.
export function missingFiles(lesson: Lesson) {
    const index = get(libraryStore).index;
    const missing: string[] = [];
    const check = (kind: LibraryKind, name: string | undefined) => {
        if (name && !index[kind].some((e) => e.name == name)) missing.push(name);
    };
    check('programs', lesson.program);
    check('scenes', lesson.field);
    check('robots', lesson.robot);
    return missing;
}

// ---- Packages -------------------------------------------------------------

const folders: { folder: string; kind: LibraryKind; extensions: string[] }[] = [
    { folder: 'programs', kind: 'programs', extensions: ['.llsp3'] },
    { folder: 'scenes', kind: 'scenes', extensions: ['.spk'] },
    { folder: 'robots', kind: 'robots', extensions: ['.mpd', '.ldr'] }
];

export interface LessonPackage {
    lesson: Lesson;
    name: string;
    files: { kind: LibraryKind; name: string; blob: Blob }[];
}

// Read a lesson package (.zip) or a bare lesson .json file.
export async function readLessonPackage(file: File): Promise<LessonPackage> {
    let lesson: unknown;
    const files: LessonPackage['files'] = [];
    if (file.name.toLowerCase().endsWith('.json')) {
        lesson = parseJson(await file.text());
    } else {
        let zip: JSZip;
        try {
            zip = await new JSZip().loadAsync(file);
        } catch {
            throw new Error('That file is not a lesson package (.zip) or lesson (.json).');
        }
        // Allow the whole package to sit inside one folder, as zipping a folder does.
        const json = zip.file(/(^|\/)lesson\.json$/)[0];
        if (!json) throw new Error('The package has no lesson.json.');
        const root = json.name.slice(0, -'lesson.json'.length);
        lesson = parseJson(await json.async('string'));
        for (const { folder, kind, extensions } of folders) {
            for (const entry of zip.file(new RegExp(`^${escape(root)}${folder}/[^/]+$`))) {
                const name = entry.name.split('/').pop() ?? '';
                if (!extensions.some((e) => name.toLowerCase().endsWith(e))) continue;
                files.push({ kind, name, blob: await entry.async('blob') });
            }
        }
    }
    const problem = lessonProblem(lesson);
    if (problem) throw new Error(problem);
    const valid = lesson as Lesson;
    return { lesson: valid, name: libraryFileName('lessons', valid.title), files };
}

// Library entries a package would replace.
export function packageConflicts(pkg: LessonPackage) {
    const index = get(libraryStore).index;
    const names = pkg.files
        .filter((f) => index[f.kind].some((e) => e.name == f.name))
        .map((f) => f.name);
    if (index.lessons.some((e) => e.name == pkg.name)) names.unshift(pkg.name);
    return names;
}

export async function installLessonPackage(pkg: LessonPackage) {
    for (const f of pkg.files) {
        await saveEntry(f.kind, f.name, f.blob);
    }
    await saveLesson(pkg.name, pkg.lesson);
}

// Build a package with the lesson and the library files it uses.
export async function exportLessonPackage(lesson: Lesson): Promise<Blob> {
    const zip = new JSZip();
    zip.file('lesson.json', JSON.stringify(lesson, null, 2));
    const add = async (kind: LibraryKind, name: string | undefined) => {
        if (!name || !get(libraryStore).index[kind].some((e) => e.name == name)) return;
        zip.file(`${kind}/${name}`, await fetchEntry(kind, name));
    };
    await add('programs', lesson.program);
    await add('scenes', lesson.field);
    await add('robots', lesson.robot);
    return await zip.generateAsync({ type: 'blob' });
}

function parseJson(text: string) {
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('lesson.json is not valid JSON.');
    }
}

function escape(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
