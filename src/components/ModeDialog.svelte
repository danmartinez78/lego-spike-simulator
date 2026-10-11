<script lang="ts">
    // Picks how perfect the simulated robot is, and shows what changes in
    // each mode.
    import { Modal } from 'flowbite-svelte';
    import {
        realismStore,
        applyPreset,
        presets,
        presetDescriptions,
        realismName,
        type PresetName
    } from '$lib/spike/realism';

    export let modalOpen = false;
    export let running = false;

    const modes: PresetName[] = ['ideal', 'realistic', 'challenging'];

    // One row per kind of error, worded for students.
    const rows: { label: string; value: (name: PresetName) => string }[] = [
        {
            label: 'Start position',
            value: (n) =>
                presets[n].startJitterMm == 0
                    ? 'exact'
                    : `up to ${presets[n].startJitterMm} mm and ${presets[n].startJitterDeg}° off`
        },
        {
            label: 'Driving straight',
            value: (n) =>
                presets[n].wheelMismatchPct == 0
                    ? 'straight'
                    : `wheels differ by up to ${presets[n].wheelMismatchPct}%`
        },
        {
            label: 'Wheel slip',
            value: (n) =>
                presets[n].wheelSlipPct == 0 ? 'none' : `up to ${presets[n].wheelSlipPct}%`
        },
        {
            label: 'Stopping',
            value: (n) =>
                presets[n].stopOvershootDeg == 0
                    ? 'exact'
                    : `overshoots up to ${presets[n].stopOvershootDeg}°`
        },
        {
            label: 'Gyro (yaw)',
            value: (n) =>
                presets[n].gyroDriftDegPerMin == 0
                    ? 'exact'
                    : `drifts up to ${presets[n].gyroDriftDegPerMin}° a minute`
        },
        {
            label: 'Light sensor',
            value: (n) =>
                presets[n].lightNoisePct == 0 ? 'exact' : `± ${presets[n].lightNoisePct}%`
        },
        {
            label: 'Distance sensor',
            value: (n) =>
                presets[n].distanceNoiseMm == 0 ? 'exact' : `± ${presets[n].distanceNoiseMm} mm`
        }
    ];
</script>

<Modal title="Mode" bind:open={modalOpen} size="md" autoclose={false} outsideclose>
    <div class="flex flex-col gap-3 text-sm text-gray-800">
        <p class="text-gray-600">
            How perfect is the robot? Real robots never drive exactly the same way twice. Programs
            that only count rotations drift, and programs that check sensors stay on target.
        </p>
        <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Mode">
            {#each modes as mode}
                <button
                    role="radio"
                    aria-checked={$realismStore.preset == mode}
                    class="rounded-lg border-2 p-2 text-left flex flex-col gap-1 disabled:opacity-60 {$realismStore.preset ==
                    mode
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'}"
                    disabled={running}
                    on:click={() => applyPreset(mode)}
                >
                    <span class="font-semibold text-gray-900">{realismName(mode)}</span>
                    <span class="text-xs text-gray-600">{presetDescriptions[mode]}</span>
                </button>
            {/each}
        </div>
        {#if running}
            <p class="text-xs text-amber-800">Stop the robot to change the mode.</p>
        {/if}
        <table class="w-full text-xs">
            <caption class="text-left font-semibold text-gray-900 pb-1">What to expect</caption>
            <thead>
                <tr class="text-gray-500">
                    <th class="text-left font-normal py-1"></th>
                    {#each modes as mode}
                        <th
                            class="text-left font-semibold py-1 px-1 {$realismStore.preset == mode
                                ? 'text-blue-900 bg-blue-50'
                                : ''}">{realismName(mode)}</th
                        >
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each rows as row}
                    <tr class="border-t border-gray-100">
                        <th class="text-left font-normal text-gray-600 py-1 pr-2">{row.label}</th>
                        {#each modes as mode}
                            <td
                                class="py-1 px-1 {$realismStore.preset == mode
                                    ? 'bg-blue-50 text-blue-900'
                                    : ''}">{row.value(mode)}</td
                            >
                        {/each}
                    </tr>
                {/each}
            </tbody>
        </table>
        <p class="text-xs text-gray-500">The errors are random each run, up to these amounts.</p>
    </div>
</Modal>
