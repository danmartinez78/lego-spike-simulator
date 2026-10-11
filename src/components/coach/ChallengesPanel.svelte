<script lang="ts">
    // Coach page: the challenge cards students find in the code panel's
    // Challenges window. They're built into the simulator for now.
    import SceneThumb from '$components/coach/SceneThumb.svelte';
    import { libraryStore } from '$lib/library';
    import { challenges } from '$lib/spike/challenges';

    const levels = ['', 'Starter', 'Getting there', 'Tricky'];

    $: scenes = new Map($libraryStore.index.scenes.map((e) => [e.name, e]));
    $: lessonsFor = (id: string) =>
        $libraryStore.index.lessons.filter((l) => l.lesson?.challenge == id);
</script>

<section class="flex flex-col gap-3">
    <div>
        <h2 class="text-lg font-semibold">Challenges</h2>
        <p class="text-gray-600 text-sm">
            Short goals students try from the Challenges button in the code panel. The simulator
            checks them automatically over five runs. Unlike lessons, there are no steps: just the
            goal, the field and a few hints.
        </p>
    </div>
    <div
        class="rounded-lg px-4 py-2 text-sm bg-blue-50 text-blue-900 border border-blue-200"
        role="note"
    >
        These {challenges.length} challenges are built into the simulator for now. Making and editing
        your own here, by placing the target on the mat, is coming next.
    </div>

    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <ul class="divide-y divide-gray-200">
            {#each challenges as c (c.id)}
                {@const scene = scenes.get(c.field)}
                {@const lessons = lessonsFor(c.id)}
                <li class="flex flex-row flex-wrap items-start gap-3 px-4 py-3">
                    {#if scene}
                        <SceneThumb name={scene.name} modified={scene.modified} />
                    {/if}
                    <div class="flex-1 min-w-[12rem] flex flex-col gap-1">
                        <div class="flex flex-row flex-wrap items-center gap-2">
                            <span class="font-medium">{c.title}</span>
                            {#if c.level}
                                <span
                                    class="text-xs font-medium rounded-full px-2 py-0.5 bg-gray-100 text-gray-700"
                                    >{levels[c.level]}</span
                                >
                            {/if}
                            {#if c.skill}
                                <span
                                    class="text-xs font-medium rounded-full px-2 py-0.5 bg-blue-100 text-blue-800"
                                    >{c.skill}</span
                                >
                            {/if}
                            {#if !scene}
                                <span
                                    class="text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-800"
                                    >Field missing from the library</span
                                >
                            {/if}
                        </div>
                        <p class="text-sm text-gray-700">{c.goal}</p>
                        <p class="text-sm text-gray-500">
                            {[
                                c.field,
                                `${c.needed} of 5 runs must pass`,
                                `${c.realism} realism`,
                                `${c.hints.length} hint${c.hints.length == 1 ? '' : 's'}`,
                                c.example ? `example ${c.example}` : ''
                            ]
                                .filter((x) => x)
                                .join(' · ')}
                        </p>
                        {#if lessons.length > 0}
                            <p class="text-sm text-gray-500">
                                Ends {lessons.length == 1 ? 'the lesson' : 'the lessons'}
                                {lessons.map((l) => l.lesson?.title ?? l.name).join(', ')}
                            </p>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    </div>
</section>
