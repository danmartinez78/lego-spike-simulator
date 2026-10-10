<script lang="ts">
    import { tick } from 'svelte';
    import { confirmStore } from '$lib/confirm';

    let okButton: HTMLButtonElement;

    $: request = $confirmStore;
    $: if (request) focusOk();

    async function focusOk() {
        await tick();
        okButton?.focus();
    }

    function answer(ok: boolean) {
        request?.resolve(ok);
    }

    function keydown(event: KeyboardEvent) {
        if (!request) return;
        if (event.key == 'Escape') {
            // Only this question closes, not a window open underneath it.
            event.preventDefault();
            event.stopImmediatePropagation();
            answer(!request.cancelLabel);
        }
    }
</script>

<svelte:window on:keydown|capture={keydown} />

{#if request}
    <!-- Above every other window (they use z-80/90), since questions are asked from inside them. -->
    <div
        class="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900 bg-opacity-50 p-4"
        data-testid="confirm-dialog"
    >
        <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-message"
            class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl flex flex-col gap-4"
        >
            <p id="confirm-dialog-message" class="text-sm leading-relaxed text-gray-800">
                {request.message}
            </p>
            <div class="flex flex-row justify-end gap-2">
                {#if request.cancelLabel}
                    <button
                        class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-4 focus:ring-gray-200"
                        on:click={() => answer(false)}>{request.cancelLabel}</button
                    >
                {/if}
                <button
                    bind:this={okButton}
                    class="rounded-lg px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-4 {request.danger
                        ? 'bg-red-700 hover:bg-red-800 focus:ring-red-300'
                        : 'bg-blue-700 hover:bg-blue-800 focus:ring-blue-300'}"
                    on:click={() => answer(true)}>{request.confirmLabel}</button
                >
            </div>
        </div>
    </div>
{/if}
