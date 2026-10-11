<script lang="ts">
    // Form for making or editing a challenge: the goal, the field, hints and
    // the check drawn on the mat.
    import { createEventDispatcher } from 'svelte';
    import { Button, Input, Label, Modal, Select, Textarea } from 'flowbite-svelte';
    import { TrashBinOutline } from 'flowbite-svelte-icons';
    import CheckEditor from '$components/coach/CheckEditor.svelte';
    import { cleanCheck, type Check } from '$lib/spike/checks';
    import type { ChallengeFile } from '$lib/spike/challenges';
    import { challengeProblems } from '../../../server/lesson-rules.mjs';

    export let open = false;
    export let challenge: ChallengeFile | undefined = undefined;
    export let programs: string[] = [];
    export let scenes: string[] = [];
    export let robots: string[] = [];
    export let skills: string[] = [];
    export let saving = false;

    const dispatch = createEventDispatcher<{ save: ChallengeFile }>();

    let title = '';
    let level = '1';
    let skill = '';
    let order = '';
    let goal = '';
    let field = '';
    let robot = '';
    let example = '';
    let hints: string[] = [];
    let check: Check | undefined = undefined;
    let published = false;
    let problem = '';

    $: if (open) fill(challenge);

    function fill(c: ChallengeFile | undefined) {
        title = c?.title ?? '';
        level = String(c?.level ?? 1);
        skill = c?.skill ?? '';
        order = c?.order !== undefined ? String(c.order) : '';
        goal = c?.goal ?? '';
        field = c?.field ?? '';
        robot = c?.robot ?? '';
        example = c?.example ?? '';
        hints = [...(c?.hints ?? [])];
        if (hints.length == 0) hints = [''];
        check = c?.check ? structuredClone(c.check) : { realism: 'realistic', needed: 4 };
        // New challenges start as drafts.
        published = !!c && !c.draft;
        problem = '';
    }

    function build(): ChallengeFile {
        // Keep any fields this form doesn't know about.
        const result: ChallengeFile = {
            ...(challenge ?? {}),
            schema: 'spike-challenge/1',
            title: title.trim(),
            goal: goal.trim(),
            field: field.trim(),
            check: check ? cleanCheck(check) : (undefined as unknown as Check),
            level: Number(level) as 1 | 2 | 3
        };
        const optional = { skill, robot, example };
        for (const [key, value] of Object.entries(optional)) {
            const k = key as keyof typeof optional;
            if (value.trim()) result[k] = value.trim();
            else delete result[k];
        }
        const number = Number(order);
        if (order.trim() && Number.isFinite(number)) result.order = number;
        else delete result.order;
        const kept = hints.map((h) => h.trim()).filter((h) => h);
        if (kept.length > 0) result.hints = kept;
        else delete result.hints;
        if (published) delete result.draft;
        else result.draft = true;
        return result;
    }

    function save() {
        if (order.trim() && !Number.isFinite(Number(order))) {
            problem = 'Order must be a number.';
            return;
        }
        if (!check) {
            problem =
                'A challenge needs a check. Press Add a check and draw where the robot must go.';
            return;
        }
        const result = build();
        const issue = challengeProblems(result).errors[0];
        if (issue) {
            problem = issue;
            return;
        }
        problem = '';
        dispatch('save', result);
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

    const levels = [
        { value: '1', name: '1 star: starter' },
        { value: '2', name: '2 stars: getting there' },
        { value: '3', name: '3 stars: tricky' }
    ];
    $: fieldItems = options(scenes, 'Pick a field', field);
    $: robotItems = options(robots, 'The default robot', robot);
    $: exampleItems = options(programs, 'No example', example);
</script>

<Modal
    title={challenge ? 'Edit challenge' : 'New challenge'}
    bind:open
    size="xl"
    backdropClass="fixed inset-0 z-40 bg-gray-900 bg-opacity-50"
>
    <form class="flex flex-col gap-4 [overflow-anchor:none]" on:submit|preventDefault={save}>
        <div class="grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div class="sm:col-span-3">
                <Label for="challenge-title" class="mb-1">Title</Label>
                <Input id="challenge-title" bind:value={title} placeholder="Hit target A" />
            </div>
            <div class="sm:col-span-1">
                <Label for="challenge-level" class="mb-1">Level</Label>
                <Select id="challenge-level" items={levels} bind:value={level} placeholder="" />
            </div>
            <div class="sm:col-span-1">
                <Label for="challenge-skill" class="mb-1">Skill</Label>
                <Input
                    id="challenge-skill"
                    bind:value={skill}
                    list="challenge-skills"
                    placeholder="Driving"
                />
                <datalist id="challenge-skills">
                    {#each skills as s}
                        <option value={s}></option>
                    {/each}
                </datalist>
            </div>
            <div class="sm:col-span-1">
                <Label for="challenge-order" class="mb-1">Order</Label>
                <Input id="challenge-order" type="number" bind:value={order} placeholder="1" />
            </div>
        </div>
        <div>
            <Label for="challenge-goal" class="mb-1">Goal</Label>
            <Textarea
                id="challenge-goal"
                rows={2}
                bind:value={goal}
                placeholder="Stop inside the 6 cm ring of target A, 4 out of 5 times, on Realistic."
            />
            <p class="text-xs text-gray-500 mt-1">
                Say what to do, how well, how often and on which realism, so it matches the check
                below.
            </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
                <Label for="challenge-field" class="mb-1">Field</Label>
                <Select id="challenge-field" items={fieldItems} bind:value={field} placeholder="" />
            </div>
            <div>
                <Label for="challenge-robot" class="mb-1">Robot</Label>
                <Select id="challenge-robot" items={robotItems} bind:value={robot} placeholder="" />
            </div>
            <div>
                <Label for="challenge-example" class="mb-1">Related example</Label>
                <Select
                    id="challenge-example"
                    items={exampleItems}
                    bind:value={example}
                    placeholder=""
                />
            </div>
        </div>

        <fieldset class="flex flex-col gap-2">
            <legend class="text-sm font-medium text-gray-900 mb-1">
                Hints <span class="text-gray-500 font-normal"
                    >(students see them one at a time; nudge, don't give the answer)</span
                >
            </legend>
            {#each Array.from(hints.keys()) as i}
                <div class="flex flex-row items-center gap-2">
                    <span
                        class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold"
                        >{i + 1}</span
                    >
                    <Input
                        size="sm"
                        bind:value={hints[i]}
                        placeholder="Use the measure tool to find how far the target is."
                        aria-label="Hint {i + 1}"
                    />
                    <button
                        type="button"
                        class="p-1 rounded text-red-600 hover:bg-red-50"
                        aria-label="Remove hint {i + 1}"
                        on:click={() => (hints = hints.toSpliced(i, 1))}
                        ><TrashBinOutline class="w-4 h-4" /></button
                    >
                </div>
            {/each}
            {#if hints.length < 10}
                <Button
                    size="sm"
                    color="light"
                    class="self-start"
                    on:click={() => (hints = [...hints, ''])}>+ Add a hint</Button
                >
            {/if}
        </fieldset>
    </form>

    <div class="flex flex-col gap-4 mt-2 border-t pt-4 [overflow-anchor:none]">
        <fieldset class="flex flex-col gap-2">
            <legend class="text-sm font-medium text-gray-900 mb-1">
                Check{field ? ` · on ${field.replace(/\.spk$/i, '')}` : ' · pick a field first'}
            </legend>
            {#if field}
                <CheckEditor bind:check {field} />
            {/if}
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
            <Button color="blue" disabled={saving} on:click={save}>Save challenge</Button>
        </div>
    </div>
</Modal>
