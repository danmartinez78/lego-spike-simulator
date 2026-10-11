<script lang="ts">
    // Coach page: team settings the head coach chooses, the note for families,
    // and the end-of-season clear-out.
    import { onMount } from 'svelte';
    import { Button, Input, Label, Spinner } from 'flowbite-svelte';
    import { askConfirm } from '$lib/confirm';
    import {
        AI_NAME_CHOICES,
        DEFAULT_SETTINGS,
        SIGN_OUT_CHOICES,
        getCoachSettings,
        parentNotice,
        privacyAddress,
        saveCoachSettings,
        type TeamSettings
    } from '$lib/settings';
    import { getRoster, removeAllStudents } from '$lib/team';

    let settings: TeamSettings = { ...DEFAULT_SETTINGS };
    let saved: TeamSettings = { ...DEFAULT_SETTINGS };
    let canEdit = false;
    let headCoaches = false;
    let loading = true;
    let busy = false;
    let message = '';
    let failed = false;
    let studentCount = 0;

    onMount(async () => {
        try {
            const result = await getCoachSettings();
            settings = { ...result.settings };
            saved = { ...result.settings };
            canEdit = result.canEdit;
            headCoaches = result.headCoaches;
            studentCount = (await getRoster()).students.length;
        } catch (e) {
            failed = true;
            message = (e as Error).message;
        }
        loading = false;
    });

    $: changed = JSON.stringify(settings) != JSON.stringify(saved);
    $: notice = parentNotice(saved);

    async function save() {
        busy = true;
        message = '';
        try {
            const result = await saveCoachSettings(settings);
            settings = { ...result.settings };
            saved = { ...result.settings };
            failed = false;
            message = 'Saved. Students and assistants get the new settings straight away.';
        } catch (e) {
            failed = true;
            message = (e as Error).message;
        }
        busy = false;
    }

    async function copyNotice() {
        try {
            await navigator.clipboard.writeText(notice);
            failed = false;
            message = 'Copied the note for families.';
        } catch {
            failed = true;
            message = "Couldn't copy. Select the text and copy it instead.";
        }
    }

    async function clearSeason() {
        if (
            !(await askConfirm(
                `Remove all ${studentCount} students, with their progress and handed-in programs? Their codes stop working. This can't be undone, so download a backup from the Students tab first if you want to keep anything.`,
                { confirmLabel: 'Remove everyone', danger: true }
            ))
        ) {
            return;
        }
        busy = true;
        try {
            studentCount = (await removeAllStudents()).students.length;
            failed = false;
            message = 'Removed every student and their work.';
        } catch (e) {
            failed = true;
            message = (e as Error).message;
        }
        busy = false;
    }
</script>

<section class="flex flex-col gap-4">
    <div>
        <h2 class="text-lg font-semibold">Team settings</h2>
        <p class="text-gray-600 text-sm">
            Choices about students' privacy for the whole team.
            {#if headCoaches}
                Only head coaches can change them.
            {:else}
                Any coach can change them.
            {/if}
        </p>
    </div>

    {#if message}
        <div
            role="status"
            class="rounded-lg px-4 py-2 text-sm break-words {failed
                ? 'bg-red-50 text-red-800 border border-red-200'
                : 'bg-green-50 text-green-800 border border-green-200'}"
        >
            {message}
        </div>
    {/if}

    {#if loading}
        <div class="flex flex-row gap-2 items-center text-gray-600 text-sm">
            <Spinner size="4" /> Loading the settings…
        </div>
    {:else}
        {#if !canEdit}
            <p
                class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2"
            >
                You can see these settings, but only a head coach can change them.
            </p>
        {/if}
        <form
            class="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-5"
            on:submit|preventDefault={save}
        >
            <fieldset class="flex flex-col gap-2" disabled={!canEdit}>
                <legend class="font-medium">What AI assistants see about students</legend>
                <p class="text-sm text-gray-600">
                    When a coach's AI assistant (Claude, ChatGPT and others) asks how an assignment
                    is going, its answer goes to the company that runs the assistant.
                </p>
                {#each AI_NAME_CHOICES as choice}
                    <label class="flex flex-row items-start gap-2 text-sm">
                        <input
                            type="radio"
                            class="mt-1"
                            name="ai-names"
                            value={choice.value}
                            bind:group={settings.aiStudentNames}
                        />
                        <span><b>{choice.label}.</b> {choice.about}</span>
                    </label>
                {/each}
            </fieldset>

            <fieldset class="flex flex-col gap-2" disabled={!canEdit}>
                <legend class="font-medium">Shared computers</legend>
                <p class="text-sm text-gray-600">
                    On computers students share, a student who walks away stays signed in. Signing
                    them out after a while also clears the code panel for the next person.
                </p>
                <select
                    class="rounded-lg border-gray-300 text-sm max-w-md"
                    bind:value={settings.signOutAfterMinutes}
                    aria-label="Sign students out"
                >
                    {#each SIGN_OUT_CHOICES as choice}
                        <option value={choice.value}>{choice.label}</option>
                    {/each}
                </select>
            </fieldset>

            <fieldset class="flex flex-col gap-3" disabled={!canEdit}>
                <legend class="font-medium">For families</legend>
                <div class="flex flex-col gap-1 max-w-md">
                    <Label for="team-name">Team name</Label>
                    <Input
                        id="team-name"
                        size="sm"
                        bind:value={settings.teamName}
                        placeholder="Team 12345 RoboRaptors"
                    />
                </div>
                <div class="flex flex-col gap-1 max-w-md">
                    <Label for="privacy-contact">Who families contact about privacy</Label>
                    <Input
                        id="privacy-contact"
                        size="sm"
                        bind:value={settings.privacyContact}
                        placeholder="Coach Dan, coach@example.org"
                    />
                    <span class="text-xs text-gray-500"
                        >Shown on the privacy page. Leave it empty to say "your coach".</span
                    >
                </div>
            </fieldset>

            {#if canEdit}
                <div class="flex flex-row gap-3 items-center">
                    <Button type="submit" color="blue" size="sm" disabled={busy || !changed}
                        >Save settings</Button
                    >
                    {#if changed}<span class="text-sm text-gray-500">Not saved yet</span>{/if}
                </div>
            {/if}
        </form>

        <div class="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-2">
            <h3 class="font-medium">Note for families</h3>
            <p class="text-sm text-gray-600">
                Send this to families before students start. The full notice is on the <a
                    class="text-blue-700 underline"
                    href={privacyAddress()}
                    target="_blank">privacy page</a
                >.
            </p>
            <pre
                class="whitespace-pre-wrap text-sm bg-gray-50 border border-gray-200 rounded-lg p-3 font-sans">{notice}</pre>
            <Button size="sm" color="light" class="self-start" on:click={copyNotice}
                >Copy the note</Button
            >
        </div>

        {#if canEdit}
            <div class="bg-white rounded-lg border border-red-200 p-4 flex flex-col gap-2">
                <h3 class="font-medium">End of the season</h3>
                <p class="text-sm text-gray-600">
                    Remove every student with their progress and handed-in programs. Lessons,
                    challenges and the rest of the library stay.
                </p>
                <Button
                    size="sm"
                    color="red"
                    outline
                    class="self-start"
                    disabled={busy || studentCount == 0}
                    on:click={clearSeason}
                    >{studentCount == 1
                        ? 'Remove the 1 student'
                        : `Remove all ${studentCount} students`}</Button
                >
            </div>
        {/if}
    {/if}
</section>
