<script lang="ts">
    import { Modal } from 'flowbite-svelte';
    import { helpStore, closeBlockHelp, openGuide } from '$lib/help';
    import { helpFor, helpCategories, categoryOf } from '$lib/blockly/blockhelp';
    import { toolbox } from '$lib/blockly/toolbox';
    import BlockPreview from '$components/BlockPreview.svelte';

    const categories = helpCategories(toolbox);

    $: open = $helpStore.blockHelpType !== undefined;
    $: type = $helpStore.blockHelpType;
    $: help = type ? helpFor(type) : undefined;
    $: category = type ? categoryOf(type, categories) : undefined;

    // The card is shown while the store names a block. Every way of closing
    // (the X, clicking outside, Escape) clears the store.
    function close() {
        if ($helpStore.blockHelpType !== undefined) {
            closeBlockHelp();
        }
    }

    function keydown(event: KeyboardEvent) {
        if (open && event.key == 'Escape') {
            event.preventDefault();
            close();
        }
    }

    function showAll() {
        closeBlockHelp();
        openGuide('blocks');
    }

</script>

<svelte:window on:keydown={keydown} />

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    size="md"
    {open}
    on:close={close}
    outsideclose
>
    <svelte:fragment slot="header">
        <div class="flex flex-col gap-1">
            {#if category}
                <span
                    class="self-start text-xs font-semibold tracking-wide text-white rounded-full px-2 py-0.5"
                    style="background-color: {category.colour}">{category.name}</span
                >
            {/if}
            <h3 class="text-lg font-semibold text-gray-900">{help?.title ?? type}</h3>
        </div>
    </svelte:fragment>
    {#if type && help}
        <div class="flex flex-col gap-3 text-sm leading-relaxed text-gray-800">
            <BlockPreview {type} />
            <p class="text-base text-gray-900">{help.text}</p>
            {#if help.example}
                <div class="rounded-lg bg-blue-50 border border-blue-100 p-3">
                    <div class="text-xs font-semibold uppercase tracking-wide text-blue-800 mb-1">
                        Example
                    </div>
                    {help.example}
                </div>
            {/if}
            {#if help.tip}
                <div class="rounded-lg bg-amber-50 border border-amber-100 p-3">
                    <div class="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-1">
                        Watch out
                    </div>
                    {help.tip}
                </div>
            {/if}
            {#if help.sim}
                <div class="rounded-lg bg-gray-100 border border-gray-200 p-3">
                    <div class="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                        In the simulator
                    </div>
                    {help.sim}
                </div>
            {/if}
            <button class="self-start text-blue-700 hover:underline" on:click={showAll}>
                See every block in the reference →
            </button>
        </div>
    {/if}
</Modal>
