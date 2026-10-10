<script lang="ts">
    import { tick } from 'svelte';
    import { Modal } from 'flowbite-svelte';
    import { sceneStore } from '$lib/spike/scene';
    import { runBatch, type RunPath } from '$lib/spike/runs';
    import { realismStore, presetLabels, type PresetName } from '$lib/spike/realism';

    const colours = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6'];
    let canvas: HTMLCanvasElement | undefined;
    let spreadText = '';

    function endOf(path: RunPath) {
        return path.points[path.points.length - 1];
    }

    function describeSpread(paths: RunPath[]) {
        const ends = paths.map(endOf).filter((p) => p !== undefined);
        if (ends.length < 2) {
            return '';
        }
        let widest = 0;
        for (let i = 0; i < ends.length; i++) {
            for (let j = i + 1; j < ends.length; j++) {
                const dx = ends[i].x - ends[j].x;
                const dz = ends[i].z - ends[j].z;
                widest = Math.max(widest, Math.sqrt(dx * dx + dz * dz));
            }
        }
        const headings = ends.map((p) => p.rotation);
        let headingSpread = 0;
        for (const a of headings) {
            for (const b of headings) {
                let d = Math.abs(a - b) % 360;
                if (d > 180) {
                    d = 360 - d;
                }
                headingSpread = Math.max(headingSpread, d);
            }
        }
        return `End points are up to ${(widest / 10).toFixed(1)} cm apart, and final headings differ by up to ${headingSpread.toFixed(0)}°.`;
    }

    async function draw(paths: RunPath[], open: boolean) {
        if (!open) {
            return;
        }
        // The canvas only exists once the modal has rendered.
        await tick();
        if (!canvas) {
            return;
        }
        const scene = $sceneStore;
        const width = scene.mapWidth;
        const height = scene.mapHeight;
        const scale = Math.min(1100 / width, 600 / height);
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        ctx.fillStyle = '#d1d5db';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (scene.map) {
            const bitmap = await createImageBitmap(scene.map);
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        // The mat is centred on the origin, with +z towards the bottom of the image.
        const px = (x: number) => (x + width / 2) * scale;
        const pz = (z: number) => (z + height / 2) * scale;

        paths.forEach((path, index) => {
            if (path.points.length == 0) {
                return;
            }
            const colour = colours[index % colours.length];
            ctx.strokeStyle = colour;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            path.points.forEach((p, i) => {
                if (i == 0) {
                    ctx.moveTo(px(p.x), pz(p.z));
                } else {
                    ctx.lineTo(px(p.x), pz(p.z));
                }
            });
            ctx.stroke();

            const start = path.points[0];
            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.arc(px(start.x), pz(start.z), 4, 0, Math.PI * 2);
            ctx.fill();

            const end = endOf(path);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(px(end.x) - 7, pz(end.z) - 7);
            ctx.lineTo(px(end.x) + 7, pz(end.z) + 7);
            ctx.moveTo(px(end.x) + 7, pz(end.z) - 7);
            ctx.lineTo(px(end.x) - 7, pz(end.z) + 7);
            ctx.stroke();
        });
        spreadText = describeSpread(paths);
    }

    function modeName(preset: PresetName | 'custom') {
        return preset == 'custom' ? 'Custom' : presetLabels[preset];
    }

    $: draw($runBatch.completed, $runBatch.overlayOpen);
</script>

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    title="Robot paths over {$runBatch.completed.length} runs"
    size="xl"
    bind:open={$runBatch.overlayOpen}
>
    <div class="flex flex-col gap-2 items-center">
        <canvas bind:this={canvas} class="max-w-full border border-gray-300"></canvas>
        <div class="text-sm w-full">
            Realism: {modeName($realismStore.preset)}. Dots mark each start, crosses mark where each
            run ended.
            {spreadText}
        </div>
        <div class="flex flex-row flex-wrap gap-3 text-sm w-full">
            {#each $runBatch.completed as path, index}
                <span class="flex flex-row items-center gap-1">
                    <span
                        class="inline-block w-3 h-3 rounded-full"
                        style="background-color: {colours[index % colours.length]}"
                    ></span>
                    Run {index + 1}{path.seed ? ` (seed ${path.seed})` : ''}{path.timedOut
                        ? ', stopped at time limit'
                        : ''}
                </span>
            {/each}
        </div>
    </div>
</Modal>
