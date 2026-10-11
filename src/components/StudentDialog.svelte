<script lang="ts">
    // Student sign-in with the code from the coach's card.
    import { Button, Input, Label, Modal } from 'flowbite-svelte';
    import { pendingCode, signIn, studentStore } from '$lib/team';
    import { signOutStudent } from '$lib/homework';

    export let modalOpen = false;

    let code = '';
    let problem = '';
    let busy = false;

    function opened(open: boolean) {
        if (!open) return;
        problem = '';
        if ($pendingCode) {
            code = $pendingCode;
            pendingCode.set('');
            submit();
        }
    }

    async function submit() {
        if (code.trim().length == 0) {
            problem = 'Type the code from your card.';
            return;
        }
        busy = true;
        problem = '';
        try {
            await signIn(code.trim());
            code = '';
        } catch (e) {
            problem = (e as Error).message;
        } finally {
            busy = false;
        }
    }

    $: opened(modalOpen);
</script>

<Modal
    backdropClass="fixed inset-0 z-[100] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[110] w-full p-4 flex"
    size="sm"
    title={$studentStore ? 'Signed in' : 'Sign in'}
    bind:open={modalOpen}
>
    {#if $studentStore}
        <div class="flex flex-col gap-4 text-gray-800">
            <p class="text-lg">
                Hi <b>{$studentStore.name}</b>! You're signed in on this device.
            </p>
            <p class="text-sm text-gray-600">
                Not you? Sign out, then sign in with your own code. Keep your code to yourself, like
                a password. Later, press your name in the toolbar to see your work or sign out.
            </p>
            <div class="flex flex-row gap-2 justify-end">
                <Button color="light" on:click={() => signOutStudent(false)}
                    >Not you? Sign out</Button
                >
                <Button color="blue" on:click={() => (modalOpen = false)}>Done</Button>
            </div>
        </div>
    {:else}
        <form class="flex flex-col gap-4 text-gray-800" on:submit|preventDefault={submit}>
            <p class="text-sm text-gray-600">
                Your coach gave you a card with your own code. You only need to do this once on each
                device.
            </p>
            <div>
                <Label for="student-code" class="mb-1">Your code</Label>
                <Input
                    id="student-code"
                    bind:value={code}
                    placeholder="TIGER-ROCKET-42"
                    autocomplete="off"
                    autocapitalize="characters"
                    spellcheck="false"
                    class="uppercase tracking-wider"
                />
            </div>
            {#if problem}
                <p class="text-sm text-red-700" role="alert">{problem}</p>
            {/if}
            <div class="flex flex-row gap-2 justify-end">
                <Button color="light" on:click={() => (modalOpen = false)}>Cancel</Button>
                <Button type="submit" color="blue" disabled={busy}>Sign in</Button>
            </div>
        </form>
    {/if}
</Modal>
