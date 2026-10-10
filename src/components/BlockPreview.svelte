<script lang="ts">
    // Draws one block, read-only, the way it looks in the code panel.
    import { onDestroy, onMount } from 'svelte';
    import * as Blockly from 'blockly/core';

    export let type: string;

    let container: HTMLDivElement;
    let workspace: Blockly.WorkspaceSvg | undefined;
    let failed = false;
    let height = 60;

    function draw(blockType: string) {
        if (!workspace) {
            return;
        }
        workspace.clear();
        failed = false;
        try {
            const block = Blockly.serialization.blocks.append(
                { type: blockType, x: 0, y: 0 },
                workspace
            ) as Blockly.BlockSvg;
            const box = block.getHeightWidth();
            height = Math.min(240, Math.max(44, Math.ceil(box.height * workspace.scale) + 28));
            setTimeout(() => {
                if (workspace) {
                    Blockly.svgResize(workspace);
                    // Put the block's top-left corner a little inside the frame.
                    const bounds = block.getBoundingRectangle();
                    workspace.translate(
                        -bounds.left * workspace.scale + 14,
                        -bounds.top * workspace.scale + 14
                    );
                }
            }, 0);
        } catch {
            failed = true;
        }
    }

    onMount(() => {
        try {
            workspace = Blockly.inject(container, {
                readOnly: true,
                renderer: 'spike_renderer',
                theme: 'spike',
                media: 'blockly/media/',
                scrollbars: false,
                zoom: { startScale: 0.85, controls: false, wheel: false },
                move: { scrollbars: false, drag: false, wheel: false }
            });
            draw(type);
        } catch {
            failed = true;
        }
    });

    onDestroy(() => {
        workspace?.dispose();
        workspace = undefined;
    });

    $: if (workspace) draw(type);
</script>

<div
    class="w-full rounded-lg bg-gray-50 border border-gray-200 overflow-hidden"
    class:hidden={failed}
    style="height: {height}px"
>
    <div bind:this={container} class="w-full h-full pointer-events-none" />
</div>
