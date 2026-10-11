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
        ToolsOutline
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
    import { runBatch, startBatch, rerunRequest, pinnedRuns } from '$lib/spike/runs';
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
    let lastRerun = 0;

    function handleRerun(request: number) {
        if (request != lastRerun) {
            lastRerun = request;
            if (!runSimulation) {
                startRepeatedRuns();
            }
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

    function startRepeatedRuns() {
        startBatch(5);
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
                    <img alt="" width="28" height="28" src="icons/Eye.svg" />
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
                    <ToolButton label="Run ×5" on:click={startRepeatedRuns}>
                        <span class="flex flex-row items-center text-sm">
                            <img alt="" width="18" height="18" src="icons/GenericPlayIcon.svg" />
                            ×5
                        </span>
                    </ToolButton>
                    <Tooltip
                        >Run the program 5 times and draw every path on the mat, to see how much the
                        runs differ</Tooltip
                    >
                {/if}
                {#if runSimulation && $runBatch.active}
                    <span class="text-sm">
                        Run {Math.min($runBatch.completed.length + 1, $runBatch.total)} of {$runBatch.total}
                    </span>
                {/if}
                {#if $activeChallenge}
                    <span class="text-xs rounded bg-green-100 text-green-900 flex items-center">
                        <button
                            class="px-2 py-1 flex items-center gap-1 rounded-l hover:bg-green-200"
                            on:click={() =>
                                $activeChallenge?.lesson
                                    ? lessonsOpen.set(true)
                                    : challengesOpen.set(true)}
                        >
                            {#if $activeChallenge.lesson}
                                <ClipboardCheckOutline class="w-4 h-4" />
                            {:else}
                                <AwardOutline class="w-4 h-4" />
                            {/if}
                            {$activeChallenge.title}
                        </button>
                        <button
                            class="px-1.5 py-1 rounded-r hover:bg-green-200"
                            aria-label="Stop checking"
                            on:click={() => activeChallenge.set(undefined)}>✕</button
                        >
                    </span>
                    <Tooltip
                        >{$activeChallenge.lesson ? 'Lesson check' : 'Challenge'} in progress. Press
                        ▶︎×5 to check it.</Tooltip
                    >
                {/if}
                {#if $pinnedRuns}
                    <span class="text-xs px-2 py-1 rounded bg-amber-100 text-amber-900">
                        Comparing with {$pinnedRuns.label}
                    </span>
                    <Tooltip
                        >The next ▶︎×5 results are compared with the runs you kept as A.</Tooltip
                    >
                {/if}
                {#if $realismStore.preset != 'ideal'}
                    <span class="text-xs px-2 py-1 rounded bg-amber-100 text-amber-900">
                        {$realismStore.preset == 'custom'
                            ? 'Custom realism'
                            : presetLabels[$realismStore.preset]}
                    </span>
                    <Tooltip>Real-world errors are on. Change them in the settings.</Tooltip>
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
                <div class="flex-1 w-full overflow-hidden">
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
