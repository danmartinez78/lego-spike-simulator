<script lang="ts">
    // Drawing a lesson's check on the mat: where to stop, waypoints, stay-out
    // zones and a line to follow, plus time and block rules.
    import { Button, Input, Label, Select } from 'flowbite-svelte';
    import { readMat, type MatPicture } from '$lib/library';
    import { blockRules, type Check, type Point, type Zone } from '$lib/spike/checks';
    import {
        checkColours,
        drawCheck,
        drawMat,
        fitCanvas,
        sameItem,
        toMat,
        type CheckItem,
        type MatView
    } from '$lib/spike/checkdraw';
    import { presetLabels, type PresetName } from '$lib/spike/realism';

    export let check: Check | undefined;
    export let field: string;

    type Tool = 'move' | 'stop' | 'waypoint' | 'avoid' | 'line';
    const tools: { id: Tool; label: string; colour: string; hint: string }[] = [
        {
            id: 'stop',
            label: 'Stop zone',
            colour: checkColours.stop,
            hint: 'Drag on the mat to draw where the robot must stop.'
        },
        {
            id: 'waypoint',
            label: 'Waypoint',
            colour: checkColours.waypoint,
            hint: 'Drag to draw a zone the robot must drive through. Draw them in order.'
        },
        {
            id: 'avoid',
            label: 'Stay-out zone',
            colour: checkColours.avoid,
            hint: "Drag to draw a zone the robot's centre must never enter."
        },
        {
            id: 'line',
            label: 'Line to follow',
            colour: checkColours.follow,
            hint: 'Click along the line from start to end. The colour sensor must stay near it.'
        },
        {
            id: 'move',
            label: 'Move',
            colour: '#4b5563',
            hint: 'Drag a zone or a line point to move it. Click one to select it.'
        }
    ];

    let tool: Tool = 'stop';
    let shape: 'circle' | 'box' = 'circle';
    let selected: CheckItem | undefined = undefined;
    let canvas: HTMLCanvasElement | undefined;
    let width = 0;
    let mat: MatPicture | undefined;
    let matError = '';
    let view: MatView | undefined;
    let pointer: Point | undefined = undefined;
    // While dragging: where it started and what is being drawn or moved.
    let dragStart: Point | undefined = undefined;
    let drawing: Zone | undefined = undefined;
    let moving: { item: CheckItem; point?: number; last: Point } | undefined = undefined;

    async function load(name: string) {
        mat = undefined;
        matError = '';
        if (!name) return;
        try {
            mat = await readMat(name);
        } catch (e) {
            matError = (e as Error).message;
        }
    }

    async function draw(...changes: unknown[]) {
        void changes;
        if (!canvas || !mat || width == 0) return;
        const fitted = fitCanvas(canvas, mat, width, 560);
        if (!fitted) return;
        view = fitted.view;
        const { ctx } = fitted;
        await drawMat(ctx, view, mat.map, 0.3);
        if (check) drawCheck(ctx, view, check, selected);
        if (drawing) {
            drawCheck(
                ctx,
                view,
                tool == 'stop'
                    ? { stop: { zone: drawing } }
                    : tool == 'waypoint'
                      ? { waypoints: [drawing] }
                      : { avoid: [drawing] }
            );
        }
    }

    function round(p: Point): Point {
        if (!mat) return p;
        const w = mat.width / 2;
        const h = mat.height / 2;
        return {
            x: Math.round(Math.max(-w, Math.min(w, p.x))),
            z: Math.round(Math.max(-h, Math.min(h, p.z)))
        };
    }

    function eventPoint(event: PointerEvent): Point | undefined {
        if (!canvas || !view) return undefined;
        const rect = canvas.getBoundingClientRect();
        return round(toMat(view, event.clientX - rect.left, event.clientY - rect.top));
    }

    function makeZone(a: Point, b: Point): Zone {
        const far = Math.hypot(b.x - a.x, b.z - a.z);
        if (shape == 'circle') {
            return { kind: 'circle', x: a.x, z: a.z, radius: Math.round(far < 15 ? 60 : far) };
        }
        if (Math.abs(b.x - a.x) < 15 || Math.abs(b.z - a.z) < 15) {
            return { kind: 'box', x1: a.x - 60, z1: a.z - 60, x2: a.x + 60, z2: a.z + 60 };
        }
        return {
            kind: 'box',
            x1: Math.min(a.x, b.x),
            z1: Math.min(a.z, b.z),
            x2: Math.max(a.x, b.x),
            z2: Math.max(a.z, b.z)
        };
    }

    function inZone(zone: Zone, p: Point) {
        if (zone.kind == 'circle') return Math.hypot(p.x - zone.x, p.z - zone.z) <= zone.radius;
        return (
            p.x >= Math.min(zone.x1, zone.x2) &&
            p.x <= Math.max(zone.x1, zone.x2) &&
            p.z >= Math.min(zone.z1, zone.z2) &&
            p.z <= Math.max(zone.z1, zone.z2)
        );
    }

    // What is under the pointer: line points first, then zones (top-most first).
    function hit(p: Point): { item: CheckItem; point?: number } | undefined {
        if (!check || !view) return undefined;
        const near = 10 / view.scale;
        const path = check.follow?.path ?? [];
        for (let i = path.length - 1; i >= 0; i--) {
            if (Math.hypot(path[i].x - p.x, path[i].z - p.z) <= near) {
                return { item: { kind: 'follow' }, point: i };
            }
        }
        if (check.stop && inZone(check.stop.zone, p)) return { item: { kind: 'stop' } };
        const waypoints = check.waypoints ?? [];
        for (let i = waypoints.length - 1; i >= 0; i--) {
            if (inZone(waypoints[i], p)) return { item: { kind: 'waypoint', index: i } };
        }
        const avoid = check.avoid ?? [];
        for (let i = avoid.length - 1; i >= 0; i--) {
            if (inZone(avoid[i], p)) return { item: { kind: 'avoid', index: i } };
        }
        return undefined;
    }

    function shiftZone(zone: Zone, dx: number, dz: number): Zone {
        return zone.kind == 'circle'
            ? { ...zone, x: zone.x + dx, z: zone.z + dz }
            : { ...zone, x1: zone.x1 + dx, x2: zone.x2 + dx, z1: zone.z1 + dz, z2: zone.z2 + dz };
    }

    function down(event: PointerEvent) {
        const p = eventPoint(event);
        if (!p || !check) return;
        canvas?.setPointerCapture(event.pointerId);
        if (tool == 'line') {
            const follow = check.follow ?? { path: [], width: 20, share: 0.9 };
            check.follow = { ...follow, path: [...follow.path, p] };
            selected = { kind: 'follow' };
            check = check;
            return;
        }
        if (tool == 'move') {
            const found = hit(p);
            selected = found?.item;
            moving = found ? { ...found, last: p } : undefined;
            return;
        }
        dragStart = p;
        drawing = makeZone(p, p);
    }

    function move(event: PointerEvent) {
        const p = eventPoint(event);
        pointer = p;
        if (!p || !check) return;
        if (dragStart) {
            drawing = makeZone(dragStart, p);
        } else if (moving) {
            const dx = p.x - moving.last.x;
            const dz = p.z - moving.last.z;
            moving.last = p;
            const item = moving.item;
            if (item.kind == 'follow' && check.follow && moving.point !== undefined) {
                const path = [...check.follow.path];
                path[moving.point] = round({
                    x: path[moving.point].x + dx,
                    z: path[moving.point].z + dz
                });
                check.follow = { ...check.follow, path };
            } else if (item.kind == 'stop' && check.stop) {
                check.stop = { ...check.stop, zone: shiftZone(check.stop.zone, dx, dz) };
            } else if (item.kind == 'waypoint' && check.waypoints) {
                check.waypoints[item.index] = shiftZone(check.waypoints[item.index], dx, dz);
            } else if (item.kind == 'avoid' && check.avoid) {
                check.avoid[item.index] = shiftZone(check.avoid[item.index], dx, dz);
            }
            check = check;
        }
    }

    function up(event: PointerEvent) {
        const p = eventPoint(event);
        if (dragStart && check) {
            const zone = makeZone(dragStart, p ?? dragStart);
            if (tool == 'stop') {
                check.stop = { ...(check.stop ?? {}), zone };
                selected = { kind: 'stop' };
            } else if (tool == 'waypoint') {
                check.waypoints = [...(check.waypoints ?? []), zone];
                selected = { kind: 'waypoint', index: check.waypoints.length - 1 };
            } else if (tool == 'avoid') {
                check.avoid = [...(check.avoid ?? []), zone];
                selected = { kind: 'avoid', index: check.avoid.length - 1 };
            }
            check = check;
        }
        dragStart = undefined;
        drawing = undefined;
        moving = undefined;
    }

    function removeItem(item: CheckItem) {
        if (!check) return;
        if (item.kind == 'stop') delete check.stop;
        if (item.kind == 'follow') delete check.follow;
        if (item.kind == 'waypoint') {
            check.waypoints = check.waypoints?.filter((_, i) => i != item.index);
            if (!check.waypoints?.length) delete check.waypoints;
        }
        if (item.kind == 'avoid') {
            check.avoid = check.avoid?.filter((_, i) => i != item.index);
            if (!check.avoid?.length) delete check.avoid;
        }
        if (sameItem(selected, item)) selected = undefined;
        check = check;
    }

    function undoPoint() {
        if (!check?.follow) return;
        const path = check.follow.path.slice(0, -1);
        if (path.length == 0) delete check.follow;
        else check.follow = { ...check.follow, path };
        check = check;
    }

    function keydown(event: KeyboardEvent) {
        if ((event.key == 'Delete' || event.key == 'Backspace') && selected) {
            event.preventDefault();
            removeItem(selected);
        }
    }

    function setHeading(on: boolean) {
        if (!check?.stop) return;
        check.stop = on
            ? { ...check.stop, heading: { value: 0, tolerance: 10 } }
            : { zone: check.stop.zone };
        check = check;
    }

    function blockChoice(id: string) {
        if (check?.blocks?.use?.includes(id)) return 'use';
        if (check?.blocks?.avoid?.includes(id)) return 'avoid';
        return '';
    }

    function setBlock(id: string, choice: string) {
        if (!check) return;
        const use = (check.blocks?.use ?? []).filter((b) => b != id);
        const avoid = (check.blocks?.avoid ?? []).filter((b) => b != id);
        if (choice == 'use') use.push(id);
        if (choice == 'avoid') avoid.push(id);
        check.blocks = {};
        if (use.length) check.blocks.use = use;
        if (avoid.length) check.blocks.avoid = avoid;
        if (!use.length && !avoid.length) delete check.blocks;
        check = check;
    }

    function setTimeLimit(value: string) {
        if (!check) return;
        const n = Number(value);
        if (value.trim() && Number.isFinite(n) && n > 0) check.timeLimit = Math.min(150, n);
        else delete check.timeLimit;
        check = check;
    }

    function blockCount(c: Check) {
        return (c.blocks?.use?.length ?? 0) + (c.blocks?.avoid?.length ?? 0);
    }

    function valueOf(event: Event) {
        return (event.target as HTMLInputElement | HTMLSelectElement).value;
    }

    function setShare(value: string) {
        if (!check?.follow) return;
        check.follow.share = Math.max(0.01, Math.min(1, (Number(value) || 90) / 100));
        check = check;
    }

    function setSensor(value: string) {
        if (!check?.follow) return;
        if (value) check.follow.sensor = value;
        else delete check.follow.sensor;
        check = check;
    }

    function zoneSize(zone: Zone) {
        return zone.kind == 'circle'
            ? `ring, ${zone.radius / 10} cm radius`
            : `box ${Math.abs(zone.x2 - zone.x1) / 10} × ${Math.abs(zone.z2 - zone.z1) / 10} cm`;
    }

    const realismItems = (Object.keys(presetLabels) as PresetName[]).map((p) => ({
        value: p,
        name: presetLabels[p]
    }));
    const neededItems = [1, 2, 3, 4, 5].map((n) => ({ value: n, name: `${n} of 5 runs` }));
    const sensorItems = [
        { value: '', name: 'First colour sensor' },
        ...['A', 'B', 'C', 'D', 'E', 'F'].map((p) => ({ value: p, name: `Port ${p}` }))
    ];

    $: load(field);
    $: draw(canvas, mat, width, check, selected, drawing);
    $: hint = tools.find((t) => t.id == tool)?.hint ?? '';
</script>

{#if !check}
    <div class="flex flex-col gap-2 rounded-lg border border-dashed border-gray-300 p-4">
        <p class="text-sm text-gray-700">
            A check lets the simulator tell students when they've done it: stop in a zone, drive
            through waypoints, stay out of zones, follow a line, beat a time, or use certain blocks.
        </p>
        {#if field}
            <Button
                size="sm"
                color="light"
                class="self-start"
                on:click={() => (check = { realism: 'realistic', needed: 4 })}>+ Add a check</Button
            >
        {:else}
            <p class="text-sm text-amber-800">Pick a field above to add a check.</p>
        {/if}
    </div>
{:else}
    <div class="flex flex-col gap-3">
        <div class="flex flex-row flex-wrap gap-1" role="toolbar" aria-label="Check tools">
            {#each tools as t}
                <button
                    type="button"
                    class="text-xs font-medium rounded-md border px-2.5 py-1.5 flex items-center gap-1.5 {tool ==
                    t.id
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'}"
                    aria-pressed={tool == t.id}
                    on:click={() => (tool = t.id)}
                >
                    <span class="w-2.5 h-2.5 rounded-full" style="background-color: {t.colour}"
                    ></span>
                    {t.label}
                </button>
            {/each}
            {#if tool == 'line'}
                <span class="ml-auto flex flex-row gap-1">
                    <button
                        type="button"
                        class="text-xs rounded-md border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
                        disabled={!check.follow}
                        on:click={undoPoint}>Undo last point</button
                    >
                    <button
                        type="button"
                        class="text-xs rounded-md border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
                        disabled={!check.follow}
                        on:click={() => removeItem({ kind: 'follow' })}>Clear the line</button
                    >
                </span>
            {:else if tool == 'stop' || tool == 'waypoint' || tool == 'avoid'}
                <span
                    class="ml-auto flex flex-row rounded-md border border-gray-300 overflow-hidden"
                >
                    <button
                        type="button"
                        class="text-xs px-2 py-1 {shape == 'circle'
                            ? 'bg-gray-200 font-semibold'
                            : 'bg-white'}"
                        aria-pressed={shape == 'circle'}
                        on:click={() => (shape = 'circle')}>Ring</button
                    >
                    <button
                        type="button"
                        class="text-xs px-2 py-1 border-l border-gray-300 {shape == 'box'
                            ? 'bg-gray-200 font-semibold'
                            : 'bg-white'}"
                        aria-pressed={shape == 'box'}
                        on:click={() => (shape = 'box')}>Box</button
                    >
                </span>
            {/if}
        </div>
        <p class="text-xs text-gray-600 -mt-1">{hint}</p>

        <div bind:clientWidth={width} class="w-full relative">
            {#if matError}
                <p class="text-sm text-red-700">Couldn't load the field: {matError}</p>
            {:else}
                <canvas
                    bind:this={canvas}
                    tabindex="0"
                    class="block rounded-md border border-gray-300 touch-none {tool == 'move'
                        ? 'cursor-move'
                        : 'cursor-crosshair'}"
                    on:pointerdown={down}
                    on:pointermove={move}
                    on:pointerup={up}
                    on:pointerleave={() => (pointer = undefined)}
                    on:keydown={keydown}
                    >The mat. Pick a tool, then click or drag on it to draw the check.</canvas
                >
                {#if pointer}
                    <span
                        class="absolute top-1 left-1 text-[11px] rounded bg-white/90 px-1.5 py-0.5 text-gray-700 font-mono pointer-events-none"
                        >x {pointer.x} z {pointer.z} mm</span
                    >
                {/if}
            {/if}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
                <Label for="check-realism" class="mb-1 text-xs">Realism</Label>
                <Select
                    id="check-realism"
                    size="sm"
                    items={realismItems}
                    bind:value={check.realism}
                    placeholder=""
                />
            </div>
            <div>
                <Label for="check-needed" class="mb-1 text-xs">Must pass</Label>
                <Select
                    id="check-needed"
                    size="sm"
                    items={neededItems}
                    bind:value={check.needed}
                    placeholder=""
                />
            </div>
            <div>
                <Label for="check-time" class="mb-1 text-xs">Time limit (seconds, optional)</Label>
                <Input
                    id="check-time"
                    size="sm"
                    type="number"
                    min="1"
                    max="150"
                    value={check.timeLimit ?? ''}
                    on:change={(e) => setTimeLimit(valueOf(e))}
                />
            </div>
        </div>

        <ul class="flex flex-col gap-2 text-sm" aria-label="Parts of the check">
            {#if check.stop}
                <li
                    class="rounded-md border p-2 flex flex-col gap-2 {selected?.kind == 'stop'
                        ? 'border-green-500'
                        : 'border-gray-200'}"
                >
                    <div class="flex flex-row items-center gap-2">
                        <span
                            class="w-2.5 h-2.5 rounded-full"
                            style="background-color: {checkColours.stop}"
                        ></span>
                        <b>Stop zone</b>
                        <span class="text-gray-500 text-xs">{zoneSize(check.stop.zone)}</span>
                        <Input
                            size="sm"
                            class="max-w-[10rem] ml-auto"
                            placeholder="Label (optional)"
                            aria-label="Stop zone label"
                            bind:value={check.stop.zone.label}
                        />
                        <Button
                            size="xs"
                            color="light"
                            on:click={() => removeItem({ kind: 'stop' })}>Remove</Button
                        >
                    </div>
                    <label class="flex flex-row flex-wrap items-center gap-2 text-xs text-gray-700">
                        <input
                            type="checkbox"
                            class="rounded"
                            checked={!!check.stop.heading}
                            on:change={(e) => setHeading(e.currentTarget.checked)}
                        />
                        Must face a direction
                    </label>
                    {#if check.stop.heading}
                        <div
                            class="flex flex-row flex-wrap items-center gap-2 text-xs text-gray-700"
                        >
                            <label for="check-heading">Facing</label>
                            <Input
                                id="check-heading"
                                size="sm"
                                type="number"
                                class="w-20"
                                bind:value={check.stop.heading.value}
                            />
                            <span>degrees (0 = up the mat, 90 = right, 180 = down)</span>
                            <label for="check-tolerance">give or take</label>
                            <Input
                                id="check-tolerance"
                                size="sm"
                                type="number"
                                class="w-16"
                                bind:value={check.stop.heading.tolerance}
                            />
                        </div>
                    {/if}
                </li>
            {/if}
            {#each check.waypoints ?? [] as zone, i}
                <li
                    class="rounded-md border p-2 flex flex-row items-center gap-2 {sameItem(
                        selected,
                        {
                            kind: 'waypoint',
                            index: i
                        }
                    )
                        ? 'border-blue-500'
                        : 'border-gray-200'}"
                >
                    <span
                        class="w-2.5 h-2.5 rounded-full"
                        style="background-color: {checkColours.waypoint}"
                    ></span>
                    <b>Waypoint {i + 1}</b>
                    <span class="text-gray-500 text-xs">{zoneSize(zone)}</span>
                    <Input
                        size="sm"
                        class="max-w-[10rem] ml-auto"
                        placeholder="Label (optional)"
                        aria-label="Waypoint {i + 1} label"
                        bind:value={zone.label}
                        on:input={() => (check = check)}
                    />
                    <Button
                        size="xs"
                        color="light"
                        on:click={() => removeItem({ kind: 'waypoint', index: i })}>Remove</Button
                    >
                </li>
            {/each}
            {#each check.avoid ?? [] as zone, i}
                <li
                    class="rounded-md border p-2 flex flex-row items-center gap-2 {sameItem(
                        selected,
                        {
                            kind: 'avoid',
                            index: i
                        }
                    )
                        ? 'border-red-500'
                        : 'border-gray-200'}"
                >
                    <span
                        class="w-2.5 h-2.5 rounded-full"
                        style="background-color: {checkColours.avoid}"
                    ></span>
                    <b>Stay-out zone</b>
                    <span class="text-gray-500 text-xs">{zoneSize(zone)}</span>
                    <Input
                        size="sm"
                        class="max-w-[10rem] ml-auto"
                        placeholder="Label (optional)"
                        aria-label="Stay-out zone {i + 1} label"
                        bind:value={zone.label}
                        on:input={() => (check = check)}
                    />
                    <Button
                        size="xs"
                        color="light"
                        on:click={() => removeItem({ kind: 'avoid', index: i })}>Remove</Button
                    >
                </li>
            {/each}
            {#if check.follow}
                <li
                    class="rounded-md border p-2 flex flex-col gap-2 {selected?.kind == 'follow'
                        ? 'border-amber-500'
                        : 'border-gray-200'}"
                >
                    <div class="flex flex-row items-center gap-2">
                        <span
                            class="w-2.5 h-2.5 rounded-full"
                            style="background-color: {checkColours.follow}"
                        ></span>
                        <b>Line to follow</b>
                        <span class="text-gray-500 text-xs">{check.follow.path.length} points</span>
                        <Button
                            size="xs"
                            color="light"
                            class="ml-auto"
                            on:click={() => removeItem({ kind: 'follow' })}>Remove</Button
                        >
                    </div>
                    {#if check.follow.path.length < 2}
                        <p class="text-xs text-amber-800">
                            Click at least one more point along the line.
                        </p>
                    {/if}
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div>
                            <Label for="check-width" class="mb-1 text-xs"
                                >Allowed distance from the line (mm)</Label
                            >
                            <Input
                                id="check-width"
                                size="sm"
                                type="number"
                                min="5"
                                max="200"
                                bind:value={check.follow.width}
                            />
                        </div>
                        <div>
                            <Label for="check-share" class="mb-1 text-xs"
                                >On the line at least (%)</Label
                            >
                            <Input
                                id="check-share"
                                size="sm"
                                type="number"
                                min="1"
                                max="100"
                                value={Math.round(check.follow.share * 100)}
                                on:change={(e) => setShare(valueOf(e))}
                            />
                        </div>
                        <div>
                            <Label for="check-sensor" class="mb-1 text-xs">Sensor</Label>
                            <Select
                                id="check-sensor"
                                size="sm"
                                items={sensorItems}
                                value={check.follow.sensor ?? ''}
                                on:change={(e) => setSensor(valueOf(e))}
                                placeholder=""
                            />
                        </div>
                    </div>
                </li>
            {/if}
        </ul>

        <details class="rounded-md border border-gray-200 p-2 text-sm">
            <summary class="cursor-pointer font-medium"
                >Blocks{check.blocks
                    ? ` · ${blockCount(check)} rule${blockCount(check) == 1 ? '' : 's'}`
                    : ' (optional)'}</summary
            >
            <p class="text-xs text-gray-600 my-2">
                Only blocks in stacks that run (under an event block, or in a My Block) count.
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {#each blockRules as rule}
                    <label class="flex flex-row items-center justify-between gap-2 text-xs">
                        <span>{rule.label}</span>
                        <select
                            class="text-xs rounded border-gray-300 py-0.5"
                            value={blockChoice(rule.id)}
                            on:change={(e) => setBlock(rule.id, e.currentTarget.value)}
                        >
                            <option value="">Any</option>
                            <option value="use">Must use</option>
                            <option value="avoid">Must not use</option>
                        </select>
                    </label>
                {/each}
            </div>
        </details>

        <Button
            size="xs"
            color="light"
            class="self-start text-red-700"
            on:click={() => {
                check = undefined;
                selected = undefined;
            }}>Remove the whole check</Button
        >
    </div>
{/if}

<style>
    canvas:focus {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
    }
</style>
