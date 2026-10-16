// The team's missions and the versions of their programs (server/missions.mjs).
// Team code: only coaches and signed-in students can read it, so it never goes
// through the public library.

import { get, writable } from 'svelte/store';
import { studentStore } from '$lib/team';

export interface MissionVersion {
    id: string;
    // 1, 2, 3... in the order they were saved
    number: number;
    note: string;
    saved: string;
    // A student's first name, or "Coach" (a coach's email on the coach page).
    by: { kind: 'student' | 'coach'; name: string; id?: string };
    // The version it was made from, when it was opened from one.
    from?: string;
}

export interface Mission {
    id: string;
    number: number;
    title: string;
    season?: string;
    goal?: string;
    notes?: string;
    video?: string;
    field?: string;
    robot?: string;
    // FIRST's guided mission, a program in the public library.
    guided?: string;
    // The version the robot runs at the competition, picked by a coach.
    current?: string;
    versions: MissionVersion[];
    created: string;
    updated: string;
}

export type MissionDetails = Pick<
    Mission,
    'number' | 'title' | 'season' | 'goal' | 'notes' | 'video' | 'field' | 'robot' | 'guided'
>;

export function missionLabel(mission: Pick<Mission, 'number' | 'title'>) {
    return `M${String(mission.number).padStart(2, '0')} ${mission.title}`;
}

export function versionDate(saved: string) {
    return new Date(saved).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}

// Newest first, the way students look for the latest.
export function newestFirst(versions: MissionVersion[]) {
    return [...versions].sort((a, b) => b.number - a.number);
}

async function errorOf(response: Response) {
    try {
        return (await response.json()).error ?? `${response.status}`;
    } catch {
        return response.status == 401 ? 'Sign in first' : `${response.status}`;
    }
}

// ---- Students ------------------------------------------------------------------

export const missionsStore = writable<Mission[]>([]);
export const missionsOpen = writable(false);

// The mission version last opened into the code panel, so saving records
// which version the new one was made from.
export const openedVersion = writable<{ mission: string; version: string } | undefined>(undefined);

// Team code doesn't stay on a shared computer after signing out.
studentStore.subscribe((student) => {
    if (!student) {
        missionsStore.set([]);
        openedVersion.set(undefined);
    }
});

function studentHeaders(): Record<string, string> {
    const student = get(studentStore);
    return student ? { 'X-Student-Code': student.code } : {};
}

export async function refreshMissions(): Promise<Mission[]> {
    if (!get(studentStore)) {
        missionsStore.set([]);
        return [];
    }
    const response = await fetch('api/student/missions', {
        headers: studentHeaders(),
        cache: 'no-store'
    });
    if (!response.ok) throw new Error(await errorOf(response));
    const missions = ((await response.json()).missions ?? []) as Mission[];
    missionsStore.set(missions);
    return missions;
}

export async function fetchVersion(mission: string, version: string): Promise<Blob> {
    const response = await fetch(
        `api/student/missions/${encodeURIComponent(mission)}/versions/${encodeURIComponent(version)}`,
        { headers: studentHeaders(), cache: 'no-store' }
    );
    if (!response.ok) throw new Error(await errorOf(response));
    return await response.blob();
}

export async function saveVersion(
    mission: string,
    program: Blob,
    note: string,
    from?: string
): Promise<MissionVersion> {
    const query = new URLSearchParams({ note, ...(from ? { from } : {}) });
    const response = await fetch(
        `api/student/missions/${encodeURIComponent(mission)}/versions?${query}`,
        { method: 'POST', headers: studentHeaders(), body: program, cache: 'no-store' }
    );
    if (!response.ok) throw new Error(await errorOf(response));
    const result = await response.json();
    await refreshMissions();
    return result.version;
}

// ---- Coaches -------------------------------------------------------------------

async function coachRequest(method: string, path: string, body?: BodyInit) {
    const response = await fetch(`api/admin/missions${path}`, {
        method,
        body,
        credentials: 'same-origin',
        redirect: 'manual',
        cache: 'no-store'
    });
    if (!response.ok) {
        let message = `${response.status}`;
        try {
            message = (await response.json()).error ?? message;
        } catch {
            message = 'Sign in as a coach first';
        }
        throw new Error(message);
    }
    return await response.json();
}

export async function coachMissions(): Promise<Mission[]> {
    return (await coachRequest('GET', '')).missions ?? [];
}

export async function saveMission(details: MissionDetails, id?: string) {
    const result = await coachRequest(
        id ? 'PUT' : 'POST',
        id ? `/${encodeURIComponent(id)}` : '',
        JSON.stringify(details)
    );
    return result as { mission: Mission; warnings: string[] };
}

export async function deleteMission(id: string) {
    await coachRequest('DELETE', `/${encodeURIComponent(id)}`);
}

export async function uploadVersion(
    id: string,
    program: Blob,
    note: string,
    saved?: string,
    from?: string
) {
    const query = new URLSearchParams({
        note,
        ...(saved ? { saved } : {}),
        ...(from ? { from } : {})
    });
    return (await coachRequest('POST', `/${encodeURIComponent(id)}/versions?${query}`, program))
        .mission as Mission;
}

export async function setCurrentVersion(id: string, version: string | undefined) {
    return (
        await coachRequest(
            'PUT',
            `/${encodeURIComponent(id)}/current`,
            JSON.stringify({ version: version ?? null })
        )
    ).mission as Mission;
}

export async function deleteVersion(id: string, version: string) {
    return (
        await coachRequest(
            'DELETE',
            `/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`
        )
    ).mission as Mission;
}

export async function coachFetchVersion(id: string, version: string): Promise<Blob> {
    const response = await fetch(versionDownloadUrl(id, version), {
        credentials: 'same-origin',
        redirect: 'manual',
        cache: 'no-store'
    });
    if (!response.ok) throw new Error(await errorOf(response));
    return await response.blob();
}

export function versionDownloadUrl(id: string, version: string) {
    return `api/admin/missions/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`;
}
