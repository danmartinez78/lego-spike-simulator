<script lang="ts">
    // Lessons window: step-by-step activities from the shared library.
    import { createEventDispatcher } from 'svelte';
    import { askConfirm } from '$lib/confirm';
    import { Button, Modal } from 'flowbite-svelte';
    import { AwardOutline, CheckOutline } from 'flowbite-svelte-icons';
    import {
        libraryStore,
        refreshLibrary,
        fetchEntry,
        loadSceneFromLibrary,
        loadRobotFromLibrary,
        programRequest,
        type LibraryEntry
    } from '$lib/library';
    import { openChallenge, progressStore } from '$lib/spike/challenges';
    import {
        challengeFor,
        groupLessons,
        lessonProgress,
        lessonStatus,
        missingFiles,
        toggleStep,
        topicColour
    } from '$lib/lessons';

    export let modalOpen = false;

    const dispatch = createEventDispatcher<{ setup: void }>();

    let selected: LibraryEntry | undefined = undefined;
    let message = '';
    let busy = false;

    // Show the play symbol as text rather than as an emoji.
    function text(value: string | undefined) {
        return (value ?? '').replace(/▶️?/g, '▶︎');
    }

    function paragraphs(value: string) {
        return text(value)
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
    }

    function niceName(name: string) {
        return name.replace(/^Practice - /, '').replace(/\.(spk|llsp3|mpd|ldr)$/i, '');
    }

    async function setUp() {
        const lesson = selected?.lesson;
        if (!lesson) return;
        if (
            lesson.program &&
            !(await askConfirm('Replace the program in the code panel with the starter program?', {
                confirmLabel: 'Replace'
            }))
        ) {
            return;
        }
        busy = true;
        message = '';
        try {
            if (lesson.field) await loadSceneFromLibrary(lesson.field);
            if (lesson.robot) await loadRobotFromLibrary(lesson.robot);
            if (lesson.program) {
                programRequest.set({
                    blob: await fetchEntry('programs', lesson.program),
                    merge: false
                });
            }
            modalOpen = false;
            dispatch('setup');
        } catch (e) {
            message = `Could not set up the lesson: ${(e as Error).message}`;
        } finally {
            busy = false;
        }
    }

    function showChallenge() {
        const challenge = challengeFor(selected?.lesson);
        if (!challenge) return;
        modalOpen = false;
        openChallenge(challenge.id);
    }

    function opened(open: boolean) {
        if (open) {
            message = '';
            refreshLibrary().then((state) => {
                const groups = groupLessons(state.index.lessons);
                if (!selected && groups.length > 0) {
                    selected = groups[0].entries[0];
                }
            });
        }
    }

    const badges = {
        new: { text: 'New', css: 'bg-gray-100 text-gray-600' },
        started: { text: 'Started', css: 'bg-amber-100 text-amber-800' },
        done: { text: 'Done', css: 'bg-green-100 text-green-800' }
    };

    $: opened(modalOpen);
    $: groups = groupLessons($libraryStore.index.lessons);
    $: allEntries = groups.flatMap((g) => g.entries);
    $: lesson = selected?.lesson;
    $: position = selected ? allEntries.findIndex((e) => e.name == selected?.name) + 1 : 0;
    $: ticked = selected ? ($lessonProgress[selected.name]?.steps ?? []) : [];
    $: challenge = challengeFor(lesson);
    $: missing = lesson ? missingFiles(lesson) : [];
    $: doneCount = allEntries.filter(
        (e) => e.lesson && lessonStatus(e.name, e.lesson, $lessonProgress, $progressStore) == 'done'
    ).length;
    $: setupParts = lesson
        ? [
              lesson.program ? `the starter program "${niceName(lesson.program)}"` : '',
              lesson.field ? `the field "${niceName(lesson.field)}"` : '',
              lesson.robot ? `the robot "${niceName(lesson.robot)}"` : ''
          ].filter((x) => x)
        : [];
</script>

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    size="xl"
    bodyClass="p-0"
    bind:open={modalOpen}
>
    <svelte:fragment slot="header">
        <div class="flex flex-row items-center gap-3">
            <div class="flex flex-col">
                <h3 class="text-lg font-semibold text-gray-900">Lessons</h3>
                <p class="text-sm text-gray-500">Work through the steps and tick each one off.</p>
            </div>
            {#if allEntries.length > 0}
                <span
                    class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-900 whitespace-nowrap"
                    >{doneCount} of {allEntries.length} done</span
                >
            {/if}
        </div>
    </svelte:fragment>
    {#if !$libraryStore.available}
        <div class="p-6 text-gray-700">This copy of the simulator has no lesson library.</div>
    {:else}
        <div class="flex flex-col md:flex-row h-[70dvh] text-gray-800">
            <!-- Lesson list -->
            <nav
                class="md:w-72 shrink-0 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto p-3 flex flex-col gap-4"
            >
                {#if groups.length == 0}
                    <div class="text-sm text-gray-500 p-2">No lessons yet.</div>
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
                            {@const l = entry.lesson}
                            {#if l}
                                {@const badge =
                                    badges[
                                        lessonStatus(entry.name, l, $lessonProgress, $progressStore)
                                    ]}
                                <button
                                    class="text-left rounded-lg px-3 py-2 border transition-colors {selected?.name ==
                                    entry.name
                                        ? 'bg-white border-gray-300 shadow-sm'
                                        : 'border-transparent hover:bg-white hover:border-gray-200'}"
                                    on:click={() => {
                                        selected = entry;
                                        message = '';
                                    }}
                                >
                                    <div class="flex items-center gap-2">
                                        <span class="text-sm font-medium text-gray-900 flex-1"
                                            >{l.title}</span
                                        >
                                        <span
                                            class="text-[11px] rounded-full px-2 py-0.5 {badge.css}"
                                            >{badge.text}</span
                                        >
                                    </div>
                                    {#if l.summary}
                                        <div
                                            class="text-xs text-gray-500 leading-snug mt-0.5 line-clamp-2"
                                        >
                                            {text(l.summary)}
                                        </div>
                                    {/if}
                                </button>
                            {/if}
                        {/each}
                    </div>
                {/each}
            </nav>

            <!-- Detail -->
            <section class="flex-1 min-w-0 flex flex-col">
                <div class="flex-1 overflow-y-auto px-6 py-5">
                    {#if selected && lesson}
                        <article class="max-w-2xl flex flex-col gap-5">
                            <header class="flex flex-col gap-2">
                                <div class="flex items-center gap-2 text-xs">
                                    <span
                                        class="rounded-full px-2 py-0.5 font-semibold text-white"
                                        style="background-color: {topicColour(lesson.topic)}"
                                        >{lesson.topic || 'Other'}</span
                                    >
                                    {#if position > 0}
                                        <span class="text-gray-500"
                                            >Lesson {position} of {allEntries.length}</span
                                        >
                                    {/if}
                                </div>
                                <h3 class="text-2xl font-semibold text-gray-900 leading-tight">
                                    {lesson.title}
                                </h3>
                                {#if lesson.summary}
                                    <p class="text-base text-gray-600">{text(lesson.summary)}</p>
                                {/if}
                            </header>

                            {#if setupParts.length > 0}
                                <section
                                    class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3"
                                >
                                    <p class="flex-1 text-sm text-gray-800">
                                        <b>Get set up:</b> loads {setupParts.join(' and ')}.
                                    </p>
                                    <Button
                                        size="sm"
                                        color="blue"
                                        disabled={busy || missing.length > 0}
                                        on:click={setUp}>Set up</Button
                                    >
                                </section>
                                {#if missing.length > 0}
                                    <p class="text-sm text-amber-800 -mt-3">
                                        Ask your coach: the library is missing {missing.join(', ')}.
                                    </p>
                                {/if}
                            {/if}

                            <section>
                                <h4
                                    class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2"
                                >
                                    Steps · {ticked.filter((s) => s < lesson.steps.length).length} of
                                    {lesson.steps.length} done
                                </h4>
                                <ol class="flex flex-col gap-3">
                                    {#each lesson.steps as step, i}
                                        {@const done = ticked.includes(i)}
                                        <li class="flex gap-3 items-start">
                                            <button
                                                class="shrink-0 mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full border-2 text-xs font-semibold transition-colors {done
                                                    ? 'bg-green-600 border-green-600 text-white'
                                                    : 'bg-white border-gray-300 text-gray-700 hover:border-green-600'}"
                                                role="checkbox"
                                                aria-checked={done}
                                                aria-label="Step {i + 1} done"
                                                on:click={() =>
                                                    selected && toggleStep(selected.name, i)}
                                            >
                                                {#if done}
                                                    <CheckOutline class="w-4 h-4" />
                                                {:else}
                                                    {i + 1}
                                                {/if}
                                            </button>
                                            <div
                                                class="flex flex-col gap-1 {done
                                                    ? 'text-gray-500'
                                                    : 'text-gray-800'}"
                                            >
                                                {#if step.title}
                                                    <div class="font-semibold text-[15px]">
                                                        {text(step.title)}
                                                    </div>
                                                {/if}
                                                {#each paragraphs(step.text) as p}
                                                    <p class="text-[15px] leading-relaxed">{p}</p>
                                                {/each}
                                            </div>
                                        </li>
                                    {/each}
                                </ol>
                            </section>

                            {#if challenge}
                                {@const passed = $progressStore[challenge.id]?.completed}
                                <section
                                    class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-gray-200 px-4 py-3"
                                >
                                    <AwardOutline class="w-6 h-6 text-gray-500 shrink-0" />
                                    <div class="flex-1">
                                        <div class="text-xs text-gray-500">
                                            Challenge · {passed ? 'passed' : 'not passed yet'}
                                        </div>
                                        <div class="text-sm font-medium text-gray-900">
                                            {challenge.title}
                                        </div>
                                        <div class="text-sm text-gray-600">{challenge.goal}</div>
                                    </div>
                                    {#if passed}
                                        <span
                                            class="text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-800"
                                            >Passed</span
                                        >
                                    {/if}
                                    <Button size="sm" color="light" on:click={showChallenge}
                                        >Open challenge</Button
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
            </section>
        </div>
    {/if}
</Modal>
