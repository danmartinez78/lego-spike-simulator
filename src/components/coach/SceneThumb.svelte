<script context="module" lang="ts">
    // Mat images pulled out of scene files, kept while the page is open.
    const cache = new Map<string, Promise<string | undefined>>();
</script>

<script lang="ts">
    // Small picture of a library scene's mat, read from mat.jpg inside the .spk zip.
    import JSZip from 'jszip';
    import { fetchEntry } from '$lib/library';

    export let name: string;
    export let modified: string;

    let src: string | undefined;
    let failed = false;

    function matImage(name: string, modified: string) {
        const key = `${name}|${modified}`;
        let result = cache.get(key);
        if (!result) {
            result = (async () => {
                const zip = await new JSZip().loadAsync(await fetchEntry('scenes', name));
                const mat = zip.file('mat.jpg');
                return mat ? URL.createObjectURL(await mat.async('blob')) : undefined;
            })();
            cache.set(key, result);
        }
        return result;
    }

    $: matImage(name, modified).then(
        (url) => {
            src = url;
            failed = !url;
        },
        () => (failed = true)
    );
</script>

<div
    class="w-24 h-16 shrink-0 rounded-md border border-gray-200 bg-gray-100 overflow-hidden flex items-center justify-center"
>
    {#if src}
        <img {src} alt="Mat for {name}" class="w-full h-full object-cover" />
    {:else}
        <span class="text-xs text-gray-400">{failed ? 'No mat' : '…'}</span>
    {/if}
</div>
