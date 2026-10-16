// Shared robot and scene library, served by server/server.mjs.
// When the app runs from a plain file or a static server the API is missing,
// and everything here quietly reports that no library is available.

import { get, writable } from 'svelte/store';
import type { Check } from '$lib/spike/checks';
import type { ChallengeFile } from '$lib/spike/challenges';
import JSZip from 'jszip';
import {
    componentStore,
    fetchAndResolveParts,
    loadModel,
    updateUnresolvedParts
} from '$lib/ldraw/components';
import { sceneStore, type SceneObject } from '$lib/spike/scene';

export type LibraryKind = 'robots' | 'scenes' | 'programs' | 'lessons' | 'challenges';

export interface LessonCard {
    title: string;
    topic: string;
    order?: number;
    summary?: string;
    what?: string;
    why?: string;
    try?: string[];
    scene?: string;
    // Kept in the program catalog but left out of the Examples window.
    hidden?: boolean;
}

// A program is an example when it has an explanation that isn't hidden.
// Others are only in the catalog, for lessons and challenges to use.
export function isExample(entry: LibraryEntry) {
    return !!entry.card && !entry.card.hidden;
}

// A lesson students work through step by step (schemas/lesson-v1.json).
export interface LessonStep {
    title?: string;
    text: string;
}

export interface Lesson {
    schema: 'spike-lesson/1';
    title: string;
    topic?: string;
    order?: number;
    summary?: string;
    steps: LessonStep[];
    program?: string;
    field?: string;
    robot?: string;
    // Related challenges' ids, shown once the lesson is done.
    challenges?: string[];
    // One related challenge (older lessons). Counts the same as challenges.
    challenge?: string;
    // How the simulator checks the student's runs (see docs/lessons.md).
    check?: Check;
    // Drafts are only shown to coaches.
    draft?: boolean;
    // Set by the server when a coach's AI assistant saved it through /mcp.
    author?: string;
}

export interface LibraryEntry {
    name: string;
    size: number;
    modified: string;
    card?: LessonCard;
    lesson?: Lesson;
    challenge?: ChallengeFile;
    // Robots and scenes an AI assistant added: the coach it worked for.
    author?: string;
}

export interface LibraryIndex {
    robots: LibraryEntry[];
    scenes: LibraryEntry[];
    programs: LibraryEntry[];
    lessons: LibraryEntry[];
    challenges: LibraryEntry[];
    defaults: { robot?: string; scene?: string };
}

export interface LibraryState {
    available: boolean;
    index: LibraryIndex;
    writer: string | undefined;
}

export interface RobotRequest {
    name: string;
    blob: Blob;
}

export const libraryStore = writable<LibraryState>({
    available: false,
    index: { robots: [], scenes: [], programs: [], lessons: [], challenges: [], defaults: {} },
    writer: undefined
});

// A robot waiting to be loaded by the simulator panel, which owns the hub
// that the robot's ports and wheels are connected to.
export const robotRequest = writable<RobotRequest | undefined>(undefined);

function entryUrl(kind: LibraryKind, name: string) {
    return `api/library/${kind}/${encodeURIComponent(name)}`;
}

export async function refreshLibrary(): Promise<LibraryState> {
    let state: LibraryState = get(libraryStore);
    try {
        const response = await fetch('api/library', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`library ${response.status}`);
        }
        const index = (await response.json()) as LibraryIndex;
        index.programs = index.programs ?? [];
        index.lessons = index.lessons ?? [];
        index.challenges = index.challenges ?? [];
        state = { ...state, available: true, index };
    } catch {
        state = { ...state, available: false };
    }
    try {
        const response = await fetch('api/admin/whoami', {
            cache: 'no-store',
            redirect: 'manual'
        });
        if (response.ok) {
            const body = await response.json();
            state = { ...state, writer: body.writer ?? undefined };
        } else {
            state = { ...state, writer: undefined };
        }
    } catch {
        // Cloudflare Access redirects to its login page, which fetch cannot follow.
        state = { ...state, writer: undefined };
    }
    libraryStore.set(state);
    return state;
}

export async function fetchEntry(kind: LibraryKind, name: string): Promise<Blob> {
    const response = await fetch(entryUrl(kind, name), { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Could not load ${name} (${response.status})`);
    }
    return await response.blob();
}

async function adminRequest(method: string, path: string, body?: BodyInit) {
    const response = await fetch(`api/admin/${path}`, {
        method,
        body,
        credentials: 'same-origin',
        redirect: 'manual'
    });
    if (!response.ok) {
        let message = `${response.status}`;
        try {
            message = (await response.json()).error ?? message;
        } catch {
            // not json, probably a sign-in redirect
            message = 'Sign in to change the library';
        }
        throw new Error(message);
    }
    await refreshLibrary();
}

export async function saveEntry(kind: LibraryKind, name: string, blob: Blob) {
    await adminRequest('PUT', `${kind}/${encodeURIComponent(name)}`, blob);
}

export async function deleteEntry(kind: LibraryKind, name: string) {
    await adminRequest('DELETE', `${kind}/${encodeURIComponent(name)}`);
}

export async function setDefault(kind: LibraryKind, name: string | null) {
    const field = kind === 'robots' ? 'robot' : 'scene';
    await adminRequest('PUT', 'defaults', JSON.stringify({ [field]: name }));
}

export async function renameEntry(kind: LibraryKind, from: string, to: string) {
    await adminRequest('POST', 'rename', JSON.stringify({ kind, from, to }));
}

export async function saveLessonCard(name: string, card: LessonCard) {
    await adminRequest(
        'PUT',
        `programs/${encodeURIComponent(name + '.json')}`,
        new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' })
    );
}

export async function saveLesson(name: string, lesson: Lesson) {
    await adminRequest(
        'PUT',
        `lessons/${encodeURIComponent(name)}`,
        new Blob([JSON.stringify(lesson, null, 2)], { type: 'application/json' })
    );
}

export async function saveChallenge(name: string, challenge: ChallengeFile) {
    await adminRequest(
        'PUT',
        `challenges/${encodeURIComponent(name)}`,
        new Blob([JSON.stringify(challenge, null, 2)], { type: 'application/json' })
    );
}

export async function saveProgram(name: string, blob: Blob, card: LessonCard) {
    await adminRequest('PUT', `programs/${encodeURIComponent(name)}`, blob);
    await adminRequest(
        'PUT',
        `programs/${encodeURIComponent(name + '.json')}`,
        new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' })
    );
}

const extensions: Record<LibraryKind, string> = {
    robots: '.mpd',
    scenes: '.spk',
    programs: '.llsp3',
    lessons: '.json',
    challenges: '.json'
};

export function libraryFileName(kind: LibraryKind, name: string) {
    const extension = extensions[kind];
    let clean = name
        .trim()
        .replace(/[^\w .()+-]/g, '_')
        .slice(0, 90);
    if (clean.length == 0) {
        clean = kind.slice(0, -1);
    }
    if (!clean.toLowerCase().endsWith(extension)) {
        clean += extension;
    }
    return clean;
}

// Name of the library robot loaded last, so the robot picker can show it.
export const currentRobotName = writable<string | undefined>(undefined);

export async function loadRobotFromLibrary(name: string) {
    const blob = await fetchEntry('robots', name);
    robotRequest.set({ name, blob });
    currentRobotName.set(name);
}

// A library file name without its extension, for showing to students.
export function entryTitle(name: string) {
    return name.replace(/\.(mpd|ldr|spk|llsp3|json)$/i, '');
}

// Name of the library scene loaded last, so it can be saved back.
export const currentSceneName = writable<string | undefined>(undefined);

export async function loadSceneFromLibrary(name: string) {
    await loadSceneFromBlob(await fetchEntry('scenes', name));
    currentSceneName.set(name);
}

// Load a scene (.spk zip of scene.json, mat.jpg and object models) into the scene store.
export async function loadSceneFromBlob(blob: Blob) {
    const zip = new JSZip();
    const zipFile = await zip.loadAsync(blob);
    let map: Blob | undefined = undefined;
    const jsonFile = zipFile.file('scene.json');
    if (!jsonFile) {
        throw new Error('Invalid scene file format, missing scene.json');
    }
    const sceneDefContents = await jsonFile.async('string');
    const scene = JSON.parse(sceneDefContents);
    const objects: SceneObject[] = [];

    const mapFile = zipFile.file('mat.jpg');
    if (mapFile) {
        map = await mapFile.async('blob');
    }

    const robot = {
        anchored: scene.robot.anchored,
        position: scene.robot.position,
        rotation: scene.robot.rotation,
        name: scene.robot.name,
        bricks: get(componentStore).robotModel
    };
    for (const obj of scene.objects) {
        const objFile = zipFile.file(`bricks-${obj.name}`);
        if (objFile) {
            const content = await objFile.async('string');
            const model = loadModel(obj.name, content);
            updateUnresolvedParts();
            objects.push({
                anchored: obj.anchored,
                position: obj.position,
                rotation: obj.rotation,
                name: obj.name,
                bricks: model
            });
        } else {
            objects.push({
                anchored: obj.anchored,
                position: obj.position,
                rotation: obj.rotation,
                name: obj.name
            });
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sceneStore.update((old) => {
        return {
            robot: robot,
            objects: objects,
            map: map,
            mapWidth: scene.matWidth,
            mapHeight: scene.matHeight
        };
    });
    if (objects.length > 0 && get(componentStore).canFetchComponents) {
        fetchAndResolveParts();
    }
}

// On start up, load the library's default robot and scene, if any.
export async function loadLibraryDefaults() {
    const state = await refreshLibrary();
    if (!state.available) {
        return;
    }
    const defaults = state.index.defaults;
    try {
        if (defaults.robot) {
            await loadRobotFromLibrary(defaults.robot);
        }
        if (defaults.scene) {
            await loadSceneFromLibrary(defaults.scene);
        }
    } catch (e) {
        console.log('Could not load library defaults', e);
    }
}

// A program the code panel should open or merge in (from the Examples panel).
export interface ProgramRequest {
    blob: Blob;
    merge: boolean;
}

export const programRequest = writable<ProgramRequest | undefined>(undefined);

// Set to true to empty the code panel (for example when a student signs out).
export const clearProgram = writable(false);

// Set by the code panel so other windows can save the current program.
let programBuilder: (() => Promise<Blob | undefined>) | undefined = undefined;

export function setProgramBuilder(builder: () => Promise<Blob | undefined>) {
    programBuilder = builder;
}

export async function currentProgram(): Promise<Blob | undefined> {
    return programBuilder ? await programBuilder() : undefined;
}

// ---- Mat pictures, for drawing checks ---------------------------------------

export interface MatPicture {
    width: number;
    height: number;
    map?: Blob;
}

const matCache = new Map<string, Promise<MatPicture>>();

// The mat picture and size of a library scene (cached; scenes rarely change).
export function readMat(sceneName: string): Promise<MatPicture> {
    const modified = get(libraryStore).index.scenes.find((e) => e.name == sceneName)?.modified;
    const key = `${sceneName}@${modified}`;
    let mat = matCache.get(key);
    if (!mat) {
        mat = (async () => {
            const zip = await new JSZip().loadAsync(await fetchEntry('scenes', sceneName));
            const json = zip.file('scene.json');
            if (!json) throw new Error(`${sceneName} has no scene.json`);
            const scene = JSON.parse(await json.async('string'));
            const map = await zip.file('mat.jpg')?.async('blob');
            return { width: scene.matWidth ?? 2360, height: scene.matHeight ?? 1140, map };
        })();
        mat.catch(() => matCache.delete(key));
        matCache.set(key, mat);
    }
    return mat;
}
