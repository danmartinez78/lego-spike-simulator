<script lang="ts">
    import { askConfirm } from '$lib/confirm';
    import { Button, Modal } from 'flowbite-svelte';
    import { StarSolid } from 'flowbite-svelte-icons';
    import {
        challenges,
        activeChallenge,
        progressStore,
        type Challenge
    } from '$lib/spike/challenges';
    import { applyPreset, presetLabels } from '$lib/spike/realism';
    import {
        libraryStore,
        refreshLibrary,
        loadSceneFromLibrary,
        loadRobotFromLibrary,
        fetchEntry,
        programRequest
    } from '$lib/library';

    export let modalOpen = false;

    let selected: Challenge = challenges[0];
    let hintsShown = 0;
    let message = '';
    let busy = false;

    $: progress = $progressStore;
    $: done = challenges.filter((c) => progress[c.id]?.completed).length;

    function choose(c: Challenge) {
        selected = c;
        hintsShown = 0;
        message = '';
    }

    function status(c: Challenge) {
        const p = progress[c.id];
        if (p?.completed) return { text: 'Complete', css: 'bg-green-100 text-green-800' };
        if (p && p.best > 0)
            return { text: `Best ${p.best}/5`, css: 'bg-amber-100 text-amber-800' };
        return { text: 'New', css: 'bg-gray-100 text-gray-600' };
    }

    function available(c: Challenge) {
        const lib = $libraryStore.index;
        return (
            lib.scenes.some((s) => s.name == c.field) &&
            (!c.robot || lib.robots.some((r) => r.name == c.robot))
        );
    }

    async function start(c: Challenge) {
        busy = true;
        message = '';
        try {
            await loadSceneFromLibrary(c.field);
            if (c.robot) {
                await loadRobotFromLibrary(c.robot);
            }
            applyPreset(c.realism);
            activeChallenge.set(c);
            modalOpen = false;
        } catch (e) {
            message = `Could not set up the challenge: ${(e as Error).message}`;
        } finally {
            busy = false;
        }
    }

    async function openExample(name: string) {
        if (
            !(await askConfirm('Replace the program in the code panel with this example?', {
                confirmLabel: 'Replace'
            }))
        )
            return;
        try {
            programRequest.set({ blob: await fetchEntry('programs', name), merge: false });
            message = 'Example opened in the code panel.';
        } catch (e) {
            message = (e as Error).message;
        }
    }

    function opened(open: boolean) {
        if (open) {
            message = '';
            refreshLibrary();
            if ($activeChallenge) choose($activeChallenge);
        }
    }

    $: opened(modalOpen);
</script>

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    size="xl"
    bind:open={modalOpen}
>
    <svelte:fragment slot="header">
        <div class="flex flex-row items-center gap-3">
            <h3 class="text-lg font-semibold text-gray-900">Challenges</h3>
            <span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-900"
                >{done} of {challenges.length} complete</span
            >
        </div>
    </svelte:fragment>
    <div class="flex flex-col md:flex-row gap-4 text-sm max-h-[70dvh]">
        <div class="md:w-72 shrink-0 overflow-y-auto flex flex-col gap-2 pr-1">
            {#each challenges as c}
                {@const s = status(c)}
                <button
                    class="text-left rounded-lg border px-3 py-2 transition-colors {selected.id ==
                    c.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'}"
                    on:click={() => choose(c)}
                >
                    <div class="flex items-center gap-2">
                        <span class="font-medium text-gray-900 flex-1">{c.title}</span>
                        <span class="text-[11px] rounded-full px-2 py-0.5 {s.css}">{s.text}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span class="flex">
                            {#each [1, 2, 3] as n}
                                <StarSolid
                                    class="w-3.5 h-3.5 {n <= c.level
                                        ? 'text-amber-400'
                                        : 'text-gray-200'}"
                                />
                            {/each}
                        </span>
                        <span>{c.skill}</span>
                    </div>
                </button>
            {/each}
        </div>
        <div class="flex-1 overflow-y-auto leading-relaxed pr-1">
            <div class="flex items-center gap-2">
                <h3 class="text-xl font-semibold text-gray-900">{selected.title}</h3>
                {#if $activeChallenge?.id == selected.id}
                    <span class="text-xs rounded-full px-2 py-0.5 bg-blue-100 text-blue-800"
                        >In progress</span
                    >
                {/if}
            </div>
            <p class="text-base text-gray-900 mt-2">{selected.goal}</p>
            <div class="grid grid-cols-2 gap-2 mt-3">
                <div class="rounded-lg bg-gray-50 border border-gray-200 p-2">
                    <div class="text-xs text-gray-500">Field</div>
                    <div class="font-medium first-letter:uppercase">
                        {selected.field.replace(/^Practice - |\.spk$/g, '')}
                    </div>
                </div>
                <div class="rounded-lg bg-gray-50 border border-gray-200 p-2">
                    <div class="text-xs text-gray-500">Realism</div>
                    <div class="font-medium">{presetLabels[selected.realism]}</div>
                </div>
                <div class="rounded-lg bg-gray-50 border border-gray-200 p-2">
                    <div class="text-xs text-gray-500">To pass</div>
                    <div class="font-medium">{selected.needed} of 5 runs</div>
                </div>
                <div class="rounded-lg bg-gray-50 border border-gray-200 p-2">
                    <div class="text-xs text-gray-500">Robot</div>
                    <div class="font-medium">
                        {selected.robot ? selected.robot.replace(/\.mpd$/, '') : 'Any driving base'}
                    </div>
                </div>
            </div>
            <h4 class="font-medium mt-4">How it works</h4>
            <ol class="list-decimal ml-5 text-gray-700">
                <li>Press <b>Start challenge</b>. It loads the field and sets the realism.</li>
                <li>Write your program in the code panel.</li>
                <li>Press <b>▶︎×5</b>. The results show the target and which runs passed.</li>
            </ol>
            <h4 class="font-medium mt-4">Hints</h4>
            {#if hintsShown == 0}
                <p class="text-gray-500">Try it first. Hints are here if you get stuck.</p>
            {/if}
            <ol class="list-decimal ml-5 text-gray-700">
                {#each selected.hints.slice(0, hintsShown) as hint}
                    <li>{hint}</li>
                {/each}
            </ol>
            {#if hintsShown < selected.hints.length}
                <button class="mt-1 text-blue-700 hover:underline" on:click={() => hintsShown++}
                    >Show a hint ({hintsShown + 1} of {selected.hints.length})</button
                >
            {/if}
            <div class="flex flex-row flex-wrap gap-2 mt-5 items-center">
                <Button
                    color="blue"
                    disabled={busy || !available(selected)}
                    on:click={() => start(selected)}
                    >{$activeChallenge?.id == selected.id
                        ? 'Restart challenge'
                        : 'Start challenge'}</Button
                >
                {#if selected.example && $libraryStore.index.programs.some((p) => p.name == selected.example)}
                    <Button
                        color="light"
                        on:click={() => selected.example && openExample(selected.example)}
                        >Open a related example</Button
                    >
                {/if}
                {#if $activeChallenge}
                    <Button color="light" on:click={() => activeChallenge.set(undefined)}
                        >Stop the challenge</Button
                    >
                {/if}
            </div>
            {#if !available(selected) && $libraryStore.available}
                <p class="text-xs text-red-700 mt-2">
                    This challenge needs the "{selected.field.replace(/\.spk$/, '')}" field{selected.robot
                        ? ` and the "${selected.robot.replace(/\.mpd$/, '')}" robot`
                        : ''} in the shared library.
                </p>
            {/if}
            {#if message}
                <p class="mt-2">{message}</p>
            {/if}
            <p class="text-xs text-gray-500 mt-4">
                Your progress is saved in this browser. The target is checked against the centre of
                the robot where it stops.
            </p>
        </div>
    </div>
</Modal>
