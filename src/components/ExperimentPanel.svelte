<script lang="ts">
    // Step-by-step experiment: how consistent is the program, and is a
    // changed version better? Runs the program 5 times with real-world
    // errors, keeps one set of runs as Program A, and compares.
    import { Button } from 'flowbite-svelte';
    import { CloseOutline } from 'flowbite-svelte-icons';
    import {
        runBatch,
        pinnedRuns,
        requestRuns,
        summarise,
        spreadWords,
        headingWords,
        compareWords
    } from '$lib/spike/runs';
    import {
        realismStore,
        applyPreset,
        realismName,
        presetDescriptions,
        type PresetName
    } from '$lib/spike/realism';

    export let open = false;
    export let running = false;

    const levels: { name: PresetName; text: string }[] = (
        ['ideal', 'realistic', 'challenging'] as PresetName[]
    ).map((name) => ({ name, text: presetDescriptions[name] }));

    let nameA = '';

    // The latest finished experiment, if the last batch was one.
    $: latest =
        $runBatch.purpose == 'experiment' && !$runBatch.active && $runBatch.completed.length > 0
            ? $runBatch.completed
            : undefined;
    $: summary = latest ? summarise(latest) : undefined;
    $: pinned = $pinnedRuns;
    $: summaryA = pinned ? summarise(pinned.paths) : undefined;
    // Runs finished since Program A was saved count as Program B.
    $: isB = !!(pinned && latest && latest !== pinned.source);
    $: step = !summary ? 1 : !pinned ? 2 : 3;

    function keepAsA() {
        if (!latest) return;
        pinnedRuns.set({
            label: nameA.trim() || 'Program A',
            paths: latest.map((p) => ({ ...p, points: [...p.points] })),
            realism: $realismStore.preset,
            source: latest
        });
        nameA = '';
    }

    function startOver() {
        pinnedRuns.set(undefined);
    }
</script>

{#if open}
    <section
        class="absolute top-2 right-2 z-20 w-80 max-w-[calc(100%-1rem)] max-h-[calc(100%-1rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white/95 shadow-lg p-4 flex flex-col gap-3 text-sm text-gray-800"
        aria-label="Experiment"
    >
        <div class="flex flex-row items-start gap-2">
            <div class="flex-1">
                <h3 class="text-base font-semibold text-gray-900">Experiment</h3>
                <p class="text-gray-600">How consistent is your program?</p>
            </div>
            <button
                class="p-1 rounded hover:bg-gray-100"
                aria-label="Close the experiment"
                on:click={() => (open = false)}><CloseOutline class="w-4 h-4" /></button
            >
        </div>

        <div class="flex flex-col gap-1">
            <div class="text-xs font-semibold uppercase tracking-wider text-gray-500">Robot</div>
            <div class="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Realism">
                {#each levels as level}
                    <button
                        role="radio"
                        aria-checked={$realismStore.preset == level.name}
                        class="rounded-lg border px-2 py-1.5 text-xs font-medium {$realismStore.preset ==
                        level.name
                            ? 'border-blue-600 bg-blue-50 text-blue-900'
                            : 'border-gray-200 hover:bg-gray-50'}"
                        disabled={running}
                        on:click={() => applyPreset(level.name)}>{realismName(level.name)}</button
                    >
                {/each}
            </div>
            <p class="text-xs text-gray-600">
                {presetDescriptions[$realismStore.preset]}
            </p>
        </div>

        <ol class="flex flex-col gap-3">
            <li class="flex flex-row gap-2 {step == 1 ? '' : 'opacity-90'}">
                <span
                    class="shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center {step >
                    1
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-600 text-white'}">{step > 1 ? '✓' : '1'}</span
                >
                <div class="flex-1 flex flex-col gap-1.5">
                    <div class="font-medium">Run your program 5 times</div>
                    {#if summary && !isB}
                        <p>{spreadWords(summary)} {headingWords(summary)}</p>
                    {:else if !pinned}
                        <p class="text-gray-600">
                            Each run starts a little differently, just like a real robot.
                        </p>
                    {/if}
                    {#if !pinned}
                        <Button
                            size="sm"
                            color={summary ? 'light' : 'blue'}
                            disabled={running}
                            on:click={() => requestRuns('experiment')}
                            >{summary ? 'Run 5 times again' : 'Run 5 times'}</Button
                        >
                    {/if}
                </div>
            </li>

            <li class="flex flex-row gap-2 {step < 2 ? 'opacity-50' : ''}">
                <span
                    class="shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center {step >
                    2
                        ? 'bg-green-600 text-white'
                        : step == 2
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700'}">{step > 2 ? '✓' : '2'}</span
                >
                <div class="flex-1 flex flex-col gap-1.5">
                    <div class="font-medium">Save it as Program A</div>
                    {#if pinned && summaryA}
                        <p>
                            <span class="inline-block w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                            <b>{pinned.label}</b>: {spreadWords(summaryA)}
                        </p>
                    {:else if step == 2}
                        <input
                            class="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                            placeholder="Name it, e.g. without gyro"
                            maxlength="30"
                            bind:value={nameA}
                        />
                        <Button size="sm" color="blue" disabled={running} on:click={keepAsA}
                            >Save as Program A</Button
                        >
                    {:else}
                        <p class="text-gray-600">Then you can try to beat it.</p>
                    {/if}
                </div>
            </li>

            <li class="flex flex-row gap-2 {step < 3 ? 'opacity-50' : ''}">
                <span
                    class="shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center {step ==
                    3
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700'}">3</span
                >
                <div class="flex-1 flex flex-col gap-1.5">
                    <div class="font-medium">Change your program and try to beat it</div>
                    {#if step == 3}
                        {#if isB && summary && summaryA && pinned}
                            <p>
                                <span class="inline-block w-2.5 h-2.5 rounded-full bg-blue-600"
                                ></span>
                                <b>Program B</b>: {spreadWords(summary)}
                            </p>
                            <p
                                class="rounded-lg bg-blue-50 border border-blue-100 p-2 font-medium text-blue-900"
                            >
                                {compareWords(summaryA, summary, pinned.label, 'Program B')}
                            </p>
                        {:else}
                            <p class="text-gray-600">
                                For example, steer with the gyro or stop on a line. Then run Program
                                B.
                            </p>
                        {/if}
                        <Button
                            size="sm"
                            color="blue"
                            disabled={running}
                            on:click={() => requestRuns('experiment')}
                            >{isB ? 'Run Program B again' : 'Run Program B 5 times'}</Button
                        >
                        <button
                            class="self-start text-xs text-blue-700 hover:underline"
                            on:click={startOver}>Start a new experiment</button
                        >
                    {/if}
                </div>
            </li>
        </ol>
    </section>
{/if}
