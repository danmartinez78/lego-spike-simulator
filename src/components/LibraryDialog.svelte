<script lang="ts">
    // Pick a robot or a field from the shared library.
    import { Modal } from 'flowbite-svelte';
    import CheckMap from '$components/CheckMap.svelte';
    import {
        libraryStore,
        refreshLibrary,
        loadRobotFromLibrary,
        loadSceneFromLibrary,
        currentRobotName,
        currentSceneName,
        entryTitle
    } from '$lib/library';

    export let modalOpen = false;
    export let kind: 'robots' | 'scenes' = 'scenes';

    let message = '';
    let busy = '';

    $: entries = $libraryStore.index[kind];
    $: current = kind == 'robots' ? $currentRobotName : $currentSceneName;

    async function load(name: string) {
        message = '';
        busy = name;
        try {
            if (kind === 'robots') {
                await loadRobotFromLibrary(name);
            } else {
                await loadSceneFromLibrary(name);
            }
            modalOpen = false;
        } catch (e) {
            message = `Couldn't load ${entryTitle(name)}: ${(e as Error).message}`;
        } finally {
            busy = '';
        }
    }

    function openDialog(open: boolean) {
        if (open) {
            message = '';
            refreshLibrary();
        }
    }

    $: openDialog(modalOpen);
</script>

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    title={kind == 'robots' ? 'Choose a robot' : 'Choose a field'}
    size={kind == 'robots' ? 'md' : 'xl'}
    bind:open={modalOpen}
>
    {#if !$libraryStore.available}
        <div>This copy of the simulator has no shared library.</div>
    {:else}
        <div class="flex flex-col gap-3 text-gray-800">
            {#if entries.length == 0}
                <div class="text-sm text-gray-500">
                    There are no {kind == 'robots' ? 'robots' : 'fields'} here yet. Ask your coach to
                    add some.
                </div>
            {/if}
            {#if kind == 'scenes'}
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {#each entries as entry (entry.name)}
                        <button
                            class="flex flex-col gap-2 rounded-xl border p-2 text-left hover:border-blue-500 hover:bg-blue-50 disabled:opacity-60 {current ==
                            entry.name
                                ? 'border-blue-600 ring-2 ring-blue-200'
                                : 'border-gray-200'}"
                            disabled={busy != ''}
                            on:click={() => load(entry.name)}
                        >
                            <CheckMap
                                field={entry.name}
                                check={undefined}
                                maxHeight={200}
                                lighten={0}
                            />
                            <span class="font-medium text-sm flex flex-row gap-2 items-center">
                                <span class="flex-1">{entryTitle(entry.name)}</span>
                                {#if busy == entry.name}
                                    <span class="text-xs text-gray-500">Loading...</span>
                                {:else if current == entry.name}
                                    <span class="text-xs text-blue-700">Loaded</span>
                                {/if}
                            </span>
                        </button>
                    {/each}
                </div>
            {:else}
                <div class="flex flex-col gap-2">
                    {#each entries as entry (entry.name)}
                        <button
                            class="flex flex-row gap-3 items-center rounded-xl border p-3 text-left hover:border-blue-500 hover:bg-blue-50 disabled:opacity-60 {current ==
                            entry.name
                                ? 'border-blue-600 ring-2 ring-blue-200'
                                : 'border-gray-200'}"
                            disabled={busy != ''}
                            on:click={() => load(entry.name)}
                        >
                            <img alt="" width="32" height="32" src="icons/Robot.svg" />
                            <span class="flex-1 font-medium">{entryTitle(entry.name)}</span>
                            {#if busy == entry.name}
                                <span class="text-xs text-gray-500">Loading...</span>
                            {:else if current == entry.name}
                                <span class="text-xs text-blue-700">Loaded</span>
                            {/if}
                        </button>
                    {/each}
                </div>
            {/if}
            {#if $libraryStore.writer}
                <p class="text-xs text-gray-500">
                    Coaches add, remove and choose the default robots and fields on the
                    <a class="text-blue-700 underline" href="coach" target="_blank">coach page</a>.
                </p>
            {/if}
            {#if message}
                <div class="text-sm text-red-700" role="alert">{message}</div>
            {/if}
        </div>
    {/if}
</Modal>
