// In-app replacement for window.confirm() and window.alert(). The browser's own
// popups block the page, which freezes automated testing and looks out of
// place, so questions are shown by ConfirmDialog instead.

import { writable } from 'svelte/store';

export interface ConfirmRequest {
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    danger: boolean;
    resolve: (ok: boolean) => void;
}

export const confirmStore = writable<ConfirmRequest | undefined>(undefined);

let current: ConfirmRequest | undefined;
confirmStore.subscribe((value) => (current = value));

function ask(request: Omit<ConfirmRequest, 'resolve'>) {
    // A new question replaces one still waiting, which counts as cancelled.
    current?.resolve(false);
    return new Promise<boolean>((resolve) => {
        confirmStore.set({
            ...request,
            resolve: (ok) => {
                confirmStore.set(undefined);
                resolve(ok);
            }
        });
    });
}

export function askConfirm(
    message: string,
    options: { confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {}
) {
    return ask({
        message,
        confirmLabel: options.confirmLabel ?? 'OK',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        danger: options.danger ?? false
    });
}

export async function showMessage(message: string) {
    await ask({ message, confirmLabel: 'OK', danger: false });
}
