// Which help windows are open: the first-visit welcome and the usage guide.

import { writable } from 'svelte/store';

const seenKey = 'spike-sim-welcome-seen';

function welcomeSeen() {
    try {
        return localStorage.getItem(seenKey) === '1';
    } catch {
        return false;
    }
}

export const helpStore = writable({
    welcomeOpen: !welcomeSeen(),
    guideOpen: false,
    guideTab: 'start',
    // Bumped each time a tab is requested, so the guide switches to it once.
    guideRequest: 0,
    // Block type shown in the "Explain this block" card.
    blockHelpType: undefined as string | undefined
});

export function closeWelcome(dontShowAgain: boolean) {
    if (dontShowAgain) {
        try {
            localStorage.setItem(seenKey, '1');
        } catch {
            // storage unavailable
        }
    }
    helpStore.update((old) => ({ ...old, welcomeOpen: false }));
}

export function openGuide(tab = 'start') {
    helpStore.update((old) => ({
        ...old,
        welcomeOpen: false,
        guideOpen: true,
        guideTab: tab,
        guideRequest: old.guideRequest + 1
    }));
}

export function openBlockHelp(type: string) {
    helpStore.update((old) => ({ ...old, blockHelpType: type }));
}

export function closeBlockHelp() {
    helpStore.update((old) => ({ ...old, blockHelpType: undefined }));
}
