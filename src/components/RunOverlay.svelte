<script lang="ts">
    // Results of a batch of runs: every path drawn on the mat, how far the
    // runs spread out, an optional comparison with runs kept as "A", and the
    // result of the active challenge.
    import { tick } from 'svelte';
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
    import {
        activeChallenge,
        checkRun,
        recordAttempt,
        type Challenge,
        type RunCheck
    } from '$lib/spike/challenges';

    const colourB = '#2563eb';
    const colourA = '#f59e0b';

    let canvas: HTMLCanvasElement | undefined;
    let wrapper: HTMLDivElement | undefined;
    let labelA = 'A';
    let recordedBatch: RunPath[] | undefined = undefined;

    $: paths = $runBatch.completed;
    $: summary = summarise(paths);
    $: pinned = $pinnedRuns;
    $: summaryA = pinned ? summarise(pinned.paths) : undefined;
    $: challenge = $activeChallenge;
    $: checks = challenge ? paths.map((p) => checkRun(challenge!, p)) : [];
    $: passes = checks.filter((c) => c.passed).length;
    $: complete = challenge ? passes >= challenge.needed : false;

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

    function record(c: Challenge | undefined, batch: RunPath[], open: boolean) {
        if (!open || !c || batch.length == 0 || batch === recordedBatch) {
            return;
        }
        recordedBatch = batch;
        recordAttempt(c, batch.map((p) => checkRun(c, p)).filter((x) => x.passed).length);
    }

    async function draw(...changes: unknown[]) {
        if (changes.length == 0 || !$runBatch.overlayOpen) return;
        await tick();
        if (!canvas || !wrapper) return;
        const scene = $sceneStore;
        const width = scene.mapWidth;
        const height = scene.mapHeight;
        const scale = Math.min(wrapper.clientWidth / width, 520 / height);
        const ratio = window.devicePixelRatio || 1;
        const w = Math.round(width * scale);
        const h = Math.round(height * scale);
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(0, 0, w, h);
        if (scene.map) {
            const bitmap = await createImageBitmap(scene.map);
            ctx.drawImage(bitmap, 0, 0, w, h);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fillRect(0, 0, w, h);
        }
        const px = (x: number) => (x + width / 2) * scale;
        const pz = (z: number) => (z + height / 2) * scale;

        // Challenge target
        if (challenge) {
            const t = challenge.target;
            ctx.fillStyle = complete ? 'rgba(22, 163, 74, 0.22)' : 'rgba(22, 163, 74, 0.14)';
            ctx.strokeStyle = '#16a34a';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            if (t.kind == 'circle') {
                ctx.arc(px(t.x), pz(t.z), t.radius * scale, 0, Math.PI * 2);
            } else {
                ctx.rect(
                    px(Math.min(t.x1, t.x2)),
                    pz(Math.min(t.z1, t.z2)),
                    Math.abs(t.x2 - t.x1) * scale,
                    Math.abs(t.z2 - t.z1) * scale
                );
            }
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);
        }

        function drawSet(set: RunPath[], colour: string, dashed: boolean, runChecks?: RunCheck[]) {
            set.forEach((path, index) => {
                if (path.points.length == 0) return;
                ctx!.strokeStyle = colour;
                ctx!.globalAlpha = 0.85;
                ctx!.lineWidth = 2.5;
                ctx!.setLineDash(dashed ? [7, 5] : []);
                ctx!.beginPath();
                path.points.forEach((p, i) =>
                    i == 0 ? ctx!.moveTo(px(p.x), pz(p.z)) : ctx!.lineTo(px(p.x), pz(p.z))
                );
                ctx!.stroke();
                ctx!.setLineDash([]);
                ctx!.globalAlpha = 1;
                const start = path.points[0];
                ctx!.fillStyle = colour;
                ctx!.beginPath();
                ctx!.arc(px(start.x), pz(start.z), 3.5, 0, Math.PI * 2);
                ctx!.fill();
                const end = path.points[path.points.length - 1];
                const mark = runChecks
                    ? runChecks[index]?.passed
                        ? '#16a34a'
                        : '#dc2626'
                    : colour;
                ctx!.strokeStyle = mark;
                ctx!.lineWidth = 3;
                ctx!.beginPath();
                ctx!.moveTo(px(end.x) - 6, pz(end.z) - 6);
                ctx!.lineTo(px(end.x) + 6, pz(end.z) + 6);
                ctx!.moveTo(px(end.x) + 6, pz(end.z) - 6);
                ctx!.lineTo(px(end.x) - 6, pz(end.z) + 6);
                ctx!.stroke();
            });
        }
        if (pinned) drawSet(pinned.paths, colourA, true);
        drawSet(paths, colourB, false, challenge ? checks : undefined);
    }

    $: record(challenge, paths, $runBatch.overlayOpen);
    $: draw($runBatch.overlayOpen, paths, pinned, challenge, $sceneStore);
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
                    >Challenge: {challenge.title}</span
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
                {#if challenge}
                    <span class="flex items-center gap-1"
                        ><span
                            class="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-green-600 bg-green-100"
                        ></span> target</span
                    >
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
                        {complete ? '🎉 Challenge complete!' : 'Not yet'}
                    </div>
                    <div class="mt-1">
                        {passes} of {paths.length} runs passed. You need {challenge.needed}.
                    </div>
                    <div class="flex flex-row gap-1 mt-2">
                        {#each checks as check, i}
                            <span
                                class="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold text-white {check.passed
                                    ? 'bg-green-600'
                                    : 'bg-red-600'}"
                                title={check.passed
                                    ? `Run ${i + 1} passed`
                                    : check.inTarget
                                      ? `Run ${i + 1}: heading ${Math.round(check.heading)}°`
                                      : `Run ${i + 1}: missed by ${cm(check.miss)}`}>{i + 1}</span
                            >
                        {/each}
                    </div>
                    {#if !complete}
                        <div class="text-xs text-gray-600 mt-2">
                            {#if checks.some((c) => !c.inTarget)}
                                Closest miss: {cm(
                                    Math.min(
                                        ...checks.filter((c) => !c.inTarget).map((c) => c.miss)
                                    )
                                )}.
                            {/if}
                            {#if checks.some((c) => c.inTarget && !c.headingOk)}
                                Some runs reached the target but faced the wrong way.
                            {/if}
                            Hover a number to see that run.
                        </div>
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
