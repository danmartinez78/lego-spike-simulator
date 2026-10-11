<script lang="ts">
    // Printable sign-in cards, one per student, cut out along the dashed lines.
    // Only shown when printing.
    import { siteAddress, type Student } from '$lib/team';

    export let students: Student[] = [];

    $: site = siteAddress()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
</script>

<div class="hidden print:grid grid-cols-2 gap-0 text-black" data-testid="code-cards">
    {#each students as s (s.id)}
        <div
            class="border border-dashed border-gray-400 p-4 flex flex-col gap-1 break-inside-avoid"
        >
            <div class="text-xs uppercase tracking-wider text-gray-600">LEGO SPIKE Simulator</div>
            <div class="text-xl font-semibold">{s.name}</div>
            <div class="text-xs text-gray-600 mt-1">Your code</div>
            <div class="font-mono text-lg font-bold tracking-wider">{s.code}</div>
            <div class="text-xs text-gray-700 mt-1 leading-snug">
                On a laptop or tablet, go to <b>{site}</b>, press <b>Sign in</b> and type your code.
                Keep it to yourself, like a password.
            </div>
        </div>
    {/each}
</div>
