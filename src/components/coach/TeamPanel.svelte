<script lang="ts">
    // Coach page: the team roster with each student's sign-in code.
    import { createEventDispatcher, onMount } from 'svelte';
    import { Button, Input, Label, Spinner, Textarea } from 'flowbite-svelte';
    import { askConfirm } from '$lib/confirm';
    import {
        addStudents,
        getRoster,
        newCode,
        removeStudent,
        renameStudent,
        rosterCsv,
        signInLink,
        type Student
    } from '$lib/team';

    const dispatch = createEventDispatcher<{ print: Student[] }>();

    let students: Student[] = [];
    let loading = true;
    let names = '';
    let message = '';
    let failed = false;
    let busy = '';
    let showCodes = false;
    let shown = new Set<string>();
    let renaming = '';
    let newName = '';

    onMount(() => run('load', getRoster, ''));

    async function run(key: string, action: () => Promise<{ students: Student[] }>, done: string) {
        busy = key;
        message = '';
        try {
            students = (await action()).students;
            failed = false;
            message = done;
        } catch (e) {
            failed = true;
            message = (e as Error).message;
        }
        busy = '';
        loading = false;
    }

    async function add() {
        const list = names
            .split('\n')
            .map((n) => n.trim())
            .filter((n) => n.length > 0);
        if (list.length == 0) {
            failed = true;
            message = 'Type at least one name, one per line.';
            return;
        }
        await run(
            'add',
            () => addStudents(list),
            `Added ${list.length} student${list.length == 1 ? '' : 's'}, each with their own code.`
        );
        if (!failed) names = '';
    }

    async function regenerate(s: Student) {
        if (
            await askConfirm(
                `Give ${s.name} a new code? Their old code stops working, so they'll need a new card or link.`,
                { confirmLabel: 'New code' }
            )
        ) {
            await run(`code ${s.id}`, () => newCode(s.id), `${s.name} has a new code.`);
            shown = new Set([...shown, s.id]);
        }
    }

    async function remove(s: Student) {
        if (
            await askConfirm(`Remove ${s.name} from the team? Their code stops working.`, {
                confirmLabel: 'Remove',
                danger: true
            })
        ) {
            await run(`remove ${s.id}`, () => removeStudent(s.id), `Removed ${s.name}.`);
        }
    }

    async function finishRename(s: Student) {
        const name = newName.trim();
        if (!name || name == s.name) {
            renaming = '';
            return;
        }
        await run(`rename ${s.id}`, () => renameStudent(s.id, name), `Renamed to ${name}.`);
        if (!failed) renaming = '';
    }

    async function copyLink(s: Student) {
        const link = signInLink(s.code);
        try {
            await navigator.clipboard.writeText(link);
            failed = false;
            message = `Copied ${s.name}'s sign-in link. Send it only to ${s.name}.`;
        } catch {
            failed = false;
            message = `${s.name}'s sign-in link: ${link}`;
        }
    }

    function exportCsv() {
        const blob = new Blob([rosterCsv(students)], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'team codes.csv';
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
        failed = false;
        message =
            'Downloaded the codes as a spreadsheet for a mail merge. It holds every code, so keep it private.';
    }

    function toggleShown(id: string) {
        const next = new Set(shown);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        shown = next;
    }

    $: sorted = [...students].sort((a, b) => a.name.localeCompare(b.name));
</script>

<section class="flex flex-col gap-3">
    <div>
        <h2 class="text-lg font-semibold">Students</h2>
        <p class="text-gray-600 text-sm">
            Each student gets their own random code. Hand out the printed cards, or send each
            student only their own link. Students without a code can still use the simulator.
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

    <form
        class="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-2"
        on:submit|preventDefault={add}
    >
        <Label for="student-names">Add students, one per line</Label>
        <Textarea id="student-names" rows={3} bind:value={names} placeholder={'Maya R.\nLeo K.'} />
        <div class="flex flex-row flex-wrap items-center gap-3">
            <Button type="submit" color="blue" size="sm" disabled={busy != ''}>Add students</Button>
            <span class="text-xs text-gray-500"
                >First name and last initial is enough. Don't add emails or other details.</span
            >
        </div>
    </form>

    {#if loading}
        <div class="flex flex-row gap-2 items-center text-gray-600 text-sm">
            <Spinner size="4" /> Loading the team…
        </div>
    {:else if students.length > 0}
        <div class="flex flex-row flex-wrap items-center gap-2">
            <Button size="sm" color="light" on:click={() => dispatch('print', sorted)}
                >Print code cards</Button
            >
            <Button size="sm" color="light" on:click={exportCsv}>Export CSV</Button>
            <label class="flex flex-row items-center gap-2 text-sm text-gray-700 ml-auto">
                <input type="checkbox" bind:checked={showCodes} class="rounded" />
                Show all codes
            </label>
        </div>

        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <ul class="divide-y divide-gray-200">
                {#each sorted as s (s.id)}
                    <li class="flex flex-row flex-wrap items-center gap-3 px-4 py-3">
                        <div class="flex-1 min-w-[12rem]">
                            {#if renaming == s.id}
                                <form
                                    class="flex flex-row flex-wrap items-center gap-2"
                                    on:submit|preventDefault={() => finishRename(s)}
                                >
                                    <Input
                                        size="sm"
                                        class="max-w-xs"
                                        bind:value={newName}
                                        aria-label="New name for {s.name}"
                                    />
                                    <Button size="xs" color="blue" type="submit">Save name</Button>
                                    <Button size="xs" color="light" on:click={() => (renaming = '')}
                                        >Cancel</Button
                                    >
                                </form>
                            {:else}
                                <div class="font-medium">{s.name}</div>
                            {/if}
                            <div class="text-sm text-gray-500 flex flex-row items-center gap-2">
                                Code
                                {#if showCodes || shown.has(s.id)}
                                    <span class="font-mono tracking-wider text-gray-800"
                                        >{s.code}</span
                                    >
                                {:else}
                                    <span class="font-mono text-gray-400">••••••••</span>
                                {/if}
                                {#if !showCodes}
                                    <button
                                        class="text-blue-700 hover:underline text-xs"
                                        on:click={() => toggleShown(s.id)}
                                        >{shown.has(s.id) ? 'hide' : 'show'}</button
                                    >
                                {/if}
                            </div>
                        </div>
                        {#if renaming != s.id}
                            <div class="flex flex-row gap-2 flex-wrap">
                                <Button size="xs" color="light" on:click={() => copyLink(s)}
                                    >Copy link</Button
                                >
                                <Button
                                    size="xs"
                                    color="light"
                                    on:click={() => dispatch('print', [s])}>Print card</Button
                                >
                                <Button
                                    size="xs"
                                    color="light"
                                    disabled={busy != ''}
                                    on:click={() => regenerate(s)}>New code</Button
                                >
                                <Button
                                    size="xs"
                                    color="light"
                                    disabled={busy != ''}
                                    on:click={() => {
                                        renaming = s.id;
                                        newName = s.name;
                                    }}>Rename</Button
                                >
                                <Button
                                    size="xs"
                                    color="red"
                                    outline
                                    disabled={busy != ''}
                                    on:click={() => remove(s)}>Remove</Button
                                >
                            </div>
                        {/if}
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
</section>
