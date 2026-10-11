<script lang="ts">
    // Results of a batch of runs: every path drawn on the mat, how far the
    // runs spread out, an optional comparison with runs kept as "A", and the
    // result of the active challenge or lesson check.
    import { tick } from 'svelte';
    import * as Blockly from 'blockly/core';
    import { Button, Modal } from 'flowbite-svelte';
    import { sceneStore } from '$lib/spike/scene';
    import {
        runBatch,
        pinnedRuns,
        rerunRequest,
        summarise,
        type RunPath,
        type RunSummary
    } from '$lib/spike/runs';
    import { realismStore, presetLabels, type PresetName } from '$lib/spike/realism';
    import { activeChallenge, recordAttempt, type Challenge } from '$lib/spike/challenges';
    import {
        checkBlocks,
        checkRun,
        programBlockTypes,
        type BlockResult,
        type RunResult
    } from '$lib/spike/checks';
    import { drawCheck, drawMat, fitCanvas, px, pz, type MatView } from '$lib/spike/checkdraw';
    import { recordLessonCheck } from '$lib/lessons';

    const colourB = '#2563eb';
    const colourA = '#f59e0b';

    let canvas: HTMLCanvasElement | undefined;
    let wrapper: HTMLDivElement | undefined;
    let labelA = 'A';
    let recordedBatch: RunPath[] | undefined = undefined;
    let blocks: BlockResult = { ok: true, notes: [] };
    let shownRun = 0;

    $: paths = $runBatch.completed;
    $: summary = summarise(paths);
    $: pinned = $pinnedRuns;
    $: summaryA = pinned ? summarise(pinned.paths) : undefined;
    $: challenge = $activeChallenge;
    $: checks = challenge ? paths.map((p) => checkRun(challenge!.check, p)) : [];
    $: passes = blocks.ok ? checks.filter((c) => c.passed).length : 0;
    $: complete = challenge ? passes >= challenge.needed : false;
    $: shown = checks[shownRun];

    function modeName(preset: PresetName | 'custom' | string) {
        return preset in presetLabels ? presetLabels[preset as PresetName] : 'Custom';
    }

    function cm(mm: number) {
        return `${(mm / 10).toFixed(1)} cm`;
    }

    function comparison(a: RunSummary, b: RunSummary) {
        if (a.spread < 1 && b.spread < 1) {
            return 'Both sets of runs ended in the same place every time.';
        }
        if (Math.abs(a.spread - b.spread) < Math.max(5, 0.1 * Math.max(a.spread, b.spread))) {
            return 'Both programs are about as consistent as each other.';
        }
        const better = b.spread < a.spread ? 'This program (B)' : labelOf('A');
        const ratio = Math.max(a.spread, b.spread) / Math.max(1, Math.min(a.spread, b.spread));
        return `${better} ended ${ratio >= 10 ? 'more than 10' : ratio.toFixed(1)}× closer together.`;
    }

    function labelOf(which: 'A') {
        return pinned?.label && pinned.label != which ? `A (${pinned.label})` : which;
    }

    function keepAsA() {
        pinnedRuns.set({
            label: labelA.trim() || 'A',
            paths: paths.map((p) => ({ ...p, points: [...p.points] })),
            realism: $realismStore.preset
        });
    }

    function runAgain() {
        $runBatch.overlayOpen = false;
        rerunRequest.update((n) => n + 1);
    }

    // Once per batch: check the program's blocks and remember the result.
    function record(c: Challenge | undefined, batch: RunPath[], open: boolean) {
        if (!open || !c || batch.length == 0 || batch === recordedBatch) {
            return;
        }
        recordedBatch = batch;
        blocks = checkBlocks(c.check, programBlockTypes(Blockly.getMainWorkspace()));
        const results = batch.map((p) => checkRun(c.check, p));
        const passed = blocks.ok ? results.filter((x) => x.passed).length : 0;
        const firstFail = results.findIndex((r) => !r.passed);
        shownRun = firstFail < 0 ? 0 : firstFail;
        if (c.lesson) {
            recordLessonCheck(c.lesson, passed, c.needed);
        } else {
            recordAttempt(c, passed);
        }
    }

    function drawRun(
        ctx: CanvasRenderingContext2D,
        view: MatView,
        path: RunPath,
        colour: string,
        dashed: boolean,
        result: RunResult | undefined,
        highlight: boolean
    ) {
        if (path.points.length == 0) return;
        // For a line check, draw where the sensor went: that's what is checked.
        const line = result?.trail ?? path.points;
        ctx.strokeStyle = colour;
        ctx.globalAlpha = highlight ? 1 : 0.6;
        ctx.lineWidth = highlight ? 3.5 : 2;
        ctx.setLineDash(dashed ? [7, 5] : []);
        ctx.beginPath();
        line.forEach((p, i) =>
            i == 0
                ? ctx.moveTo(px(view, p.x), pz(view, p.z))
                : ctx.lineTo(px(view, p.x), pz(view, p.z))
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        const start = path.points[0];
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(px(view, start.x), pz(view, start.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
        const end = path.points[path.points.length - 1];
        const mark = result ? (result.passed && blocks.ok ? '#16a34a' : '#dc2626') : colour;
        ctx.strokeStyle = mark;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const ex = px(view, end.x);
        const ez = pz(view, end.z);
        ctx.moveTo(ex - 6, ez - 6);
        ctx.lineTo(ex + 6, ez + 6);
        ctx.moveTo(ex + 6, ez - 6);
        ctx.lineTo(ex - 6, ez + 6);
        ctx.stroke();
        if (highlight && result?.leftLine) {
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(px(view, result.leftLine.x), pz(view, result.leftLine.z), 9, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    async function draw(...changes: unknown[]) {
        if (changes.length == 0 || !$runBatch.overlayOpen) return;
        await tick();
        if (!canvas || !wrapper) return;
        const scene = $sceneStore;
        const fitted = fitCanvas(
            canvas,
            { width: scene.mapWidth, height: scene.mapHeight },
            wrapper.clientWidth,
            520
        );
        if (!fitted) return;
        const { ctx, view } = fitted;
        await drawMat(ctx, view, scene.map, 0.45);
        if (challenge) drawCheck(ctx, view, challenge.check);
        if (pinned) {
            for (const path of pinned.paths)
                drawRun(ctx, view, path, colourA, true, undefined, false);
        }
        paths.forEach((path, i) => {
            if (i != shownRun || !challenge) {
                drawRun(ctx, view, path, colourB, false, checks[i], !challenge);
            }
        });
        if (challenge && paths[shownRun]) {
            drawRun(ctx, view, paths[shownRun], colourB, false, checks[shownRun], true);
        }
    }

    $: record(challenge, paths, $runBatch.overlayOpen);
    $: draw($runBatch.overlayOpen, paths, pinned, challenge, $sceneStore, shownRun, blocks);
</script>

<svelte:window on:resize={() => draw(true)} />

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    size="xl"
    bind:open={$runBatch.overlayOpen}
>
    <svelte:fragment slot="header">
        <div class="flex flex-row items-center gap-3">
            <h3 class="text-lg font-semibold text-gray-900">
                {paths.length} run{paths.length == 1 ? '' : 's'}
            </h3>
            <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900"
                >{modeName($realismStore.preset)}</span
            >
            {#if challenge}
                <span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-900"
                    >{challenge.lesson ? 'Lesson check' : 'Challenge'}: {challenge.title}</span
                >
            {/if}
        </div>
    </svelte:fragment>
    <div class="flex flex-col lg:flex-row gap-4 text-sm">
        <div class="flex-1 min-w-0 flex flex-col gap-2">
            <div bind:this={wrapper} class="w-full">
                <canvas bind:this={canvas} class="block rounded-lg border border-gray-300"></canvas>
            </div>
            <div class="flex flex-row flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                <span class="flex items-center gap-1"
                    ><span class="inline-block w-4 h-0.5" style="background-color: {colourB}"
                    ></span>
                    {pinned ? 'B: these runs' : 'These runs'}</span
                >
                {#if pinned}
                    <span class="flex items-center gap-1"
                        ><span
                            class="inline-block w-4 border-t-2 border-dashed"
                            style="border-color: {colourA}"
                        ></span>
                        {labelOf('A')}</span
                    >
                {/if}
                <span>● start · ✕ end</span>
                {#if challenge?.check.follow}
                    <span>Lines show where the colour sensor went</span>
                {/if}
            </div>
        </div>
        <div class="lg:w-72 shrink-0 flex flex-col gap-3">
            {#if challenge}
                <div
                    class="rounded-lg border p-3 {complete
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-200 bg-gray-50'}"
                >
                    <div class="font-semibold {complete ? 'text-green-800' : 'text-gray-800'}">
                        {complete
                            ? challenge.lesson
                                ? '🎉 Check passed!'
                                : '🎉 Challenge complete!'
                            : 'Not yet'}
                    </div>
                    <div class="mt-1">
                        {passes} of {paths.length} runs passed. You need {challenge.needed}.
                    </div>
                    {#if !blocks.ok}
                        <ul class="mt-2 text-red-700 font-medium">
                            {#each blocks.notes as note}
                                <li>✗ {note}</li>
                            {/each}
                        </ul>
                    {:else if challenge.check.blocks}
                        <div class="mt-2 text-green-800">✓ Your program uses the right blocks</div>
                    {/if}
                    <div class="flex flex-row gap-1 mt-2" role="group" aria-label="Runs">
                        {#each checks as check, i}
                            <button
                                class="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold text-white {check.passed &&
                                blocks.ok
                                    ? 'bg-green-600'
                                    : 'bg-red-600'} {i == shownRun
                                    ? 'ring-2 ring-offset-1 ring-blue-500'
                                    : ''}"
                                aria-label="Run {i + 1}, {check.passed ? 'passed' : 'failed'}"
                                aria-pressed={i == shownRun}
                                on:click={() => (shownRun = i)}>{i + 1}</button
                            >
                        {/each}
                    </div>
                    {#if shown}
                        <div class="text-xs text-gray-500 mt-2">Run {shownRun + 1}:</div>
                        <ul class="mt-1 flex flex-col gap-1">
                            {#each shown.rules as r}
                                <li class="flex flex-row gap-1.5 items-start">
                                    <span
                                        class="shrink-0 font-bold {r.ok
                                            ? 'text-green-700'
                                            : 'text-red-700'}">{r.ok ? '✓' : '✗'}</span
                                    >
                                    <span>{r.note}</span>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>
            {/if}
            <div class="rounded-lg border border-gray-200 p-3 flex flex-col gap-1">
                <div class="font-semibold text-gray-800 flex items-center gap-2">
                    <span
                        class="inline-block w-3 h-3 rounded-full"
                        style="background-color: {colourB}"
                    ></span>
                    {pinned ? 'B: these runs' : 'These runs'}
                </div>
                <div>End points spread: <b>{cm(summary.spread)}</b></div>
                <div>Headings spread: <b>{summary.headingSpread.toFixed(0)}°</b></div>
            </div>
            {#if pinned && summaryA}
                <div
                    class="rounded-lg border border-amber-200 bg-amber-50/50 p-3 flex flex-col gap-1"
                >
                    <div class="font-semibold text-gray-800 flex items-center gap-2">
                        <span
                            class="inline-block w-3 h-3 rounded-full"
                            style="background-color: {colourA}"
                        ></span>
                        {labelOf('A')}
                        <span class="text-xs font-normal text-gray-500"
                            >· {modeName(pinned.realism)}</span
                        >
                    </div>
                    <div>End points spread: <b>{cm(summaryA.spread)}</b></div>
                    <div>Headings spread: <b>{summaryA.headingSpread.toFixed(0)}°</b></div>
                    <div class="mt-1 text-gray-600">
                        Average end points are {cm(
                            Math.hypot(
                                summaryA.centre.x - summary.centre.x,
                                summaryA.centre.z - summary.centre.z
                            )
                        )} apart.
                    </div>
                </div>
                <div
                    class="rounded-lg bg-blue-50 border border-blue-100 p-3 font-medium text-blue-900"
                >
                    {comparison(summaryA, summary)}
                </div>
            {/if}
            <div class="flex flex-col gap-2">
                <Button size="sm" color="blue" on:click={runAgain}>Run ×5 again</Button>
                {#if !pinned}
                    <div class="flex flex-row gap-2 items-center">
                        <input
                            class="flex-1 min-w-0 rounded-md border border-gray-300 px-2 py-1 text-sm"
                            placeholder="Name, e.g. without gyro"
                            bind:value={labelA}
                        />
                        <Button size="sm" color="light" on:click={keepAsA}>Keep as A</Button>
                    </div>
                    <p class="text-xs text-gray-500">
                        Keep these runs as A, change your program, then run ×5 again to compare.
                    </p>
                {:else}
                    <div class="flex flex-row gap-2">
                        <Button size="xs" color="light" class="flex-1" on:click={keepAsA}
                            >Make these the new A</Button
                        >
                        <Button
                            size="xs"
                            color="light"
                            class="flex-1"
                            on:click={() => pinnedRuns.set(undefined)}>Stop comparing</Button
                        >
                    </div>
                {/if}
            </div>
        </div>
    </div>
</Modal>
