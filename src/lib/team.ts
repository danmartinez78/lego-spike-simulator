// Team roster (coach side) and student sign-in with a roster code.
// Served by server/team.mjs; without the server, sign-in reports it's unavailable.

import { writable } from 'svelte/store';

export interface Student {
    id: string;
    name: string;
    code: string;
    added: string;
}

export interface Roster {
    students: Student[];
}

// ---- Student sign-in --------------------------------------------------------

export interface SignedInStudent {
    name: string;
    code: string;
}

const studentKey = 'spike-sim-student';

function loadStudent(): SignedInStudent | undefined {
    try {
        return JSON.parse(localStorage.getItem(studentKey) ?? 'null') ?? undefined;
    } catch {
        return undefined;
    }
}

export const studentStore = writable<SignedInStudent | undefined>(loadStudent());

studentStore.subscribe((value) => {
    try {
        if (value) localStorage.setItem(studentKey, JSON.stringify(value));
        else localStorage.removeItem(studentKey);
    } catch {
        // storage unavailable
    }
});

export const studentDialogOpen = writable(false);

// A code from a sign-in link that didn't work, to show in the sign-in window.
export const pendingCode = writable('');

export async function signIn(code: string) {
    let response: Response;
    try {
        response = await fetch('api/student/signin', {
            method: 'POST',
            body: JSON.stringify({ code }),
            cache: 'no-store'
        });
    } catch {
        throw new Error("Couldn't reach the site. Check your internet connection.");
    }
    let body: { name?: string; code?: string; error?: string } = {};
    try {
        body = await response.json();
    } catch {
        throw new Error('Signing in only works on the team website.');
    }
    if (!response.ok || !body.name || !body.code) {
        throw new Error(body.error ?? "That code didn't work.");
    }
    const student = { name: body.name, code: body.code };
    studentStore.set(student);
    return student;
}

export function signOut() {
    studentStore.set(undefined);
}

// Sign in from a #code=... link. Returns false when the address has no code.
async function signInFromLink() {
    const match = window.location.hash.match(/code=([A-Za-z0-9-]+)/);
    if (!match) return false;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    try {
        await signIn(match[1]);
    } catch {
        // Show the code in the sign-in window so the student sees what went wrong.
        pendingCode.set(match[1]);
    }
    studentDialogOpen.set(true);
    return true;
}

// On startup: sign in from a #code=... link, or check the remembered code still works.
export async function startStudentSession() {
    // A link opened while the simulator is already open only changes the hash.
    window.addEventListener('hashchange', () => void signInFromLink());
    if (await signInFromLink()) return;
    const current = loadStudent();
    if (!current) return;
    try {
        const response = await fetch('api/student/me', {
            headers: { 'X-Student-Code': current.code },
            cache: 'no-store'
        });
        if (response.status == 401) {
            // The coach gave this student a new code or removed them.
            signOut();
        } else if (response.ok) {
            const body = await response.json();
            if (body.name && body.name != current.name) {
                studentStore.set({ ...current, name: body.name });
            }
        }
    } catch {
        // offline: keep the remembered sign-in
    }
}

// ---- Coach side -------------------------------------------------------------

async function rosterRequest(method: string, path = '', body?: unknown): Promise<Roster> {
    const response = await fetch(`api/admin/roster${path}`, {
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
            message = 'Sign in to manage the team';
        }
        throw new Error(message);
    }
    return (await response.json()) as Roster;
}

export const getRoster = () => rosterRequest('GET');
export const addStudents = (names: string[]) => rosterRequest('POST', '', { names });
export const newCode = (id: string) => rosterRequest('POST', `/${id}/code`);
export const renameStudent = (id: string, name: string) =>
    rosterRequest('PATCH', `/${id}`, { name });
export const removeStudent = (id: string) => rosterRequest('DELETE', `/${id}`);
export const newCodesForEveryone = () => rosterRequest('POST', '/codes');

// The site's address for a backup zip: the team (roster, progress, handed-in
// programs, assignments) and the shared library.
export const backupUrl = 'api/admin/backup';

// Names that look like a full surname ("Maya Rodriguez" rather than "Maya R.").
export function fullNames(names: string[]) {
    return names.filter((name) => {
        const words = name.trim().split(/\s+/);
        return words.length > 1 && words.slice(1).some((w) => w.replace(/\./g, '').length > 2);
    });
}

// The simulator's address, worked out from the coach page's address.
export function siteAddress() {
    return new URL('./', window.location.href).href;
}

// A link that opens the simulator and signs the student in.
export function signInLink(code: string) {
    return `${siteAddress()}#code=${code}`;
}

export function rosterCsv(students: Student[]) {
    const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [['Name', 'Code', 'Sign-in link']];
    for (const s of students) rows.push([s.name, s.code, signInLink(s.code)]);
    return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
