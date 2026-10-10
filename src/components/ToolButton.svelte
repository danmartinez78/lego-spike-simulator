<script lang="ts">
    // A toolbar button with its icon (the slot) above a short text label.
    import { Button } from 'flowbite-svelte';

    export let label: string;
    export let color: 'light' | 'blue' | 'green' | 'red' | 'yellow' | 'alternative' = 'light';
    let klass = '';
    export { klass as class };
</script>

<Button
    {color}
    class="!px-1 !py-1 min-w-[3.5rem] flex flex-col items-center gap-0.5 {klass}"
    aria-label={label}
    {...$$restProps}
    on:click
>
    <div class="w-7 h-7 flex flex-col justify-center items-center">
        <slot />
    </div>
    <span class="text-[11px] leading-none font-normal whitespace-nowrap">{label}</span>
</Button>
