<script lang="ts">
    // Coach page: the team's missions and every version of their programs.
    // Team code, kept with the roster rather than in the public library.
    import { onMount } from 'svelte';
    import { Button, Input, Label, Select, Spinner, Textarea } from 'flowbite-svelte';
    import { FileCodeOutline, UploadOutline } from 'flowbite-svelte-icons';
    import { askConfirm } from '$lib/confirm';
    import { libraryStore } from '$lib/library';
    import {
        coachMissions,
        deleteMission,
        deleteVersion,
        missionFields,
        missionLabel,
        newestFirst,
        startText,
        saveMission,
        setCurrentVersion,
        uploadVersion,
        versionDate,
        versionDownloadUrl,
        type Mission,
        type MissionDetails,
        type MissionStart,
        type MissionVersion
    } from '$lib/missions';

    let missions: Mission[] = [];
    let loading = true;
    let message = '';
    let failed = false;
    let busy = false;

    // The mission form, for a new mission (editing == 'new') or an existing one.
    let editing = '';
    let form = emptyForm();

    // Adding a version from a file.
    let uploadFor = '';
    let uploadNote = '';
    let uploadDate = '';
    let uploadFile: File | undefined = undefined;
    let dragging = false;

    function pickFile(files: FileList | null | undefined) {
        const file = files?.[0];
        if (!file) return;
        if (!/\.llsp3$/i.test(file.name)) {
            failed = true;
            message = `${file.name} isn't a SPIKE program. Pick a .llsp3 file saved in the SPIKE app.`;
            return;
        }
        message = '';
        uploadFile = file;
    }

    function sizeText(bytes: number) {
        return bytes < 1024 * 1024
            ? `${Math.max(1, Math.round(bytes / 1024))} KB`
            : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function emptyForm() {
        return {
            number: '',
            title: '',
            season: '',
            goal: '',
            notes: '',
            video: '',
            field: '',
            otherField: '',
            start: undefined as MissionStart | undefined,
            robot: '',
            guided: ''
        };
    }

    $: fieldItems = [
        { value: '', name: 'No field' },
        ...$libraryStore.index.scenes.map((s) => ({
            value: s.name,
            name: s.name.replace(/\.spk$/i, '')
        }))
    ];
    $: robotItems = [
        { value: '', name: "Keep the student's robot" },
        ...$libraryStore.index.robots.map((r) => ({ value: r.name, name: r.name }))
    ];
    $: programItems = [
        { value: '', name: 'None' },
        ...$libraryStore.index.programs.map((p) => ({
            value: p.name,
            name: p.card?.title ? `${p.card.title} (${p.name})` : p.name
        }))
    ];

    onMount(load);

    async function load() {
        try {
            missions = await coachMissions();
            failed = false;
        } catch (e) {
            failed = true;
            message = (e as Error).message;
        }
        loading = false;
    }

    async function refresh() {
        loading = true;
        message = '';
        await load();
    }

    function replace(mission: Mission) {
        missions = missions.map((m) => (m.id == mission.id ? mission : m));
    }

    async function run(action: () => Promise<void>, done: string) {
        busy = true;
        message = '';
        try {
            await action();
            failed = false;
            message = done;
        } catch (e) {
            failed = true;
            message = (e as Error).message;
        }
        busy = false;
    }

    function startEdit(mission: Mission | undefined) {
        editing = mission?.id ?? 'new';
        form = mission
            ? {
                  number: String(mission.number),
                  title: mission.title,
                  season: mission.season ?? '',
                  goal: mission.goal ?? '',
                  notes: mission.notes ?? '',
                  video: mission.video ?? '',
                  field: missionFields(mission)[0] ?? '',
                  otherField: missionFields(mission)[1] ?? '',
                  start: mission.start,
                  robot: mission.robot ?? '',
                  guided: mission.guided ?? ''
              }
            : emptyForm();
        message = '';
    }

    async function save() {
        const details: MissionDetails = {
            number: Number(form.number),
            title: form.title,
            season: form.season || undefined,
            goal: form.goal || undefined,
            notes: form.notes || undefined,
            video: form.video || undefined,
            fields: [form.field, form.otherField].filter((f) => f),
            start: form.start,
            robot: form.robot || undefined,
            guided: form.guided || undefined
        };
        await run(
            async () => {
                const result = await saveMission(details, editing == 'new' ? undefined : editing);
                if (editing == 'new') missions = [...missions, result.mission];
                else replace(result.mission);
                missions = missions.sort((a, b) => a.number - b.number);
                editing = '';
            },
            `Saved ${missionLabel(details)}.`
        );
    }

    async function remove(mission: Mission) {
        if (
            !(await askConfirm(
                `Delete ${missionLabel(mission)} and all ${mission.versions.length} of its versions? This can't be undone, so download the versions you want to keep first.`,
                { confirmLabel: 'Delete', danger: true }
            ))
        )
            return;
        await run(
            async () => {
                await deleteMission(mission.id);
                missions = missions.filter((m) => m.id != mission.id);
            },
            `Deleted ${missionLabel(mission)}.`
        );
    }

    function startUpload(mission: Mission) {
        uploadFor = mission.id;
        uploadNote = '';
        uploadDate = '';
        uploadFile = undefined;
        message = '';
    }

    async function upload(mission: Mission) {
        const file = uploadFile;
        if (!file) {
            failed = true;
            message = 'Pick a .llsp3 file first.';
            return;
        }
        if (!uploadNote.trim()) {
            failed = true;
            message = 'Say what this version is, like "Saturday meeting".';
            return;
        }
        await run(
            async () => {
                replace(
                    await uploadVersion(
                        mission.id,
                        file,
                        uploadNote.trim(),
                        uploadDate || undefined
                    )
                );
                uploadFor = '';
            },
            `Added a version to ${missionLabel(mission)}.`
        );
    }

    async function toggleCurrent(mission: Mission, version: MissionVersion) {
        const current = mission.current == version.id ? undefined : version.id;
        await run(
            async () => replace(await setCurrentVersion(mission.id, current)),
            current
                ? `Version ${version.number} is now the one to use at the competition for ${missionLabel(mission)}.`
                : `${missionLabel(mission)} has no competition version picked.`
        );
    }

    async function removeVersion(mission: Mission, version: MissionVersion) {
        if (
            !(await askConfirm(
                `Delete version ${version.number} of ${missionLabel(mission)} ("${version.note}")? This can't be undone.`,
                { confirmLabel: 'Delete', danger: true }
            ))
        )
            return;
        await run(
            async () => replace(await deleteVersion(mission.id, version.id)),
            `Deleted version ${version.number}.`
        );
    }

    function byLine(version: MissionVersion) {
        const who = version.by.kind == 'coach' ? `Coach (${version.by.name})` : version.by.name;
        return `${who} · ${versionDate(version.saved)}`;
    }
</script>

<section class="flex flex-col gap-3">
    <div class="flex flex-row flex-wrap items-end gap-3">
        <div class="flex-1 min-w-[16rem]">
            <h2 class="text-lg font-semibold">Missions</h2>
            <p class="text-gray-600 text-sm">
                The team's programs for this season's missions. Only coaches and signed-in students
                can see them; they aren't in the public library. Students open a version from the
                Missions button, improve it in the simulator and save a new version. Nothing is
                overwritten. Mark the version the team runs, and download it for the SPIKE app.
            </p>
        </div>
        <Button size="sm" color="light" disabled={loading} on:click={refresh}>Refresh</Button>
        <Button
            size="sm"
            color="blue"
            disabled={editing != ''}
            on:click={() => startEdit(undefined)}>New mission</Button
        >
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

    {#if editing}
        <form
            class="bg-white rounded-lg border border-blue-200 p-4 flex flex-col gap-4"
            on:submit|preventDefault={save}
        >
            <h3 class="font-semibold">{editing == 'new' ? 'New mission' : 'Edit mission'}</h3>
            <div class="grid grid-cols-1 sm:grid-cols-6 gap-4">
                <div>
                    <Label for="mission-number" class="mb-1">Number</Label>
                    <Input
                        id="mission-number"
                        type="number"
                        min="1"
                        max="99"
                        bind:value={form.number}
                        placeholder="11"
                    />
                </div>
                <div class="sm:col-span-3">
                    <Label for="mission-title" class="mb-1">Name</Label>
                    <Input
                        id="mission-title"
                        bind:value={form.title}
                        placeholder="Window to the Past"
                    />
                </div>
                <div class="sm:col-span-2">
                    <Label for="mission-season" class="mb-1">Season (optional)</Label>
                    <Input id="mission-season" bind:value={form.season} placeholder="2026-27" />
                </div>
            </div>
            <div>
                <Label for="mission-goal" class="mb-1">What the robot has to do</Label>
                <Textarea
                    id="mission-goal"
                    rows={3}
                    bind:value={form.goal}
                    placeholder="Push the lever so the window opens, then get back to base."
                />
            </div>
            <div>
                <Label for="mission-notes" class="mb-1">Team notes (optional)</Label>
                <Textarea
                    id="mission-notes"
                    rows={3}
                    bind:value={form.notes}
                    placeholder="Start in the right launch area, back against the wall. Arm on port E."
                />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label for="mission-video" class="mb-1">Video (optional)</Label>
                    <Input
                        id="mission-video"
                        type="url"
                        bind:value={form.video}
                        placeholder="https://www.youtube.com/watch?v=..."
                    />
                </div>
                <div>
                    <Label for="mission-guided" class="mb-1"
                        >FIRST's guided mission (optional)</Label
                    >
                    <Select
                        id="mission-guided"
                        items={programItems}
                        bind:value={form.guided}
                        placeholder=""
                    />
                    <p class="text-xs text-gray-500 mt-1">
                        A program from the public Programs tab, for students to start from.
                    </p>
                </div>
                <div>
                    <Label for="mission-field" class="mb-1">Field</Label>
                    <Select
                        id="mission-field"
                        items={fieldItems}
                        bind:value={form.field}
                        placeholder=""
                    />
                </div>
                <div>
                    <Label for="mission-other-field" class="mb-1"
                        >Other field <span class="font-normal text-gray-500">(optional)</span
                        ></Label
                    >
                    <Select
                        id="mission-other-field"
                        items={fieldItems}
                        bind:value={form.otherField}
                        placeholder=""
                    />
                    <p class="text-xs text-gray-500 mt-1">
                        Students pick either field, such as the color mat or the wireframe.
                    </p>
                </div>
                <div>
                    <Label class="mb-1">Robot start</Label>
                    {#if form.start}
                        <div class="flex flex-row flex-wrap items-center gap-2 text-sm">
                            <span>{startText(form.start)}</span>
                            <Button
                                size="xs"
                                color="light"
                                on:click={() => (form.start = undefined)}>Clear</Button
                            >
                        </div>
                    {:else}
                        <p class="text-sm text-gray-700">The field's own start.</p>
                    {/if}
                    <p class="text-xs text-gray-500 mt-1">
                        To set it, load the field in the simulator, place the robot in the launch
                        area, then press <b>Start here</b> in the Missions window.
                    </p>
                </div>
                <div>
                    <Label for="mission-robot" class="mb-1">Robot</Label>
                    <Select
                        id="mission-robot"
                        items={robotItems}
                        bind:value={form.robot}
                        placeholder=""
                    />
                </div>
            </div>
            <div class="flex flex-row gap-2">
                <Button type="submit" size="sm" disabled={busy}>Save mission</Button>
                <Button size="sm" color="light" on:click={() => (editing = '')}>Cancel</Button>
            </div>
        </form>
    {/if}

    {#if loading}
        <div class="flex justify-center p-6"><Spinner /></div>
    {:else if missions.length == 0 && !failed && editing != 'new'}
        <div class="bg-white rounded-lg border border-gray-200 p-6 text-gray-600 text-sm">
            No missions yet. Press <b>New mission</b>, then add the team's program as its first
            version.
        </div>
    {/if}

    {#each missions as mission (mission.id)}
        <div class="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-3">
            <div class="flex flex-row flex-wrap items-start gap-3">
                <div class="flex-1 min-w-[14rem]">
                    <div class="font-semibold">{missionLabel(mission)}</div>
                    <div class="text-sm text-gray-500">
                        {[
                            mission.season,
                            missionFields(mission)
                                .map((f) => f.replace(/\.spk$/i, ''))
                                .join(' or '),
                            mission.start ? 'robot start set' : '',
                            mission.guided ? "has FIRST's guided mission" : '',
                            mission.video ? 'has a video' : ''
                        ]
                            .filter((x) => x)
                            .join(' · ')}
                    </div>
                    {#if mission.goal}
                        <p class="text-sm text-gray-700 mt-1 whitespace-pre-line">{mission.goal}</p>
                    {/if}
                </div>
                <div class="flex flex-row flex-wrap gap-2">
                    <Button
                        size="xs"
                        color="light"
                        disabled={busy || editing != ''}
                        on:click={() => startEdit(mission)}>Edit</Button
                    >
                    <Button
                        size="xs"
                        color="light"
                        disabled={busy}
                        on:click={() => startUpload(mission)}>Add a version from a file</Button
                    >
                    <Button
                        size="xs"
                        color="light"
                        class="text-red-700"
                        disabled={busy}
                        on:click={() => remove(mission)}>Delete</Button
                    >
                </div>
            </div>

            {#if uploadFor == mission.id}
                <form
                    class="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col gap-4"
                    on:submit|preventDefault={() => upload(mission)}
                >
                    <div>
                        <h4 class="text-sm font-semibold text-gray-900">
                            Add version {mission.versions.reduce(
                                (n, v) => Math.max(n, v.number),
                                0
                            ) + 1} from a file
                        </h4>
                        <p class="text-xs text-gray-500">
                            A program saved in the SPIKE app, such as one from the team's Drive
                            folder.
                        </p>
                    </div>
                    <label
                        for="upload-file-{mission.id}"
                        class="flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-4 cursor-pointer transition-colors {dragging
                            ? 'border-blue-500 bg-blue-50'
                            : uploadFile
                              ? 'border-green-300 bg-white'
                              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'}"
                        on:dragover|preventDefault={() => (dragging = true)}
                        on:dragleave={() => (dragging = false)}
                        on:drop|preventDefault={(e) => {
                            dragging = false;
                            pickFile(e.dataTransfer?.files);
                        }}
                    >
                        {#if uploadFile}
                            <FileCodeOutline class="w-8 h-8 shrink-0 text-green-600" />
                            <span class="flex-1 min-w-0">
                                <span class="block text-sm font-medium text-gray-900 truncate"
                                    >{uploadFile.name}</span
                                >
                                <span class="block text-xs text-gray-500"
                                    >{sizeText(uploadFile.size)} · click to pick a different file</span
                                >
                            </span>
                        {:else}
                            <UploadOutline class="w-8 h-8 shrink-0 text-gray-400" />
                            <span class="flex-1">
                                <span class="block text-sm font-medium text-gray-900"
                                    >Choose a .llsp3 file</span
                                >
                                <span class="block text-xs text-gray-500">or drop it here</span>
                            </span>
                        {/if}
                        <input
                            id="upload-file-{mission.id}"
                            type="file"
                            accept=".llsp3"
                            class="sr-only"
                            on:change={(e) => pickFile(e.currentTarget.files)}
                        />
                    </label>
                    <div class="grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-3">
                        <div>
                            <Label for="upload-note-{mission.id}" class="mb-1"
                                >What changed or where it came from</Label
                            >
                            <Input
                                id="upload-note-{mission.id}"
                                size="sm"
                                bind:value={uploadNote}
                                maxlength={300}
                                placeholder="Saturday meeting"
                            />
                        </div>
                        <div>
                            <Label for="upload-date-{mission.id}" class="mb-1"
                                >Saved on <span class="font-normal text-gray-500">(optional)</span
                                ></Label
                            >
                            <Input
                                id="upload-date-{mission.id}"
                                size="sm"
                                type="date"
                                bind:value={uploadDate}
                            />
                        </div>
                    </div>
                    <div class="flex flex-row justify-end gap-2">
                        <Button size="sm" color="alternative" on:click={() => (uploadFor = '')}
                            >Cancel</Button
                        >
                        <Button type="submit" size="sm" disabled={busy || !uploadFile}
                            >Add version</Button
                        >
                    </div>
                </form>
            {/if}

            {#if mission.versions.length > 0}
                <ul class="flex flex-col divide-y divide-gray-100 border-t border-gray-100">
                    {#each newestFirst(mission.versions) as version (version.id)}
                        <li class="flex flex-row flex-wrap items-center gap-3 py-2">
                            <div class="flex-1 min-w-[14rem]">
                                <div class="flex flex-wrap items-center gap-2 text-sm">
                                    <span class="font-medium">Version {version.number}</span>
                                    {#if mission.current == version.id}
                                        <span
                                            class="text-xs font-medium rounded-full px-2 py-0.5 bg-green-600 text-white"
                                            >Competition version</span
                                        >
                                    {/if}
                                    <span class="text-gray-800">{version.note}</span>
                                </div>
                                <div class="text-xs text-gray-500">
                                    {byLine(version)}{version.from
                                        ? ` · made from version ${mission.versions.find((v) => v.id == version.from)?.number ?? '?'}`
                                        : ''}
                                </div>
                            </div>
                            <div class="flex flex-row flex-wrap gap-2">
                                <Button
                                    size="xs"
                                    color={mission.current == version.id ? 'green' : 'light'}
                                    disabled={busy}
                                    title="The version the robot runs at the competition"
                                    on:click={() => toggleCurrent(mission, version)}
                                    >{mission.current == version.id
                                        ? 'Stop using at competition'
                                        : 'Use at competition'}</Button
                                >
                                <Button
                                    size="xs"
                                    color="light"
                                    href={versionDownloadUrl(mission.id, version.id)}
                                    >Download</Button
                                >
                                <Button
                                    size="xs"
                                    color="light"
                                    class="text-red-700"
                                    disabled={busy}
                                    on:click={() => removeVersion(mission, version)}>Delete</Button
                                >
                            </div>
                        </li>
                    {/each}
                </ul>
            {:else}
                <p class="text-sm text-gray-500">No versions yet.</p>
            {/if}
        </div>
    {/each}
</section>
