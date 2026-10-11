// Whether the simulator shows the tools for building robots and fields
// (open a robot file, ports, wheels, scene editor, save). Hidden by default so
// students only see what they need; remembered in this browser.

import { writable } from 'svelte/store';

const storageKey = 'spike-sim-build-tools';

function read(): boolean | undefined {
    try {
        const value = localStorage.getItem(storageKey);
        return value === null ? undefined : value === '1';
    } catch {
        return undefined;
    }
}

// undefined until someone chooses, so the default can depend on who is using it.
export const buildToolsChoice = writable<boolean | undefined>(read());

export function setBuildTools(show: boolean) {
    buildToolsChoice.set(show);
    try {
        localStorage.setItem(storageKey, show ? '1' : '0');
    } catch {
        // storage unavailable: the choice lasts until the page closes
    }
}
