<script lang="ts">
    // Coach tools, served at /coach. On the live site Cloudflare Access guards
    // this page and /api/admin, so only coaches on the allowlist reach it.
    import { onMount } from 'svelte';
    import { Button, Spinner } from 'flowbite-svelte';
    import ConfirmDialog from '$components/ConfirmDialog.svelte';
    import { askConfirm } from '$lib/confirm';
    import {
        libraryStore,
        refreshLibrary,
        deleteEntry,
        setDefault,
        type LibraryEntry,
        type LibraryKind
    } from '$lib/library';

    const sections: { kind: LibraryKind; title: string; icon: string; empty: string }[] = [
        {
            kind: 'robots',
            title: 'Robots',
            icon: 'icons/Robot.svg',
            empty: 'No robots yet. Load one in the simulator, then use Save → Save robot.'
        },
        {
            kind: 'scenes',
            title: 'Scenes and maps',
            icon: 'icons/Scene.svg',
            empty: 'No scenes yet. Set one up in the simulator, then use Save → Save scene.'
        },
        {
            kind: 'programs',
            title: 'Example programs',
            icon: 'icons/Library.svg',
            empty: 'No example programs yet. Add one from the Examples window in the simulator.'
        }
    ];

    let loading = true;
    let active: LibraryKind = 'robots';
    let message = '';
    let failed = false;
    let busy = '';

    onMount(async () => {
        await refreshLibrary();
        loading = false;
    });

    $: section = sections.find((s) => s.kind == active)!;
    $: entries = $libraryStore.index[active] ?? [];
    $: hasDefault = active != 'programs';

    function isDefault(kind: LibraryKind, name: string) {
        const defaults = $libraryStore.index.defaults;
        if (kind == 'robots') return defaults.robot == name;
        if (kind == 'scenes') return defaults.scene == name;
        return false;
    }

    function size(bytes: number) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function changed(iso: string) {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function downloadUrl(kind: LibraryKind, name: string) {
        return `api/library/${kind}/${encodeURIComponent(name)}`;
    }

    async function run(key: string, action: () => Promise<void>, done: string) {
        busy = key;
        message = '';
        try {
            await action();
            failed = false;
            message = done;
        } catch (e) {
            failed = true;
            message = (e as Error).message;
        }
        busy = '';
    }

    function toggleDefault(kind: LibraryKind, entry: LibraryEntry) {
        const value = isDefault(kind, entry.name) ? null : entry.name;
        run(
            `default ${entry.name}`,
            () => setDefault(kind, value),
            value
                ? `${entry.name} now loads when the simulator opens.`
                : `${entry.name} no longer loads when the simulator opens.`
        );
    }

    async function remove(kind: LibraryKind, entry: LibraryEntry) {
        const what = entry.card?.title ? `"${entry.card.title}" (${entry.name})` : entry.name;
        const extra = kind == 'programs' ? ' Its lesson card is deleted too.' : '';
        if (
            await askConfirm(
                `Delete ${what} from the shared library? Students won't see it any more.${extra}`,
                { confirmLabel: 'Delete', danger: true }
            )
        ) {
            run(
                `delete ${entry.name}`,
                () => deleteEntry(kind, entry.name),
                `Deleted ${entry.name}.`
            );
        }
    }
</script>

<svelte:head>
    <title>Coach tools · LEGO SPIKE Simulator</title>
</svelte:head>

<div class="min-h-dvh bg-gray-50 text-gray-900">
    <header class="bg-white border-b border-gray-200">
        <div class="max-w-5xl mx-auto px-4 py-3 flex flex-row items-center gap-3 flex-wrap">
            <img src="icons/SensorHub.svg" alt="" width="32" height="32" />
            <div class="flex flex-col">
                <h1 class="text-xl font-semibold leading-tight">Coach tools</h1>
                <span class="text-sm text-gray-500">LEGO SPIKE Simulator</span>
            </div>
            <div class="flex-1"></div>
            {#if $libraryStore.writer}
                <span class="text-sm text-gray-600" data-testid="signed-in"
                    >{#if $libraryStore.writer.startsWith('lan ')}Signed in from the home network{:else}Signed
                        in as <b>{$libraryStore.writer}</b>{/if}</span
                >
            {/if}
            <Button href="./" color="light" size="sm">Open the simulator</Button>
        </div>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
        {#if loading}
            <div class="flex flex-row gap-3 items-center text-gray-600">
                <Spinner size="5" /> Checking your sign-in…
            </div>
        {:else if !$libraryStore.available}
            <div class="bg-white rounded-lg border border-gray-200 p-6">
                <h2 class="text-lg font-semibold">No shared library here</h2>
                <p class="mt-2 text-gray-700">
                    This copy of the simulator isn't running with the library server, so there is
                    nothing to manage.
                </p>
            </div>
        {:else if !$libraryStore.writer}
            <div class="bg-white rounded-lg border border-gray-200 p-6 max-w-xl">
                <h2 class="text-lg font-semibold">This page is for coaches</h2>
                <p class="mt-2 text-gray-700">
                    Coaches sign in with their email address to manage the robots, maps and example
                    programs that everyone on the team sees.
                </p>
                <p class="mt-2 text-gray-700">
                    If you're a student, head back to the simulator. Everything you need is there.
                </p>
                <div class="mt-4 flex flex-row gap-2 flex-wrap">
                    <Button href="api/admin/login?to=coach" color="blue">Coach sign in</Button>
                    <Button href="./" color="light">Back to the simulator</Button>
                </div>
            </div>
        {:else}
            <section class="flex flex-col gap-3">
                <div>
                    <h2 class="text-lg font-semibold">Shared library</h2>
                    <p class="text-gray-600 text-sm">
                        What students see in the simulator's Library and Examples windows. The
                        default robot and scene load when someone opens the simulator.
                    </p>
                </div>

                <div class="flex flex-row gap-2 flex-wrap" role="tablist">
                    {#each sections as s}
                        <button
                            role="tab"
                            aria-selected={active == s.kind}
                            class="flex flex-row items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium
                                {active == s.kind
                                ? 'bg-blue-50 border-blue-600 text-blue-800'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'}"
                            on:click={() => {
                                active = s.kind;
                                message = '';
                            }}
                        >
                            <img src={s.icon} alt="" width="20" height="20" />
                            {s.title}
                            <span
                                class="text-xs rounded-full px-2 py-0.5 {active == s.kind
                                    ? 'bg-blue-100'
                                    : 'bg-gray-100'}"
                                >{$libraryStore.index[s.kind]?.length ?? 0}</span
                            >
                        </button>
                    {/each}
                </div>

                {#if message}
                    <div
                        role="status"
                        class="rounded-lg px-4 py-2 text-sm {failed
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-green-50 text-green-800 border border-green-200'}"
                    >
                        {message}
                    </div>
                {/if}

                <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {#if entries.length == 0}
                        <p class="p-6 text-gray-600">{section.empty}</p>
                    {:else}
                        <ul class="divide-y divide-gray-200">
                            {#each entries as entry (entry.name)}
                                <li class="flex flex-row flex-wrap items-center gap-3 px-4 py-3">
                                    <div class="flex-1 min-w-[12rem]">
                                        <div
                                            class="font-medium flex flex-row items-center gap-2 flex-wrap"
                                        >
                                            {entry.card?.title ?? entry.name}
                                            {#if isDefault(active, entry.name)}
                                                <span
                                                    class="text-xs font-medium rounded-full px-2 py-0.5 bg-green-100 text-green-800"
                                                    >Loads on open</span
                                                >
                                            {/if}
                                        </div>
                                        <div class="text-sm text-gray-500">
                                            {#if entry.card}
                                                {entry.card.topic} · {entry.name} ·
                                            {/if}
                                            {size(entry.size)} · changed {changed(entry.modified)}
                                        </div>
                                    </div>
                                    <div class="flex flex-row gap-2 flex-wrap">
                                        {#if hasDefault}
                                            <Button
                                                size="xs"
                                                color="light"
                                                disabled={busy != ''}
                                                on:click={() => toggleDefault(active, entry)}
                                                >{isDefault(active, entry.name)
                                                    ? "Don't load on open"
                                                    : 'Load on open'}</Button
                                            >
                                        {/if}
                                        <Button
                                            size="xs"
                                            color="light"
                                            href={downloadUrl(active, entry.name)}
                                            download={entry.name}>Download</Button
                                        >
                                        <Button
                                            size="xs"
                                            color="red"
                                            outline
                                            disabled={busy != ''}
                                            on:click={() => remove(active, entry)}>Delete</Button
                                        >
                                    </div>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>
                <p class="text-sm text-gray-500">
                    To add a robot or scene, open it in the simulator and use Save. To add an
                    example program with a lesson card, use the Examples window.
                </p>
            </section>
        {/if}
    </main>
</div>
<ConfirmDialog />
