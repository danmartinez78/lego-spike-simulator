// Homework from the coach, and syncing a signed-in student's lesson progress,
// challenge results and handed-in programs with the server (server/homework.mjs).

import { get, writable } from 'svelte/store';
import { currentProgram, programRequest } from '$lib/library';
import { lessonProgress, type LessonProgress } from '$lib/lessons';
import { progressStore as challengeProgress, type Progress } from '$lib/spike/challenges';
import { studentStore } from '$lib/team';

export interface Assignment {
    id: string;
    title: string;
    note?: string;
    due?: string;
    lessons: string[];
    created: string;
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
        // offline or no server: no homework shown
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

// Called once at startup. Signing in uploads this device's progress and
// brings back the student's progress from other devices; signing out clears
// it from this device so the next person starts fresh.
export function startProgressSync() {
    if (started) return;
    started = true;
    let previous = get(studentStore)?.code;
    studentStore.subscribe((student) => {
        if (student && student.code != previous) {
            push();
        } else if (!student && previous) {
            apply({ lessons: {}, challenges: {}, programs: {} });
        }
        previous = student?.code;
    });
    if (previous) push();
    lessonProgress.subscribe(schedulePush);
    challengeProgress.subscribe(schedulePush);
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
            message = 'Sign in to manage homework';
        }
        throw new Error(message);
    }
    return (await response.json()) as T;
}

export type AssignmentInput = Pick<Assignment, 'title' | 'note' | 'due' | 'lessons'>;

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
