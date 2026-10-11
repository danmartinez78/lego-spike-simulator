<script lang="ts">
    // One lesson as students see it. The coach page uses it as a preview.
    import { createEventDispatcher } from 'svelte';
    import { Button } from 'flowbite-svelte';
    import { AwardOutline, CheckOutline, ClipboardCheckOutline } from 'flowbite-svelte-icons';
    import type { Lesson } from '$lib/library';
    import { topicColour } from '$lib/lessons';
    import type { Challenge, Progress } from '$lib/spike/challenges';
    import { describeCheck } from '$lib/spike/checks';
    import { presetLabels } from '$lib/spike/realism';
    import CheckMap from '$components/CheckMap.svelte';

    export let lesson: Lesson;
    export let position = 0;
    export let total = 0;
    export let ticked: number[] = [];
    export let missing: string[] = [];
    export let busy = false;
    export let preview = false;
    // Related challenges, shown once the lesson is done, and the student's results on them.
    export let related: Challenge[] = [];
    export let challengeResults: Record<string, Progress> = {};
    // Whether there is a lesson after this one for the Next lesson button.
    export let hasNext = false;
    export let signedIn = false;
    export let handedInAt: string | undefined = undefined;
    // The coach asked for the check to pass before handing in.
    export let checkFirst = false;
    // Best result of the lesson's check, if the student tried it.
    export let checkResult: { best: number; passed: boolean } | undefined = undefined;

    const dispatch = createEventDispatcher<{
        setup: void;
        toggle: number;
        challenge: string;
        next: void;
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

    function challengeBadge(id: string) {
        const result = challengeResults[id];
        if (result?.completed) return { text: 'Complete', css: 'bg-green-100 text-green-800' };
        if (result && result.best > 0)
            return { text: `Best ${result.best}/5`, css: 'bg-amber-100 text-amber-800' };
        return undefined;
    }

    // What finishing this lesson takes: every step ticked, the check passed (if
    // there is one) and, when signed in, a program handed in. The same rule as
    // lessonStatus() in src/lib/lessons.ts.
    $: stepsDone = ticked.filter((s) => s < lesson.steps.length).length >= lesson.steps.length;
    $: toFinish = [
        { label: 'Tick every step', done: stepsDone },
        ...(lesson.check ? [{ label: 'Pass the check', done: !!checkResult?.passed }] : []),
        ...(signedIn ? [{ label: 'Hand in your program', done: !!handedInAt }] : [])
    ];
    $: complete = !preview && toFinish.every((t) => t.done);
    $: waitingForCheck = checkFirst && !!lesson.check && !checkResult?.passed;
    $: started = ticked.length > 0 || !!checkResult || !!handedInAt;
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

    {#if complete}
        <section
            class="flex flex-col gap-3 rounded-xl border-2 border-green-300 bg-green-50 px-4 py-4"
            aria-label="Lesson complete"
            data-testid="lesson-complete"
        >
            <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                <div class="flex-1">
                    <div class="text-xl font-semibold text-green-900">Lesson complete! 🎉</div>
                    <p class="text-sm text-green-900">
                        {signedIn
                            ? 'Great work. Your coach can see that you finished it.'
                            : 'Great work. Sign in with your code so your coach can see it too.'}
                    </p>
                </div>
                {#if hasNext}
                    <Button color="green" on:click={() => dispatch('next')}>Next lesson</Button>
                {/if}
            </div>
            {#if related.length > 0}
                <div class="flex flex-col gap-2">
                    <div class="text-sm font-semibold text-gray-900">
                        Ready for more? Try {related.length == 1
                            ? 'this challenge'
                            : 'these challenges'}:
                    </div>
                    {#each related as c (c.id)}
                        {@const badge = challengeBadge(c.id)}
                        <div
                            class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                        >
                            <AwardOutline class="w-6 h-6 text-amber-500 shrink-0" />
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900">{c.title}</div>
                                <div class="text-sm text-gray-600">{c.goal}</div>
                            </div>
                            {#if badge}
                                <span class="text-xs rounded-full px-2 py-0.5 {badge.css}"
                                    >{badge.text}</span
                                >
                            {/if}
                            <Button
                                size="sm"
                                color="light"
                                on:click={() => dispatch('challenge', c.id)}>Open challenge</Button
                            >
                        </div>
                    {/each}
                </div>
            {/if}
        </section>
    {/if}

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
    {#if !preview}
        <section
            class="flex flex-col gap-2 rounded-xl border border-gray-200 px-4 py-3"
            aria-label="Hand in"
        >
            {#if signedIn}
                <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                    <p class="flex-1 text-sm text-gray-800">
                        {#if waitingForCheck}
                            <b>Pass the check first.</b> Your coach asked for the check to pass
                            before you hand in. Press <b>Check my robot</b> above.
                        {:else if handedInAt}
                            <b>Handed in</b> {when(handedInAt)}. Hand in again after you change it.
                        {:else}
                            <b>Hand in</b> the program in your code panel so your coach can see it.
                        {/if}
                    </p>
                    <Button
                        size="sm"
                        color={handedInAt ? 'light' : 'green'}
                        disabled={busy || waitingForCheck}
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
    {#if !preview && !complete && started}
        <section
            class="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
            aria-label="To finish this lesson"
        >
            <div class="text-sm font-semibold text-gray-900">To finish this lesson</div>
            <ul class="flex flex-col gap-1">
                {#each toFinish as item}
                    <li class="flex items-center gap-2 text-sm">
                        <span
                            class="inline-flex items-center justify-center w-5 h-5 rounded-full border-2 {item.done
                                ? 'bg-green-600 border-green-600 text-white'
                                : 'border-gray-300 bg-white'}"
                        >
                            {#if item.done}<CheckOutline class="w-3 h-3" />{/if}
                        </span>
                        <span class={item.done ? 'text-gray-500 line-through' : 'text-gray-800'}
                            >{item.label}</span
                        >
                    </li>
                {/each}
            </ul>
            {#if related.length > 0}
                <p class="text-sm text-gray-600">
                    Finish it to see {related.length == 1
                        ? 'a related challenge'
                        : `${related.length} related challenges`}.
                </p>
            {/if}
        </section>
    {/if}
    {#if preview && related.length > 0}
        <section class="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm">
            <div class="text-xs text-gray-500">Shown once a student finishes the lesson</div>
            <div class="text-gray-800">
                Related challenges: {related.map((c) => c.title).join(', ')}
            </div>
        </section>
    {/if}
</article>
