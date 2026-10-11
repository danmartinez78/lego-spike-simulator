<script lang="ts">
    // Coach tools, served at /coach. On the live site Cloudflare Access guards
    // this page and /api/admin, so only coaches on the allowlist reach it.
    import { onMount } from 'svelte';
    import { Button, Input, Spinner } from 'flowbite-svelte';
    import ConfirmDialog from '$components/ConfirmDialog.svelte';
    import SceneThumb from '$components/coach/SceneThumb.svelte';
    import LessonCardEditor from '$components/coach/LessonCardEditor.svelte';
    import LessonEditor from '$components/coach/LessonEditor.svelte';
    import TeamPanel from '$components/coach/TeamPanel.svelte';
    import HomeworkPanel from '$components/coach/HomeworkPanel.svelte';
    import AgentsPanel from '$components/coach/AgentsPanel.svelte';
    import CodeCards from '$components/coach/CodeCards.svelte';
    import { tick } from 'svelte';
    import type { Student } from '$lib/team';
    import { askConfirm } from '$lib/confirm';
    import { ClipboardCheckOutline } from 'flowbite-svelte-icons';
    import { challenges } from '$lib/spike/challenges';
    import {
        exportLessonPackage,
        installLessonPackage,
        missingFiles,
        packageConflicts,
        readLessonPackage
    } from '$lib/lessons';
    import {
        libraryStore,
        refreshLibrary,
        deleteEntry,
        renameEntry,
        saveEntry,
        libraryFileName,
        saveLesson,
        saveLessonCard,
        type Lesson,
        setDefault,
        type LessonCard,
        type LibraryEntry,
        type LibraryKind
    } from '$lib/library';

    const sections: {
        kind: LibraryKind;
        title: string;
        icon: string;
        empty: string;
        extensions: string[];
        upload: string;
    }[] = [
        {
            kind: 'lessons',
            title: 'Lessons',
            icon: '',
            empty: 'No lessons yet. Write one with New lesson, or import a lesson package (.zip).',
            extensions: ['.zip', '.json'],
            upload: 'Import a lesson (.zip or .json)'
        },
        {
            kind: 'robots',
            title: 'Robots',
            icon: 'icons/Robot.svg',
            empty: 'No robots yet. Upload a .mpd or .ldr model, or load one in the simulator and use Save → Save robot.',
            extensions: ['.mpd', '.ldr'],
            upload: 'Upload a robot (.mpd or .ldr)'
        },
        {
            kind: 'scenes',
            title: 'Scenes and maps',
            icon: 'icons/Scene.svg',
            empty: 'No scenes yet. Upload a .spk scene, or set one up in the simulator and use Save → Save scene.',
            extensions: ['.spk'],
            upload: 'Upload a scene (.spk)'
        },
        {
            kind: 'programs',
            title: 'Example programs',
            icon: 'icons/Library.svg',
            empty: 'No example programs yet. Upload a .llsp3 program, then add its lesson card.',
            extensions: ['.llsp3'],
            upload: 'Upload a program (.llsp3)'
        }
    ];

    let loading = true;
    type View = 'students' | 'library' | 'homework' | 'agents';
    let view: View = 'library';
    const views: { id: View; label: string }[] = [
        { id: 'library', label: 'Library and lessons' },
        { id: 'homework', label: 'Homework' },
        { id: 'students', label: 'Students' },
        { id: 'agents', label: 'AI assistants' }
    ];
    let printing: Student[] = [];

    async function printCards(students: Student[]) {
        printing = students;
        await tick();
        window.print();
    }
    let active: LibraryKind = 'lessons';
    let message = '';
    let failed = false;
    let busy = '';

    onMount(async () => {
        await refreshLibrary();
        loading = false;
    });

    $: section = sections.find((s) => s.kind == active)!;
    $: entries = $libraryStore.index[active] ?? [];
    $: hasDefault = active == 'robots' || active == 'scenes';
    $: sceneNames = $libraryStore.index.scenes.map((s) => s.name);
    $: topics = [
        ...new Set(
            [
                'Basics',
                'Sensors',
                'Gyro',
                'Missions',
                ...$libraryStore.index.programs.map((p) => p.card?.topic),
                ...$libraryStore.index.lessons.map((l) => l.lesson?.topic)
            ].filter((t): t is string => !!t)
        )
    ];

    // Challenge cards name their field, robot and example program by file name.
    function challengesUsing(kind: LibraryKind, name: string) {
        return challenges.filter((c) =>
            kind == 'scenes'
                ? c.field == name
                : kind == 'robots'
                  ? c.robot == name
                  : c.example == name
        );
    }

    function lessonsUsing(kind: LibraryKind, name: string) {
        return $libraryStore.index.lessons.filter((l) =>
            kind == 'programs'
                ? l.lesson?.program == name
                : kind == 'scenes'
                  ? l.lesson?.field == name
                  : kind == 'robots'
                    ? l.lesson?.robot == name
                    : false
        );
    }

    function cardsUsing(kind: LibraryKind, name: string) {
        if (kind != 'scenes') return [];
        return $libraryStore.index.programs.filter((p) => p.card?.scene == name);
    }

    function extensionOf(name: string) {
        const dot = name.lastIndexOf('.');
        return dot < 0 ? '' : name.slice(dot).toLowerCase();
    }

    function baseOf(name: string) {
        const dot = name.lastIndexOf('.');
        return dot < 0 ? name : name.slice(0, dot);
    }

    // Library names allow letters, digits, spaces and . ( ) + - _ and start with a letter or digit.
    function cleanBase(base: string) {
        return base
            .trim()
            .replace(/[^\w .()+-]/g, '_')
            .replace(/^[^\w]+/, '')
            .slice(0, 90);
    }

    function isDefault(kind: LibraryKind, name: string) {
        const defaults = $libraryStore.index.defaults;
        if (kind == 'robots') return defaults.robot == name;
        if (kind == 'scenes') return defaults.scene == name;
        return false;
    }

    function size(bytes: number) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function changed(iso: string) {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function downloadUrl(kind: LibraryKind, name: string) {
        return `api/library/${kind}/${encodeURIComponent(name)}`;
    }

    async function run(key: string, action: () => Promise<void>, done: string) {
        busy = key;
        message = '';
        try {
            await action();
            failed = false;
            message = done;
        } catch (e) {
            failed = true;
            message = (e as Error).message;
        }
        busy = '';
    }

    function toggleDefault(kind: LibraryKind, entry: LibraryEntry) {
        const value = isDefault(kind, entry.name) ? null : entry.name;
        run(
            `default ${entry.name}`,
            () => setDefault(kind, value),
            value
                ? `${entry.name} is now the default ${kind == 'robots' ? 'robot' : 'scene'}. It loads when the simulator opens.`
                : `There is no default ${kind == 'robots' ? 'robot' : 'scene'} now.`
        );
    }

    async function remove(kind: LibraryKind, entry: LibraryEntry) {
        const title = entry.card?.title ?? entry.lesson?.title;
        const what = title ? `"${title}" (${entry.name})` : entry.name;
        const used = kind == 'lessons' ? [] : challengesUsing(kind, entry.name);
        const lessons = lessonsUsing(kind, entry.name);
        let extra = kind == 'programs' ? ' Its lesson card is deleted too.' : '';
        if (used.length > 0) {
            extra += ` ${used.length} challenge card${used.length == 1 ? '' : 's'} (${used.map((c) => c.title).join(', ')}) use${used.length == 1 ? 's' : ''} it.`;
        }
        if (lessons.length > 0) {
            extra += ` ${lessons.length} lesson${lessons.length == 1 ? '' : 's'} (${lessons.map((l) => l.lesson?.title).join(', ')}) use${lessons.length == 1 ? 's' : ''} it.`;
        }
        if (
            await askConfirm(
                `Delete ${what} from the shared library? Students won't see it any more.${extra}`,
                { confirmLabel: 'Delete', danger: true }
            )
        ) {
            run(
                `delete ${entry.name}`,
                () => deleteEntry(kind, entry.name),
                `Deleted ${entry.name}.`
            );
        }
    }

    let renaming = '';
    let newName = '';

    function startRename(entry: LibraryEntry) {
        renaming = entry.name;
        newName = baseOf(entry.name);
        message = '';
    }

    async function finishRename(kind: LibraryKind, entry: LibraryEntry) {
        const base = cleanBase(newName);
        if (base.length == 0) {
            failed = true;
            message = 'Type a new name first.';
            return;
        }
        const to = base + extensionOf(entry.name);
        if (to == entry.name) {
            renaming = '';
            return;
        }
        const used = challengesUsing(kind, entry.name);
        if (
            used.length > 0 &&
            !(await askConfirm(
                `${used.length} challenge card${used.length == 1 ? '' : 's'} (${used.map((c) => c.title).join(', ')}) look for "${entry.name}" by name and won't find it after the rename. Rename anyway?`,
                { confirmLabel: 'Rename' }
            ))
        ) {
            return;
        }
        await run(
            `rename ${entry.name}`,
            () => renameEntry(kind, entry.name, to),
            `Renamed to ${to}.`
        );
        if (!failed) renaming = '';
    }

    let fileInput: HTMLInputElement;

    function chooseFile() {
        message = '';
        fileInput.value = '';
        fileInput.click();
    }

    async function importLesson(file: File) {
        let pkg;
        try {
            pkg = await readLessonPackage(file);
        } catch (e) {
            failed = true;
            message = `Couldn't import ${file.name}: ${(e as Error).message}`;
            return;
        }
        const replaced = packageConflicts(pkg);
        if (
            replaced.length > 0 &&
            !(await askConfirm(
                `Importing "${pkg.lesson.title}" replaces what's already in the library: ${replaced.join(', ')}. Import anyway?`,
                { confirmLabel: 'Replace', danger: true }
            ))
        ) {
            return;
        }
        const count = pkg.files.length;
        await run(
            `upload ${pkg.name}`,
            () => installLessonPackage(pkg),
            `Added the lesson "${pkg.lesson.title}"${count > 0 ? ` and ${count} file${count == 1 ? '' : 's'} it uses` : ''} as a draft. Look it over, then press Publish.`
        );
        const missing = failed ? [] : missingFiles(pkg.lesson);
        if (missing.length > 0) {
            message += ` It also needs ${missing.join(', ')}, which the library doesn't have yet.`;
        }
    }

    let lessonOpen = false;
    let lessonName = '';
    let lessonValue: Lesson | undefined = undefined;
    let lessonSaving = false;

    function editLesson(entry: LibraryEntry | undefined) {
        lessonName = entry?.name ?? '';
        lessonValue = entry?.lesson;
        lessonOpen = true;
        message = '';
    }

    async function togglePublished(entry: LibraryEntry) {
        const lesson = entry.lesson;
        if (!lesson) return;
        const next: Lesson = { ...lesson };
        if (lesson.draft) delete next.draft;
        else next.draft = true;
        await run(
            `lesson ${entry.name}`,
            () => saveLesson(entry.name, next),
            lesson.draft
                ? `Published "${lesson.title}". Students can see it now.`
                : `"${lesson.title}" is a draft again. Students can't see it.`
        );
    }

    async function saveLessonForm(lesson: Lesson) {
        // An edited lesson keeps its file name, so students' progress stays with it.
        const name = lessonName || libraryFileName('lessons', lesson.title);
        if (
            !lessonName &&
            $libraryStore.index.lessons.some((l) => l.name == name) &&
            !(await askConfirm(`There's already a lesson saved as ${name}. Replace it?`, {
                confirmLabel: 'Replace',
                danger: true
            }))
        ) {
            return;
        }
        lessonSaving = true;
        await run(
            `lesson ${name}`,
            () => saveLesson(name, lesson),
            `Saved the lesson "${lesson.title}".`
        );
        lessonSaving = false;
        if (!failed) lessonOpen = false;
    }

    async function downloadLesson(entry: LibraryEntry) {
        const lesson = entry.lesson;
        if (!lesson) return;
        await run(
            `download ${entry.name}`,
            async () => {
                const blob = await exportLessonPackage(lesson);
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = baseOf(entry.name) + '.zip';
                link.click();
                setTimeout(() => URL.revokeObjectURL(link.href), 10000);
            },
            `Downloaded the lesson package for "${lesson.title}".`
        );
    }

    async function upload(kind: LibraryKind, file: File | undefined) {
        if (!file) return;
        if (kind == 'lessons') {
            const extension = extensionOf(file.name);
            if (extension != '.zip' && extension != '.json') {
                failed = true;
                message = `${file.name} isn't a lesson package (.zip) or lesson (.json).`;
                return;
            }
            await importLesson(file);
            return;
        }
        const info = sections.find((s) => s.kind == kind)!;
        const extension = extensionOf(file.name);
        if (!info.extensions.includes(extension)) {
            failed = true;
            message =
                kind == 'robots' && extension == '.io'
                    ? 'BrickLink Studio .io files need exporting first: in Studio use File → Export As → LDraw (.mpd), then upload that.'
                    : `${file.name} isn't a ${info.extensions.join(' or ')} file.`;
            return;
        }
        const base = cleanBase(baseOf(file.name));
        const name = (base.length > 0 ? base : kind.slice(0, -1)) + extension;
        if (
            $libraryStore.index[kind].some((e) => e.name == name) &&
            !(await askConfirm(`There's already a ${name} in the library. Replace it?`, {
                confirmLabel: 'Replace',
                danger: true
            }))
        ) {
            return;
        }
        await run(`upload ${name}`, () => saveEntry(kind, name, file), `Added ${name}.`);
        if (!failed && kind == 'programs') {
            const entry = $libraryStore.index.programs.find((p) => p.name == name);
            if (entry && !entry.card) editCard(entry);
        }
    }

    let cardOpen = false;
    let cardProgram = '';
    let cardValue: LessonCard | undefined = undefined;
    let cardSaving = false;

    function editCard(entry: LibraryEntry) {
        cardProgram = entry.name;
        cardValue = entry.card;
        cardOpen = true;
    }

    async function saveCard(card: LessonCard) {
        cardSaving = true;
        await run(
            `card ${cardProgram}`,
            () => saveLessonCard(cardProgram, card),
            `Saved the lesson card for "${card.title}".`
        );
        cardSaving = false;
        if (!failed) cardOpen = false;
    }
</script>

<svelte:head>
    <title>Coach tools · LEGO SPIKE Simulator</title>
</svelte:head>

<div class="min-h-dvh bg-gray-50 text-gray-900 print:hidden">
    <header class="bg-white border-b border-gray-200">
        <div class="max-w-5xl mx-auto px-4 py-3 flex flex-row items-center gap-3 flex-wrap">
            <img src="icons/SensorHub.svg" alt="" width="32" height="32" />
            <div class="flex flex-col">
                <h1 class="text-xl font-semibold leading-tight">Coach tools</h1>
                <span class="text-sm text-gray-500">LEGO SPIKE Simulator</span>
            </div>
            <div class="flex-1"></div>
            {#if $libraryStore.writer}
                <span class="text-sm text-gray-600" data-testid="signed-in"
                    >{#if $libraryStore.writer.startsWith('lan ')}Signed in from the home network{:else}Signed
                        in as <b>{$libraryStore.writer}</b>{/if}</span
                >
            {/if}
            <Button href="./" color="light" size="sm">Open the simulator</Button>
        </div>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
        {#if loading}
            <div class="flex flex-row gap-3 items-center text-gray-600">
                <Spinner size="5" /> Checking your sign-in…
            </div>
        {:else if !$libraryStore.available}
            <div class="bg-white rounded-lg border border-gray-200 p-6">
                <h2 class="text-lg font-semibold">No shared library here</h2>
                <p class="mt-2 text-gray-700">
                    This copy of the simulator isn't running with the library server, so there is
                    nothing to manage.
                </p>
            </div>
        {:else if !$libraryStore.writer}
            <div class="bg-white rounded-lg border border-gray-200 p-6 max-w-xl">
                <h2 class="text-lg font-semibold">This page is for coaches</h2>
                <p class="mt-2 text-gray-700">
                    Coaches sign in with their email address to manage the robots, maps and example
                    programs that everyone on the team sees.
                </p>
                <p class="mt-2 text-gray-700">
                    If you're a student, head back to the simulator. Everything you need is there.
                </p>
                <div class="mt-4 flex flex-row gap-2 flex-wrap">
                    <Button href="api/admin/login?to=coach" color="blue">Coach sign in</Button>
                    <Button href="./" color="light">Back to the simulator</Button>
                </div>
            </div>
        {:else}
            <nav
                class="flex flex-row gap-1 border-b border-gray-200 -mt-2 overflow-x-auto"
                aria-label="Coach tools"
            >
                {#each views as item}
                    <button
                        class="px-4 py-2 -mb-px border-b-2 text-sm font-medium whitespace-nowrap {view ==
                        item.id
                            ? 'border-blue-600 text-blue-800'
                            : 'border-transparent text-gray-600 hover:text-gray-900'}"
                        aria-current={view == item.id ? 'page' : undefined}
                        on:click={() => (view = item.id)}>{item.label}</button
                    >
                {/each}
            </nav>
        {/if}
        {#if !loading && $libraryStore.available && $libraryStore.writer && view == 'students'}
            <TeamPanel on:print={(e) => printCards(e.detail)} />
        {:else if !loading && $libraryStore.available && $libraryStore.writer && view == 'homework'}
            <HomeworkPanel />
        {:else if !loading && $libraryStore.available && $libraryStore.writer && view == 'agents'}
            <AgentsPanel
                on:lessons={() => {
                    view = 'library';
                    active = 'lessons';
                }}
            />
        {:else if !loading && $libraryStore.available && $libraryStore.writer}
            <section class="flex flex-col gap-3">
                <div>
                    <h2 class="text-lg font-semibold">Shared library</h2>
                    <p class="text-gray-600 text-sm">
                        What students see in the simulator's Lessons, Library and Examples windows.
                        There is one default robot and one default scene; they load when someone
                        opens the simulator.
                    </p>
                </div>

                <div class="flex flex-row gap-2 flex-wrap" role="tablist">
                    {#each sections as s}
                        <button
                            role="tab"
                            aria-selected={active == s.kind}
                            class="flex flex-row items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium
                                {active == s.kind
                                ? 'bg-blue-50 border-blue-600 text-blue-800'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'}"
                            on:click={() => {
                                active = s.kind;
                                message = '';
                            }}
                        >
                            {#if s.icon}
                                <img src={s.icon} alt="" width="20" height="20" />
                            {:else}
                                <ClipboardCheckOutline class="w-5 h-5" />
                            {/if}
                            {s.title}
                            <span
                                class="text-xs rounded-full px-2 py-0.5 {active == s.kind
                                    ? 'bg-blue-100'
                                    : 'bg-gray-100'}"
                                >{$libraryStore.index[s.kind]?.length ?? 0}</span
                            >
                        </button>
                    {/each}
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
                    {#if active == 'lessons'}
                        <Button
                            color="blue"
                            size="sm"
                            disabled={busy != ''}
                            on:click={() => editLesson(undefined)}>New lesson</Button
                        >
                    {/if}
                    <Button
                        color={active == 'lessons' ? 'light' : 'blue'}
                        size="sm"
                        disabled={busy != ''}
                        on:click={chooseFile}>{section.upload}</Button
                    >
                    <input
                        bind:this={fileInput}
                        type="file"
                        class="hidden"
                        accept={section.extensions.join(',')}
                        data-testid="upload-input"
                        on:change={() => upload(active, fileInput.files?.[0])}
                    />
                    {#if busy.startsWith('upload')}
                        <span class="text-sm text-gray-600 flex items-center gap-2"
                            ><Spinner size="4" /> Uploading…</span
                        >
                    {/if}
                </div>

                <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {#if entries.length == 0}
                        <p class="p-6 text-gray-600">{section.empty}</p>
                    {:else}
                        <ul class="divide-y divide-gray-200">
                            {#each entries as entry (entry.name)}
                                {@const usedBy = challengesUsing(active, entry.name)}
                                {@const cards = cardsUsing(active, entry.name)}
                                {@const lessons = lessonsUsing(active, entry.name)}
                                {@const missing = entry.lesson ? missingFiles(entry.lesson) : []}
                                <li class="flex flex-row flex-wrap items-center gap-3 px-4 py-3">
                                    {#if active == 'scenes'}
                                        <SceneThumb name={entry.name} modified={entry.modified} />
                                    {/if}
                                    <div class="flex-1 min-w-[12rem]">
                                        {#if renaming == entry.name}
                                            <form
                                                class="flex flex-row flex-wrap items-center gap-2"
                                                on:submit|preventDefault={() =>
                                                    finishRename(active, entry)}
                                            >
                                                <Input
                                                    size="sm"
                                                    class="max-w-xs"
                                                    bind:value={newName}
                                                    aria-label="New name for {entry.name}"
                                                />
                                                <span class="text-sm text-gray-500"
                                                    >{extensionOf(entry.name)}</span
                                                >
                                                <Button
                                                    size="xs"
                                                    color="blue"
                                                    type="submit"
                                                    disabled={busy != ''}>Save name</Button
                                                >
                                                <Button
                                                    size="xs"
                                                    color="light"
                                                    on:click={() => (renaming = '')}>Cancel</Button
                                                >
                                            </form>
                                        {:else}
                                            <div
                                                class="font-medium flex flex-row items-center gap-2 flex-wrap"
                                            >
                                                {entry.card?.title ??
                                                    entry.lesson?.title ??
                                                    entry.name}
                                                {#if isDefault(active, entry.name)}
                                                    <span
                                                        class="text-xs font-medium rounded-full px-2 py-0.5 bg-green-100 text-green-800"
                                                        >{active == 'robots'
                                                            ? 'Default robot'
                                                            : 'Default scene'}</span
                                                    >
                                                {/if}
                                                {#if missing.length > 0}
                                                    <span
                                                        class="text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-800"
                                                        title="Missing: {missing.join(', ')}"
                                                        >Missing {missing.length} file{missing.length ==
                                                        1
                                                            ? ''
                                                            : 's'}</span
                                                    >
                                                {/if}
                                                {#if entry.lesson?.draft}
                                                    <span
                                                        class="text-xs font-medium rounded-full px-2 py-0.5 bg-gray-200 text-gray-700"
                                                        >Draft</span
                                                    >
                                                {/if}
                                                {#if entry.lesson?.author}
                                                    <span
                                                        class="text-xs font-medium rounded-full px-2 py-0.5 bg-purple-100 text-purple-800"
                                                        title="Saved by an AI assistant for this coach"
                                                        >From an assistant · {entry.lesson
                                                            .author}</span
                                                    >
                                                {/if}
                                                {#if entry.lesson?.check}
                                                    <span
                                                        class="text-xs font-medium rounded-full px-2 py-0.5 bg-blue-100 text-blue-800"
                                                        >Has a check</span
                                                    >
                                                {/if}
                                                {#if active == 'programs' && !entry.card}
                                                    <span
                                                        class="text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-800"
                                                        >No lesson card</span
                                                    >
                                                {/if}
                                            </div>
                                        {/if}
                                        <div class="text-sm text-gray-500">
                                            {#if entry.card}
                                                {entry.card.topic} · {entry.name} ·
                                            {/if}
                                            {#if entry.lesson}
                                                {entry.lesson.topic || 'Other'} · {entry.lesson
                                                    .steps.length} step{entry.lesson.steps.length ==
                                                1
                                                    ? ''
                                                    : 's'} ·
                                            {/if}
                                            {size(entry.size)} · changed {changed(entry.modified)}
                                        </div>
                                        {#if entry.lesson && (entry.lesson.program || entry.lesson.field || entry.lesson.robot || entry.lesson.challenge)}
                                            <div class="text-sm text-gray-500">
                                                Uses {[
                                                    entry.lesson.program,
                                                    entry.lesson.field,
                                                    entry.lesson.robot,
                                                    entry.lesson.challenge
                                                        ? `the challenge "${challenges.find((c) => c.id == entry.lesson?.challenge)?.title ?? entry.lesson.challenge}"`
                                                        : ''
                                                ]
                                                    .filter((x) => x)
                                                    .join(', ')}
                                            </div>
                                        {/if}
                                        {#if usedBy.length > 0 || cards.length > 0 || lessons.length > 0}
                                            <div class="text-sm text-gray-500">
                                                Used by
                                                {[
                                                    usedBy.length > 0
                                                        ? `${usedBy.length} challenge${usedBy.length == 1 ? '' : 's'}`
                                                        : '',
                                                    cards.length > 0
                                                        ? `${cards.length} lesson card${cards.length == 1 ? '' : 's'}`
                                                        : '',
                                                    lessons.length > 0
                                                        ? `${lessons.length} lesson${lessons.length == 1 ? '' : 's'}`
                                                        : ''
                                                ]
                                                    .filter((x) => x)
                                                    .join(', ')}
                                            </div>
                                        {/if}
                                    </div>
                                    {#if renaming != entry.name}
                                        <div class="flex flex-row gap-2 flex-wrap">
                                            {#if active == 'programs'}
                                                <Button
                                                    size="xs"
                                                    color="light"
                                                    disabled={busy != ''}
                                                    on:click={() => editCard(entry)}
                                                    >{entry.card
                                                        ? 'Edit lesson card'
                                                        : 'Add lesson card'}</Button
                                                >
                                            {/if}
                                            {#if hasDefault}
                                                <Button
                                                    size="xs"
                                                    color="light"
                                                    disabled={busy != ''}
                                                    on:click={() => toggleDefault(active, entry)}
                                                    >{isDefault(active, entry.name)
                                                        ? 'Clear default'
                                                        : 'Make default'}</Button
                                                >
                                            {/if}
                                            {#if active == 'lessons'}
                                                <Button
                                                    size="xs"
                                                    color="light"
                                                    disabled={busy != ''}
                                                    on:click={() => editLesson(entry)}>Edit</Button
                                                >
                                                <Button
                                                    size="xs"
                                                    color={entry.lesson?.draft ? 'green' : 'light'}
                                                    disabled={busy != ''}
                                                    on:click={() => togglePublished(entry)}
                                                    >{entry.lesson?.draft
                                                        ? 'Publish'
                                                        : 'Unpublish'}</Button
                                                >
                                                <Button
                                                    size="xs"
                                                    color="light"
                                                    disabled={busy != ''}
                                                    on:click={() => downloadLesson(entry)}
                                                    >Download package</Button
                                                >
                                            {:else}
                                                <Button
                                                    size="xs"
                                                    color="light"
                                                    disabled={busy != ''}
                                                    on:click={() => startRename(entry)}
                                                    >Rename</Button
                                                >
                                                <Button
                                                    size="xs"
                                                    color="light"
                                                    href={downloadUrl(active, entry.name)}
                                                    download={entry.name}>Download</Button
                                                >
                                            {/if}
                                            <Button
                                                size="xs"
                                                color="red"
                                                outline
                                                disabled={busy != ''}
                                                on:click={() => remove(active, entry)}
                                                >Delete</Button
                                            >
                                        </div>
                                    {/if}
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>
                <p class="text-sm text-gray-500">
                    You can also save the robot, scene or program that's open in the simulator from
                    its Save button and Examples window while signed in.
                </p>
            </section>
        {/if}
    </main>
</div>
<CodeCards students={printing} />
<LessonCardEditor
    bind:open={cardOpen}
    program={cardProgram}
    card={cardValue}
    scenes={sceneNames}
    {topics}
    saving={cardSaving}
    on:save={(e) => saveCard(e.detail)}
/>
<LessonEditor
    bind:open={lessonOpen}
    lesson={lessonValue}
    programs={$libraryStore.index.programs.map((p) => p.name)}
    scenes={sceneNames}
    robots={$libraryStore.index.robots.map((r) => r.name)}
    {topics}
    saving={lessonSaving}
    on:save={(e) => saveLessonForm(e.detail)}
/>
<ConfirmDialog />
