<script lang="ts" context="module">
    export type GuideSection =
        | 'start'
        | 'lessons'
        | 'challenges'
        | 'examples'
        | 'assignments'
        | 'students'
        | 'assets'
        | 'agents'
        | 'settings';
</script>

<script lang="ts">
    // The coach guide: what each tab is for and a first-time checklist.
    // Opened from the Guide button; it starts at the section for the tab
    // the coach is on.
    import { createEventDispatcher, tick } from 'svelte';
    import { Button, Modal } from 'flowbite-svelte';

    export let open = false;
    export let section: GuideSection = 'start';

    const dispatch = createEventDispatcher<{ go: GuideSection }>();

    const sections: { id: GuideSection; label: string; tab?: string }[] = [
        { id: 'start', label: 'Getting started' },
        { id: 'lessons', label: 'Lessons', tab: 'Lessons' },
        { id: 'challenges', label: 'Challenges', tab: 'Challenges' },
        { id: 'examples', label: 'Example programs', tab: 'Example programs' },
        { id: 'assignments', label: 'Assignments', tab: 'Assignments' },
        { id: 'students', label: 'Students', tab: 'Students' },
        { id: 'assets', label: 'Robots and maps', tab: 'Robots and maps' },
        { id: 'agents', label: 'AI assistants', tab: 'AI assistants' },
        { id: 'settings', label: 'Team settings', tab: 'Team settings' }
    ];

    let body: HTMLElement;
    let current: GuideSection = section;

    $: if (open) jump(section);

    async function jump(id: GuideSection) {
        current = id;
        await tick();
        const target = body?.querySelector(`[data-section="${id}"]`);
        if (target && body) body.scrollTop = (target as HTMLElement).offsetTop - body.offsetTop;
    }

    function go(id: GuideSection) {
        open = false;
        dispatch('go', id);
    }
</script>

<Modal title="Coach guide" bind:open size="xl">
    <div class="flex flex-col md:flex-row gap-4 text-sm leading-relaxed">
        <nav
            class="md:w-48 shrink-0 flex flex-row md:flex-col gap-1 overflow-x-auto pb-1 md:pb-0"
            aria-label="Guide sections"
        >
            {#each sections as s}
                <button
                    class="text-left whitespace-nowrap rounded-md px-3 py-1.5 {current == s.id
                        ? 'bg-blue-50 text-blue-800 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'}"
                    aria-current={current == s.id ? 'true' : undefined}
                    on:click={() => jump(s.id)}>{s.label}</button
                >
            {/each}
        </nav>

        <div
            bind:this={body}
            class="flex-1 max-h-[65dvh] overflow-y-auto pr-1 flex flex-col gap-6 text-gray-700"
        >
            <section data-section="start" class="flex flex-col gap-2">
                <h3 class="text-base font-semibold text-gray-900">Getting started</h3>
                <p>
                    This page is where coaches set up what students see in the simulator. Students
                    never come here: everything you publish appears in their code panel, under the
                    Lessons, Examples and Challenges buttons.
                </p>
                <p class="font-medium text-gray-900">For a new team, in this order:</p>
                <ol class="list-decimal ml-5 flex flex-col gap-1">
                    <li>
                        <b>Students:</b> paste the names, then print the code cards. Each student signs
                        in with their code so their progress follows them between computers.
                    </li>
                    <li>
                        <b>Robots and maps:</b> check the robot and field that load when someone opens
                        the simulator, and upload your own if you have them.
                    </li>
                    <li>
                        <b>Lessons and challenges:</b> look through what's there, edit or write your
                        own, and press Publish on the ones students should see.
                    </li>
                    <li>
                        <b>Assignments:</b> pick lessons and a due date, and mark it as practice or as
                        prep for the next meeting. Students see it at the top of their Lessons window,
                        and you see who is done.
                    </li>
                </ol>
                <p class="font-medium text-gray-900">Drafts and publishing</p>
                <p>
                    New and imported lessons and challenges, and anything an AI assistant writes or
                    sets as an assignment, start as a <b>draft</b>, marked with a grey Draft badge.
                    Students can't see drafts. Press
                    <b>Publish</b> when it's ready, and <b>Unpublish</b> to hide it again without losing
                    it.
                </p>
                <p class="font-medium text-gray-900">Who can use this page</p>
                <p>
                    Coaches sign in with their email address and a code sent to it. Everything here
                    is shared by all the coaches, so a change one coach makes is seen by everyone.
                </p>
            </section>

            <section data-section="lessons" class="flex flex-col gap-2">
                <h3 class="text-base font-semibold text-gray-900">Lessons</h3>
                <p>
                    Step-by-step activities. A lesson has a <b>Set up</b> button that loads the right
                    field, robot and starting program, steps students tick off, and an optional check
                    that runs their program five times to see if it works.
                </p>
                <ul class="list-disc ml-5 flex flex-col gap-1">
                    <li>
                        <b>New lesson</b> opens the editor, with a live preview of what students see.
                    </li>
                    <li>
                        <b>Add a check</b> in the editor shows the field's mat: draw where the robot
                        must stop, waypoints, stay-out zones or a line to follow, then pick how many
                        of the five runs must pass.
                    </li>
                    <li>
                        <b>Related challenges</b> show up as "Ready for more?" once a student finishes
                        the lesson. They're extra practice and never needed to finish it.
                    </li>
                    <li>
                        <b>Download package</b> saves a lesson with its field, robot and programs as
                        a .zip.
                        <b>Import a lesson</b> adds one from another team, as a draft.
                    </li>
                </ul>
                <Button size="xs" color="light" class="self-start" on:click={() => go('lessons')}
                    >Go to Lessons</Button
                >
            </section>

            <section data-section="challenges" class="flex flex-col gap-2">
                <h3 class="text-base font-semibold text-gray-900">Challenges</h3>
                <p>
                    Short goals with no steps, like "stop on green 4 out of 5 times". Students start
                    one, write their own program and press the green Check button in the simulator.
                    Hints show one at a time if they ask.
                </p>
                <ul class="list-disc ml-5 flex flex-col gap-1">
                    <li>
                        <b>New challenge</b> asks for a title, level (1 to 3 stars), goal, field, hints
                        and the check, drawn on the mat the same way as in lessons.
                    </li>
                    <li>
                        Write the goal so it matches the check: what to do, how well, how many runs
                        out of five and on which realism.
                    </li>
                    <li>
                        <b>Order</b> sets where it appears in the students' list. Lower numbers come
                        first.
                    </li>
                    <li>
                        Deleting a challenge loses students' progress on it, so unpublish it instead
                        if you might want it back.
                    </li>
                </ul>
                <Button size="xs" color="light" class="self-start" on:click={() => go('challenges')}
                    >Go to Challenges</Button
                >
            </section>

            <section data-section="examples" class="flex flex-col gap-2">
                <h3 class="text-base font-semibold text-gray-900">Example programs</h3>
                <p>
                    Programs students open from the Examples window to see how something is done.
                    Upload a .llsp3 file saved from the SPIKE app or the simulator, then press
                    <b>Add an explanation</b> to say what it does and what to try changing. Programs
                    without one still open, but students get no explanation.
                </p>
                <Button size="xs" color="light" class="self-start" on:click={() => go('examples')}
                    >Go to Example programs</Button
                >
            </section>

            <section data-section="assignments" class="flex flex-col gap-2">
                <h3 class="text-base font-semibold text-gray-900">Assignments</h3>
                <p>
                    <b>New assignment</b> picks one or more published lessons, an optional due date and
                    a note. Students who are signed in see it at the top of their Lessons window.
                </p>
                <p>
                    <b>Type</b> tells students what it's for: <b>Practice</b> to go over what you've
                    already covered, or <b>Prep for next meeting</b> to get ready for what's next. It
                    shows as a badge on their list. Leave it as No type if neither fits.
                </p>
                <p>
                    Under each assignment there's a row for every student: <b>Not started</b>, how
                    many steps they've ticked, or <b>Done</b>. A lesson is done when every step is
                    ticked, its check has passed and the student has pressed Hand in. A link to the
                    handed-in program appears so you can download it and look at it.
                </p>
                <p>
                    Progress only reaches you if the student is signed in. Without a code it stays
                    in their browser, and students see a reminder to sign in. When they do sign in,
                    they're asked whether the work already on that computer is theirs before it's
                    added to their account.
                </p>
                <p>
                    An assignment an AI assistant sets is a draft until you press <b>Publish</b> on it.
                    An assistant can also read this progress, so you can ask it who still has work to
                    do.
                </p>
                <Button
                    size="xs"
                    color="light"
                    class="self-start"
                    on:click={() => go('assignments')}>Go to Assignments</Button
                >
            </section>

            <section data-section="students" class="flex flex-col gap-2">
                <h3 class="text-base font-semibold text-gray-900">Students</h3>
                <p>
                    Paste names one per line. First name and last initial is enough; don't add
                    emails. Each student gets a code like <code>MAPLE-ROCKET-42</code>.
                </p>
                <ul class="list-disc ml-5 flex flex-col gap-1">
                    <li>
                        <b>Print code cards</b> makes cut-out cards with a QR code that signs the student
                        in when scanned.
                    </li>
                    <li>
                        <b>Copy link</b> gives one student's sign-in link to send them.
                        <b>Export CSV</b>
                        is for a mail merge; it holds every code, so keep it private.
                    </li>
                    <li>
                        If a code gets shared around, press <b>New code</b>. The old one stops
                        working and the student keeps their progress.
                    </li>
                </ul>
                <Button size="xs" color="light" class="self-start" on:click={() => go('students')}
                    >Go to Students</Button
                >
            </section>

            <section data-section="assets" class="flex flex-col gap-2">
                <h3 class="text-base font-semibold text-gray-900">Robots and maps</h3>
                <p>
                    The robots and the fields (scenes with their mats) that everything runs on.
                    <b>Make default</b> picks the robot and field that load when someone opens the simulator.
                </p>
                <ul class="list-disc ml-5 flex flex-col gap-1">
                    <li>
                        Upload a robot as a .mpd or .ldr model (for example from Studio), or a field
                        as a .spk scene.
                    </li>
                    <li>
                        Or set it up in the simulator, open <b>Save</b> and use Save robot or Save scene
                        under "Save to the shared library" (shown to coaches only). It's added here.
                    </li>
                    <li>
                        An AI assistant can draw a new field from a description (lines, shapes,
                        labels, the robot's start, walls and blocks) or add robot and scene files.
                        These are ready to use at once and marked "From an assistant".
                    </li>
                    <li>
                        Lessons and challenges refer to fields and robots by file name, so renaming
                        or deleting one can break them. They show a warning badge when that happens.
                    </li>
                </ul>
                <Button size="xs" color="light" class="self-start" on:click={() => go('assets')}
                    >Go to Robots and maps</Button
                >
            </section>

            <section data-section="agents" class="flex flex-col gap-2">
                <h3 class="text-base font-semibold text-gray-900">AI assistants</h3>
                <p>
                    An AI assistant such as Claude, ChatGPT or Copilot can write lessons and
                    challenges (checks included), set assignments, check on students' progress, and
                    add robots and fields. Connect it to this site with the connector address on the
                    AI assistants tab and it can read the library and save straight here. Or have
                    any chatbot make a lesson or challenge file and import it.
                </p>
                <p>
                    Everything an assistant saves has your email on it, shown with a purple "From an
                    assistant" badge. Lessons, challenges and assignments are drafts: look them
                    over, especially the check on the mat, then publish them. Robots and fields are
                    ready to use as soon as they're saved.
                </p>
                <p>
                    What an assistant sees about students is set on the Team settings tab: team
                    statistics only (the default), or each student's name and progress as well.
                </p>
                <Button size="xs" color="light" class="self-start" on:click={() => go('agents')}
                    >Go to AI assistants</Button
                >
            </section>

            <section data-section="settings" class="flex flex-col gap-2">
                <h3 class="text-base font-semibold text-gray-900">Team settings</h3>
                <p>
                    Privacy choices for the whole team. If the site has head coaches set up, only
                    they can change them.
                </p>
                <ul class="list-disc ml-5 flex flex-col gap-1">
                    <li>
                        <b>What AI assistants see:</b> team statistics per lesson (how many are done,
                        and which steps students are stuck on), or each student by name as well.
                    </li>
                    <li>
                        <b>Shared computers:</b> sign students out after a while without using the site,
                        and clear the code panel for the next person.
                    </li>
                    <li>
                        <b>For families:</b> your team name and a privacy contact, which fill in the
                        privacy page and a note you can copy and send home.
                    </li>
                    <li>
                        <b>End of the season:</b> remove every student and their work in one go.
                    </li>
                </ul>
                <Button size="xs" color="light" class="self-start" on:click={() => go('settings')}
                    >Go to Team settings</Button
                >
            </section>
        </div>
    </div>
</Modal>
