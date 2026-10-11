// Team settings the head coach chooses on the coach page (server/settings.mjs).
// Anyone can read them: the privacy page shows families what they are.

import { writable } from 'svelte/store';

export type AiStudentNames = 'stats' | 'names';

export interface TeamSettings {
    teamName: string;
    privacyContact: string;
    aiStudentNames: AiStudentNames;
    signOutAfterMinutes: number;
}

export const DEFAULT_SETTINGS: TeamSettings = {
    teamName: '',
    privacyContact: '',
    aiStudentNames: 'stats',
    signOutAfterMinutes: 0
};

export const AI_NAME_CHOICES: { value: AiStudentNames; label: string; about: string }[] = [
    {
        value: 'stats',
        label: 'Team statistics',
        about: 'For each lesson: how many students are done, started or not started, how many handed in or passed the check, and which steps the ones still working are on. Nothing about any one student.'
    },
    {
        value: 'names',
        label: 'Team statistics and each student by name',
        about: "The statistics, plus every student's name and progress, so an assistant can say who needs help."
    }
];

export const SIGN_OUT_CHOICES: { value: number; label: string }[] = [
    { value: 0, label: 'Never (students use their own computers)' },
    { value: 30, label: 'After 30 minutes without using the site' },
    { value: 60, label: 'After 1 hour without using the site' },
    { value: 120, label: 'After 2 hours without using the site' }
];

export const settingsStore = writable<TeamSettings>(DEFAULT_SETTINGS);

// The public settings, for the simulator and the privacy page.
export async function loadSettings() {
    try {
        const response = await fetch('api/settings', { cache: 'no-store' });
        if (response.ok) settingsStore.set({ ...DEFAULT_SETTINGS, ...(await response.json()) });
    } catch {
        // no server: the defaults
    }
}

export interface CoachSettings {
    settings: TeamSettings;
    canEdit: boolean;
    headCoaches: boolean;
}

async function adminRequest(method: string, body?: unknown): Promise<CoachSettings> {
    const response = await fetch('api/admin/settings', {
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
            message = 'Sign in to see the team settings';
        }
        throw new Error(message);
    }
    const result = (await response.json()) as CoachSettings;
    settingsStore.set({ ...DEFAULT_SETTINGS, ...result.settings });
    return result;
}

export const getCoachSettings = () => adminRequest('GET');
export const saveCoachSettings = (settings: Partial<TeamSettings>) => adminRequest('PUT', settings);

// The privacy page's address, worked out from the current page's address.
export function privacyAddress() {
    return new URL('privacy', new URL('./', window.location.href)).href;
}

// A note coaches can send to families, filled in from the settings.
export function parentNotice(settings: TeamSettings) {
    const team = settings.teamName || 'our team';
    const contact = settings.privacyContact
        ? ` If you have questions, or want your child's information removed, contact ${settings.privacyContact}.`
        : " If you have questions, or want your child's information removed, contact the coach.";
    const ai = {
        names: "Coaches may use an AI assistant to help plan lessons; it can see students' names and progress.",
        stats: 'Coaches may use an AI assistant to help plan lessons; it sees team statistics only, never names or anything about one student.'
    }[settings.aiStudentNames];
    return [
        `Hello families,`,
        ``,
        `${team} uses the LEGO SPIKE Simulator (${new URL('./', window.location.href).href}) to practise programming robots online. It runs in the browser: there's nothing to install, no sign-up or email address, no ads and no cookies for students. Cloudflare, which delivers the site, counts visits; the team only sees totals.`,
        ``,
        `Each student gets a sign-in code from the coach. When they sign in, the site keeps the name the coach entered (first name and last initial), their progress on lessons and challenges, and the programs they hand in. Only the team's coaches can see this. ${ai}`,
        ``,
        `Everything is deleted when a student leaves the team, and at the end of the season.${contact}`,
        ``,
        `The full privacy notice is at ${privacyAddress()}.`
    ].join('\n');
}
