// Keep the program in the code panel in this browser, so closing the tab or
// reloading doesn't lose work. Saving a .llsp3 file is still how work moves
// between devices.

import * as Blockly from 'blockly/core';

const storageKey = 'spike-sim-program';

export function restoreProgram(workspace: Blockly.WorkspaceSvg) {
    let saved: string | null = null;
    try {
        saved = localStorage.getItem(storageKey);
    } catch {
        return false;
    }
    if (!saved) return false;
    try {
        const state = JSON.parse(saved);
        if (!state?.blocks?.blocks?.length) return false;
        Blockly.serialization.workspaces.load(state, workspace);
        return true;
    } catch (e) {
        console.log('Could not restore the saved program', e);
        return false;
    }
}

export function saveProgramNow(workspace: Blockly.WorkspaceSvg) {
    try {
        const state = Blockly.serialization.workspaces.save(workspace);
        localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
        // storage full or unavailable: the program stays in the code panel
    }
}

// Save shortly after each change, and right away when the page is hidden or closed.
export function startAutosave(workspace: Blockly.WorkspaceSvg) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
        if (timer) clearTimeout(timer);
        timer = undefined;
        saveProgramNow(workspace);
    };
    const listener = (event: Blockly.Events.Abstract) => {
        if (event.isUiEvent) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 1000);
    };
    const hidden = () => {
        if (document.visibilityState == 'hidden') flush();
    };
    workspace.addChangeListener(listener);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', flush);
    return () => {
        workspace.removeChangeListener(listener);
        document.removeEventListener('visibilitychange', hidden);
        window.removeEventListener('pagehide', flush);
        if (timer) flush();
    };
}
