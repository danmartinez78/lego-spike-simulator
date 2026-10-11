<script lang="ts">
    // Coach page: a big look at a library field's mat, or the robot model
    // turning in 3D, without opening the simulator.
    import JSZip from 'jszip';
    import { Modal, Spinner } from 'flowbite-svelte';
    import RobotPreview from '$components/RobotPreview.svelte';
    import { entryTitle, fetchEntry } from '$lib/library';
    import { fetchAndResolveParts, getUnresolvedParts, loadModel } from '$lib/ldraw/components';
    import type { Model } from '$lib/ldraw/components';
    import type { CompiledModel } from '$lib/ldraw/gl';

    export let open = false;
    export let kind: 'scenes' | 'robots';
    export let name: string;

    let loading = false;
    let failed = '';
    let matUrl: string | undefined;
    let matSize = '';
    let robot: Model | undefined;
    let compiledRobot: CompiledModel | undefined;
    let missing = 0;
    let loaded = '';

    $: if (open && loaded != `${kind}|${name}`) load(kind, name);

    async function load(kind: 'scenes' | 'robots', name: string) {
        loaded = `${kind}|${name}`;
        loading = true;
        failed = '';
        robot = undefined;
        compiledRobot = undefined;
        if (matUrl) URL.revokeObjectURL(matUrl);
        matUrl = undefined;
        matSize = '';
        try {
            const blob = await fetchEntry(kind, name);
            if (kind == 'scenes') {
                const zip = await new JSZip().loadAsync(blob);
                const mat = zip.file('mat.jpg');
                const scene = zip.file('scene.json');
                if (scene) {
                    const json = JSON.parse(await scene.async('string'));
                    if (json.matWidth && json.matHeight) {
                        matSize = `${Math.round(json.matWidth / 10)} × ${Math.round(json.matHeight / 10)} cm`;
                    }
                }
                if (mat) matUrl = URL.createObjectURL(await mat.async('blob'));
                else failed = "This scene doesn't have a mat picture.";
            } else {
                const model = loadModel('main.ldr', await blob.text());
                if (getUnresolvedParts().length > 0) await fetchAndResolveParts();
                missing = getUnresolvedParts().length;
                robot = model;
            }
        } catch (e) {
            failed = `Couldn't open ${name}: ${(e as Error).message}`;
        }
        loading = false;
    }

    function size(model: CompiledModel | undefined) {
        if (!model) return '';
        const b = model.bbox;
        return `${Math.ceil(b.max.x - b.min.x)} × ${Math.ceil(b.max.z - b.min.z)} × ${Math.ceil(b.max.y - b.min.y)} mm`;
    }
</script>

<Modal
    title={entryTitle(name)}
    bind:open
    size="xl"
    outsideclose
    backdropClass="fixed inset-0 z-40 bg-gray-900 bg-opacity-50"
>
    {#if loading}
        <div class="flex flex-row gap-2 items-center text-gray-600 text-sm py-10 justify-center">
            <Spinner size="4" />
            {kind == 'robots' ? 'Loading the robot and its parts…' : 'Loading the mat…'}
        </div>
    {:else if failed}
        <p class="text-sm text-red-700">{failed}</p>
    {:else if kind == 'scenes' && matUrl}
        <img src={matUrl} alt="Mat for {entryTitle(name)}" class="w-full rounded-lg border" />
        {#if matSize}<p class="text-sm text-gray-600">Mat size {matSize}.</p>{/if}
    {:else if kind == 'robots' && robot}
        <div class="relative w-full h-[60vh] rounded-lg overflow-hidden bg-black">
            {#if compiledRobot}
                <div class="absolute right-0 top-0 text-white text-sm px-2 my-1">
                    {size(compiledRobot)}
                </div>
            {/if}
            <RobotPreview
                id="coach_robot_preview"
                class="w-full h-full"
                robotModel={robot}
                bind:compiledRobot
                enabled={open}
            />
        </div>
        {#if missing > 0}
            <p class="text-sm text-amber-700">
                {missing} part{missing == 1 ? '' : 's'} couldn't be found, so the model may have gaps.
            </p>
        {/if}
    {/if}
</Modal>
