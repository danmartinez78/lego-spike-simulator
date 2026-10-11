<script lang="ts">
    // One lesson in the Lessons window's list, with its New/Started/Done badge.
    import type { Lesson } from '$lib/library';
    import type { LessonStatus } from '$lib/lessons';

    export let lesson: Lesson;
    export let status: LessonStatus;
    export let selected = false;

    const badges = {
        new: { text: 'New', css: 'bg-gray-100 text-gray-600' },
        started: { text: 'Started', css: 'bg-amber-100 text-amber-800' },
        done: { text: 'Done', css: 'bg-green-100 text-green-800' }
    };

    // Show the play symbol as text rather than as an emoji.
    function text(value: string | undefined) {
        return (value ?? '').replace(/▶️?/g, '▶︎');
    }

    $: badge = badges[status];
</script>

<button
    class="text-left rounded-lg px-3 py-2 border transition-colors {selected
        ? 'bg-white border-gray-300 shadow-sm'
        : 'border-transparent hover:bg-white hover:border-gray-200'}"
    on:click
>
    <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-900 flex-1">{lesson.title}</span>
        <span class="text-[11px] rounded-full px-2 py-0.5 {badge.css}">{badge.text}</span>
    </div>
    {#if lesson.summary}
        <div class="text-xs text-gray-500 leading-snug mt-0.5 line-clamp-2">
            {text(lesson.summary)}
        </div>
    {/if}
</button>
