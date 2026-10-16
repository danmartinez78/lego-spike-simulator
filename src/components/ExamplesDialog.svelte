<script lang="ts">
    import { askConfirm } from '$lib/confirm';
    import { Button, Input, Label, Modal, Select, Textarea } from 'flowbite-svelte';
    import { MapPinAltOutline } from 'flowbite-svelte-icons';
    import {
        libraryStore,
        refreshLibrary,
        fetchEntry,
        loadSceneFromLibrary,
        programRequest,
        currentProgram,
        saveProgram,
        libraryFileName,
        isExample,
        saveLessonCard,
        type LibraryEntry,
        type LessonCard
    } from '$lib/library';

    export let modalOpen = false;

    const topicOrder = ['Basics', 'Sensors', 'Gyro', 'Missions'];
    // Topic colours follow the block categories each topic mostly uses.
    const topicColours: Record<string, string> = {
        Basics: '#ff4ccd',
        Sensors: '#3fccf1',
        Gyro: '#9b6af6',
        Missions: '#f5a623'
    };

    function topicColour(topic: string) {
        return topicColours[topic] ?? '#9ca3af';
    }

    // Show the play symbol as text rather than as an emoji.
    function text(value: string | undefined) {
        return (value ?? '').replace(/\u25b6\ufe0f?/g, '\u25b6\ufe0e');
    }

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
        if (
            !merge &&
            !(await askConfirm('Replace the program in the code panel with this example?', {
                confirmLabel: 'Replace'
            }))
        ) {
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
            !(await askConfirm(`Replace the example ${name}?`, { confirmLabel: 'Replace' }))
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
        if (
            !(await askConfirm(
                `Take "${cardOf(entry).title}" out of the examples? The program stays in the coach page's Programs tab, with its explanation, for lessons and challenges.`,
                { confirmLabel: 'Take out' }
            ))
        ) {
            return;
        }
        try {
            await saveLessonCard(entry.name, { ...cardOf(entry), hidden: true });
            await refreshLibrary();
            selected = undefined;
        } catch (e) {
            message = (e as Error).message;
        }
    }

    function openDialog(open: boolean) {
        if (open) {
            message = '';
            refreshLibrary().then((state) => {
                const examples = state.index.programs.filter(isExample);
                if (!selected && examples.length > 0) {
                    selected = grouped(examples)[0].entries[0];
                }
            });
        }
    }

    $: openDialog(modalOpen);
    $: groups = grouped($libraryStore.index.programs.filter(isExample));
    $: card = selected ? cardOf(selected) : undefined;
    $: allEntries = groups.flatMap((g) => g.entries);
    $: position = selected ? allEntries.findIndex((e) => e.name == selected?.name) + 1 : 0;
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
    size="xl"
    bodyClass="p-0"
    bind:open={modalOpen}
>
    <svelte:fragment slot="header">
        <div class="flex flex-col">
            <h3 class="text-lg font-semibold text-gray-900">Example programs</h3>
            <p class="text-sm text-gray-500">Start from a working program, then change it.</p>
        </div>
    </svelte:fragment>
    {#if !$libraryStore.available}
        <div class="p-6 text-gray-700">This copy of the simulator has no example library.</div>
    {:else}
        <div class="flex flex-col md:flex-row h-[70dvh] text-gray-800">
            <!-- Example list -->
            <nav
                class="md:w-72 shrink-0 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto p-3 flex flex-col gap-4"
            >
                {#if groups.length == 0}
                    <div class="text-sm text-gray-500 p-2">No examples yet.</div>
                {/if}
                {#each groups as group}
                    <div class="flex flex-col gap-1">
                        <div
                            class="flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500"
                        >
                            <span
                                class="w-2 h-2 rounded-full"
                                style="background-color: {topicColour(group.topic)}"
                            ></span>
                            {group.topic}
                        </div>
                        {#each group.entries as entry}
                            {@const c = cardOf(entry)}
                            <button
                                class="text-left rounded-lg px-3 py-2 border transition-colors {selected?.name ==
                                entry.name
                                    ? 'bg-white border-gray-300 shadow-sm'
                                    : 'border-transparent hover:bg-white hover:border-gray-200'}"
                                on:click={() => {
                                    selected = entry;
                                    saveOpen = false;
                                    message = '';
                                }}
                            >
                                <div class="text-sm font-medium text-gray-900">{c.title}</div>
                                {#if c.summary}
                                    <div
                                        class="text-xs text-gray-500 leading-snug mt-0.5 line-clamp-2"
                                    >
                                        {text(c.summary)}
                                    </div>
                                {/if}
                            </button>
                        {/each}
                    </div>
                {/each}
                {#if $libraryStore.writer}
                    <button
                        class="mt-auto text-sm rounded-lg border border-dashed border-gray-300 px-3 py-2 text-gray-600 hover:bg-white hover:text-gray-900"
                        on:click={() => {
                            saveOpen = true;
                            message = '';
                        }}>+ Save my program as an example</button
                    >
                {/if}
            </nav>

            <!-- Detail -->
            <section class="flex-1 min-w-0 flex flex-col">
                <div class="flex-1 overflow-y-auto px-6 py-5">
                    {#if saveOpen}
                        <div class="flex flex-col gap-3 max-w-xl">
                            <h3 class="text-xl font-semibold text-gray-900">
                                Save the program in the code panel
                            </h3>
                            <p class="text-sm text-gray-600">
                                It becomes an example everyone on this site can open.
                            </p>
                            <Label class="text-gray-800"
                                >Title <Input
                                    size="sm"
                                    class="mt-1"
                                    bind:value={draft.title}
                                /></Label
                            >
                            <Label class="text-gray-800"
                                >Topic <Input
                                    size="sm"
                                    class="mt-1"
                                    bind:value={draft.topic}
                                    placeholder="Basics, Sensors, Gyro, Missions..."
                                /></Label
                            >
                            <Label class="text-gray-800"
                                >One-line summary <Input
                                    size="sm"
                                    class="mt-1"
                                    bind:value={draft.summary}
                                /></Label
                            >
                            <Label class="text-gray-800"
                                >What it does <Textarea
                                    rows={2}
                                    class="mt-1"
                                    bind:value={draft.what}
                                /></Label
                            >
                            <Label class="text-gray-800"
                                >Why it works <Textarea
                                    rows={3}
                                    class="mt-1"
                                    bind:value={draft.why}
                                /></Label
                            >
                            <Label class="text-gray-800"
                                >Things to try (one per line) <Textarea
                                    rows={3}
                                    class="mt-1"
                                    bind:value={draft.tries}
                                /></Label
                            >
                            <Label class="text-gray-800"
                                >Practice field <Select
                                    size="sm"
                                    class="mt-1"
                                    items={sceneOptions}
                                    bind:value={draft.scene}
                                    placeholder=""
                                /></Label
                            >
                        </div>
                    {:else if selected && card}
                        <article class="max-w-2xl flex flex-col gap-5">
                            <header class="flex flex-col gap-2">
                                <div class="flex items-center gap-2 text-xs">
                                    <span
                                        class="rounded-full px-2 py-0.5 font-semibold text-white"
                                        style="background-color: {topicColour(card.topic)}"
                                        >{card.topic}</span
                                    >
                                    {#if position > 0}
                                        <span class="text-gray-500"
                                            >Example {position} of {allEntries.length}</span
                                        >
                                    {/if}
                                </div>
                                <h3 class="text-2xl font-semibold text-gray-900 leading-tight">
                                    {card.title}
                                </h3>
                                {#if card.summary}
                                    <p class="text-base text-gray-600">{text(card.summary)}</p>
                                {/if}
                            </header>

                            {#if card.what}
                                <section>
                                    <h4
                                        class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5"
                                    >
                                        What it does
                                    </h4>
                                    <p class="text-[15px] leading-relaxed text-gray-800">
                                        {text(card.what)}
                                    </p>
                                </section>
                            {/if}

                            {#if card.why}
                                <section
                                    class="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3"
                                >
                                    <h4
                                        class="text-xs font-semibold uppercase tracking-wider text-blue-800 mb-1.5"
                                    >
                                        Why it works
                                    </h4>
                                    <p class="text-[15px] leading-relaxed text-gray-800">
                                        {text(card.why)}
                                    </p>
                                </section>
                            {/if}

                            {#if card.try && card.try.length > 0}
                                <section>
                                    <h4
                                        class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2"
                                    >
                                        Try this
                                    </h4>
                                    <ol class="flex flex-col gap-2">
                                        {#each card.try as idea, i}
                                            <li class="flex gap-3 items-start">
                                                <span
                                                    class="shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold"
                                                    >{i + 1}</span
                                                >
                                                <span
                                                    class="text-[15px] leading-relaxed text-gray-800"
                                                    >{text(idea)}</span
                                                >
                                            </li>
                                        {/each}
                                    </ol>
                                </section>
                            {/if}

                            {#if sceneAvailable(card.scene)}
                                <section
                                    class="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3"
                                >
                                    <MapPinAltOutline class="w-5 h-5 text-gray-500" />
                                    <div class="flex-1">
                                        <div class="text-xs text-gray-500">Practice field</div>
                                        <div class="text-sm font-medium text-gray-900">
                                            {card.scene?.replace(/^Practice - |\.spk$/gi, '')}
                                        </div>
                                    </div>
                                    <Button
                                        size="xs"
                                        color="light"
                                        on:click={() => loadField(card?.scene ?? '')}
                                        >Load field</Button
                                    >
                                </section>
                            {/if}
                        </article>
                    {/if}
                    {#if message}
                        <div
                            class="mt-4 max-w-2xl rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800"
                        >
                            {message}
                        </div>
                    {/if}
                </div>

                <!-- Actions -->
                <footer
                    class="border-t border-gray-200 bg-white px-6 py-3 flex flex-row flex-wrap items-center gap-2"
                >
                    {#if saveOpen}
                        <Button size="sm" color="blue" on:click={saveCurrent}>Save example</Button>
                        <Button size="sm" color="light" on:click={() => (saveOpen = false)}
                            >Cancel</Button
                        >
                    {:else if selected}
                        <Button
                            size="sm"
                            color="blue"
                            on:click={() => selected && use(selected, false)}
                            >Open in code panel</Button
                        >
                        <Button
                            size="sm"
                            color="light"
                            on:click={() => selected && use(selected, true)}
                            >Add to my program</Button
                        >
                        <span class="text-xs text-gray-500 hidden lg:inline ml-1">
                            Add keeps your blocks and brings in the example's My Blocks.
                        </span>
                        {#if $libraryStore.writer}
                            <button
                                class="ml-auto text-sm text-red-600 hover:text-red-800 hover:underline"
                                on:click={() => selected && remove(selected)}
                                >Take out of examples</button
                            >
                        {/if}
                    {/if}
                </footer>
            </section>
        </div>
    {/if}
</Modal>
