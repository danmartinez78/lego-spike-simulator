<script lang="ts">
    // Lessons window: step-by-step activities from the shared library.
    import { createEventDispatcher } from 'svelte';
    import { askConfirm } from '$lib/confirm';
    import { Modal } from 'flowbite-svelte';
    import LessonView from '$components/LessonView.svelte';
    import LessonListItem from '$components/LessonListItem.svelte';
    import { studentDialogOpen, studentStore } from '$lib/team';
    import {
        dueLabel,
        handIn,
        handedIn,
        homeworkStore,
        isOverdue,
        openHandedIn,
        refreshHomework,
        timeLabel
    } from '$lib/homework';
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

    function choose(entry: LibraryEntry) {
        selected = entry;
        message = '';
    }

    async function handInProgram() {
        if (!selected) return;
        busy = true;
        message = '';
        try {
            const when = await handIn(selected.name);
            message = `Handed in ${timeLabel(when)}. Your coach can see it now.`;
        } catch (e) {
            message = (e as Error).message;
        } finally {
            busy = false;
        }
    }

    async function openMine() {
        if (!selected) return;
        if (
            !(await askConfirm(
                'Replace the program in the code panel with the one you handed in?',
                { confirmLabel: 'Replace' }
            ))
        ) {
            return;
        }
        try {
            await openHandedIn(selected.name);
            modalOpen = false;
        } catch (e) {
            message = (e as Error).message;
        }
    }

    function opened(open: boolean) {
        if (open) {
            message = '';
            Promise.all([refreshLibrary(), refreshHomework()]).then(([state]) => {
                if (selected) return;
                const first =
                    homework[0]?.entries[0] ?? groupLessons(state.index.lessons)[0]?.entries[0];
                if (first) selected = first;
            });
        }
    }

    // Homework that names lessons this library has, soonest due first.
    function homeworkLessons(
        assignments: typeof $homeworkStore,
        lessons: LibraryEntry[],
        progress: typeof $lessonProgress,
        passed: typeof $progressStore
    ) {
        return [...assignments]
            .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
            .map((assignment) => {
                const entries = assignment.lessons
                    .map((name) => lessons.find((l) => l.name == name))
                    .filter((e): e is LibraryEntry => !!e?.lesson);
                const done = entries.filter(
                    (e) => e.lesson && lessonStatus(e.name, e.lesson, progress, passed) == 'done'
                ).length;
                return { assignment, entries, done };
            })
            .filter((h) => h.entries.length > 0);
    }

    $: opened(modalOpen);
    $: groups = groupLessons($libraryStore.index.lessons);
    $: homework = homeworkLessons(
        $homeworkStore,
        $libraryStore.index.lessons,
        $lessonProgress,
        $progressStore
    );
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
                {#if homework.length > 0}
                    <div class="flex flex-col gap-2">
                        <div
                            class="px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500"
                        >
                            Homework
                        </div>
                        {#each homework as h (h.assignment.id)}
                            <div class="rounded-xl border border-blue-200 bg-blue-50/60 p-2">
                                <div class="px-1 flex flex-col">
                                    <div class="text-sm font-semibold text-gray-900">
                                        {h.assignment.title}
                                    </div>
                                    <div class="text-xs flex flex-row flex-wrap gap-x-2">
                                        {#if h.assignment.due}
                                            <span
                                                class={isOverdue(h.assignment.due) &&
                                                h.done < h.entries.length
                                                    ? 'text-red-700 font-medium'
                                                    : 'text-gray-600'}
                                                >Due {dueLabel(h.assignment.due)}</span
                                            >
                                        {/if}
                                        <span class="text-gray-600"
                                            >{h.done} of {h.entries.length} done</span
                                        >
                                    </div>
                                    {#if h.assignment.note}
                                        <p class="text-xs text-gray-700 mt-1 whitespace-pre-line">
                                            {h.assignment.note}
                                        </p>
                                    {/if}
                                </div>
                                <div class="flex flex-col gap-1 mt-1">
                                    {#each h.entries as entry}
                                        {#if entry.lesson}
                                            <LessonListItem
                                                lesson={entry.lesson}
                                                status={lessonStatus(
                                                    entry.name,
                                                    entry.lesson,
                                                    $lessonProgress,
                                                    $progressStore
                                                )}
                                                selected={selected?.name == entry.name}
                                                on:click={() => choose(entry)}
                                            />
                                        {/if}
                                    {/each}
                                </div>
                            </div>
                        {/each}
                        {#if !$studentStore}
                            <button
                                class="text-left text-xs text-blue-800 px-2 hover:underline"
                                on:click={() => studentDialogOpen.set(true)}
                                >Sign in with your code so your coach sees your progress.</button
                            >
                        {/if}
                    </div>
                    <div
                        class="px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 -mb-3"
                    >
                        All lessons
                    </div>
                {/if}
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
                            {#if entry.lesson}
                                <LessonListItem
                                    lesson={entry.lesson}
                                    status={lessonStatus(
                                        entry.name,
                                        entry.lesson,
                                        $lessonProgress,
                                        $progressStore
                                    )}
                                    selected={selected?.name == entry.name}
                                    on:click={() => choose(entry)}
                                />
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
                            signedIn={!!$studentStore}
                            handedInAt={selected ? $handedIn[selected.name] : undefined}
                            on:handin={handInProgram}
                            on:openmine={openMine}
                            on:signin={() => studentDialogOpen.set(true)}
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
