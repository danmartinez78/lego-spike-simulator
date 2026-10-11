<script lang="ts">
    // One lesson as students see it. The coach page uses it as a preview.
    import { createEventDispatcher } from 'svelte';
    import { Button } from 'flowbite-svelte';
    import { AwardOutline, CheckOutline, ClipboardCheckOutline } from 'flowbite-svelte-icons';
    import type { Lesson } from '$lib/library';
    import { challengeFor, topicColour } from '$lib/lessons';
    import { describeCheck } from '$lib/spike/checks';
    import { presetLabels } from '$lib/spike/realism';
    import CheckMap from '$components/CheckMap.svelte';

    export let lesson: Lesson;
    export let position = 0;
    export let total = 0;
    export let ticked: number[] = [];
    export let missing: string[] = [];
    export let busy = false;
    export let passed = false;
    export let preview = false;
    export let signedIn = false;
    export let handedInAt: string | undefined = undefined;
    // Best result of the lesson's check, if the student tried it.
    export let checkResult: { best: number; passed: boolean } | undefined = undefined;

    const dispatch = createEventDispatcher<{
        setup: void;
        toggle: number;
        challenge: void;
        check: void;
        handin: void;
        openmine: void;
        signin: void;
    }>();

    function when(iso: string) {
        return new Date(iso).toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    // Show the play symbol as text rather than as an emoji.
    function text(value: string | undefined) {
        return (value ?? '').replace(/\u25b6\ufe0f?/g, '\u25b6\ufe0e');
    }

    function paragraphs(value: string) {
        return text(value)
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
    }

    function niceName(name: string) {
        return name.replace(/^Practice - /, '').replace(/\.(spk|llsp3|mpd|ldr)$/i, '');
    }

    $: challenge = challengeFor(lesson);
    $: setupParts = [
        lesson.program ? `the starter program "${niceName(lesson.program)}"` : '',
        lesson.field ? `the field "${niceName(lesson.field)}"` : '',
        lesson.robot ? `the robot "${niceName(lesson.robot)}"` : ''
    ].filter((x) => x);
</script>

<article class="max-w-2xl flex flex-col gap-5">
    <header class="flex flex-col gap-2">
        <div class="flex items-center gap-2 text-xs">
            <span
                class="rounded-full px-2 py-0.5 font-semibold text-white"
                style="background-color: {topicColour(lesson.topic)}"
                >{lesson.topic || 'Other'}</span
            >
            {#if position > 0}
                <span class="text-gray-500">Lesson {position} of {total}</span>
            {/if}
        </div>
        <h3 class="text-2xl font-semibold text-gray-900 leading-tight">
            {lesson.title}
        </h3>
        {#if lesson.summary}
            <p class="text-base text-gray-600">{text(lesson.summary)}</p>
        {/if}
    </header>

    {#if setupParts.length > 0}
        <section
            class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3"
        >
            <p class="flex-1 text-sm text-gray-800">
                <b>Get set up:</b> loads {setupParts.join(' and ')}.
            </p>
            <Button
                size="sm"
                color="blue"
                disabled={busy || missing.length > 0}
                on:click={() => dispatch('setup')}>Set up</Button
            >
        </section>
        {#if missing.length > 0}
            <p class="text-sm text-amber-800 -mt-3">
                {preview ? 'The library is missing' : 'Ask your coach: the library is missing'}
                {missing.join(', ')}.
            </p>
        {/if}
    {/if}

    <section>
        <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Steps · {ticked.filter((s) => s < lesson.steps.length).length} of
            {lesson.steps.length} done
        </h4>
        <ol class="flex flex-col gap-3">
            {#each lesson.steps as step, i}
                {@const done = ticked.includes(i)}
                <li class="flex gap-3 items-start">
                    <button
                        class="shrink-0 mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full border-2 text-xs font-semibold transition-colors {done
                            ? 'bg-green-600 border-green-600 text-white'
                            : 'bg-white border-gray-300 text-gray-700 hover:border-green-600'}"
                        role="checkbox"
                        aria-checked={done}
                        aria-label="Step {i + 1} done"
                        on:click={() => dispatch('toggle', i)}
                    >
                        {#if done}
                            <CheckOutline class="w-4 h-4" />
                        {:else}
                            {i + 1}
                        {/if}
                    </button>
                    <div class="flex flex-col gap-1 {done ? 'text-gray-500' : 'text-gray-800'}">
                        {#if step.title}
                            <div class="font-semibold text-[15px]">
                                {text(step.title)}
                            </div>
                        {/if}
                        {#each paragraphs(step.text) as p}
                            <p class="text-[15px] leading-relaxed">{p}</p>
                        {/each}
                    </div>
                </li>
            {/each}
        </ol>
    </section>

    {#if lesson.check}
        <section
            class="flex flex-col gap-3 rounded-xl border px-4 py-3 {checkResult?.passed
                ? 'border-green-300 bg-green-50/50'
                : 'border-gray-200'}"
            aria-label="Check"
        >
            <div class="flex flex-col sm:flex-row sm:items-start gap-3">
                <ClipboardCheckOutline class="w-6 h-6 text-gray-500 shrink-0" />
                <div class="flex-1 flex flex-col gap-1">
                    <div class="text-xs text-gray-500">
                        Check · {checkResult?.passed
                            ? 'passed'
                            : checkResult
                              ? `best so far ${checkResult.best} of 5`
                              : 'not tried yet'} · {presetLabels[lesson.check.realism] ??
                            lesson.check.realism}
                    </div>
                    <ul class="text-sm text-gray-800 list-disc pl-5">
                        {#each describeCheck(lesson.check) as line}
                            <li>{line}</li>
                        {/each}
                    </ul>
                </div>
                {#if checkResult?.passed}
                    <span class="text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-800"
                        >Passed</span
                    >
                {/if}
                <Button
                    size="sm"
                    color={checkResult?.passed ? 'light' : 'green'}
                    disabled={preview || busy || !lesson.field}
                    on:click={() => dispatch('check')}>Check my robot</Button
                >
            </div>
            <CheckMap field={lesson.field} check={lesson.check} maxHeight={200} />
            <p class="text-xs text-gray-500">
                Check my robot runs your program 5 times on the lesson's field and checks every run.
            </p>
        </section>
    {/if}
    {#if challenge}
        <section
            class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-gray-200 px-4 py-3"
        >
            <AwardOutline class="w-6 h-6 text-gray-500 shrink-0" />
            <div class="flex-1">
                <div class="text-xs text-gray-500">
                    Challenge · {passed ? 'passed' : 'not passed yet'}
                </div>
                <div class="text-sm font-medium text-gray-900">
                    {challenge.title}
                </div>
                <div class="text-sm text-gray-600">{challenge.goal}</div>
            </div>
            {#if passed}
                <span class="text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-800"
                    >Passed</span
                >
            {/if}
            <Button size="sm" color="light" on:click={() => dispatch('challenge')}
                >Open challenge</Button
            >
        </section>
    {/if}
    {#if !preview}
        <section
            class="flex flex-col gap-2 rounded-xl border border-gray-200 px-4 py-3"
            aria-label="Hand in"
        >
            {#if signedIn}
                <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                    <p class="flex-1 text-sm text-gray-800">
                        {#if handedInAt}
                            <b>Handed in</b> {when(handedInAt)}. Hand in again after you change it.
                        {:else}
                            <b>Hand in</b> the program in your code panel so your coach can see it.
                        {/if}
                    </p>
                    <Button
                        size="sm"
                        color={handedInAt ? 'light' : 'green'}
                        disabled={busy}
                        on:click={() => dispatch('handin')}
                        >{handedInAt ? 'Hand in again' : 'Hand in my program'}</Button
                    >
                </div>
                {#if handedInAt}
                    <button
                        class="self-start text-sm text-blue-700 hover:underline"
                        on:click={() => dispatch('openmine')}
                        >Open what I handed in (for example on another computer)</button
                    >
                {/if}
            {:else}
                <p class="text-sm text-gray-700">
                    <button
                        class="text-blue-700 hover:underline"
                        on:click={() => dispatch('signin')}>Sign in with your code</button
                    > to hand in your program and keep your progress on any computer.
                </p>
            {/if}
        </section>
    {/if}
</article>
