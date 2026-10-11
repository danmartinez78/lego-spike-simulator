<script lang="ts">
    // Coach page: homework assignments and each student's progress on them.
    import { onMount } from 'svelte';
    import { Button, Input, Label, Spinner, Textarea } from 'flowbite-svelte';
    import { askConfirm } from '$lib/confirm';
    import { libraryStore, type LibraryEntry } from '$lib/library';
    import { groupLessons, lessonStatus, topicColour } from '$lib/lessons';
    import {
        addAssignment,
        deleteAssignment,
        dueLabel,
        getHomework,
        getTeamProgress,
        handedInUrl,
        isOverdue,
        updateAssignment,
        type Assignment,
        type StudentProgress
    } from '$lib/homework';

    let assignments: Assignment[] = [];
    let students: StudentProgress[] = [];
    let loading = true;
    let message = '';
    let failed = false;
    let busy = false;

    // The form, for a new assignment (editing == 'new') or an existing one.
    let editing = '';
    let title = '';
    let due = '';
    let note = '';
    let picked: string[] = [];

    onMount(load);

    async function load() {
        try {
            const [h, p] = await Promise.all([getHomework(), getTeamProgress()]);
            assignments = h.assignments;
            students = p.students;
            failed = false;
        } catch (e) {
            failed = true;
            message = (e as Error).message;
        }
        loading = false;
    }

    function startEdit(a: Assignment | undefined) {
        editing = a?.id ?? 'new';
        title = a?.title ?? '';
        due = a?.due ?? '';
        note = a?.note ?? '';
        picked = [...(a?.lessons ?? [])];
        message = '';
    }

    function toggle(name: string) {
        picked = picked.includes(name) ? picked.filter((n) => n != name) : [...picked, name];
    }

    async function save() {
        busy = true;
        message = '';
        const input = { title, due, note, lessons: picked };
        try {
            const result =
                editing == 'new'
                    ? await addAssignment(input)
                    : await updateAssignment(editing, input);
            assignments = result.assignments;
            failed = false;
            message = `Saved "${title.trim()}". Students see it at the top of their Lessons window.`;
            editing = '';
        } catch (e) {
            failed = true;
            message = (e as Error).message;
        }
        busy = false;
    }

    async function remove(a: Assignment) {
        if (
            !(await askConfirm(
                `Delete the homework "${a.title}"? Students keep their progress on the lessons.`,
                { confirmLabel: 'Delete', danger: true }
            ))
        ) {
            return;
        }
        try {
            assignments = (await deleteAssignment(a.id)).assignments;
            failed = false;
            message = `Deleted "${a.title}".`;
        } catch (e) {
            failed = true;
            message = (e as Error).message;
        }
    }

    async function refresh() {
        loading = true;
        message = '';
        await load();
    }

    function lessonEntry(name: string): LibraryEntry | undefined {
        return $libraryStore.index.lessons.find((l) => l.name == name);
    }

    function cell(s: StudentProgress, name: string) {
        const entry = lessonEntry(name);
        if (!entry?.lesson) return undefined;
        const lesson = entry.lesson;
        const status = lessonStatus(name, lesson, s.progress.lessons, s.progress.challenges);
        const ticked =
            s.progress.lessons[name]?.steps.filter((i) => i < lesson.steps.length).length ?? 0;
        return { status, ticked, total: lesson.steps.length, handedIn: s.programs[name] };
    }

    function doneCount(a: Assignment) {
        return students.filter((s) => a.lessons.every((name) => cell(s, name)?.status == 'done'))
            .length;
    }

    function shortTime(iso: string) {
        return new Date(iso).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    // Drafts can't be assigned (unless they already were).
    $: groups = groupLessons(
        $libraryStore.index.lessons.filter((e) => !e.lesson?.draft || picked.includes(e.name))
    );
    $: sorted = [...assignments].sort((a, b) => (b.due ?? '0000').localeCompare(a.due ?? '0000'));
    $: sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name));
</script>

<section class="flex flex-col gap-3">
    <div class="flex flex-row flex-wrap items-end gap-3">
        <div class="flex-1 min-w-[16rem]">
            <h2 class="text-lg font-semibold">Homework</h2>
            <p class="text-gray-600 text-sm">
                Pick lessons and a due date. A lesson counts as done when the student ticks every
                step and passes its challenge. Progress shows up once a student signs in with their
                code.
            </p>
        </div>
        <Button size="sm" color="light" disabled={loading} on:click={refresh}>Refresh</Button>
        <Button
            size="sm"
            color="blue"
            disabled={editing != ''}
            on:click={() => startEdit(undefined)}>New homework</Button
        >
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

    {#if editing}
        <form
            class="bg-white rounded-lg border border-blue-200 p-4 flex flex-col gap-4"
            on:submit|preventDefault={save}
        >
            <h3 class="font-semibold">{editing == 'new' ? 'New homework' : 'Edit homework'}</h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="sm:col-span-2">
                    <Label for="hw-title" class="mb-1">Title</Label>
                    <Input id="hw-title" bind:value={title} placeholder="Line following week" />
                </div>
                <div>
                    <Label for="hw-due" class="mb-1">Due (optional)</Label>
                    <Input id="hw-due" type="date" bind:value={due} />
                </div>
            </div>
            <div>
                <Label for="hw-note" class="mb-1">Note for students (optional)</Label>
                <Textarea
                    id="hw-note"
                    rows={2}
                    bind:value={note}
                    placeholder="Finish these before Thursday's meeting."
                />
            </div>
            <fieldset>
                <legend class="text-sm font-medium text-gray-900 mb-2">
                    Lessons ({picked.length} picked)
                </legend>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {#each groups as group}
                        <div class="flex flex-col gap-1">
                            <div
                                class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500"
                            >
                                <span
                                    class="w-2 h-2 rounded-full"
                                    style="background-color: {topicColour(group.topic)}"
                                ></span>
                                {group.topic}
                            </div>
                            {#each group.entries as entry}
                                <label class="flex flex-row items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        class="rounded"
                                        checked={picked.includes(entry.name)}
                                        on:change={() => toggle(entry.name)}
                                    />
                                    {entry.lesson?.title}
                                    {#if entry.lesson?.draft}
                                        <span class="text-xs text-gray-500">(draft)</span>
                                    {/if}
                                </label>
                            {/each}
                        </div>
                    {/each}
                </div>
            </fieldset>
            <div class="flex flex-row gap-2 justify-end">
                <Button color="light" on:click={() => (editing = '')}>Cancel</Button>
                <Button type="submit" color="blue" disabled={busy}>Save homework</Button>
            </div>
        </form>
    {/if}

    {#if loading}
        <div class="flex flex-row gap-2 items-center text-gray-600 text-sm">
            <Spinner size="4" /> Loading homework…
        </div>
    {:else if sorted.length == 0 && !editing}
        <p class="bg-white rounded-lg border border-gray-200 p-6 text-gray-600">
            No homework yet. Press New homework to assign some lessons.
        </p>
    {/if}

    {#each sorted as a (a.id)}
        <article class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <header class="px-4 py-3 flex flex-row flex-wrap items-start gap-3 border-b">
                <div class="flex-1 min-w-[12rem]">
                    <h3 class="font-semibold">{a.title}</h3>
                    <div class="text-sm text-gray-600 flex flex-row flex-wrap gap-x-3">
                        {#if a.due}
                            <span class={isOverdue(a.due) ? 'text-red-700' : ''}
                                >Due {dueLabel(a.due)}</span
                            >
                        {:else}
                            <span>No due date</span>
                        {/if}
                        <span
                            >{doneCount(a)} of {students.length} student{students.length == 1
                                ? ''
                                : 's'} done</span
                        >
                    </div>
                    {#if a.note}
                        <p class="text-sm text-gray-700 mt-1 whitespace-pre-line">{a.note}</p>
                    {/if}
                </div>
                <div class="flex flex-row gap-2">
                    <Button size="xs" color="light" on:click={() => startEdit(a)}>Edit</Button>
                    <Button size="xs" color="red" outline on:click={() => remove(a)}>Delete</Button>
                </div>
            </header>
            {#if students.length == 0}
                <p class="px-4 py-3 text-sm text-gray-600">
                    Add students on the Students tab to see their progress here.
                </p>
            {:else}
                <div class="overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead class="bg-gray-50 text-left text-gray-600">
                            <tr>
                                <th class="px-4 py-2 font-medium">Student</th>
                                {#each a.lessons as name}
                                    <th class="px-3 py-2 font-medium min-w-[8rem]"
                                        >{lessonEntry(name)?.lesson?.title ??
                                            `${name.replace(/\.json$/, '')} (deleted)`}</th
                                    >
                                {/each}
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            {#each sortedStudents as s (s.id)}
                                <tr>
                                    <td class="px-4 py-2 font-medium whitespace-nowrap">{s.name}</td
                                    >
                                    {#each a.lessons as name}
                                        {@const c = cell(s, name)}
                                        <td class="px-3 py-2 align-top">
                                            {#if c}
                                                <span
                                                    class="inline-block text-xs rounded-full px-2 py-0.5 {c.status ==
                                                    'done'
                                                        ? 'bg-green-100 text-green-800'
                                                        : c.status == 'started'
                                                          ? 'bg-amber-100 text-amber-800'
                                                          : 'bg-gray-100 text-gray-500'}"
                                                    >{c.status == 'done'
                                                        ? 'Done'
                                                        : c.status == 'started'
                                                          ? `${c.ticked}/${c.total} steps`
                                                          : 'Not started'}</span
                                                >
                                                {#if c.handedIn}
                                                    <a
                                                        class="block text-xs text-blue-700 hover:underline mt-1"
                                                        href={handedInUrl(s.id, name)}
                                                        title="Handed in {shortTime(c.handedIn)}"
                                                        >Program, {shortTime(c.handedIn)}</a
                                                    >
                                                {/if}
                                            {:else}
                                                <span class="text-xs text-gray-400">–</span>
                                            {/if}
                                        </td>
                                    {/each}
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </article>
    {/each}
</section>
