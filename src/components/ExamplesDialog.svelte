<script lang="ts">
    import { Button, Input, Label, Modal, Select, Textarea } from 'flowbite-svelte';
    import {
        libraryStore,
        refreshLibrary,
        fetchEntry,
        loadSceneFromLibrary,
        programRequest,
        currentProgram,
        saveProgram,
        deleteEntry,
        libraryFileName,
        type LibraryEntry,
        type LessonCard
    } from '$lib/library';

    export let modalOpen = false;

    const topicOrder = ['Basics', 'Sensors', 'Gyro', 'Missions'];

    let selected: LibraryEntry | undefined = undefined;
    let message = '';
    let saveOpen = false;
    let draft = emptyDraft();

    function emptyDraft() {
        return {
            title: '',
            topic: 'Missions',
            summary: '',
            what: '',
            why: '',
            tries: '',
            scene: ''
        };
    }

    function cardOf(entry: LibraryEntry): LessonCard {
        return entry.card ?? { title: entry.name.replace(/\.llsp3$/i, ''), topic: 'Other' };
    }

    function grouped(programs: LibraryEntry[]) {
        const groups = new Map<string, LibraryEntry[]>();
        for (const entry of programs) {
            const topic = cardOf(entry).topic || 'Other';
            groups.set(topic, [...(groups.get(topic) ?? []), entry]);
        }
        const rank = (t: string) => {
            const i = topicOrder.indexOf(t);
            return i < 0 ? topicOrder.length : i;
        };
        return [...groups.entries()]
            .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
            .map(([topic, entries]) => ({
                topic,
                entries: entries.sort(
                    (a, b) =>
                        (cardOf(a).order ?? 999) - (cardOf(b).order ?? 999) ||
                        cardOf(a).title.localeCompare(cardOf(b).title)
                )
            }));
    }

    async function use(entry: LibraryEntry, merge: boolean) {
        if (!merge && !confirm('Replace the program in the code panel with this example?')) {
            return;
        }
        message = '';
        try {
            const blob = await fetchEntry('programs', entry.name);
            programRequest.set({ blob, merge });
            modalOpen = false;
        } catch (e) {
            message = (e as Error).message;
        }
    }

    async function loadField(scene: string) {
        message = '';
        try {
            await loadSceneFromLibrary(scene);
            message = `Loaded the field "${scene.replace(/\.spk$/i, '')}". Open the simulator to see it.`;
        } catch (e) {
            message = (e as Error).message;
        }
    }

    function sceneAvailable(scene: string | undefined) {
        return !!scene && $libraryStore.index.scenes.some((s) => s.name === scene);
    }

    async function saveCurrent() {
        message = '';
        if (draft.title.trim().length == 0) {
            message = 'Give the example a title first.';
            return;
        }
        const blob = await currentProgram();
        if (!blob) {
            message = 'There is no program to save.';
            return;
        }
        const name = libraryFileName('programs', draft.title);
        if (
            $libraryStore.index.programs.some((p) => p.name === name) &&
            !confirm(`Replace the example ${name}?`)
        ) {
            return;
        }
        const card: LessonCard = {
            title: draft.title.trim(),
            topic: draft.topic.trim() || 'Missions',
            summary: draft.summary.trim(),
            what: draft.what.trim(),
            why: draft.why.trim(),
            try: draft.tries
                .split('\n')
                .map((x) => x.trim())
                .filter((x) => x.length > 0),
            scene: draft.scene || undefined
        };
        try {
            await saveProgram(name, blob, card);
            message = `Saved "${card.title}" to the examples.`;
            saveOpen = false;
            draft = emptyDraft();
            selected = $libraryStore.index.programs.find((p) => p.name === name);
        } catch (e) {
            message = `Could not save: ${(e as Error).message}`;
        }
    }

    async function remove(entry: LibraryEntry) {
        if (!confirm(`Delete the example "${cardOf(entry).title}"?`)) {
            return;
        }
        try {
            await deleteEntry('programs', entry.name);
            selected = undefined;
        } catch (e) {
            message = (e as Error).message;
        }
    }

    function openDialog(open: boolean) {
        if (open) {
            message = '';
            refreshLibrary().then((state) => {
                if (!selected && state.index.programs.length > 0) {
                    selected = grouped(state.index.programs)[0].entries[0];
                }
            });
        }
    }

    $: openDialog(modalOpen);
    $: groups = grouped($libraryStore.index.programs);
    $: card = selected ? cardOf(selected) : undefined;
    $: sceneOptions = [
        { value: '', name: 'None' },
        ...$libraryStore.index.scenes.map((s) => ({
            value: s.name,
            name: s.name.replace(/\.spk$/i, '')
        }))
    ];
</script>

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    title="Example programs"
    size="xl"
    bind:open={modalOpen}
>
    {#if !$libraryStore.available}
        <div>This copy of the simulator has no example library.</div>
    {:else}
        <div class="flex flex-col md:flex-row gap-4 max-h-[70dvh] text-sm">
            <div class="md:w-64 shrink-0 overflow-y-auto flex flex-col gap-3">
                {#if groups.length == 0}
                    <div class="text-gray-500">No examples yet.</div>
                {/if}
                {#each groups as group}
                    <div class="flex flex-col gap-1">
                        <div class="font-medium text-gray-500 uppercase text-xs">{group.topic}</div>
                        {#each group.entries as entry}
                            <button
                                class="text-left px-2 py-1 rounded {selected?.name == entry.name
                                    ? 'bg-blue-100 text-blue-900'
                                    : 'hover:bg-gray-100'}"
                                on:click={() => {
                                    selected = entry;
                                    saveOpen = false;
                                    message = '';
                                }}
                            >
                                {cardOf(entry).title}
                            </button>
                        {/each}
                    </div>
                {/each}
                {#if $libraryStore.writer}
                    <Button
                        size="xs"
                        color="light"
                        on:click={() => {
                            saveOpen = true;
                            message = '';
                        }}>Save my program as an example</Button
                    >
                {/if}
            </div>
            <div class="flex-1 overflow-y-auto leading-relaxed pr-1">
                {#if saveOpen}
                    <div class="flex flex-col gap-2">
                        <h3 class="text-base font-medium">Save the program in the code panel</h3>
                        <Label>Title <Input size="sm" bind:value={draft.title} /></Label>
                        <Label
                            >Topic <Input
                                size="sm"
                                bind:value={draft.topic}
                                placeholder="Basics, Sensors, Gyro, Missions..."
                            /></Label
                        >
                        <Label
                            >One-line summary <Input size="sm" bind:value={draft.summary} /></Label
                        >
                        <Label>What it does <Textarea rows={2} bind:value={draft.what} /></Label>
                        <Label>Why it works <Textarea rows={3} bind:value={draft.why} /></Label>
                        <Label
                            >Things to try (one per line) <Textarea
                                rows={3}
                                bind:value={draft.tries}
                            /></Label
                        >
                        <Label
                            >Practice field <Select
                                size="sm"
                                items={sceneOptions}
                                bind:value={draft.scene}
                                placeholder=""
                            /></Label
                        >
                        <div class="flex flex-row gap-2">
                            <Button size="sm" color="blue" on:click={saveCurrent}
                                >Save example</Button
                            >
                            <Button size="sm" color="light" on:click={() => (saveOpen = false)}
                                >Cancel</Button
                            >
                        </div>
                    </div>
                {:else if selected && card}
                    <h3 class="text-lg font-medium">{card.title}</h3>
                    {#if card.summary}
                        <p class="text-gray-600">{card.summary}</p>
                    {/if}
                    {#if card.what}
                        <h4 class="font-medium mt-3">What it does</h4>
                        <p>{card.what}</p>
                    {/if}
                    {#if card.why}
                        <h4 class="font-medium mt-3">Why it works</h4>
                        <p>{card.why}</p>
                    {/if}
                    {#if card.try && card.try.length > 0}
                        <h4 class="font-medium mt-3">Try this</h4>
                        <ul class="list-disc ml-5">
                            {#each card.try as idea}
                                <li>{idea}</li>
                            {/each}
                        </ul>
                    {/if}
                    {#if sceneAvailable(card.scene)}
                        <p class="mt-3">
                            Practice field: <b>{card.scene?.replace(/\.spk$/i, '')}</b>
                            <Button
                                size="xs"
                                color="light"
                                class="ml-2"
                                on:click={() => loadField(card?.scene ?? '')}
                                >Load this field</Button
                            >
                        </p>
                    {/if}
                    <div class="flex flex-row flex-wrap gap-2 mt-4">
                        <Button
                            size="sm"
                            color="blue"
                            on:click={() => selected && use(selected, false)}>Open</Button
                        >
                        <Button
                            size="sm"
                            color="light"
                            on:click={() => selected && use(selected, true)}
                            >Add to my program</Button
                        >
                        {#if $libraryStore.writer}
                            <div class="flex-1" />
                            <Button
                                size="sm"
                                color="light"
                                on:click={() => selected && remove(selected)}>Delete example</Button
                            >
                        {/if}
                    </div>
                    <p class="text-xs text-gray-500 mt-2">
                        Open replaces your program. Add to my program puts the example's blocks next
                        to yours, including its My Blocks.
                    </p>
                {/if}
                {#if message}
                    <div class="mt-3">{message}</div>
                {/if}
            </div>
        </div>
    {/if}
</Modal>
