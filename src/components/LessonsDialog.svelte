<script lang="ts">
    // Lessons window: step-by-step activities from the shared library.
    import { createEventDispatcher } from 'svelte';
    import { askConfirm } from '$lib/confirm';
    import { Modal } from 'flowbite-svelte';
    import LessonView from '$components/LessonView.svelte';
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
                        <LessonView
                            {lesson}
                            {position}
                            total={allEntries.length}
                            {ticked}
                            {missing}
                            {busy}
                            passed={!!(challenge && $progressStore[challenge.id]?.completed)}
                            on:setup={setUp}
                            on:toggle={(e) => selected && toggleStep(selected.name, e.detail)}
                            on:challenge={showChallenge}
                        />
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
