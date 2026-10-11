<script lang="ts">
    import { Modal, TabItem, Tabs } from 'flowbite-svelte';
    import {
        CogOutline,
        EditOutline,
        ToolsOutline,
        ChartLineUpOutline,
        RulerCombinedOutline,
        MapPinAltOutline,
        AwardOutline,
        BookOpenOutline,
        ClipboardCheckOutline,
        QuestionCircleOutline,
        UserCircleOutline
    } from 'flowbite-svelte-icons';
    import { helpStore, openBlockHelp } from '$lib/help';
    import { blockHelp, helpCategories } from '$lib/blockly/blockhelp';
    import { toolbox } from '$lib/blockly/toolbox';

    const categories = helpCategories(toolbox);

    // The tab showing. It follows the store only when a tab is asked for,
    // so clicking tabs isn't undone by other help changes.
    let activeTab = $helpStore.guideTab;
    let lastRequest = $helpStore.guideRequest;
    $: if ($helpStore.guideRequest != lastRequest) {
        lastRequest = $helpStore.guideRequest;
        activeTab = $helpStore.guideTab;
    }
    let search = '';

    function matches(type: string, query: string) {
        const q = query.trim().toLowerCase();
        if (q.length == 0) {
            return true;
        }
        const help = blockHelp[type];
        return (
            help.title.toLowerCase().includes(q) ||
            help.text.toLowerCase().includes(q) ||
            (help.example ?? '').toLowerCase().includes(q)
        );
    }

    $: filtered = categories
        .map((c) => ({ ...c, types: c.types.filter((t) => matches(t, search)) }))
        .filter((c) => c.types.length > 0);

    const codePanel = [
        { icon: 'icons/FolderMedium.svg', text: 'Open a program saved on your computer (.llsp3).' },
        {
            icon: 'icons/FolderMerge.svg',
            text: 'Merge: add another program to this one, for example to borrow its My Blocks.'
        },
        { icon: 'icons/SaveMedium.svg', text: 'Save your program as a file on your computer.' },
        { icon: 'icons/Print.svg', text: 'Print your program (when the simulator is closed).' },
        { icon: 'icons/Brick.svg', text: 'Open or close the simulator.' },
        {
            component: ClipboardCheckOutline,
            text: 'Lessons: step-by-step activities, and any assignments from your coach.'
        },
        { component: BookOpenOutline, text: 'Examples: programs that explain how they work.' },
        {
            component: AwardOutline,
            text: 'Challenges: goals like "stop on green every time". Start one, write a program, then press the green Check button in the simulator.'
        },
        { component: QuestionCircleOutline, text: 'Help: this guide.' },
        {
            component: UserCircleOutline,
            text: 'Sign in with the code from your coach. It turns green and shows your name when you are signed in.'
        }
    ];

    const toolbar = [
        { icon: 'icons/Robot.svg', text: 'Robot: choose a robot from this site.' },
        { icon: 'icons/Scene.svg', text: 'Field: choose the mat the robot drives on.' },
        {
            component: MapPinAltOutline,
            text: 'Place: drag the robot and objects on a top-down view of the mat, and turn them.'
        },
        {
            component: CogOutline,
            text: 'Settings: simulation speed, boundary and realism.'
        },
        {
            component: ChartLineUpOutline,
            text: 'Sensor graph: watch light, distance, yaw and motor readings while the robot runs. Hover after a run to read any moment.'
        },
        {
            component: RulerCombinedOutline,
            text: 'Measure: click points on the mat to see distances and turns for a route, then copy the steps.'
        },
        { icon: 'icons/Eye.svg', text: 'Camera: top view, side views, or follow the robot.' },
        { icon: 'icons/GenericPlayIcon.svg', text: 'Run the program in the code panel.' }
    ];

    const buildTools = [
        {
            icon: 'icons/Robot.svg',
            text: 'Open robot: load a robot model from your computer (.io, .ldr or .mpd).'
        },
        {
            icon: 'icons/HubSmall.svg',
            text: 'Ports: connect the motors and sensors to hub ports A to F.'
        },
        {
            icon: 'icons/wheel.svg',
            text: 'Wheels: tell the simulator which motor drives each wheel.'
        },
        {
            component: EditOutline,
            text: 'Edit field: the scene editor. Choose the mat, add obstacles, or open a field file.'
        },
        {
            icon: 'icons/SaveMedium.svg',
            text: 'Save the robot or field to your computer.'
        }
    ];
</script>

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    title="How to use the simulator"
    size="xl"
    bind:open={$helpStore.guideOpen}
>
    <div class="max-h-[70dvh] overflow-y-auto text-sm leading-relaxed">
        <Tabs style="underline" contentClass="pt-4">
            <TabItem
                open={activeTab == 'start'}
                on:click={() => (activeTab = 'start')}
                title="Getting started"
            >
                <ol class="list-decimal ml-5 flex flex-col gap-2">
                    <li>
                        <b>Write a program.</b> The left panel works like the LEGO SPIKE app. Drag
                        blocks out of the categories (Motor, Movement, Sensor, ...) and snap them
                        under a yellow <i>when program starts</i> block.
                    </li>
                    <li>
                        <b>Open the simulator</b> with the red brick button. If this site has a default
                        robot and field, they load automatically.
                    </li>
                    <li>
                        <b>Press play.</b> The robot runs your program on the mat. Press stop, change
                        the code and run again.
                    </li>
                    <li>
                        <b>Save a copy.</b> The save button in the code panel downloads your program
                        as a .llsp3 file (the LEGO SPIKE app's file type), which opens in the real LEGO
                        SPIKE app too. The folder button opens it again.
                    </li>
                </ol>
                <p class="mt-3">
                    New to coding the robot? The <b>book</b> button in the code panel opens example programs.
                    Each one explains what it does and why, with ideas to try. Open one to start from
                    it, or add it to your program to borrow its My Blocks.
                </p>
                <p class="mt-3">
                    Want a plan? The <b>Lessons</b> button opens step-by-step activities. See the Lessons
                    tab.
                </p>
                <p class="mt-3">
                    This browser keeps your program for you, so closing or reloading the page won't
                    lose it. It is only kept on this computer, though. To work on it somewhere else,
                    save it as a file, or hand it in from a lesson. The 1:1 button changes how wide
                    the code panel is next to the simulator.
                </p>
            </TabItem>
            <TabItem
                open={activeTab == 'lessons'}
                on:click={() => (activeTab = 'lessons')}
                title="Lessons"
            >
                <p>
                    Press <b>Lessons</b> in the code panel. Pick a lesson on the left and work down
                    its steps, ticking each one off as you go. <b>Set up</b> loads the lesson's starter
                    program, field and robot for you.
                </p>
                <p class="mt-3 font-medium">Checking your robot</p>
                <p>
                    Many lessons end with a check. The lesson shows what your robot has to do, with
                    a map of the mat:
                </p>
                <ul class="list-disc ml-5 flex flex-col gap-1 mt-1">
                    <li><span class="font-medium text-green-700">Green</span>: where to stop.</li>
                    <li>
                        <span class="font-medium text-blue-700">Blue</span>: places to drive
                        through, in order.
                    </li>
                    <li>
                        <span class="font-medium text-red-700">Red</span>: places to stay out of.
                    </li>
                    <li>
                        <span class="font-medium text-amber-700">Orange</span>: a line for the color
                        sensor to follow.
                    </li>
                </ul>
                <p class="mt-2">
                    Press <b>Check my robot</b>. That loads the right field and robot, keeps your
                    program, and runs it five times. Each run gets a ✓ or ✗ for every rule. Click a
                    run's number to see what went wrong in it. A lesson is done when every step is
                    ticked and the check has passed. To check again after changing your program,
                    press the green <b>Check</b> button in the simulator. The ✕ next to it stops checking.
                </p>
                <p class="mt-3 font-medium">Assignments and signing in</p>
                <p>
                    If your coach gave you a card with a code, press <b>Sign in</b> and type it. A sign-in
                    link from your coach does this for you. You only do this once on each computer. Once
                    you're signed in:
                </p>
                <ul class="list-disc ml-5 flex flex-col gap-1 mt-1">
                    <li>
                        Assignments from your coach show at the top of the Lessons list. A badge
                        says whether it's <b>Practice</b> (going over what you've learned) or
                        <b>Prep for next meeting</b> (getting ready for what's next).
                    </li>
                    <li>Your progress follows you to any computer you sign in on.</li>
                    <li>
                        <b>Hand in my program</b> (at the bottom of a lesson) sends your coach the program
                        in your code panel. You can hand in again after changing it.
                    </li>
                </ul>
                <p class="mt-2">
                    Keep your code to yourself, like a password. Press your name in the toolbar to
                    see your progress, check your work is saved, or <b>Sign out</b> when you're done
                    on a shared computer. If someone else is signed in, press their name and sign them
                    out.
                </p>
            </TabItem>
            <TabItem
                open={activeTab == 'toolbar'}
                on:click={() => (activeTab = 'toolbar')}
                title="Buttons"
            >
                <h4 class="font-medium mb-2">Code panel</h4>
                <div class="flex flex-col gap-2 mb-4">
                    {#each codePanel as item}
                        <div class="flex flex-row gap-3 items-center">
                            <div class="w-8 h-8 flex justify-center items-center shrink-0">
                                {#if item.icon}
                                    <img alt="" width="28" height="28" src={item.icon} />
                                {:else if item.component}
                                    <svelte:component this={item.component} class="w-7 h-7" />
                                {/if}
                            </div>
                            <div>{item.text}</div>
                        </div>
                    {/each}
                </div>
                <h4 class="font-medium mb-2">Simulator</h4>
                <div class="flex flex-col gap-2">
                    {#each toolbar as item}
                        <div class="flex flex-row gap-3 items-center">
                            <div class="w-8 h-8 flex justify-center items-center shrink-0">
                                {#if item.icon}
                                    <img alt="" width="28" height="28" src={item.icon} />
                                {:else if item.component}
                                    <svelte:component this={item.component} class="w-7 h-7" />
                                {/if}
                            </div>
                            <div>{item.text}</div>
                        </div>
                    {/each}
                    <div class="flex flex-row gap-3 items-center">
                        <div
                            class="w-8 h-8 flex justify-center items-center shrink-0 text-xs font-semibold text-green-700"
                        >
                            Check
                        </div>
                        <div>
                            Only while a challenge or lesson check is open: run the program five
                            times and check every run.
                        </div>
                    </div>
                    <div class="flex flex-row gap-3 items-center">
                        <div class="w-8 h-8 flex justify-center items-center shrink-0 text-xs">
                            Exp.
                        </div>
                        <div>
                            Experiment: see how consistent your program is, and compare two
                            versions. See the Realism tab.
                        </div>
                    </div>
                </div>
                <h4 class="font-medium mt-4 mb-1 flex flex-row items-center gap-2">
                    <ToolsOutline class="w-5 h-5" /> Build tools
                </h4>
                <p class="mb-2">
                    Press <b>Build</b> to show the tools for making your own robot or field. Most of
                    the time you won't need them.
                </p>
                <div class="flex flex-col gap-2">
                    {#each buildTools as item}
                        <div class="flex flex-row gap-3 items-center">
                            <div class="w-8 h-8 flex justify-center items-center shrink-0">
                                {#if item.icon}
                                    <img alt="" width="28" height="28" src={item.icon} />
                                {:else if item.component}
                                    <svelte:component this={item.component} class="w-7 h-7" />
                                {/if}
                            </div>
                            <div>{item.text}</div>
                        </div>
                    {/each}
                </div>
                <p class="mt-3">
                    If some bricks are missing, a bouncing <b>Parts</b> button appears. Press it to load
                    the LDraw parts library.
                </p>
                <p class="mt-3">
                    While it runs, the panel on the left shows the hub screen and buttons, plus a
                    live view from each sensor.
                </p>
            </TabItem>
            <TabItem
                open={activeTab == 'blocks'}
                on:click={() => (activeTab = 'blocks')}
                title="Block reference"
            >
                <div class="flex flex-col gap-3">
                    <input
                        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                        type="search"
                        placeholder="Search blocks, e.g. yaw, wait, line"
                        bind:value={search}
                    />
                    <p class="text-gray-600">
                        Tip: in the code panel, hover over any block for a quick explanation, or
                        right-click it and choose <b>Explain this block</b>.
                    </p>
                    {#if filtered.length == 0}
                        <p class="text-gray-500">No blocks match "{search}".</p>
                    {/if}
                    {#each filtered as category}
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-2 mt-1">
                                <span
                                    class="inline-block w-3 h-3 rounded-full"
                                    style="background-color: {category.colour}"
                                ></span>
                                <span class="text-xs font-semibold tracking-wide text-gray-600"
                                    >{category.name}</span
                                >
                            </div>
                            {#each category.types as type}
                                <button
                                    class="text-left rounded-lg px-3 py-2 hover:bg-gray-100 border-l-4"
                                    style="border-left-color: {category.colour}"
                                    on:click={() => openBlockHelp(type)}
                                >
                                    <div class="font-medium text-gray-900">
                                        {blockHelp[type].title}
                                        {#if blockHelp[type].sim}
                                            <span
                                                class="ml-1 text-[10px] uppercase tracking-wide bg-gray-200 text-gray-700 rounded px-1 py-0.5"
                                                >sim note</span
                                            >
                                        {/if}
                                    </div>
                                    <div class="text-gray-600">{blockHelp[type].text}</div>
                                </button>
                            {/each}
                        </div>
                    {/each}
                </div>
            </TabItem>
            <TabItem
                open={activeTab == 'robots'}
                on:click={() => (activeTab = 'robots')}
                title="Building robots"
            >
                <ol class="list-decimal ml-5 flex flex-col gap-2">
                    <li>
                        Design the robot in <a
                            class="text-blue-700 underline"
                            href="https://www.bricklink.com/v3/studio/download.page"
                            target="_blank">BrickLink Studio</a
                        >
                        or
                        <a
                            class="text-blue-700 underline"
                            href="https://www.leocad.org/"
                            target="_blank">LeoCAD</a
                        >. An easy start is to save the default robot from here and change it.
                    </li>
                    <li>
                        Use real SPIKE Prime parts: the hub, the large, medium and small motors, the
                        color, distance and force sensors, and the 56 mm or 88 mm wheels. Parts that
                        only look similar won't move or sense.
                    </li>
                    <li>Press <b>Build</b> in the simulator, then <b>Open robot</b>.</li>
                    <li>
                        Use <b>Ports</b> to say which port each motor and sensor is plugged into,
                        and
                        <b>Wheels</b> to link each wheel to its motor.
                    </li>
                    <li>
                        Save it as .mpd (the <b>Save</b> build tool). The .mpd keeps the port and wheel
                        setup, so next time it's ready to drive.
                    </li>
                </ol>
            </TabItem>
            <TabItem
                open={activeTab == 'library'}
                on:click={() => (activeTab = 'library')}
                title="Fields and library"
            >
                <p>
                    Press <b>Field</b> to choose a field from this site. A field (also called a
                    scene) is a mat picture plus where the robot and any obstacles start. To make
                    your own, press
                    <b>Build</b>, then <b>Edit field</b> to open the scene editor. There you can pick
                    the mat size (FIRST LEGO League or WRO), load a mat image, add obstacle models, and
                    drag the robot to its start. Arrow keys nudge the selected object, and r / R rotate
                    it.
                </p>
                <p class="mt-2">
                    The <b>Place</b> button (map pin) shows the mat from above: drag the robot or an
                    obstacle to move it, drag the round handle to turn it, or type exact numbers. Coaches
                    can save the new position as the field's start.
                </p>
                <p class="mt-2">
                    The library has <b>practice fields</b> for building skills: a line course, color
                    stops, accuracy targets, a turn rose, a wall course and mini missions. For the
                    wall course, choose the robot <i>Driving Base 3 with distance sensor</i>
                    (sensor on port F). Sensors can see obstacles, but the robot drives through them
                    rather than pushing them.
                </p>
                <p class="mt-2">
                    The robots and fields you can choose are saved on this site for everyone. Only
                    coaches can add, delete or choose the defaults that load when the simulator
                    opens.
                </p>
            </TabItem>
            <TabItem
                open={activeTab == 'realism'}
                on:click={() => (activeTab = 'realism')}
                title="Realism"
            >
                <p>
                    Real robots never drive exactly the same way twice. The <b>Experiment</b> panel
                    (and Settings) can add the errors a real robot has: a slightly different start
                    each time, wheels that aren't quite the same size, wheel slip, motors that
                    overshoot a little when they stop, a gyro that slowly drifts, and noisy sensors.
                    <i>Ideal</i> turns all of that off.
                </p>
                <p class="mt-2 font-medium">Try this: open loop vs closed loop</p>
                <ol class="list-decimal ml-5 flex flex-col gap-1">
                    <li>
                        Open <b>Experiment</b> and pick a <i>Realistic</i> robot. Write a program
                        that only uses
                        <i>move ... cm</i> and turn blocks to reach a target on the mat. This is
                        <b>open loop</b>: the robot never checks where it is.
                    </li>
                    <li>
                        Press <b>Run 5 times</b> and look at how far apart the five runs end. Save them
                        as Program A.
                    </li>
                    <li>
                        Now make it <b>closed loop</b>: steer with the gyro (yaw angle) to drive
                        straight, turn until the yaw reaches an angle, or drive until the color
                        sensor sees a line. Run Program B 5 times.
                    </li>
                    <li>
                        The results draw both programs' runs and say which one ended closer
                        together.
                    </li>
                </ol>
                <p class="mt-2">
                    A fixed random seed in Settings makes every run repeat the same errors, which
                    helps when tracking down one odd run. A teacher can share a link ending in
                    <code>?realism=realistic</code> or <code>?realism=challenging</code> to set the mode
                    for a class.
                </p>
            </TabItem>
            <TabItem open={activeTab == 'tips'} on:click={() => (activeTab = 'tips')} title="Tips">
                <ul class="list-disc ml-5 flex flex-col gap-1">
                    <li>
                        If the robot button is red, some bricks are missing. Wait a moment, or use
                        the bouncing Parts button.
                    </li>
                    <li>
                        Settings has a time scale to run faster or slower, and a step delay to watch
                        the program one block at a time.
                    </li>
                    <li>The camera menu's robot view follows the robot from behind.</li>
                    <li>
                        The simulator is a practice tool. Always test on the real robot and mat
                        before a match.
                    </li>
                </ul>
            </TabItem>
            <TabItem
                open={activeTab == 'about'}
                on:click={() => (activeTab = 'about')}
                title="About"
            >
                <p>
                    The LEGO SPIKE Simulator was created by <b>Alexandre Hardy</b>. The original
                    project is at
                    <a
                        class="text-blue-700 underline"
                        href="https://github.com/alexandrehardy/lego-spike-simulator"
                        target="_blank">github.com/alexandrehardy/lego-spike-simulator</a
                    >.
                </p>
                <p class="mt-2">
                    This site runs a modified version that adds lessons and assignments, challenges,
                    the shared library, realism settings, experiments that compare programs, example
                    programs, and this guide. Its full source code is at
                    <a
                        class="text-blue-700 underline"
                        href="https://github.com/danmartinez78/lego-spike-simulator"
                        target="_blank">github.com/danmartinez78/lego-spike-simulator</a
                    >.
                </p>
                <p class="mt-2">
                    The simulator is free software under the
                    <a
                        class="text-blue-700 underline"
                        href="https://github.com/danmartinez78/lego-spike-simulator/blob/master/COPYING.md"
                        target="_blank">GNU General Public License version 2</a
                    >. You may use, change and share it under those terms.
                </p>
                <p class="mt-2">
                    Coaches manage the shared library on the
                    <a class="text-blue-700 underline" href="coach" target="_blank">coach page</a>.
                </p>
                <h4 class="font-medium mt-3">Privacy</h4>
                <p>
                    You don't need to sign in to use the simulator, and the site has no ads and no
                    cookies for students. Your program is kept in this browser. If your coach gives
                    you a code card, the site keeps the name your coach typed (a first name and last
                    initial), your progress and the programs you hand in, and only your coaches can
                    see them. Read the
                    <a class="text-blue-700 underline" href="privacy" target="_blank"
                        >privacy notice</a
                    > for the details.
                </p>
                <h4 class="font-medium mt-3">Also uses</h4>
                <ul class="list-disc ml-5">
                    <li>
                        <a
                            class="text-blue-700 underline"
                            href="https://developers.google.com/blockly"
                            target="_blank">Blockly</a
                        > by Google (Apache License 2.0) for the code blocks.
                    </li>
                    <li>
                        The <a
                            class="text-blue-700 underline"
                            href="https://www.ldraw.org"
                            target="_blank">LDraw</a
                        > parts library (CC BY 2.0) for the 3D bricks.
                    </li>
                </ul>
                <p class="mt-3 text-xs text-gray-500">
                    LEGO and SPIKE are trademarks of the LEGO Group. FIRST, FIRST LEGO League and
                    BIOGLOW are trademarks of FIRST. This site is not affiliated with or endorsed by
                    either. Field images belong to their owners and are used for team practice.
                </p>
            </TabItem>
        </Tabs>
    </div>
</Modal>
