// Debug options for the simulator view, remembered in this browser.

import { writable } from 'svelte/store';

const fpsKey = 'spike-sim-show-fps';

function read(): boolean {
    try {
        return localStorage.getItem(fpsKey) === '1';
    } catch {
        return false;
    }
}

// Show the frame rate in the corner of the 3D view.
export const showFps = writable<boolean>(read());

export function setShowFps(show: boolean) {
    showFps.set(show);
    try {
        localStorage.setItem(fpsKey, show ? '1' : '0');
    } catch {
        // storage unavailable: the choice lasts until the page closes
    }
}
