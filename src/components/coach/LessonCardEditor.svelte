<script lang="ts">
    // Form for the lesson card shown with an example program in the Examples window.
    import { createEventDispatcher } from 'svelte';
    import { Button, Input, Label, Modal, Select, Textarea } from 'flowbite-svelte';
    import type { LessonCard } from '$lib/library';

    export let open = false;
    export let program = '';
    export let card: LessonCard | undefined = undefined;
    export let scenes: string[] = [];
    export let topics: string[] = [];
    export let saving = false;

    const dispatch = createEventDispatcher<{ save: LessonCard }>();

    let title = '';
    let topic = '';
    let order = '';
    let summary = '';
    let what = '';
    let why = '';
    let tries = '';
    let scene = '';
    let problem = '';

    // Fill the form each time it opens for a program.
    $: if (open) fill(program, card);

    function fill(program: string, card: LessonCard | undefined) {
        title = card?.title ?? program.replace(/\.llsp3$/i, '').replace(/^\d+\s+/, '');
        topic = card?.topic ?? '';
        order = card?.order !== undefined ? String(card.order) : '';
        summary = card?.summary ?? '';
        what = card?.what ?? '';
        why = card?.why ?? '';
        tries = (card?.try ?? []).join('\n');
        scene = card?.scene ?? '';
        problem = '';
    }

    function save() {
        if (title.trim().length == 0) {
            problem = 'Give the lesson a title.';
            return;
        }
        if (topic.trim().length == 0) {
            problem = 'Pick or type a topic, like Basics or Sensors.';
            return;
        }
        const number = order.trim().length > 0 ? Number(order) : undefined;
        if (number !== undefined && !Number.isFinite(number)) {
            problem = 'Order must be a number.';
            return;
        }
        problem = '';
        // Keep any fields this form doesn't know about.
        const result: LessonCard = {
            ...(card ?? {}),
            title: title.trim(),
            topic: topic.trim(),
            summary: summary.trim(),
            what: what.trim(),
            why: why.trim(),
            try: tries
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
        };
        if (number !== undefined) result.order = number;
        else delete result.order;
        if (scene) result.scene = scene;
        else delete result.scene;
        dispatch('save', result);
    }

    $: sceneItems = [
        { value: '', name: 'No field' },
        ...scenes.map((s) => ({ value: s, name: s.replace(/\.spk$/i, '') }))
    ];
</script>

<Modal
    title={card ? 'Edit lesson card' : 'Add a lesson card'}
    bind:open
    size="lg"
    backdropClass="fixed inset-0 z-40 bg-gray-900 bg-opacity-50"
>
    <form class="flex flex-col gap-4" on:submit|preventDefault={save}>
        <p class="text-sm text-gray-600 -mt-2">
            For <b>{program}</b>. Students see this card in the simulator's Examples window.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div class="sm:col-span-2">
                <Label for="card-title" class="mb-1">Title</Label>
                <Input id="card-title" bind:value={title} placeholder="Drive a square" />
            </div>
            <div>
                <Label for="card-topic" class="mb-1">Topic</Label>
                <Input id="card-topic" bind:value={topic} list="card-topics" placeholder="Basics" />
                <datalist id="card-topics">
                    {#each topics as t}
                        <option value={t}></option>
                    {/each}
                </datalist>
            </div>
            <div>
                <Label for="card-order" class="mb-1">Order in topic</Label>
                <Input id="card-order" type="number" bind:value={order} placeholder="1" />
            </div>
        </div>
        <div>
            <Label for="card-summary" class="mb-1">One-line summary</Label>
            <Input
                id="card-summary"
                bind:value={summary}
                placeholder="Drive 30 cm, turn right, and repeat four times."
            />
        </div>
        <div>
            <Label for="card-what" class="mb-1">What it does</Label>
            <Textarea id="card-what" rows={3} bind:value={what} />
        </div>
        <div>
            <Label for="card-why" class="mb-1">Why it works</Label>
            <Textarea id="card-why" rows={3} bind:value={why} />
        </div>
        <div>
            <Label for="card-try" class="mb-1">Things to try (one per line)</Label>
            <Textarea id="card-try" rows={4} bind:value={tries} />
        </div>
        <div>
            <Label for="card-scene" class="mb-1">Practice field</Label>
            <Select id="card-scene" items={sceneItems} bind:value={scene} placeholder="" />
            <p class="text-xs text-gray-500 mt-1">
                Students get a button to load this field with the example.
            </p>
        </div>
        {#if problem}
            <p class="text-sm text-red-700" role="alert">{problem}</p>
        {/if}
        <div class="flex flex-row gap-2 justify-end">
            <Button color="light" on:click={() => (open = false)}>Cancel</Button>
            <Button type="submit" color="blue" disabled={saving}>Save card</Button>
        </div>
    </form>
</Modal>
