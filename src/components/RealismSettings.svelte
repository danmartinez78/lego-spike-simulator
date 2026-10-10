<script lang="ts">
    import { Input, Label, Range, Select } from 'flowbite-svelte';
    import {
        realismStore,
        applyPreset,
        presetLabels,
        type PresetName,
        type RealismSettings
    } from '$lib/spike/realism';

    type NumericSetting = Exclude<keyof RealismSettings, 'preset' | 'seed'>;

    const sliders: {
        key: NumericSetting;
        label: string;
        unit: string;
        max: number;
        step: number;
    }[] = [
        { key: 'startJitterMm', label: 'Start position error', unit: 'mm', max: 30, step: 1 },
        { key: 'startJitterDeg', label: 'Start angle error', unit: '°', max: 10, step: 0.5 },
        {
            key: 'wheelMismatchPct',
            label: 'Wheel size mismatch',
            unit: '%',
            max: 5,
            step: 0.5
        },
        { key: 'wheelSlipPct', label: 'Wheel slip', unit: '%', max: 15, step: 0.5 },
        {
            key: 'stopOvershootDeg',
            label: 'Motor overshoot when stopping',
            unit: '°',
            max: 30,
            step: 1
        },
        {
            key: 'gyroDriftDegPerMin',
            label: 'Gyro drift',
            unit: '°/min',
            max: 10,
            step: 0.5
        },
        { key: 'gyroNoiseDeg', label: 'Gyro noise', unit: '°', max: 5, step: 0.5 },
        { key: 'lightNoisePct', label: 'Light sensor noise', unit: '%', max: 15, step: 1 },
        {
            key: 'distanceNoiseMm',
            label: 'Distance sensor noise',
            unit: 'mm',
            max: 50,
            step: 1
        }
    ];

    const presetOptions = [
        ...Object.entries(presetLabels).map(([value, name]) => ({ value, name })),
        { value: 'custom', name: 'Custom' }
    ];

    let preset: string = $realismStore.preset;
    $: preset = $realismStore.preset;

    function choosePreset(event: Event) {
        const value = (event.target as HTMLSelectElement).value;
        if (value != 'custom') {
            applyPreset(value as PresetName);
        }
    }

    function setValue(key: NumericSetting, event: Event) {
        const value = +(event.target as HTMLInputElement).value;
        realismStore.update((old) => ({ ...old, [key]: value, preset: 'custom' }));
    }

    function setSeed(event: Event) {
        const value = Math.max(0, Math.floor(+(event.target as HTMLInputElement).value || 0));
        realismStore.update((old) => ({ ...old, seed: value }));
    }
</script>

<div class="flex flex-col gap-2 w-full">
    <h3 class="font-medium">Realism</h3>
    <div class="text-sm text-gray-600">
        Adds real-world errors so programs that only count rotations drift, and programs that use
        sensors do better. Ideal is a perfect robot.
    </div>
    <Select
        size="sm"
        items={presetOptions}
        value={preset}
        placeholder=""
        on:change={choosePreset}
    />
    {#each sliders as slider}
        <Label class="text-sm"
            >{slider.label}: {$realismStore[slider.key]}
            {slider.unit}</Label
        >
        <Range
            size="sm"
            min="0"
            max={slider.max}
            step={slider.step}
            value={$realismStore[slider.key]}
            on:change={(e) => setValue(slider.key, e)}
        />
    {/each}
    <Label class="text-sm">Random seed (0 = different every run)</Label>
    <Input size="sm" type="number" min="0" value={$realismStore.seed} on:change={setSeed} />
</div>
