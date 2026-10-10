<script lang="ts">
    import { Modal, TabItem, Tabs } from 'flowbite-svelte';
    import { CogOutline, DatabaseOutline } from 'flowbite-svelte-icons';
    import { helpStore } from '$lib/help';

    const toolbar = [
        {
            icon: 'icons/Robot.svg',
            text: 'Load a robot model from your computer (.io, .ldr or .mpd).'
        },
        { icon: 'icons/HubSmall.svg', text: 'Connect the motors and sensors to hub ports A to F.' },
        { icon: 'icons/wheel.svg', text: 'Tell the simulator which motor drives each wheel.' },
        {
            icon: 'icons/Scene.svg',
            text: 'Scene editor: choose the mat, place the robot and obstacles, load a saved scene.'
        },
        {
            component: DatabaseOutline,
            text: 'Shared library: robots and fields saved on this site for everyone.'
        },
        {
            icon: 'icons/Library.svg',
            text: 'Brick library: only needed if parts are missing (the button bounces).'
        },
        {
            icon: 'icons/SaveMedium.svg',
            text: 'Save the robot or scene to your computer or the shared library.'
        },
        {
            component: CogOutline,
            text: 'Settings: simulation speed, boundary and realism.'
        },
        { icon: 'icons/Eye.svg', text: 'Camera: top view, side views, or follow the robot.' },
        { icon: 'icons/GenericPlayIcon.svg', text: 'Run the program in the code panel.' }
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
            <TabItem open={$helpStore.guideTab == 'start'} title="Getting started">
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
                        <b>Save your work.</b> The save button in the code panel downloads your program
                        as a .llsp3 file (the LEGO SPIKE app's file type). The folder button opens it
                        again.
                    </li>
                </ol>
                <p class="mt-3">
                    New to coding the robot? The <b>book</b> button in the code panel opens example programs.
                    Each one explains what it does and why, with ideas to try. Open one to start from
                    it, or add it to your program to borrow its My Blocks.
                </p>
                <p class="mt-3">
                    Your program isn't stored on this site, so save it before closing the page. The
                    1:1 button changes how wide the code panel is next to the simulator.
                </p>
            </TabItem>
            <TabItem open={$helpStore.guideTab == 'toolbar'} title="Simulator buttons">
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
                        <div class="w-8 h-8 flex justify-center items-center shrink-0 text-xs">
                            ▶×5
                        </div>
                        <div>
                            Run the program five times and draw every path on the mat. See the
                            Realism tab.
                        </div>
                    </div>
                </div>
                <p class="mt-3">
                    While it runs, the panel on the left shows the hub screen and buttons, plus a
                    live view from each sensor.
                </p>
            </TabItem>
            <TabItem open={$helpStore.guideTab == 'robots'} title="Building robots">
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
                        colour, distance and force sensors, and the 56 mm or 88 mm wheels. Parts
                        that only look similar won't move or sense.
                    </li>
                    <li>Load it with the robot button.</li>
                    <li>
                        Use the hub button to say which port each motor and sensor is plugged into,
                        and the wheel button to link each wheel to its motor.
                    </li>
                    <li>
                        Save it as .mpd (save button). The .mpd keeps the port and wheel setup, so
                        next time it's ready to drive.
                    </li>
                </ol>
            </TabItem>
            <TabItem open={$helpStore.guideTab == 'library'} title="Fields and library">
                <p>
                    A <b>scene</b> is a mat image plus where the robot and any obstacles start. Use the
                    scene editor to pick the mat size (FIRST LEGO League or WRO), load a mat image, add
                    obstacle models, and drag the robot to its start. Arrow keys nudge the selected object,
                    and r / R rotate it.
                </p>
                <p class="mt-2">
                    The <b>shared library</b> holds robots and scenes saved on this site. Anyone can
                    load from it. Only signed-in people can add, delete or choose the defaults that load
                    when the simulator opens.
                </p>
            </TabItem>
            <TabItem open={$helpStore.guideTab == 'realism'} title="Realism">
                <p>
                    Real robots never drive exactly the same way twice. Under <b>Settings</b>, the
                    Realism menu adds the errors a real robot has: a slightly different start each
                    time, wheels that aren't quite the same size, wheel slip, motors that overshoot
                    a little when they stop, a gyro that slowly drifts, and noisy sensors.
                    <i>Ideal</i> turns all of that off.
                </p>
                <p class="mt-2 font-medium">Try this: open loop vs closed loop</p>
                <ol class="list-decimal ml-5 flex flex-col gap-1">
                    <li>
                        Set Realism to <i>Realistic</i>. Write a program that only uses
                        <i>move ... cm</i> and turn blocks to reach a target on the mat. This is
                        <b>open loop</b>: the robot never checks where it is.
                    </li>
                    <li>Press <b>▶×5</b> and look at how far apart the five runs end.</li>
                    <li>
                        Now make it <b>closed loop</b>: steer with the gyro (yaw angle) to drive
                        straight, turn until the yaw reaches an angle, or drive until the colour
                        sensor sees a line. Run ×5 again.
                    </li>
                    <li>Compare the spread. Which sensor fixed which kind of error?</li>
                </ol>
                <p class="mt-2">
                    A fixed random seed in Settings makes every run repeat the same errors, which
                    helps when tracking down one odd run. A teacher can share a link ending in
                    <code>?realism=realistic</code> or <code>?realism=challenging</code> to set the mode
                    for a class.
                </p>
            </TabItem>
            <TabItem open={$helpStore.guideTab == 'tips'} title="Tips">
                <ul class="list-disc ml-5 flex flex-col gap-1">
                    <li>
                        If the robot button is red, some bricks are missing. Wait a moment, or use
                        the brick library button.
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
                    <li>
                        Simulator by Alexandre Hardy (<a
                            class="text-blue-700 underline"
                            href="https://github.com/alexandrehardy/lego-spike-simulator"
                            target="_blank">source</a
                        >), with library and realism additions for this site.
                    </li>
                </ul>
            </TabItem>
        </Tabs>
    </div>
</Modal>
