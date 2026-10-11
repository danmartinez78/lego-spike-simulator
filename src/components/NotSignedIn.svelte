<script lang="ts">
    // Strip at the top of the Lessons and Challenges windows for a student who
    // isn't signed in. Nothing is locked, so visitors and demos see everything.
    import { libraryStore } from '$lib/library';
    import { studentDialogOpen, studentStore } from '$lib/team';
</script>

{#if !$studentStore && $libraryStore.available}
    <div
        class="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
        role="status"
        data-testid="not-signed-in"
    >
        <p class="flex-1">
            <b>You're not signed in.</b> Your work stays on this computer only, and your coach can't
            see it.
        </p>
        <button
            class="self-start sm:self-auto rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-300"
            on:click={() => studentDialogOpen.set(true)}>Sign in</button
        >
    </div>
{/if}
