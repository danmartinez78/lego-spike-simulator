<script lang="ts">
    // Topic for a lesson or an example: pick one the library already uses, or
    // type a new one. A plain <datalist> only suggests topics that match what is
    // already typed, so an edit form that starts filled in showed no choices.
    import { Input, Select } from 'flowbite-svelte';

    export let id: string;
    export let value = '';
    export let topics: string[] = [];
    export let placeholder = 'New topic';

    const NEW = '\u0000new';
    let choice = '';
    let typing = false;

    $: items = [
        ...[...new Set([...topics, ...(value && !typing ? [value] : [])])].map((t) => ({
            value: t,
            name: t
        })),
        { value: NEW, name: 'New topic…' }
    ];
    // Follow the value when the form is filled in for another lesson.
    $: if (!typing) choice = value;

    function picked() {
        if (choice === NEW) {
            typing = true;
            value = '';
        } else {
            typing = false;
            value = choice;
        }
    }
</script>

<Select {id} {items} bind:value={choice} on:change={picked} placeholder="Pick a topic" />
{#if typing}
    <Input id="{id}-new" class="mt-2" bind:value {placeholder} aria-label="New topic name" />
{/if}
