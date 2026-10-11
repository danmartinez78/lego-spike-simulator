<script lang="ts">
    import { Button, Checkbox, Modal } from 'flowbite-svelte';
    import { helpStore, closeWelcome, openGuide } from '$lib/help';

    let dontShowAgain = true;
    let wasOpen = $helpStore.welcomeOpen;

    function start() {
        closeWelcome(dontShowAgain);
    }

    function guide() {
        closeWelcome(dontShowAgain);
        openGuide('start');
    }

    // Closing with the X or the backdrop also counts.
    $: {
        if (wasOpen && !$helpStore.welcomeOpen) {
            closeWelcome(dontShowAgain);
        }
        wasOpen = $helpStore.welcomeOpen;
    }
</script>

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    title="Welcome to the LEGO SPIKE Simulator"
    size="lg"
    bind:open={$helpStore.welcomeOpen}
>
    <div class="flex flex-col gap-4">
        <p>
            Program a virtual SPIKE Prime robot with the same blocks as the LEGO SPIKE app, then
            watch it drive on a competition mat. Everything runs in your browser, so nothing gets
            installed.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="flex flex-col gap-2 items-center text-center p-3 rounded-lg bg-gray-50">
                <img alt="code" width="40" height="40" src="icons/BlocklyIcon.svg" />
                <div class="font-medium">1. Write a program</div>
                <div class="text-sm">
                    Drag blocks from the categories on the left. Start with "when program starts".
                </div>
            </div>
            <div class="flex flex-col gap-2 items-center text-center p-3 rounded-lg bg-gray-50">
                <img alt="simulator" width="40" height="40" src="icons/Brick.svg" />
                <div class="font-medium">2. Open the simulator</div>
                <div class="text-sm">
                    Click the red brick. A robot and field may already be loaded for you.
                </div>
            </div>
            <div class="flex flex-col gap-2 items-center text-center p-3 rounded-lg bg-gray-50">
                <img alt="play" width="40" height="40" src="icons/GenericPlayIcon.svg" />
                <div class="font-medium">3. Press play</div>
                <div class="text-sm">
                    Watch the robot run your code. Press stop, change the code, try again.
                </div>
            </div>
        </div>
        <div class="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 text-sm">
            <p>
                <b>Not sure where to start?</b> Press <b>Lessons</b> in the code panel. Each lesson walks
                you through one idea, step by step, and ends with a check that tells you when your robot
                got it right.
            </p>
            <p>
                <b>Got a code card from your coach?</b> Press <b>Sign in</b> and type your code. Then
                you'll see your assignments, and your coach sees your progress.
            </p>
        </div>
        <p
            class="sm:hidden rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
            Building programs works best on a laptop, Chromebook or tablet. On a phone you can look
            around, but the blocks are hard to drag.
        </p>
        <p class="text-sm text-gray-600">
            This browser keeps your program for you, even if you close the page. You can reopen this
            help any time with the <b>Help</b> button.
        </p>
        <p class="text-xs text-gray-500">
            Based on the LEGO SPIKE Simulator by Alexandre Hardy. Free software under the GNU GPL
            version 2. See About in the guide for credits and source code. No ads, no cookies: read
            the <a class="underline" href="privacy" target="_blank">privacy notice</a>.
        </p>
        <div class="flex flex-row flex-wrap gap-3 items-center">
            <Checkbox bind:checked={dontShowAgain}>Don't show this again</Checkbox>
            <div class="flex-1" />
            <Button color="light" on:click={guide}>Read the guide</Button>
            <Button color="blue" on:click={start}>Start coding</Button>
        </div>
    </div>
</Modal>
