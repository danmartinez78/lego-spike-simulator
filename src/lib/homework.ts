// Assignments from the coach (called homework in the code), and syncing a signed-in student's lesson progress,
// challenge results and handed-in programs with the server (server/homework.mjs).

import { get, writable } from 'svelte/store';
import { askConfirm } from '$lib/confirm';
import { currentProgram, libraryStore, programRequest } from '$lib/library';
import { lessonProgress, type LessonProgress } from '$lib/lessons';
import { progressStore as challengeProgress, type Progress } from '$lib/spike/challenges';
import { studentDialogOpen, studentStore } from '$lib/team';

// What an assignment is for. Older assignments have no type and show no badge.
export type AssignmentType = 'practice' | 'prep';

export const ASSIGNMENT_TYPES: { value: AssignmentType; label: string; badge: string }[] = [
    { value: 'practice', label: 'Practice', badge: 'bg-teal-100 text-teal-800' },
    { value: 'prep', label: 'Prep for next meeting', badge: 'bg-indigo-100 text-indigo-800' }
];

export function assignmentType(type: string | undefined) {
    return ASSIGNMENT_TYPES.find((t) => t.value == type);
}

export interface Assignment {
    id: string;
    title: string;
    note?: string;
    due?: string;
    type?: AssignmentType;
    lessons: string[];
    created: string;
    // Saved by an AI assistant and not yet published: students don't see it.
    draft?: boolean;
    author?: string;
}

export interface ServerProgress {
    lessons: Record<string, LessonProgress>;
    challenges: Record<string, Progress>;
    programs?: Record<string, string>;
}

export const homeworkStore = writable<Assignment[]>([]);

// Lesson file name -> when this student last handed in a program for it.
export const handedIn = writable<Record<string, string>>({});

export async function refreshHomework() {
    try {
        const response = await fetch('api/student/homework', { cache: 'no-store' });
        if (response.ok) homeworkStore.set((await response.json()).assignments ?? []);
    } catch {
        // offline or no server: no assignments shown
    }
}

// "Thu, Oct 16" for a YYYY-MM-DD date, read as a local date.
export function dueLabel(due: string | undefined) {
    if (!due) return '';
    const [y, m, d] = due.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}

export function isOverdue(due: string | undefined) {
    if (!due) return false;
    const [y, m, d] = due.split('-').map(Number);
    return new Date(y, m - 1, d + 1).getTime() <= Date.now();
}

// ---- Syncing ------------------------------------------------------------------

function studentHeaders(): Record<string, string> {
    const student = get(studentStore);
    return student ? { 'X-Student-Code': student.code } : {};
}

let applying = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function apply(progress: ServerProgress) {
    applying = true;
    lessonProgress.set(progress.lessons ?? {});
    challengeProgress.set(progress.challenges ?? {});
    handedIn.set(progress.programs ?? {});
    applying = false;
}

async function push() {
    if (!get(studentStore)) return;
    try {
        const response = await fetch('api/student/progress', {
            method: 'PUT',
            headers: studentHeaders(),
            body: JSON.stringify({
                lessons: get(lessonProgress),
                challenges: get(challengeProgress)
            }),
            cache: 'no-store'
        });
        if (response.ok) apply(await response.json());
    } catch {
        // offline: the next change or sign-in tries again
    }
}

function schedulePush() {
    if (applying || !get(studentStore)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, 1500);
}

let started = false;

// Lessons and challenges this browser has progress on.
function localWork() {
    const lessons = Object.values(get(lessonProgress)).filter(
        (p) => p.steps.length > 0 || p.check
    ).length;
    const challenges = Object.values(get(challengeProgress)).filter(
        (p) => p.best > 0 || p.completed
    ).length;
    return { lessons, challenges };
}

function count(n: number, one: string) {
    return `${n} ${one}${n == 1 ? '' : 's'}`;
}

// A student just signed in. Work done on this computer before that may belong
// to someone else (a shared computer), so ask before adding it to their account.
async function signedIn(switched: boolean) {
    const work = localWork();
    if (switched) {
        // Another student was signed in here: their work isn't this student's.
        apply({ lessons: {}, challenges: {}, programs: {} });
    } else if (work.lessons + work.challenges > 0) {
        const parts = [
            work.lessons ? count(work.lessons, 'lesson') : '',
            work.challenges ? count(work.challenges, 'challenge') : ''
        ].filter((x) => x);
        const mine = await askConfirm(
            `This computer has work on ${parts.join(' and ')} from before you signed in. ` +
                'Is it yours? If it is, it gets added to your account.',
            { confirmLabel: "Yes, it's mine", cancelLabel: "No, it isn't mine" }
        );
        // The student may have signed out while the question was open.
        if (!get(studentStore)) return;
        if (!mine) apply({ lessons: {}, challenges: {}, programs: {} });
    }
    await push();
}

// Called once at startup. Signing in uploads this device's progress (after
// asking) and brings back the student's progress from other devices; signing
// out clears it from this device so the next person starts fresh.
export function startProgressSync() {
    if (started) return;
    started = true;
    let previous = get(studentStore)?.code;
    studentStore.subscribe((student) => {
        if (student && student.code != previous) {
            signedIn(!!previous);
        } else if (!student && previous) {
            apply({ lessons: {}, challenges: {}, programs: {} });
        }
        previous = student?.code;
    });
    if (previous) push();
    lessonProgress.subscribe(schedulePush);
    challengeProgress.subscribe(schedulePush);
}

// ---- Reminding students to sign in -------------------------------------------

let reminded = false;

// The first time a student who isn't signed in starts real work (ticks a step,
// runs a check, starts a challenge), ask once per visit whether they want to
// sign in. Returns true to go ahead, false when they chose to sign in first.
// Visitors and demos can say "Just trying it out" and carry on.
export async function remindToSignIn() {
    if (reminded || get(studentStore) || !get(libraryStore).available) return true;
    reminded = true;
    const signIn = await askConfirm(
        "You're not signed in, so your coach can't see this work and it stays on this " +
            'computer only. Sign in with your code first?',
        { confirmLabel: 'Sign in', cancelLabel: 'Just trying it out' }
    );
    if (signIn) studentDialogOpen.set(true);
    return !signIn;
}

// ---- Handing in -------------------------------------------------------------

export async function handIn(lessonName: string) {
    const blob = await currentProgram();
    if (!blob) throw new Error('There is no program in the code panel.');
    const response = await fetch(`api/student/programs/${encodeURIComponent(lessonName)}`, {
        method: 'PUT',
        headers: studentHeaders(),
        body: blob
    });
    if (!response.ok) {
        let message = "Couldn't hand it in.";
        try {
            message = (await response.json()).error ?? message;
        } catch {
            // not json
        }
        throw new Error(message);
    }
    const { handedIn: when } = await response.json();
    handedIn.update((all) => ({ ...all, [lessonName]: when }));
    return when as string;
}

export async function openHandedIn(lessonName: string) {
    const response = await fetch(`api/student/programs/${encodeURIComponent(lessonName)}`, {
        headers: studentHeaders(),
        cache: 'no-store'
    });
    if (!response.ok) throw new Error("Couldn't load your program.");
    programRequest.set({ blob: await response.blob(), merge: false });
}

export function timeLabel(iso: string | undefined) {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

// ---- Coach side ---------------------------------------------------------------

export interface StudentProgress {
    id: string;
    name: string;
    progress: ServerProgress;
    programs: Record<string, string>;
}

async function adminJson<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`api/admin/${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
        redirect: 'manual',
        cache: 'no-store'
    });
    if (!response.ok) {
        let message = `${response.status}`;
        try {
            message = (await response.json()).error ?? message;
        } catch {
            message = 'Sign in to manage assignments';
        }
        throw new Error(message);
    }
    return (await response.json()) as T;
}

export type AssignmentInput = Pick<
    Assignment,
    'title' | 'note' | 'due' | 'type' | 'lessons' | 'draft'
>;

export const getHomework = () => adminJson<{ assignments: Assignment[] }>('GET', 'homework');
export const addAssignment = (a: AssignmentInput) =>
    adminJson<{ assignments: Assignment[] }>('POST', 'homework', a);
export const updateAssignment = (id: string, a: AssignmentInput) =>
    adminJson<{ assignments: Assignment[] }>('PUT', `homework/${id}`, a);
export const deleteAssignment = (id: string) =>
    adminJson<{ assignments: Assignment[] }>('DELETE', `homework/${id}`);
export const getTeamProgress = () => adminJson<{ students: StudentProgress[] }>('GET', 'progress');

export function handedInUrl(studentId: string, lessonName: string) {
    return `api/admin/progress/${studentId}/programs/${encodeURIComponent(lessonName)}`;
}
