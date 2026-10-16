<script lang="ts">
    // The team's missions, for signed-in students and coaches: what each mission
    // asks for, its video, and every saved version of the team's program for it.
    // Students open a version, improve it in the simulator and save it as a new
    // version. Coaches signed in to the coach page get the same window, and can
    // also pick the version to use at the competition.
    import { createEventDispatcher } from 'svelte';
    import { Button, Input, Modal } from 'flowbite-svelte';
    import { MapPinAltOutline, VideoCameraOutline } from 'flowbite-svelte-icons';
    import { askConfirm } from '$lib/confirm';
    import {
        currentProgram,
        entryTitle,
        fetchEntry,
        libraryStore,
        loadRobotFromLibrary,
        loadSceneFromLibrary,
        programRequest
    } from '$lib/library';
    import {
        coachFetchVersion,
        coachMissions,
        fetchVersion,
        missionFields,
        missionLabel,
        placeRobotAt,
        robotStart,
        saveMission,
        startText,
        missionsStore,
        newestFirst,
        openedVersion,
        refreshMissions,
        saveVersion,
        setCurrentVersion,
        uploadVersion,
        versionDate,
        type Mission,
        type MissionVersion
    } from '$lib/missions';
    import { studentDialogOpen, studentStore } from '$lib/team';

    export let modalOpen = false;

    const dispatch = createEventDispatcher<{ setup: void }>();

    let selectedId: string | undefined = undefined;
    let message = '';
    let loading = false;
    let busy = false;
    let note = '';

    $: selected = $missionsStore.find((m) => m.id == selectedId);
    $: versions = selected ? newestFirst(selected.versions) : [];
    $: guidedAvailable =
        !!selected?.guided && $libraryStore.index.programs.some((p) => p.name == selected?.guided);
    $: fields = selected
        ? missionFields(selected).filter((f) => $libraryStore.index.scenes.some((s) => s.name == f))
        : [];
    // The version this student last opened, if it belongs to this mission.
    $: from = $openedVersion?.mission == selected?.id ? $openedVersion?.version : undefined;
    $: fromVersion = selected?.versions.find((v) => v.id == from);

    // A student's sign-in wins on a shared computer; otherwise a coach signed in
    // to the coach page (Cloudflare Access or the home network) is a coach here too.
    $: coach = !$studentStore && !!$libraryStore.writer;

    $: openDialog(modalOpen, !!$studentStore, coach);

    async function loadMissions(asCoach: boolean) {
        if (!asCoach) return await refreshMissions();
        const missions = await coachMissions();
        missionsStore.set(missions);
        return missions;
    }

    async function openDialog(open: boolean, student: boolean, asCoach: boolean) {
        if (!open || !(student || asCoach)) return;
        loading = true;
        message = '';
        try {
            const missions = await loadMissions(asCoach);
            if (!missions.some((m) => m.id == selectedId)) selectedId = missions[0]?.id;
        } catch (e) {
            message = `Could not load the missions: ${(e as Error).message}`;
        } finally {
            loading = false;
        }
    }

    function versionLine(version: MissionVersion) {
        return `${version.by.name} · ${versionDate(version.saved)}`;
    }

    function madeFrom(mission: Mission, version: MissionVersion) {
        const parent = mission.versions.find((v) => v.id == version.from);
        return parent ? `made from version ${parent.number}` : '';
    }

    async function replaceProgram(question: string) {
        return await askConfirm(question, { confirmLabel: 'Replace' });
    }

    async function openVersion(mission: Mission, version: MissionVersion) {
        if (
            !(await replaceProgram(
                `Replace the program in the code panel with version ${version.number}?`
            ))
        )
            return;
        busy = true;
        message = '';
        try {
            const blob = coach
                ? await coachFetchVersion(mission.id, version.id)
                : await fetchVersion(mission.id, version.id);
            programRequest.set({ blob, merge: false });
            openedVersion.set({ mission: mission.id, version: version.id });
            modalOpen = false;
        } catch (e) {
            message = `Could not open version ${version.number}: ${(e as Error).message}`;
        } finally {
            busy = false;
        }
    }

    async function openGuided(mission: Mission) {
        if (!mission.guided) return;
        if (
            !(await replaceProgram(
                "Replace the program in the code panel with FIRST's guided mission?"
            ))
        )
            return;
        busy = true;
        message = '';
        try {
            programRequest.set({
                blob: await fetchEntry('programs', mission.guided),
                merge: false
            });
            openedVersion.set(undefined);
            modalOpen = false;
        } catch (e) {
            message = `Could not open the guided mission: ${(e as Error).message}`;
        } finally {
            busy = false;
        }
    }

    async function setUpField(mission: Mission, field: string) {
        busy = true;
        message = '';
        try {
            await loadSceneFromLibrary(field);
            if (mission.start) placeRobotAt(mission.start);
            if (mission.robot) await loadRobotFromLibrary(mission.robot);
            modalOpen = false;
            dispatch('setup');
        } catch (e) {
            message = `Could not load the field: ${(e as Error).message}`;
        } finally {
            busy = false;
        }
    }

    async function save(mission: Mission) {
        if (note.trim().length == 0) {
            message = 'First say what you changed, like "turn 5 degrees less before the window".';
            return;
        }
        const program = await currentProgram();
        if (!program) {
            message = 'There is no program in the code panel to save.';
            return;
        }
        busy = true;
        message = '';
        try {
            let number: number;
            if (coach) {
                const saved = await uploadVersion(
                    mission.id,
                    program,
                    note.trim(),
                    undefined,
                    from
                );
                const version = newestFirst(saved.versions)[0];
                number = version.number;
                openedVersion.set({ mission: mission.id, version: version.id });
                await loadMissions(true);
            } else {
                const version = await saveVersion(mission.id, program, note.trim(), from);
                number = version.number;
                openedVersion.set({ mission: mission.id, version: version.id });
            }
            note = '';
            message = `Saved as version ${number}. The team can open it now.`;
        } catch (e) {
            message = `Could not save: ${(e as Error).message}`;
        } finally {
            busy = false;
        }
    }

    // Coaches: the robot's spot in the simulator becomes the mission's start.
    async function setStart(mission: Mission, clear = false) {
        busy = true;
        message = '';
        try {
            const start = clear ? undefined : robotStart();
            await saveMission(
                {
                    number: mission.number,
                    title: mission.title,
                    season: mission.season,
                    goal: mission.goal,
                    notes: mission.notes,
                    video: mission.video,
                    fields: missionFields(mission),
                    start,
                    robot: mission.robot,
                    guided: mission.guided
                },
                mission.id
            );
            await loadMissions(true);
            message = start
                ? `The robot now starts at ${startText(start)} when this mission's field loads.`
                : "The robot now starts at the field's own start.";
        } catch (e) {
            message = `Could not save the start: ${(e as Error).message}`;
        } finally {
            busy = false;
        }
    }

    async function toggleCompetition(mission: Mission, version: MissionVersion) {
        busy = true;
        message = '';
        try {
            await setCurrentVersion(
                mission.id,
                mission.current == version.id ? undefined : version.id
            );
            await loadMissions(true);
        } catch (e) {
            message = `Could not change the competition version: ${(e as Error).message}`;
        } finally {
            busy = false;
        }
    }

    function signIn() {
        modalOpen = false;
        studentDialogOpen.set(true);
    }
</script>

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    size="xl"
    bodyClass="p-0"
    bind:open={modalOpen}
>
    <svelte:fragment slot="header">
        <div class="flex flex-col">
            <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
                Team missions
                {#if coach}
                    <span
                        class="text-xs font-medium rounded-full px-2 py-0.5 bg-blue-100 text-blue-800"
                        >Coach</span
                    >
                {/if}
            </h3>
            <p class="text-sm text-gray-500">
                Our team's programs for this season's missions. Open one, make it better, save a new
                version.
            </p>
        </div>
    </svelte:fragment>
    {#if !$studentStore && !coach}
        <div class="p-6 flex flex-col gap-3 items-start text-gray-800">
            <p>
                Missions are for our team only. Sign in with the code from your coach to see them.
            </p>
            <Button size="sm" on:click={signIn}>Sign in</Button>
        </div>
    {:else}
        <div class="flex flex-col md:flex-row h-[70dvh] text-gray-800">
            <nav
                class="md:w-64 shrink-0 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto p-3 flex flex-col gap-1"
                aria-label="Missions"
            >
                {#if loading && $missionsStore.length == 0}
                    <div class="text-sm text-gray-500 p-2">Loading…</div>
                {:else if $missionsStore.length == 0}
                    <div class="text-sm text-gray-500 p-2">
                        No missions yet. Your coach adds them on the coach page.
                    </div>
                {/if}
                {#each $missionsStore as mission}
                    <button
                        class="text-left rounded-lg px-3 py-2 border transition-colors {selectedId ==
                        mission.id
                            ? 'bg-white border-gray-300 shadow-sm'
                            : 'border-transparent hover:bg-white hover:border-gray-200'}"
                        on:click={() => {
                            selectedId = mission.id;
                            message = '';
                        }}
                    >
                        <div class="text-sm font-medium text-gray-900">{missionLabel(mission)}</div>
                        <div class="text-xs text-gray-500">
                            {mission.versions.length} version{mission.versions.length == 1
                                ? ''
                                : 's'}
                        </div>
                    </button>
                {/each}
            </nav>

            <section class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
                {#if selected}
                    <header class="flex flex-col gap-1">
                        <div class="flex items-center gap-2 text-xs">
                            <span
                                class="rounded-full px-2 py-0.5 font-semibold bg-amber-500 text-white"
                                >Mission {selected.number}</span
                            >
                            {#if selected.season}
                                <span class="text-gray-500">{selected.season}</span>
                            {/if}
                        </div>
                        <h3 class="text-2xl font-semibold text-gray-900 leading-tight">
                            {selected.title}
                        </h3>
                    </header>

                    {#if selected.goal}
                        <section>
                            <h4
                                class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5"
                            >
                                What the robot has to do
                            </h4>
                            <p class="text-[15px] leading-relaxed whitespace-pre-line">
                                {selected.goal}
                            </p>
                        </section>
                    {/if}

                    {#if selected.notes}
                        <section class="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                            <h4
                                class="text-xs font-semibold uppercase tracking-wider text-blue-800 mb-1.5"
                            >
                                Team notes
                            </h4>
                            <p class="text-[15px] leading-relaxed whitespace-pre-line">
                                {selected.notes}
                            </p>
                        </section>
                    {/if}

                    <div class="flex flex-wrap gap-2">
                        {#if selected.video}
                            <a
                                href={selected.video}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
                            >
                                <VideoCameraOutline class="w-5 h-5 text-gray-500" />
                                Watch the mission video
                            </a>
                        {/if}
                        {#each fields as field}
                            <Button
                                size="sm"
                                color="light"
                                disabled={busy}
                                on:click={() => selected && setUpField(selected, field)}
                            >
                                <MapPinAltOutline class="w-5 h-5 me-2 text-gray-500" />
                                {fields.length == 1
                                    ? 'Load the mission field'
                                    : `Load ${entryTitle(field)}`}
                            </Button>
                        {/each}
                        {#if guidedAvailable}
                            <Button
                                size="sm"
                                color="light"
                                disabled={busy}
                                on:click={() => selected && openGuided(selected)}
                                >Open FIRST's guided mission</Button
                            >
                        {/if}
                    </div>

                    {#if coach}
                        <section
                            class="rounded-xl border border-dashed border-gray-300 px-4 py-3 flex flex-wrap items-center gap-3 text-sm"
                        >
                            <div class="flex-1 min-w-48">
                                <div class="font-medium text-gray-900">Robot start</div>
                                <div class="text-gray-600">
                                    {selected.start
                                        ? startText(selected.start)
                                        : "The field's own start"}. Place the robot in the launch
                                    area in the simulator, then press Start here.
                                </div>
                            </div>
                            <Button
                                size="xs"
                                color="alternative"
                                disabled={busy}
                                on:click={() => selected && setStart(selected)}>Start here</Button
                            >
                            {#if selected.start}
                                <Button
                                    size="xs"
                                    color="light"
                                    disabled={busy}
                                    on:click={() => selected && setStart(selected, true)}
                                    >Use the field's start</Button
                                >
                            {/if}
                        </section>
                    {/if}

                    <section>
                        <h4
                            class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2"
                        >
                            Our versions
                        </h4>
                        {#if versions.length == 0}
                            <p class="text-sm text-gray-500">
                                No versions yet. Build a program, then save it below.
                            </p>
                        {/if}
                        <ul class="flex flex-col gap-2">
                            {#each versions as version}
                                <li
                                    class="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 {selected.current ==
                                    version.id
                                        ? 'border-green-300 bg-green-50'
                                        : 'border-gray-200'}"
                                >
                                    <div class="flex-1 min-w-48">
                                        <div class="flex flex-wrap items-center gap-2">
                                            <span class="text-sm font-semibold text-gray-900"
                                                >Version {version.number}</span
                                            >
                                            {#if selected.current == version.id}
                                                <span
                                                    class="text-xs font-medium rounded-full px-2 py-0.5 bg-green-600 text-white"
                                                    >Competition version</span
                                                >
                                            {/if}
                                            {#if from == version.id}
                                                <span
                                                    class="text-xs font-medium rounded-full px-2 py-0.5 bg-gray-200 text-gray-700"
                                                    >Open now</span
                                                >
                                            {/if}
                                        </div>
                                        <div class="text-sm text-gray-800">{version.note}</div>
                                        <div class="text-xs text-gray-500">
                                            {versionLine(version)}{madeFrom(selected, version)
                                                ? ` · ${madeFrom(selected, version)}`
                                                : ''}
                                        </div>
                                    </div>
                                    {#if coach}
                                        <Button
                                            size="xs"
                                            color={selected.current == version.id
                                                ? 'green'
                                                : 'alternative'}
                                            disabled={busy}
                                            title="The version the robot runs at the competition"
                                            on:click={() =>
                                                selected && toggleCompetition(selected, version)}
                                            >{selected.current == version.id
                                                ? 'Stop using at competition'
                                                : 'Use at competition'}</Button
                                        >
                                    {/if}
                                    <Button
                                        size="xs"
                                        color="light"
                                        disabled={busy}
                                        on:click={() => selected && openVersion(selected, version)}
                                        >Open</Button
                                    >
                                </li>
                            {/each}
                        </ul>
                    </section>

                    <section
                        class="rounded-xl border border-gray-200 px-4 py-3 flex flex-col gap-2"
                    >
                        <h4 class="text-sm font-semibold text-gray-900">
                            Save my program as version {selected.versions.reduce(
                                (n, v) => Math.max(n, v.number),
                                0
                            ) + 1}
                        </h4>
                        <p class="text-xs text-gray-500">
                            Saves what is in the code panel{fromVersion
                                ? `, made from version ${fromVersion.number}`
                                : ''}. Nothing gets overwritten.
                        </p>
                        <div class="flex flex-wrap gap-2">
                            <Input
                                class="flex-1 min-w-48"
                                size="sm"
                                bind:value={note}
                                maxlength={300}
                                placeholder="What did you change?"
                                aria-label="What did you change?"
                            />
                            <Button
                                size="sm"
                                disabled={busy}
                                on:click={() => selected && save(selected)}>Save version</Button
                            >
                        </div>
                    </section>
                {/if}
                {#if message}
                    <div
                        class="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800"
                        role="status"
                    >
                        {message}
                    </div>
                {/if}
            </section>
        </div>
    {/if}
</Modal>
