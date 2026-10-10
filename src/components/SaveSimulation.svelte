<script lang="ts">
    import { Button, Input, Modal } from 'flowbite-svelte';
    import FileSaver from 'file-saver';
    import {
        componentStore,
        clearPorts,
        setPort,
        setGearRatio,
        saveMPD
    } from '$lib/ldraw/components';
    import { allPorts, Hub } from '$lib/spike/vm';
    import { sceneStore } from '$lib/spike/scene';
    import {
        libraryStore,
        libraryFileName,
        refreshLibrary,
        saveEntry,
        type LibraryKind
    } from '$lib/library';
    import { sceneToBlob } from '$lib/spike/scenefile';

    export let modalOpen = false;
    export let hub: Hub;

    let robotName = 'robot';
    let sceneName = 'scene';
    let libraryMessage = '';

    function robotBlob(): Blob | undefined {
        const robot = $componentStore.robotModel;
        if (robot) {
            clearPorts(robot);
            for (const port of allPorts) {
                const id = hub.ports[port].id();
                if (id !== 'none') {
                    setPort(robot, 'main', port, id);
                }
            }
            for (const wheel of hub.wheels) {
                setPort(robot, 'main', wheel.port, wheel.id);
                setGearRatio(robot, wheel.gearing, wheel.id);
            }
            const content = saveMPD(robot);
            return new Blob([content], { type: 'text/plain;charset=utf-8' });
        }
        return undefined;
    }

    async function sceneBlob(): Promise<Blob> {
        return await sceneToBlob($sceneStore);
    }

    function saveRobot() {
        const blob = robotBlob();
        if (blob) {
            FileSaver.saveAs(blob, 'robot.mpd');
        }
    }

    async function saveScene() {
        FileSaver.saveAs(await sceneBlob(), 'scene.spk');
    }

    async function saveToLibrary(kind: LibraryKind) {
        const name = libraryFileName(kind, kind === 'robots' ? robotName : sceneName);
        const blob = kind === 'robots' ? robotBlob() : await sceneBlob();
        if (!blob) {
            libraryMessage = 'Load a robot first';
            return;
        }
        const exists = $libraryStore.index[kind].some((e) => e.name === name);
        if (exists && !confirm(`Replace ${name} in the library?`)) {
            return;
        }
        libraryMessage = `Saving ${name}...`;
        try {
            await saveEntry(kind, name, blob);
            libraryMessage = `Saved ${name} to the library`;
        } catch (e) {
            libraryMessage = `Could not save: ${(e as Error).message}`;
        }
    }

    function openDialog(open: boolean) {
        if (open) {
            libraryMessage = '';
            refreshLibrary();
        }
    }

    $: openDialog(modalOpen);
</script>

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    title="Save simulation"
    bind:open={modalOpen}
>
    <div class="flex flex-col gap-2 items-center">
        <Button color="light" class="!p-2 w-96" on:click={saveRobot}>
            <div class="flex flex-row gap-2 items-center">
                <img alt="robot" width="32" height="32" src="icons/Robot.svg" />
                <span>Save robot (mpd with ports)</span>
            </div>
        </Button>
        <Button color="light" class="!p-2 w-96" on:click={saveScene}>
            <div class="flex flex-row gap-2 items-center">
                <img alt="scene" width="32" height="32" src="icons/Scene.svg" />
                <span>Save scene with mat (zip with mpd)</span>
            </div>
        </Button>
        {#if $libraryStore.available}
            <hr class="w-96 my-2" />
            <h3 class="font-medium">Save to the shared library</h3>
            {#if $libraryStore.writer}
                <div class="flex flex-row gap-2 w-96 items-center">
                    <Input size="sm" bind:value={robotName} placeholder="Robot name" />
                    <Button
                        color="light"
                        class="!p-2 whitespace-nowrap"
                        on:click={() => saveToLibrary('robots')}>Save robot</Button
                    >
                </div>
                <div class="flex flex-row gap-2 w-96 items-center">
                    <Input size="sm" bind:value={sceneName} placeholder="Scene name" />
                    <Button
                        color="light"
                        class="!p-2 whitespace-nowrap"
                        on:click={() => saveToLibrary('scenes')}>Save scene</Button
                    >
                </div>
                {#if libraryMessage}
                    <div class="text-sm w-96">{libraryMessage}</div>
                {/if}
            {:else}
                <div class="text-sm w-96">
                    Saving to the library needs you to <a
                        class="text-blue-700 underline"
                        href="api/admin/login"
                        target="_blank">sign in</a
                    >.
                </div>
            {/if}
        {/if}
    </div>
</Modal>
