<script lang="ts">
    // A picture of a field's mat with a lesson check drawn on it.
    import { readMat, type MatPicture } from '$lib/library';
    import type { Check } from '$lib/spike/checks';
    import { drawCheck, drawMat, fitCanvas } from '$lib/spike/checkdraw';

    export let field: string | undefined;
    export let check: Partial<Check> | undefined;
    export let maxHeight = 240;

    let canvas: HTMLCanvasElement | undefined;
    let width = 0;
    let mat: MatPicture | undefined;
    let failed = false;

    async function load(name: string | undefined) {
        mat = undefined;
        failed = false;
        if (!name) return;
        try {
            mat = await readMat(name);
        } catch {
            failed = true;
        }
    }

    async function draw(...changes: unknown[]) {
        void changes;
        if (!canvas || !mat || width == 0) return;
        const fitted = fitCanvas(canvas, mat, width, maxHeight);
        if (!fitted) return;
        await drawMat(fitted.ctx, fitted.view, mat.map, 0.35);
        if (check) drawCheck(fitted.ctx, fitted.view, check);
    }

    $: load(field);
    $: draw(canvas, mat, width, check, maxHeight);
</script>

<div bind:clientWidth={width} class="w-full">
    {#if failed}
        <p class="text-xs text-gray-500">Couldn't load the field {field}.</p>
    {:else}
        <canvas bind:this={canvas} class="block rounded-md border border-gray-200"
            >The mat with the check's zones drawn on it.</canvas
        >
    {/if}
</div>
