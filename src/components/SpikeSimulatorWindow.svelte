<script lang="ts">
    import * as Blockly from 'blockly/core';
    import {
        CogOutline,
        QuestionCircleOutline,
        ChartLineUpOutline,
        RulerCombinedOutline,
        MapPinAltOutline,
        AwardOutline,
        ClipboardCheckOutline,
        EditOutline,
        ToolsOutline,
        VideoCameraOutline
    } from 'flowbite-svelte-icons';
    import { buildToolsChoice, setBuildTools } from '$lib/buildtools';
    import { activeChallenge, challengesOpen } from '$lib/spike/challenges';
    import { lessonsOpen } from '$lib/lessons';
    import PlaceDialog from '$components/PlaceDialog.svelte';
    import { graphOpen } from '$lib/spike/telemetry';
    import MeasureDialog from '$components/MeasureDialog.svelte';
    import { openGuide } from '$lib/help';
    import { CloseButton, Tooltip } from 'flowbite-svelte';
    import ToolButton from '$components/ToolButton.svelte';
    import MenuDropdown from '$components/MenuDropdown.svelte';
    import { type MenuAction } from '$components/Menu.svelte';
    import HubIcon from '$components/HubIcon.svelte';
    import SpikeSimulator from '$components/SpikeSimulator.svelte';
    import SaveSimulation from '$components/SaveSimulation.svelte';
    import SimulatorSettings from '$components/SimulatorSettings.svelte';
    import PortConnector from '$components/PortConnector.svelte';
    import WheelConnector from '$components/WheelConnector.svelte';
    import LoadScene from '$components/LoadScene.svelte';
    import LibraryDialog from '$components/LibraryDialog.svelte';
    import RunOverlay from '$components/RunOverlay.svelte';
    import {
        runBatch,
        startBatch,
        rerunRequest,
        pinnedRuns,
        requestRuns,
        type RunPurpose
    } from '$lib/spike/runs';
    import { robotRequest } from '$lib/library';
    import ExperimentPanel from '$components/ExperimentPanel.svelte';
    import { realismStore, presetLabels } from '$lib/spike/realism';
    import { libraryStore } from '$lib/library';
    import { type LDrawStore, componentStore } from '$lib/ldraw/components';
    import { Hub, codeStore } from '$lib/spike/vm';
    import {
        spikeGenerator,
        resetCode,
        getCodeEvents,
        getCodeProcedures
    } from '$lib/blockly/generator';

    export let modalOpen = false;
    export let blocklyOpen: boolean;
    export let workspace: Blockly.WorkspaceSvg | undefined;
    export let split = 2;
    let hub = new Hub();

    let connectorOpen = false;
    let wheelsOpen = false;
    let saveOpen = false;
    let sceneOpen = false;
    let settingsOpen = false;
    let libraryOpen = false;
    let libraryKind: 'robots' | 'scenes' = 'scenes';
    let measureOpen = false;
    let placeOpen = false;
    let experimentOpen = false;
    let lastRerun = 0;

    // Start the runs someone asked for, once the simulator is open and any
    // robot that is still loading has arrived.
    async function handleRerun(request: { n: number; purpose: RunPurpose }) {
        if (request.n == lastRerun) return;
        lastRerun = request.n;
        for (let i = 0; i < 100 && (!modalOpen || $robotRequest); i++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (!runSimulation && request.n == lastRerun) {
            startRepeatedRuns(request.purpose);
        }
    }

    $: handleRerun($rerunRequest);
    let robotButtonColour: 'light' | 'red' | 'green' = 'light';
    let missingParts = false;
    let runSimulation = false;
    // cameraOpen is used as a bind variable, but reported as unused by es-lint
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let cameraOpen = false;
    let camera: 'top' | 'left' | 'right' | 'front' | 'back' | 'adaptive' = 'adaptive';
    let robotFocus = false;
    let tilt = true;

    let cameraMenu = buildCameraMenu();

    function buildCameraMenu(): MenuAction[] {
        return [
            {
                name: 'Default view',
                action: () => {
                    camera = 'adaptive';
                    tilt = true;
                    robotFocus = false;
                    cameraMenu = buildCameraMenu();
                },
                radio: camera == 'adaptive'
            },
            {
                name: 'View left',
                action: () => {
                    camera = 'left';
                    cameraMenu = buildCameraMenu();
                },
                radio: camera == 'left'
            },
            {
                name: 'View right',
                action: () => {
                    camera = 'right';
                    cameraMenu = buildCameraMenu();
                },
                radio: camera == 'right'
            },
            {
                name: 'View back',
                action: () => {
                    camera = 'back';
                    cameraMenu = buildCameraMenu();
                },
                radio: camera == 'back'
            },
            {
                name: 'View front',
                action: () => {
                    camera = 'front';
                    cameraMenu = buildCameraMenu();
                },
                radio: camera == 'front'
            },
            {
                name: 'View top',
                action: () => {
                    camera = 'top';
                    tilt = false;
                    robotFocus = false;
                    cameraMenu = buildCameraMenu();
                },
                radio: camera == 'top'
            },
            {
                name: 'Tilt view',
                action: () => {
                    tilt = !tilt;
                    cameraMenu = buildCameraMenu();
                },
                toggle: tilt
            },
            {
                name: 'Robot view',
                action: () => {
                    robotFocus = !robotFocus;
                    if (robotFocus) {
                        camera = 'back';
                        tilt = true;
                    }
                    cameraMenu = buildCameraMenu();
                },
                toggle: robotFocus
            }
        ];
    }

    function closeWindow() {
        modalOpen = false;
    }

    function openBlockly() {
        blocklyOpen = true;
    }

    function askForRobot() {
        const element = document.getElementById('load_robot');
        if (element) {
            element.click();
        }
    }

    function askForLibrary() {
        const element = document.getElementById('load_library');
        if (element) {
            element.click();
        }
    }

    function updateButtons(store: LDrawStore) {
        if (!store.robotModel) {
            robotButtonColour = 'light';
        } else {
            if (store.unresolved.length > 0) {
                robotButtonColour = 'red';
            } else {
                robotButtonColour = 'green';
            }
        }
        missingParts = store.unresolved.length > 0;
    }

    function startRobot() {
        resetCode();
        const code = spikeGenerator.workspaceToCode(workspace);
        console.log('=======');
        console.log(code);
        console.log('=======');
        console.log(getCodeProcedures());
        codeStore.set({ events: getCodeEvents(), procedures: getCodeProcedures() });
        runSimulation = true;
    }

    function startRepeatedRuns(purpose: RunPurpose) {
        startBatch(5, purpose);
        startRobot();
    }

    function stopRobot() {
        runSimulation = false;
    }

    function saveRobotOrScene() {
        saveOpen = true;
    }

    function connectPorts() {
        connectorOpen = true;
    }

    function connectWheels() {
        wheelsOpen = true;
    }

    function loadScene() {
        sceneOpen = true;
    }

    function openPicker(kind: 'robots' | 'scenes') {
        libraryKind = kind;
        libraryOpen = true;
    }

    // Students pick a robot and field from the library. The tools for building
    // your own sit behind the Build button, shown from the start for coaches
    // and always when there's no library to pick from.
    $: showBuild = !$libraryStore.available || ($buildToolsChoice ?? !!$libraryStore.writer);

    function openSettings() {
        settingsOpen = true;
    }

    $: updateButtons($componentStore);
</script>

<PortConnector bind:modalOpen={connectorOpen} bind:hub />
<WheelConnector bind:modalOpen={wheelsOpen} bind:hub />
<SaveSimulation bind:modalOpen={saveOpen} bind:hub />
<LoadScene bind:modalOpen={sceneOpen} />
<SimulatorSettings bind:modalOpen={settingsOpen} />
<LibraryDialog bind:modalOpen={libraryOpen} kind={libraryKind} />
<RunOverlay />
<MeasureDialog bind:modalOpen={measureOpen} />
<PlaceDialog bind:modalOpen={placeOpen} />
{#if modalOpen}
    <div class="{split == 1 ? 'flex-1' : 'flex-[2]'} h-full overflow-hidden">
        <div class="relative flex-1 h-full flex flex-col overflow-hidden">
            <div
                class="flex flex-row bg-gray-100 gap-2 p-2 items-center border-b border-b-gray-300 z-10 flex-wrap"
            >
                <div class="w-8 h-8 flex flex-col justify-center items-center">
                    <img alt="code" width="32" height="32" src="icons/Brick.svg" />
                </div>
                {#if $libraryStore.available}
                    <ToolButton
                        label="Robot"
                        color={robotButtonColour}
                        on:click={() => openPicker('robots')}
                    >
                        <img alt="" width="28" height="28" src="icons/Robot.svg" />
                    </ToolButton>
                    <Tooltip>Choose a robot</Tooltip>
                    <ToolButton label="Field" on:click={() => openPicker('scenes')}>
                        <img alt="" width="28" height="28" src="icons/Scene.svg" />
                    </ToolButton>
                    <Tooltip>Choose a field: the mat the robot drives on</Tooltip>
                {/if}
                <ToolButton label="Place" on:click={() => (placeOpen = true)}>
                    <MapPinAltOutline class="w-7 h-7" />
                </ToolButton>
                <Tooltip>Move the robot and objects on the mat by dragging</Tooltip>
                <ToolButton label="Settings" on:click={openSettings}>
                    <CogOutline class="w-7 h-7" />
                </ToolButton>
                <Tooltip>Adjust simulator speed settings</Tooltip>
                <ToolButton
                    label="Graph"
                    color={$graphOpen ? 'blue' : 'light'}
                    on:click={() => graphOpen.update((v) => !v)}
                >
                    <ChartLineUpOutline class="w-7 h-7" />
                </ToolButton>
                <Tooltip>Show a live graph of the sensors and motors</Tooltip>
                <ToolButton label="Measure" on:click={() => (measureOpen = true)}>
                    <RulerCombinedOutline class="w-7 h-7" />
                </ToolButton>
                <Tooltip>Measure distances and angles on the mat to plan a route</Tooltip>
                <ToolButton label="Camera" id="camera_config_button">
                    <VideoCameraOutline class="w-7 h-7" />
                </ToolButton>
                <MenuDropdown
                    name="camera"
                    actions={cameraMenu}
                    rounded={true}
                    class="bg-white rounded-2xl"
                />
                <Tooltip triggeredBy="#camera_config_button">Set camera for simulator</Tooltip>
                {#if runSimulation}
                    <ToolButton label="Stop" on:click={stopRobot}>
                        <img alt="" width="28" height="28" src="icons/GenericStopIcon.svg" />
                    </ToolButton>
                    <Tooltip>Stop the simulation</Tooltip>
                {:else}
                    <ToolButton label="Run" on:click={startRobot}>
                        <img alt="" width="28" height="28" src="icons/GenericPlayIcon.svg" />
                    </ToolButton>
                    <Tooltip>Start the simulation, running the code in the code panel</Tooltip>
                {/if}
                {#if runSimulation && $runBatch.active}
                    <span class="text-sm font-medium">
                        {$runBatch.purpose == 'check' ? 'Checking' : 'Experiment'}: run {Math.min(
                            $runBatch.completed.length + 1,
                            $runBatch.total
                        )} of {$runBatch.total}
                    </span>
                {/if}
                {#if $activeChallenge}
                    <div
                        class="flex flex-row items-center gap-1 rounded-xl border border-green-300 bg-green-50 p-1"
                        role="group"
                        aria-label="Checking"
                    >
                        <ToolButton
                            label="Check"
                            color="green"
                            disabled={runSimulation}
                            on:click={() => requestRuns('check')}
                        >
                            {#if $activeChallenge.lesson}
                                <ClipboardCheckOutline class="w-7 h-7" />
                            {:else}
                                <AwardOutline class="w-7 h-7" />
                            {/if}
                        </ToolButton>
                        <Tooltip
                            >Run your program 5 times and check every run. {$activeChallenge.needed}
                            of 5 must pass.</Tooltip
                        >
                        <button
                            class="flex flex-col items-start px-1 max-w-[11rem] text-left rounded hover:bg-green-100"
                            on:click={() =>
                                $activeChallenge?.lesson
                                    ? lessonsOpen.set(true)
                                    : challengesOpen.set(true)}
                        >
                            <span class="text-xs font-semibold text-green-900 truncate w-full"
                                >{$activeChallenge.title}</span
                            >
                            <span class="text-[11px] text-green-800"
                                >{$activeChallenge.lesson ? 'Lesson check' : 'Challenge'}</span
                            >
                        </button>
                        <Tooltip
                            >Open the {$activeChallenge.lesson ? 'lesson' : 'challenge'}</Tooltip
                        >
                        <button
                            class="px-1.5 py-1 rounded text-green-900 hover:bg-green-200"
                            aria-label="Stop checking"
                            on:click={() => activeChallenge.set(undefined)}>✕</button
                        >
                        <Tooltip>Stop checking</Tooltip>
                    </div>
                {/if}
                <ToolButton
                    label="Experiment"
                    color={experimentOpen ? 'blue' : 'light'}
                    on:click={() => (experimentOpen = !experimentOpen)}
                >
                    <svg
                        class="w-7 h-7"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        ><path
                            d="M9 3h6M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3"
                        /><path d="M7 15h10" /></svg
                    >
                </ToolButton>
                <Tooltip>Experiment: how consistent is your program? Compare two versions.</Tooltip>
                {#if $pinnedRuns && !experimentOpen}
                    <span class="text-xs px-2 py-1 rounded bg-amber-100 text-amber-900">
                        Comparing with {$pinnedRuns.label}
                    </span>
                {/if}
                {#if $realismStore.preset != 'ideal'}
                    <span class="text-xs px-2 py-1 rounded bg-amber-100 text-amber-900">
                        {$realismStore.preset == 'custom'
                            ? 'Custom realism'
                            : presetLabels[$realismStore.preset]}
                    </span>
                    <Tooltip
                        >Real-world errors are on. Change them in Experiment or Settings.</Tooltip
                    >
                {/if}
                {#if $libraryStore.available}
                    <ToolButton
                        label="Build"
                        color={showBuild ? 'blue' : 'light'}
                        on:click={() => setBuildTools(!showBuild)}
                    >
                        <ToolsOutline class="w-7 h-7" />
                    </ToolButton>
                    <Tooltip
                        >{showBuild ? 'Hide' : 'Show'} the tools for building your own robot or field</Tooltip
                    >
                {/if}
                {#if showBuild}
                    <div
                        class="flex flex-row flex-wrap gap-2 items-center rounded-xl bg-blue-50 border border-blue-200 p-1"
                        role="group"
                        aria-label="Build tools"
                    >
                        <ToolButton
                            label="Open robot"
                            color={$libraryStore.available ? 'light' : robotButtonColour}
                            on:click={askForRobot}
                        >
                            <img alt="" width="28" height="28" src="icons/Robot.svg" />
                        </ToolButton>
                        <Tooltip>Open a robot model from your computer (.io, .ldr or .mpd)</Tooltip>
                        <ToolButton label="Ports" on:click={connectPorts}>
                            <div class="scale-[0.875]"><HubIcon /></div>
                        </ToolButton>
                        <Tooltip>Say which hub port each motor and sensor is plugged into</Tooltip>
                        <ToolButton label="Wheels" on:click={connectWheels}>
                            <img alt="" width="28" height="28" src="icons/wheel.svg" />
                        </ToolButton>
                        <Tooltip>Say which motor drives each wheel</Tooltip>
                        <ToolButton label="Edit field" on:click={loadScene}>
                            <EditOutline class="w-7 h-7" />
                        </ToolButton>
                        <Tooltip
                            >Scene editor: pick the mat, add obstacles, or open a field file</Tooltip
                        >
                        <ToolButton label="Save" on:click={saveRobotOrScene}>
                            <img alt="" width="28" height="28" src="icons/SaveMedium.svg" />
                        </ToolButton>
                        <Tooltip>Save the robot with its ports and wheels, or the field</Tooltip>
                    </div>
                {/if}
                {#if missingParts}
                    <ToolButton label="Parts" class="animate-bounce" on:click={askForLibrary}>
                        <img alt="" width="28" height="28" src="icons/Library.svg" />
                    </ToolButton>
                    <Tooltip
                        >Some bricks are missing. Load the LDraw parts library (complete.zip)</Tooltip
                    >
                {/if}
                {#if !blocklyOpen}
                    <ToolButton label="Code" on:click={openBlockly}>
                        <img alt="" width="28" height="28" src="icons/BlocklyIcon.svg" />
                    </ToolButton>
                    <Tooltip>Open the code panel</Tooltip>
                {/if}
                <div class="flex-1" />
                {#if !blocklyOpen}
                    <ToolButton label="Help" on:click={() => openGuide('toolbar')}>
                        <QuestionCircleOutline class="w-7 h-7" />
                    </ToolButton>
                    <Tooltip>How to use the simulator</Tooltip>
                {/if}
                {#if blocklyOpen}
                    <CloseButton on:click={closeWindow} />
                    <Tooltip>Close the simulation window</Tooltip>
                {/if}
            </div>
            {#key blocklyOpen}
                <div class="relative flex-1 w-full overflow-hidden">
                    <ExperimentPanel bind:open={experimentOpen} running={runSimulation} />
                    <SpikeSimulator
                        bind:runSimulation
                        {workspace}
                        bind:connectorOpen
                        bind:hub
                        bind:sceneOpen
                        bind:wheelsOpen
                        {camera}
                        {tilt}
                        {robotFocus}
                    />
                </div>
            {/key}
        </div>
    </div>
{/if}
