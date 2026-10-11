/// <reference types="vite/client" />
// Challenges: short goals checked automatically from a batch of runs.
// They live in the shared library (library/challenges/<id>.json, format in
// schemas/challenge-v1.json) so coaches can make and edit them. The ones in
// presets/challenges/ are built in too, for when there's no library server.

import { derived, get, writable } from 'svelte/store';
import { type PresetName } from '$lib/spike/realism';
import { type Check } from '$lib/spike/checks';
import { libraryStore } from '$lib/library';

// A challenge file (spike-challenge/1).
export interface ChallengeFile {
    schema: 'spike-challenge/1';
    title: string;
    goal: string;
    field: string;
    check: Check;
    level?: 1 | 2 | 3;
    skill?: string;
    robot?: string;
    example?: string;
    hints?: string[];
    order?: number;
    draft?: boolean;
    // Set by the server when a coach's AI assistant saved it through /mcp.
    author?: string;
}

// Something a batch of runs is checked against: a challenge, or a lesson's
// check (then lesson is the lesson's file name).
export interface Challenge {
    id: string;
    title: string;
    level?: 1 | 2 | 3;
    skill?: string;
    goal: string;
    field: string;
    robot?: string;
    realism: PresetName;
    needed: number;
    check: Check;
    hints: string[];
    example?: string;
    lesson?: string;
    order?: number;
    draft?: boolean;
}

export function challengeFromFile(name: string, file: ChallengeFile): Challenge {
    return {
        id: name.replace(/\.json$/i, ''),
        title: file.title,
        level: file.level,
        skill: file.skill,
        goal: file.goal,
        field: file.field,
        robot: file.robot,
        realism: file.check.realism,
        needed: file.check.needed,
        check: file.check,
        hints: file.hints ?? [],
        example: file.example,
        order: file.order,
        draft: file.draft
    };
}

function sorted(list: Challenge[]) {
    return list.sort(
        (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.title.localeCompare(b.title)
    );
}

const presets = import.meta.glob<ChallengeFile>('../../../presets/challenges/*.json', {
    eager: true,
    import: 'default'
});

export const builtInChallenges = sorted(
    Object.entries(presets).map(([file, json]) =>
        challengeFromFile(file.split('/').pop() ?? file, json)
    )
);

// Every challenge, drafts included: the library's when it has a server,
// otherwise the built-in ones.
export const allChallenges = derived(libraryStore, (library) =>
    library.available
        ? sorted(
              library.index.challenges
                  .filter((e) => e.challenge)
                  .map((e) => challengeFromFile(e.name, e.challenge!))
          )
        : builtInChallenges
);

// What students see.
export const challengeList = derived(allChallenges, (all) => all.filter((c) => !c.draft));

export function findChallenge(id: string | undefined) {
    return id ? get(allChallenges).find((c) => c.id == id) : undefined;
}

// ---- Checking ----------------------------------------------------------

// ---- Active challenge and progress -------------------------------------

export const activeChallenge = writable<Challenge | undefined>(undefined);

// Whether the Challenges window is open, so either panel can open it.
export const challengesOpen = writable(false);

// Challenge to show when the window next opens, for example from a lesson.
export const requestedChallenge = writable<string | undefined>(undefined);

export function openChallenge(id?: string) {
    requestedChallenge.set(id);
    challengesOpen.set(true);
}

const progressKey = 'spike-sim-challenges';

export interface Progress {
    best: number;
    completed: boolean;
}

function loadProgress(): Record<string, Progress> {
    try {
        return JSON.parse(localStorage.getItem(progressKey) ?? '{}');
    } catch {
        return {};
    }
}

export const progressStore = writable<Record<string, Progress>>(loadProgress());

progressStore.subscribe((value) => {
    try {
        localStorage.setItem(progressKey, JSON.stringify(value));
    } catch {
        // storage unavailable
    }
});

export function recordAttempt(challenge: Challenge, passes: number) {
    const all = get(progressStore);
    const old = all[challenge.id] ?? { best: 0, completed: false };
    progressStore.set({
        ...all,
        [challenge.id]: {
            best: Math.max(old.best, passes),
            completed: old.completed || passes >= challenge.needed
        }
    });
}
