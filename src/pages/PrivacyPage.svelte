<script lang="ts">
    // The privacy notice for students and families, at /privacy. It reads the
    // team settings so it says what this site actually does.
    import { onMount } from 'svelte';
    import { loadSettings, settingsStore } from '$lib/settings';

    onMount(loadSettings);

    $: team = $settingsStore.teamName;
</script>

<svelte:head>
    <title>Privacy · LEGO SPIKE Simulator</title>
</svelte:head>

<div class="min-h-dvh bg-gray-50 text-gray-900">
    <header class="bg-white border-b border-gray-200">
        <div class="max-w-3xl mx-auto px-4 py-3 flex flex-row items-center gap-3 flex-wrap">
            <img src="icons/SensorHub.svg" alt="" width="32" height="32" />
            <div class="flex flex-col">
                <h1 class="text-xl font-semibold leading-tight">Privacy</h1>
                <span class="text-sm text-gray-500"
                    >LEGO SPIKE Simulator{#if team}&nbsp;· {team}{/if}</span
                >
            </div>
            <div class="flex-1"></div>
            <a
                href="./"
                class="text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-100"
                >Open the simulator</a
            >
        </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-5 leading-relaxed">
        <p class="text-lg">
            This site is a robot programming simulator for a FIRST LEGO League team. It's made for
            students, many of them under 13, so it keeps as little as it can.
        </p>

        <section class="flex flex-col gap-2">
            <h2 class="text-lg font-semibold">The short version</h2>
            <ul class="list-disc ml-5 flex flex-col gap-1">
                <li>
                    No sign-up and no email addresses. Students sign in with a code from their
                    coach, and anyone can use the simulator without signing in.
                </li>
                <li>
                    No ads, no cookies for students, and nothing that follows anyone across sites.
                </li>
                <li>
                    Students who sign in with a code from their coach save their progress on the
                    team's own server. Only the team's coaches can see it.
                </li>
                <li>Nothing a student makes is shown to other students or to the public.</li>
            </ul>
        </section>

        <section class="flex flex-col gap-2">
            <h2 class="text-lg font-semibold">Kept in your browser</h2>
            <p>
                To work, the simulator saves a few things in your browser's own storage on this
                computer: your program, your progress on lessons and challenges, simulator settings,
                and your sign-in code if you signed in. They never leave the computer unless you're
                signed in. Clearing the browser's site data removes them. These aren't cookies, and
                they aren't used to track you.
            </p>
        </section>

        <section class="flex flex-col gap-2">
            <h2 class="text-lg font-semibold">Kept on the team's server, if you sign in</h2>
            <ul class="list-disc ml-5 flex flex-col gap-1">
                <li>
                    The name your coach typed in (a first name and last initial) and your sign-in
                    code.
                </li>
                <li>Which lesson steps you ticked, and your check and challenge results.</li>
                <li>The programs you hand in.</li>
            </ul>
            <p>
                No email addresses, birthdays, photos or locations. The server is run by the team,
                not by a company.
            </p>
        </section>

        <section class="flex flex-col gap-2">
            <h2 class="text-lg font-semibold">Who can see it</h2>
            <p>
                Only the team's coaches, who sign in separately. Coaches may use an AI assistant
                (such as Claude or ChatGPT) to help plan lessons.
                {#if $settingsStore.aiStudentNames == 'names'}
                    The head coach has allowed it to see students' names and progress, so that
                    information goes to the company that runs the assistant.
                {:else}
                    It only sees team statistics, like how many students finished a lesson, and
                    never anyone's name or progress.
                {/if}
            </p>
        </section>

        <section class="flex flex-col gap-2">
            <h2 class="text-lg font-semibold">Cookies and visit counts</h2>
            <p>
                The site sets no cookies for students. Coaches get one sign-in cookie when they log
                in to the coach pages.
            </p>
            <p>
                The site is reached through Cloudflare, which protects it from attacks. To do that
                it handles connection details such as your internet address, and it counts visits:
                how many, which pages, and roughly which country and browser. The team only sees
                those totals, never who visited or what any one person did.
            </p>
        </section>

        <section class="flex flex-col gap-2">
            <h2 class="text-lg font-semibold">How long it's kept</h2>
            <p>
                Until a coach removes the student from the team, which deletes their progress and
                programs too. Coaches clear the team at the end of each season.
                {#if $settingsStore.signOutAfterMinutes > 0}
                    On shared computers, students are signed out automatically after {$settingsStore.signOutAfterMinutes >=
                    60
                        ? `${$settingsStore.signOutAfterMinutes / 60} hour${$settingsStore.signOutAfterMinutes > 60 ? 's' : ''}`
                        : `${$settingsStore.signOutAfterMinutes} minutes`} without using the site.
                {/if}
            </p>
        </section>

        <section class="flex flex-col gap-2">
            <h2 class="text-lg font-semibold">Questions, or to have information removed</h2>
            <p>
                Ask your coach. A coach can remove a student and everything saved for them at any
                time.
            </p>
        </section>

        <p class="text-xs text-gray-500">
            The simulator is free software under the GNU General Public License version 2, based on
            the LEGO SPIKE Simulator by Alexandre Hardy. LEGO and SPIKE are trademarks of the LEGO
            Group; FIRST and FIRST LEGO League are trademarks of FIRST. This site is not affiliated
            with or endorsed by either.
        </p>
    </main>
</div>
