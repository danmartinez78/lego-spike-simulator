<script lang="ts">
    // Coach page: the challenges students find in the code panel's Challenges
    // window. Make, edit, publish, import and delete them here.
    import { Button, Spinner } from 'flowbite-svelte';
    import SceneThumb from '$components/coach/SceneThumb.svelte';
    import ChallengeEditor from '$components/coach/ChallengeEditor.svelte';
    import { askConfirm } from '$lib/confirm';
    import {
        deleteEntry,
        libraryFileName,
        libraryStore,
        saveChallenge,
        type LibraryEntry
    } from '$lib/library';
    import { challengeFromFile, type ChallengeFile } from '$lib/spike/challenges';
    import { challengeProblems, relatedChallenges } from '../../../server/lesson-rules.mjs';

    const levels = ['', 'Starter', 'Getting there', 'Tricky'];

    let message = '';
    let failed = false;
    let busy = '';
    let editorOpen = false;
    let editing: LibraryEntry | undefined = undefined;
    let fileInput: HTMLInputElement;

    $: index = $libraryStore.index;
    $: scenes = new Map(index.scenes.map((e) => [e.name, e]));
    $: entries = index.challenges
        .filter((e) => e.challenge)
        .map((e) => ({ entry: e, c: challengeFromFile(e.name, e.challenge!) }))
        .sort(
            (a, b) =>
                (a.c.order ?? Infinity) - (b.c.order ?? Infinity) ||
                a.c.title.localeCompare(b.c.title)
        );
    $: skills = [...new Set(entries.map((x) => x.c.skill).filter((s): s is string => !!s))];
    $: lessonsFor = (id: string) =>
        index.lessons.filter((l) => relatedChallenges(l.lesson).includes(id));

    function say(text: string, error = false) {
        message = text;
        failed = error;
    }

    // A short file name from the title, like "hit-target-a.json": it's the
    // challenge's id, which lessons and students' progress refer to.
    function idFor(title: string) {
        const base =
            title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 60) || 'challenge';
        let name = libraryFileName('challenges', base);
        for (let n = 2; index.challenges.some((e) => e.name == name); n++) {
            name = libraryFileName('challenges', `${base}-${n}`);
        }
        return name;
    }

    function edit(entry: LibraryEntry | undefined) {
        editing = entry;
        editorOpen = true;
        message = '';
    }

    async function save(event: CustomEvent<ChallengeFile>) {
        const name = editing?.name ?? idFor(event.detail.title);
        busy = 'save';
        try {
            await saveChallenge(name, event.detail);
            editorOpen = false;
            say(
                `Saved "${event.detail.title}"${event.detail.draft ? " as a draft. Students can't see it until you publish it." : '.'}`
            );
        } catch (e) {
            say((e as Error).message, true);
        } finally {
            busy = '';
        }
    }

    async function togglePublished(entry: LibraryEntry) {
        const file = entry.challenge!;
        const next: ChallengeFile = { ...file };
        if (file.draft) delete next.draft;
        else next.draft = true;
        busy = entry.name;
        try {
            await saveChallenge(entry.name, next);
            say(
                file.draft
                    ? `"${file.title}" is published. Students can see it now.`
                    : `"${file.title}" is a draft again. Students can't see it.`
            );
        } catch (e) {
            say((e as Error).message, true);
        } finally {
            busy = '';
        }
    }

    async function remove(entry: LibraryEntry) {
        const id = entry.name.replace(/\.json$/, '');
        const lessons = lessonsFor(id);
        const extra =
            lessons.length > 0
                ? ` ${lessons.length} lesson${lessons.length == 1 ? ' links' : 's link'} to it.`
                : '';
        if (
            !(await askConfirm(
                `Delete the challenge "${entry.challenge?.title}"? Students' progress on it is lost.${extra}`,
                { confirmLabel: 'Delete' }
            ))
        )
            return;
        busy = entry.name;
        try {
            await deleteEntry('challenges', entry.name);
            say(`Deleted "${entry.challenge?.title}".`);
        } catch (e) {
            say((e as Error).message, true);
        } finally {
            busy = '';
        }
    }

    function download(entry: LibraryEntry) {
        const blob = new Blob([JSON.stringify(entry.challenge, null, 2)], {
            type: 'application/json'
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = entry.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    async function importFile(file: File | undefined) {
        if (!file) return;
        fileInput.value = '';
        let json: ChallengeFile;
        try {
            json = JSON.parse(await file.text());
        } catch {
            say(`${file.name} isn't a challenge file (it isn't JSON).`, true);
            return;
        }
        const issue = challengeProblems(json).errors[0];
        if (issue) {
            say(`${file.name}: ${issue}`, true);
            return;
        }
        busy = 'import';
        try {
            const name = idFor(json.title);
            await saveChallenge(name, { ...json, draft: true });
            say(`Added "${json.title}" as a draft. Look it over, then press Publish.`);
        } catch (e) {
            say((e as Error).message, true);
        } finally {
            busy = '';
        }
    }
</script>

<section class="flex flex-col gap-3">
    <div>
        <h2 class="text-lg font-semibold">Challenges</h2>
        <p class="text-gray-600 text-sm">
            Short goals students try from the Challenges button in the code panel. The simulator
            checks them automatically over five runs. Unlike lessons, there are no steps: just the
            goal, the field, the check and a few hints. New challenges are drafts until you publish
            them.
        </p>
    </div>

    {#if message}
        <div
            role="status"
            class="rounded-lg px-4 py-2 text-sm {failed
                ? 'bg-red-50 text-red-800 border border-red-200'
                : 'bg-green-50 text-green-800 border border-green-200'}"
        >
            {message}
        </div>
    {/if}

    <div class="flex flex-row flex-wrap items-center gap-2">
        <Button color="blue" size="sm" disabled={busy != ''} on:click={() => edit(undefined)}
            >New challenge</Button
        >
        <Button color="light" size="sm" disabled={busy != ''} on:click={() => fileInput.click()}
            >Import a challenge (.json)</Button
        >
        <input
            bind:this={fileInput}
            type="file"
            class="hidden"
            accept=".json"
            data-testid="challenge-import"
            on:change={() => importFile(fileInput.files?.[0])}
        />
        {#if busy == 'import' || busy == 'save'}
            <span class="text-sm text-gray-600 flex items-center gap-2"
                ><Spinner size="4" /> Saving…</span
            >
        {/if}
    </div>

    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {#if entries.length == 0}
            <p class="p-6 text-gray-600">No challenges yet. Make one with New challenge.</p>
        {:else}
            <ul class="divide-y divide-gray-200">
                {#each entries as { entry, c } (entry.name)}
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
                                {#if c.draft}
                                    <span
                                        class="text-xs font-medium rounded-full px-2 py-0.5 bg-gray-200 text-gray-700"
                                        >Draft</span
                                    >
                                {/if}
                                {#if entry.challenge?.author}
                                    <span
                                        class="text-xs font-medium rounded-full px-2 py-0.5 bg-purple-100 text-purple-800"
                                        title="Saved by an AI assistant for this coach"
                                        >From an assistant · {entry.challenge.author}</span
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
                                    Related to {lessons.length == 1 ? 'the lesson' : 'the lessons'}
                                    {lessons.map((l) => l.lesson?.title ?? l.name).join(', ')}
                                </p>
                            {/if}
                        </div>
                        <div class="flex flex-row flex-wrap gap-2">
                            <Button
                                size="xs"
                                color="light"
                                disabled={busy != ''}
                                on:click={() => edit(entry)}>Edit</Button
                            >
                            <Button
                                size="xs"
                                color={c.draft ? 'green' : 'light'}
                                disabled={busy != ''}
                                on:click={() => togglePublished(entry)}
                                >{c.draft ? 'Publish' : 'Unpublish'}</Button
                            >
                            <Button size="xs" color="light" on:click={() => download(entry)}
                                >Download</Button
                            >
                            <Button
                                size="xs"
                                color="red"
                                outline
                                disabled={busy != ''}
                                on:click={() => remove(entry)}>Delete</Button
                            >
                        </div>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</section>

<ChallengeEditor
    bind:open={editorOpen}
    challenge={editing?.challenge}
    programs={index.programs.map((e) => e.name)}
    scenes={index.scenes.map((e) => e.name)}
    robots={index.robots.map((e) => e.name)}
    {skills}
    saving={busy == 'save'}
    on:save={save}
/>
