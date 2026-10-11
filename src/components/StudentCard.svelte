<script lang="ts">
    // Card that opens under the student's toolbar button: who is signed in,
    // whether their work is saved, a snapshot of their progress, and Sign out.
    // It sits in a fixed layer because the toolbar clips anything that hangs out of it.
    import { createEventDispatcher, tick } from 'svelte';
    import { Button } from 'flowbite-svelte';
    import { studentStore } from '$lib/team';
    import { libraryStore } from '$lib/library';
    import {
        dueLabel,
        handedIn,
        homeworkStore,
        isOverdue,
        saveState,
        signOutStudent
    } from '$lib/homework';
    import { isPublished, lessonProgress, lessonStatus, lessonsOpen } from '$lib/lessons';
    import { challengeList, progressStore } from '$lib/spike/challenges';

    export let open = false;
    // The toolbar button the card hangs from.
    export let anchor: HTMLElement | undefined = undefined;

    const dispatch = createEventDispatcher<{ close: void }>();

    let card: HTMLDivElement;
    let top = 0;
    let left = 0;
    let confirming = false;
    let clearCode = true;
    let busy = false;

    async function place(isOpen: boolean) {
        if (!isOpen) return;
        confirming = false;
        clearCode = true;
        await tick();
        const rect = anchor?.getBoundingClientRect();
        if (!rect) return;
        const width = card?.offsetWidth ?? 320;
        top = rect.bottom + 8;
        left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    }

    function close() {
        dispatch('close');
    }

    function outside(event: PointerEvent) {
        if (!open) return;
        const target = event.target as Node;
        if (card?.contains(target) || anchor?.contains(target)) return;
        close();
    }

    function keydown(event: KeyboardEvent) {
        if (open && event.key == 'Escape') close();
    }

    async function signOut() {
        busy = true;
        try {
            await signOutStudent(clearCode);
            close();
        } finally {
            busy = false;
        }
    }

    function savedLabel(at: string | undefined) {
        if (!at) return 'All your work is saved to your account.';
        const seconds = (Date.now() - new Date(at).getTime()) / 1000;
        if (seconds < 60) return 'All your work is saved. Saved just now.';
        const time = new Date(at).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit'
        });
        return `All your work is saved. Last saved at ${time}.`;
    }

    $: place(open);
    $: student = $studentStore;
    $: firstName = student?.name.split(' ')[0] ?? '';
    $: published = $libraryStore.index.lessons.filter(isPublished);
    $: lessonsDone = published.filter(
        (e) => e.lesson && lessonStatus(e.name, e.lesson, $lessonProgress, $handedIn) == 'done'
    ).length;
    $: challengesDone = $challengeList.filter((c) => $progressStore[c.id]?.completed).length;
    // The soonest-due assignment that still has a lesson to finish.
    $: nextDue = [...$homeworkStore]
        .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
        .find((a) =>
            a.lessons.some((name) => {
                const entry = published.find((e) => e.name == name);
                return (
                    entry?.lesson &&
                    lessonStatus(name, entry.lesson, $lessonProgress, $handedIn) != 'done'
                );
            })
        );
</script>

<svelte:window on:pointerdown|capture={outside} on:keydown={keydown} />

{#if open && student}
    <div
        bind:this={card}
        class="fixed z-[95] w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-gray-200 bg-white shadow-xl p-4 flex flex-col gap-3 text-gray-800"
        style="top: {top}px; left: {left}px"
        role="dialog"
        aria-label="Your account"
        data-testid="student-card"
    >
        <div class="flex items-center gap-3">
            <span
                class="w-11 h-11 shrink-0 rounded-full bg-green-600 text-white text-lg font-semibold flex items-center justify-center"
                aria-hidden="true">{firstName.charAt(0).toUpperCase()}</span
            >
            <div class="min-w-0">
                <div class="font-semibold text-gray-900 truncate">{student.name}</div>
                <div class="text-sm text-green-700">Signed in ✓</div>
            </div>
        </div>

        <p
            class="text-sm rounded-lg px-3 py-2 {$saveState.state == 'offline'
                ? 'bg-amber-50 text-amber-900'
                : 'bg-gray-50 text-gray-700'}"
            role="status"
        >
            {#if $saveState.state == 'saving'}
                Saving your work…
            {:else if $saveState.state == 'offline'}
                Couldn't reach the site. Your work will save when you're back online.
            {:else}
                {savedLabel($saveState.at)}
            {/if}
        </p>

        <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-lg border border-gray-200 px-3 py-2">
                <div class="text-xl font-semibold text-gray-900">
                    {lessonsDone}<span class="text-sm font-normal text-gray-500"
                        >&nbsp;of {published.length}</span
                    >
                </div>
                <div class="text-gray-600">lessons done</div>
            </div>
            <div class="rounded-lg border border-gray-200 px-3 py-2">
                <div class="text-xl font-semibold text-gray-900">
                    {challengesDone}<span class="text-sm font-normal text-gray-500"
                        >&nbsp;of {$challengeList.length}</span
                    >
                </div>
                <div class="text-gray-600">challenges complete</div>
            </div>
        </div>

        {#if nextDue}
            <button
                class="text-left text-sm rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 hover:bg-blue-100"
                on:click={() => {
                    close();
                    lessonsOpen.set(true);
                }}
            >
                <div class="text-xs text-gray-600">Next up</div>
                <div class="font-medium text-gray-900">{nextDue.title}</div>
                {#if nextDue.due}
                    <div class={isOverdue(nextDue.due) ? 'text-red-700' : 'text-gray-600'}>
                        Due {dueLabel(nextDue.due)}
                    </div>
                {/if}
            </button>
        {/if}

        {#if confirming}
            <div class="flex flex-col gap-2 border-t pt-3">
                <p class="text-sm font-medium text-gray-900">
                    Sign out, {firstName}? Your work is saved to your account.
                </p>
                <label class="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" class="rounded" bind:checked={clearCode} />
                    Clear the code panel for the next person
                </label>
                <div class="flex justify-end gap-2">
                    <Button size="sm" color="light" on:click={() => (confirming = false)}
                        >Cancel</Button
                    >
                    <Button size="sm" color="red" disabled={busy} on:click={signOut}
                        >Sign out</Button
                    >
                </div>
            </div>
        {:else}
            <div class="flex justify-end border-t pt-3">
                <Button size="sm" color="light" on:click={() => (confirming = true)}
                    >Sign out</Button
                >
            </div>
        {/if}
    </div>
{/if}
