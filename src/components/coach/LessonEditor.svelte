<script lang="ts">
    // Form for writing a lesson, with a preview of what students see.
    import { createEventDispatcher } from 'svelte';
    import { Button, Input, Label, Modal, Select, Textarea } from 'flowbite-svelte';
    import { ArrowDownOutline, ArrowUpOutline, TrashBinOutline } from 'flowbite-svelte-icons';
    import LessonView from '$components/LessonView.svelte';
    import CheckEditor from '$components/coach/CheckEditor.svelte';
    import type { Check } from '$lib/spike/checks';
    import { challenges } from '$lib/spike/challenges';
    import { lessonProblem } from '$lib/lessons';
    import type { Lesson, LessonStep } from '$lib/library';

    export let open = false;
    export let lesson: Lesson | undefined = undefined;
    export let programs: string[] = [];
    export let scenes: string[] = [];
    export let robots: string[] = [];
    export let topics: string[] = [];
    export let saving = false;

    const dispatch = createEventDispatcher<{ save: Lesson }>();

    let title = '';
    let topic = '';
    let order = '';
    let summary = '';
    let steps: LessonStep[] = [];
    let program = '';
    let field = '';
    let robot = '';
    let challenge = '';
    let check: Check | undefined = undefined;
    let published = false;
    let problem = '';

    // Fill the form each time it opens.
    $: if (open) fill(lesson);

    function fill(lesson: Lesson | undefined) {
        title = lesson?.title ?? '';
        topic = lesson?.topic ?? '';
        order = lesson?.order !== undefined ? String(lesson.order) : '';
        summary = lesson?.summary ?? '';
        steps = (lesson?.steps ?? [{ title: '', text: '' }]).map((s) => ({ ...s }));
        program = lesson?.program ?? '';
        field = lesson?.field ?? '';
        robot = lesson?.robot ?? '';
        challenge = lesson?.challenge ?? '';
        check = lesson?.check ? structuredClone(lesson.check) : undefined;
        // New lessons start as drafts.
        published = !!lesson && !lesson.draft;
        problem = '';
    }

    function build(): Lesson {
        // Keep any fields this form doesn't know about.
        const result: Lesson = {
            ...(lesson ?? {}),
            schema: 'spike-lesson/1',
            title: title.trim(),
            steps: steps
                .map((s) => ({ title: s.title?.trim() ?? '', text: s.text.trim() }))
                .filter((s) => s.title.length > 0 || s.text.length > 0)
                .map((s) => (s.title ? s : { text: s.text }))
        };
        const optional = { topic, summary, program, field, robot, challenge };
        for (const [key, value] of Object.entries(optional)) {
            const k = key as keyof typeof optional;
            if (value.trim()) result[k] = value.trim();
            else delete result[k];
        }
        const number = Number(order);
        if (order.trim() && Number.isFinite(number)) result.order = number;
        else delete result.order;
        if (check && field.trim()) result.check = cleanCheck(check);
        else delete result.check;
        if (published) delete result.draft;
        else result.draft = true;
        return result;
    }

    // Numbers typed into the form arrive as numbers or text; store numbers,
    // and drop empty labels.
    function cleanCheck(c: Check): Check {
        const copy: Check = structuredClone(c);
        copy.needed = Number(copy.needed);
        const zones = [copy.stop?.zone, ...(copy.waypoints ?? []), ...(copy.avoid ?? [])];
        for (const zone of zones) {
            if (zone && !zone.label?.trim()) delete zone.label;
        }
        if (copy.stop?.heading) {
            copy.stop.heading = {
                value: Number(copy.stop.heading.value) || 0,
                tolerance: Number(copy.stop.heading.tolerance) || 10
            };
        }
        if (copy.follow) copy.follow.width = Number(copy.follow.width);
        return copy;
    }

    function save() {
        if (order.trim() && !Number.isFinite(Number(order))) {
            problem = 'Order must be a number.';
            return;
        }
        const result = build();
        if (check && !field.trim()) {
            problem = 'Pick a field for the check, or remove the check.';
            return;
        }
        const issue = lessonProblem(result);
        if (issue) {
            problem = issue.replace(
                'The lesson needs at least one step',
                'Write at least one step.'
            );
            return;
        }
        problem = '';
        dispatch('save', result);
    }

    function addStep() {
        steps = [...steps, { title: '', text: '' }];
    }

    function moveStep(i: number, by: number) {
        const j = i + by;
        if (j < 0 || j >= steps.length) return;
        const copy = [...steps];
        [copy[i], copy[j]] = [copy[j], copy[i]];
        steps = copy;
    }

    function removeStep(i: number) {
        steps = steps.filter((_, k) => k != i);
        if (steps.length == 0) addStep();
    }

    function options(names: string[], none: string, current: string) {
        // Keep a missing file selectable so editing doesn't drop it silently.
        const all = current && !names.includes(current) ? [...names, current] : names;
        return [
            { value: '', name: none },
            ...all.map((n) => ({
                value: n,
                name: names.includes(n)
                    ? n.replace(/\.(spk|llsp3|mpd|ldr)$/i, '')
                    : `${n} (missing)`
            }))
        ];
    }

    $: programItems = options(programs, 'No starter program', program);
    $: fieldItems = options(scenes, 'No field', field);
    $: robotItems = options(robots, 'Any robot', robot);
    $: challengeItems = [
        { value: '', name: 'No challenge' },
        ...challenges.map((c) => ({ value: c.id, name: c.title }))
    ];
    // List every field so the preview updates as the coach types.
    $: previewLesson = preview(
        title,
        topic,
        order,
        summary,
        steps,
        program,
        field,
        robot,
        challenge,
        check,
        published
    );

    function preview(...fields: unknown[]): Lesson {
        void fields;
        return { ...build(), title: title.trim() || 'Untitled lesson' };
    }
    $: missing = [
        program && !programs.includes(program) ? program : '',
        field && !scenes.includes(field) ? field : '',
        robot && !robots.includes(robot) ? robot : ''
    ].filter((x) => x);
</script>

<Modal
    title={lesson ? 'Edit lesson' : 'New lesson'}
    bind:open
    size="xl"
    backdropClass="fixed inset-0 z-40 bg-gray-900 bg-opacity-50"
>
    <!-- No scroll anchoring: drawing a check adds rows, and the mat must not jump. -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 [overflow-anchor:none]">
        <form class="flex flex-col gap-4" on:submit|preventDefault={save}>
            <!-- The check and the Save button are below, across the whole window. -->
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div class="sm:col-span-2">
                    <Label for="lesson-title" class="mb-1">Title</Label>
                    <Input id="lesson-title" bind:value={title} placeholder="Stop at a line" />
                </div>
                <div>
                    <Label for="lesson-topic" class="mb-1">Topic</Label>
                    <Input
                        id="lesson-topic"
                        bind:value={topic}
                        list="lesson-topics"
                        placeholder="Sensors"
                    />
                    <datalist id="lesson-topics">
                        {#each topics as t}
                            <option value={t}></option>
                        {/each}
                    </datalist>
                </div>
                <div>
                    <Label for="lesson-order" class="mb-1">Order in topic</Label>
                    <Input id="lesson-order" type="number" bind:value={order} placeholder="1" />
                </div>
            </div>
            <div>
                <Label for="lesson-summary" class="mb-1">One-line summary</Label>
                <Input
                    id="lesson-summary"
                    bind:value={summary}
                    placeholder="Drive until the colour sensor sees black."
                />
            </div>

            <fieldset class="flex flex-col gap-3">
                <legend class="text-sm font-medium text-gray-900 mb-1">Steps</legend>
                {#each steps as step, i}
                    <div class="rounded-lg border border-gray-200 p-3 flex flex-col gap-2">
                        <div class="flex flex-row items-center gap-2">
                            <span
                                class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold"
                                >{i + 1}</span
                            >
                            <Input
                                size="sm"
                                bind:value={step.title}
                                placeholder="Step title (optional)"
                                aria-label="Step {i + 1} title"
                            />
                            <button
                                type="button"
                                class="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                                aria-label="Move step {i + 1} up"
                                disabled={i == 0}
                                on:click={() => moveStep(i, -1)}
                                ><ArrowUpOutline class="w-4 h-4" /></button
                            >
                            <button
                                type="button"
                                class="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                                aria-label="Move step {i + 1} down"
                                disabled={i == steps.length - 1}
                                on:click={() => moveStep(i, 1)}
                                ><ArrowDownOutline class="w-4 h-4" /></button
                            >
                            <button
                                type="button"
                                class="p-1 rounded text-red-600 hover:bg-red-50"
                                aria-label="Remove step {i + 1}"
                                on:click={() => removeStep(i)}
                                ><TrashBinOutline class="w-4 h-4" /></button
                            >
                        </div>
                        <Textarea
                            rows={3}
                            bind:value={step.text}
                            placeholder="What the student does. Leave a blank line to start a new paragraph."
                            aria-label="Step {i + 1} text"
                        />
                    </div>
                {/each}
                <Button size="sm" color="light" class="self-start" on:click={addStep}
                    >+ Add a step</Button
                >
            </fieldset>

            <fieldset class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <legend class="text-sm font-medium text-gray-900 mb-1">
                    What Set up loads (all optional)
                </legend>
                <div>
                    <Label for="lesson-program" class="mb-1">Starter program</Label>
                    <Select
                        id="lesson-program"
                        items={programItems}
                        bind:value={program}
                        placeholder=""
                    />
                </div>
                <div>
                    <Label for="lesson-field" class="mb-1">Field</Label>
                    <Select
                        id="lesson-field"
                        items={fieldItems}
                        bind:value={field}
                        placeholder=""
                    />
                </div>
                <div>
                    <Label for="lesson-robot" class="mb-1">Robot</Label>
                    <Select
                        id="lesson-robot"
                        items={robotItems}
                        bind:value={robot}
                        placeholder=""
                    />
                </div>
                {#if challenge}
                    <div>
                        <Label for="lesson-challenge" class="mb-1"
                            >Challenge card (older lessons)</Label
                        >
                        <Select
                            id="lesson-challenge"
                            items={challengeItems}
                            bind:value={challenge}
                            placeholder=""
                        />
                    </div>
                {/if}
            </fieldset>
        </form>

        <aside class="flex flex-col gap-2 min-w-0" aria-label="Preview">
            <div class="text-xs font-semibold uppercase tracking-wider text-gray-500">
                What students see
            </div>
            <div
                class="rounded-xl border border-gray-200 bg-white p-5 overflow-y-auto h-[60dvh]"
            >
                <LessonView lesson={previewLesson} {missing} preview />
            </div>
        </aside>
    </div>
    <div class="flex flex-col gap-4 mt-6 border-t pt-4 [overflow-anchor:none]">
        <fieldset class="flex flex-col gap-2">
            <legend class="text-sm font-medium text-gray-900 mb-1">
                Check (optional){field ? ` · on ${field.replace(/\.spk$/i, '')}` : ''}
            </legend>
            <CheckEditor bind:check {field} />
        </fieldset>

        {#if problem}
            <p class="text-sm text-red-700" role="alert">{problem}</p>
        {/if}
        <div class="flex flex-row flex-wrap items-center gap-2 justify-end">
            <label class="flex flex-row items-center gap-2 text-sm mr-auto">
                <input type="checkbox" class="rounded" bind:checked={published} />
                <span
                    ><b>Published</b>
                    <span class="text-gray-500"
                        >{published ? 'Students can see it.' : 'Draft: only coaches see it.'}</span
                    ></span
                >
            </label>
            <Button color="light" on:click={() => (open = false)}>Cancel</Button>
            <Button color="blue" disabled={saving} on:click={save}>Save lesson</Button>
        </div>
    </div>
</Modal>
