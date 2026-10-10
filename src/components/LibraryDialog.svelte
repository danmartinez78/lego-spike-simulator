<script lang="ts">
    import { askConfirm } from '$lib/confirm';
    import { Button, Modal } from 'flowbite-svelte';
    import {
        libraryStore,
        refreshLibrary,
        loadRobotFromLibrary,
        loadSceneFromLibrary,
        deleteEntry,
        setDefault,
        type LibraryKind
    } from '$lib/library';

    export let modalOpen = false;

    let message = '';

    const sections: { kind: LibraryKind; title: string; icon: string }[] = [
        { kind: 'robots', title: 'Robots', icon: 'icons/Robot.svg' },
        { kind: 'scenes', title: 'Scenes and maps', icon: 'icons/Scene.svg' }
    ];

    function isDefault(kind: LibraryKind, name: string) {
        const defaults = $libraryStore.index.defaults;
        return kind === 'robots' ? defaults.robot === name : defaults.scene === name;
    }

    async function run(action: () => Promise<void>, done: string) {
        message = '';
        try {
            await action();
            message = done;
        } catch (e) {
            message = (e as Error).message;
        }
    }

    function load(kind: LibraryKind, name: string) {
        run(async () => {
            if (kind === 'robots') {
                await loadRobotFromLibrary(name);
            } else {
                await loadSceneFromLibrary(name);
            }
            modalOpen = false;
        }, `Loaded ${name}`);
    }

    function makeDefault(kind: LibraryKind, name: string) {
        const value = isDefault(kind, name) ? null : name;
        run(
            () => setDefault(kind, value),
            value
                ? `${name} now loads when the simulator opens`
                : `${name} is no longer the default`
        );
    }

    async function remove(kind: LibraryKind, name: string) {
        if (
            await askConfirm(`Delete ${name} from the library?`, {
                confirmLabel: 'Delete',
                danger: true
            })
        ) {
            run(() => deleteEntry(kind, name), `Deleted ${name}`);
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
    title="Shared library"
    bind:open={modalOpen}
>
    {#if !$libraryStore.available}
        <div>This copy of the simulator has no shared library.</div>
    {:else}
        <div class="flex flex-col gap-4">
            {#each sections as section}
                <div class="flex flex-col gap-1">
                    <h3 class="font-medium flex flex-row gap-2 items-center">
                        <img alt={section.kind} width="24" height="24" src={section.icon} />
                        {section.title}
                    </h3>
                    {#if $libraryStore.index[section.kind].length == 0}
                        <div class="text-sm text-gray-500">Nothing saved yet.</div>
                    {/if}
                    {#each $libraryStore.index[section.kind] as entry}
                        <div class="flex flex-row gap-2 items-center">
                            <span class="flex-1 truncate">
                                {entry.name}
                                {#if isDefault(section.kind, entry.name)}
                                    <span class="text-xs text-green-700 ml-1">(default)</span>
                                {/if}
                            </span>
                            <Button
                                size="xs"
                                color="blue"
                                on:click={() => load(section.kind, entry.name)}>Load</Button
                            >
                            {#if $libraryStore.writer}
                                <Button
                                    size="xs"
                                    color="light"
                                    on:click={() => makeDefault(section.kind, entry.name)}
                                    >{isDefault(section.kind, entry.name)
                                        ? 'Unset default'
                                        : 'Make default'}</Button
                                >
                                <Button
                                    size="xs"
                                    color="light"
                                    on:click={() => remove(section.kind, entry.name)}>Delete</Button
                                >
                            {/if}
                        </div>
                    {/each}
                </div>
            {/each}
            <div class="text-sm text-gray-600">
                {#if $libraryStore.writer}
                    Signed in as {$libraryStore.writer}. Save the current robot or scene to the
                    library from the save button.
                {:else}
                    To add robots and maps, <a
                        class="text-blue-700 underline"
                        href="api/admin/login"
                        target="_blank">sign in</a
                    >, then reopen this window.
                {/if}
            </div>
            {#if message}
                <div class="text-sm">{message}</div>
            {/if}
        </div>
    {/if}
</Modal>
