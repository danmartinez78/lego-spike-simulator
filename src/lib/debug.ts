// Options for the simulator view, remembered in this browser.

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

const cameraHintKey = 'spike-sim-camera-hint-seen';

function readHintSeen(): boolean {
    try {
        return localStorage.getItem(cameraHintKey) === '1';
    } catch {
        return false;
    }
}

// Whether this browser has seen how to move the 3D view's camera. The hint
// shows until the viewer moves the view or closes it.
export const cameraHintSeen = writable<boolean>(readHintSeen());

export function setCameraHintSeen() {
    cameraHintSeen.set(true);
    try {
        localStorage.setItem(cameraHintKey, '1');
    } catch {
        // storage unavailable: the hint comes back next visit
    }
}
