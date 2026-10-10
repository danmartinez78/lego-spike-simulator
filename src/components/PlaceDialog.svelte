<script lang="ts">
    // Top-down view for placing the robot and obstacles on the mat:
    // drag to move, drag the round handle (or scroll) to turn, or type exact numbers.
    import { tick } from 'svelte';
    import { Button, Modal, Toggle } from 'flowbite-svelte';
    import FileSaver from 'file-saver';
    import { sceneStore, type SceneObject } from '$lib/spike/scene';
    import { sceneToBlob } from '$lib/spike/scenefile';
    import { libraryStore, currentSceneName, saveEntry, refreshLibrary } from '$lib/library';

    export let modalOpen = false;

    interface Footprint {
        width: number;
        length: number;
    }

    let canvas: HTMLCanvasElement | undefined;
    let wrapper: HTMLDivElement | undefined;
    let bitmap: ImageBitmap | undefined;
    let bitmapSource: Blob | undefined;
    let scale = 0.3;
    let selected = '#robot';
    let dragging: 'move' | 'rotate' | undefined = undefined;
    let dragOffset = { x: 0, z: 0 };
    let showGrid = true;
    let snapCm = true;
    let message = '';
    let saved = { x: 0, z: 0, rotation: 0 };

    $: scene = $sceneStore;
    $: items = [scene.robot, ...scene.objects] as SceneObject[];
    $: current = itemByName(selected, scene);

    function itemByName(name: string, s: typeof scene): SceneObject | undefined {
        return name == '#robot' ? s.robot : s.objects.find((o) => o.name == name);
    }

    function isRobot(obj: SceneObject) {
        return obj === scene.robot;
    }

    function footprint(obj: SceneObject): Footprint {
        const box = obj.compiled?.bbox;
        if (box) {
            return {
                width: Math.max(20, box.max.x - box.min.x),
                length: Math.max(20, box.max.z - box.min.z)
            };
        }
        return isRobot(obj) ? { width: 140, length: 160 } : { width: 100, length: 100 };
    }

    // The robot faces up the mat image at rotation 180, and turning left
    // increases rotation. Headings shown to people: 0 = up, 90 = right.
    function forward(rotation: number) {
        const r = (rotation * Math.PI) / 180;
        return { x: Math.sin(r), z: Math.cos(r) };
    }

    function headingOf(rotation: number) {
        return (((180 - rotation) % 360) + 360) % 360;
    }

    function rotationFor(heading: number) {
        return (((180 - heading) % 360) + 360) % 360;
    }

    function toCanvas(x: number, z: number) {
        return { x: (x + scene.mapWidth / 2) * scale, y: (z + scene.mapHeight / 2) * scale };
    }

    function toMat(event: MouseEvent | WheelEvent) {
        const rect = canvas!.getBoundingClientRect();
        const cx = ((event.clientX - rect.left) / rect.width) * canvas!.clientWidth;
        const cy = ((event.clientY - rect.top) / rect.height) * canvas!.clientHeight;
        return { x: cx / scale - scene.mapWidth / 2, z: cy / scale - scene.mapHeight / 2 };
    }

    function corners(obj: SceneObject) {
        const f = forward(obj.rotation ?? 0);
        const side = { x: f.z, z: -f.x };
        const { width, length } = footprint(obj);
        const p = obj.position ?? { x: 0, y: 0, z: 0 };
        return [
            [length / 2, width / 2],
            [length / 2, -width / 2],
            [-length / 2, -width / 2],
            [-length / 2, width / 2]
        ].map(([a, b]) => ({ x: p.x + f.x * a + side.x * b, z: p.z + f.z * a + side.z * b }));
    }

    function handlePoint(obj: SceneObject) {
        const f = forward(obj.rotation ?? 0);
        const p = obj.position ?? { x: 0, y: 0, z: 0 };
        const reach = footprint(obj).length / 2 + 70;
        return { x: p.x + f.x * reach, z: p.z + f.z * reach };
    }

    function inside(obj: SceneObject, point: { x: number; z: number }) {
        const f = forward(obj.rotation ?? 0);
        const p = obj.position ?? { x: 0, y: 0, z: 0 };
        const dx = point.x - p.x;
        const dz = point.z - p.z;
        const along = dx * f.x + dz * f.z;
        const across = dx * f.z - dz * f.x;
        const { width, length } = footprint(obj);
        return Math.abs(along) <= length / 2 + 10 && Math.abs(across) <= width / 2 + 10;
    }

    function commit() {
        sceneStore.update((old) => ({ ...old }));
    }

    async function loadBitmap(map: Blob | undefined) {
        if (map === bitmapSource) return;
        bitmapSource = map;
        bitmap = map ? await createImageBitmap(map) : undefined;
    }

    function drawItem(ctx: CanvasRenderingContext2D, obj: SceneObject, active: boolean) {
        const robot = isRobot(obj);
        const colour = robot ? '#ea580c' : '#4b5563';
        const pts = corners(obj).map((c) => toCanvas(c.x, c.z));
        ctx.fillStyle = robot ? 'rgba(234, 88, 12, 0.22)' : 'rgba(75, 85, 99, 0.25)';
        ctx.strokeStyle = colour;
        ctx.lineWidth = active ? 3 : 1.5;
        ctx.beginPath();
        pts.forEach((p, i) => (i == 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Front edge and arrow
        const p = obj.position ?? { x: 0, y: 0, z: 0 };
        const c = toCanvas(p.x, p.z);
        const f = forward(obj.rotation ?? 0);
        const tip = toCanvas(
            p.x + (f.x * footprint(obj).length) / 2,
            p.z + (f.z * footprint(obj).length) / 2
        );
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        const angle = Math.atan2(tip.y - c.y, tip.x - c.x);
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x - 9 * Math.cos(angle - 0.45), tip.y - 9 * Math.sin(angle - 0.45));
        ctx.lineTo(tip.x - 9 * Math.cos(angle + 0.45), tip.y - 9 * Math.sin(angle + 0.45));
        ctx.closePath();
        ctx.fill();
        if (active) {
            const h = handlePoint(obj);
            const hc = toCanvas(h.x, h.z);
            ctx.strokeStyle = colour;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(tip.x, tip.y);
            ctx.lineTo(hc.x, hc.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(hc.x, hc.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = colour;
            ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('↻', hc.x, hc.y + 0.5);
            ctx.textAlign = 'left';
        }
        if (!robot) {
            ctx.fillStyle = '#111827';
            ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(obj.name, c.x, c.y + (footprint(obj).width / 2) * scale + 12);
            ctx.textAlign = 'left';
        }
    }

    async function draw() {
        await tick();
        if (!canvas || !wrapper || !modalOpen) return;
        await loadBitmap(scene.map);
        scale = Math.min(wrapper.clientWidth / scene.mapWidth, 560 / scene.mapHeight);
        const w = Math.round(scene.mapWidth * scale);
        const h = Math.round(scene.mapHeight * scale);
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(0, 0, w, h);
        if (bitmap) ctx.drawImage(bitmap, 0, 0, w, h);
        if (showGrid) {
            ctx.strokeStyle = 'rgba(37, 99, 235, 0.16)';
            ctx.lineWidth = 1;
            for (let mm = 0; mm <= scene.mapWidth; mm += 100) {
                ctx.beginPath();
                ctx.moveTo(mm * scale + 0.5, 0);
                ctx.lineTo(mm * scale + 0.5, h);
                ctx.stroke();
            }
            for (let mm = 0; mm <= scene.mapHeight; mm += 100) {
                ctx.beginPath();
                ctx.moveTo(0, mm * scale + 0.5);
                ctx.lineTo(w, mm * scale + 0.5);
                ctx.stroke();
            }
        }
        for (const obj of scene.objects) drawItem(ctx, obj, current === obj);
        drawItem(ctx, scene.robot, current === scene.robot);
    }

    function snap(value: number, shift: boolean) {
        return snapCm && !shift ? Math.round(value / 10) * 10 : value;
    }

    function pointerDown(event: PointerEvent) {
        const point = toMat(event);
        if (current) {
            const h = handlePoint(current);
            if (Math.hypot(point.x - h.x, point.z - h.z) < 14 / scale) {
                dragging = 'rotate';
                canvas?.setPointerCapture(event.pointerId);
                return;
            }
        }
        // Robot on top, so check it first.
        const hit = [scene.robot, ...[...scene.objects].reverse()].find((o) => inside(o, point));
        if (hit) {
            selected = isRobot(hit) ? '#robot' : hit.name;
            const p = hit.position ?? { x: 0, y: 0, z: 0 };
            dragOffset = { x: point.x - p.x, z: point.z - p.z };
            dragging = 'move';
            canvas?.setPointerCapture(event.pointerId);
        }
    }

    function pointerMove(event: PointerEvent) {
        if (!dragging || !current) return;
        const point = toMat(event);
        const p = current.position ?? { x: 0, y: 0, z: 0 };
        if (dragging == 'move') {
            current.position = {
                x: snap(point.x - dragOffset.x, event.shiftKey),
                y: p.y,
                z: snap(point.z - dragOffset.z, event.shiftKey)
            };
        } else {
            const dx = point.x - p.x;
            const dz = point.z - p.z;
            let rotation = (Math.atan2(dx, dz) * 180) / Math.PI;
            if (!event.shiftKey) rotation = Math.round(rotation / 15) * 15;
            current.rotation = ((rotation % 360) + 360) % 360;
        }
        commit();
    }

    function pointerUp(event: PointerEvent) {
        dragging = undefined;
        canvas?.releasePointerCapture(event.pointerId);
    }

    function wheel(event: WheelEvent) {
        if (!current) return;
        event.preventDefault();
        const step = event.shiftKey ? 1 : 15;
        const heading = headingOf(current.rotation ?? 0) + (event.deltaY > 0 ? step : -step);
        const snapped = event.shiftKey ? heading : Math.round(heading / 15) * 15;
        current.rotation = rotationFor(snapped);
        commit();
    }

    function keydown(event: KeyboardEvent) {
        if (!modalOpen || !current) return;
        const target = event.target as HTMLElement;
        if (target && target.tagName == 'INPUT') return;
        const step = event.shiftKey ? 1 : 10;
        const p = current.position ?? { x: 0, y: 0, z: 0 };
        let handled = true;
        if (event.key == 'ArrowLeft') current.position = { ...p, x: p.x - step };
        else if (event.key == 'ArrowRight') current.position = { ...p, x: p.x + step };
        else if (event.key == 'ArrowUp') current.position = { ...p, z: p.z - step };
        else if (event.key == 'ArrowDown') current.position = { ...p, z: p.z + step };
        else if (event.key == 'q' || event.key == 'Q')
            current.rotation = rotationFor(
                headingOf(current.rotation ?? 0) - (event.shiftKey ? 1 : 15)
            );
        else if (event.key == 'e' || event.key == 'E')
            current.rotation = rotationFor(
                headingOf(current.rotation ?? 0) + (event.shiftKey ? 1 : 15)
            );
        else handled = false;
        if (handled) {
            event.preventDefault();
            commit();
        }
    }

    // Number fields, in cm from the mat's top-left corner and degrees (0 = up).
    $: fieldX = current?.position
        ? ((current.position.x + scene.mapWidth / 2) / 10).toFixed(1)
        : '';
    $: fieldY = current?.position
        ? ((current.position.z + scene.mapHeight / 2) / 10).toFixed(1)
        : '';
    $: fieldHeading = current ? Math.round(headingOf(current.rotation ?? 0)).toString() : '';

    function setField(kind: 'x' | 'y' | 'heading', event: Event) {
        if (!current) return;
        const value = parseFloat((event.target as HTMLInputElement).value);
        if (!Number.isFinite(value)) return;
        const p = current.position ?? { x: 0, y: 0, z: 0 };
        if (kind == 'x') current.position = { ...p, x: value * 10 - scene.mapWidth / 2 };
        else if (kind == 'y') current.position = { ...p, z: value * 10 - scene.mapHeight / 2 };
        else current.rotation = rotationFor(value);
        commit();
    }

    function face(heading: number) {
        if (!current) return;
        current.rotation = rotationFor(heading);
        commit();
    }

    function resetRobot() {
        scene.robot.position = {
            ...(scene.robot.position ?? { x: 0, y: 0, z: 0 }),
            x: saved.x,
            z: saved.z
        };
        scene.robot.rotation = saved.rotation;
        commit();
    }

    async function saveToLibrary() {
        message = '';
        const name = $currentSceneName;
        if (!name) return;
        try {
            await saveEntry('scenes', name, await sceneToBlob($sceneStore));
            rememberStart();
            message = `Saved. Every run of "${name.replace(/\.spk$/i, '')}" now starts here.`;
        } catch (e) {
            message = `Could not save: ${(e as Error).message}`;
        }
    }

    async function download() {
        FileSaver.saveAs(await sceneToBlob($sceneStore), 'scene.spk');
    }

    function rememberStart() {
        saved = {
            x: scene.robot.position?.x ?? 0,
            z: scene.robot.position?.z ?? 0,
            rotation: scene.robot.rotation ?? 0
        };
    }

    function opened(open: boolean) {
        if (open) {
            message = '';
            selected = '#robot';
            rememberStart();
            refreshLibrary();
        }
    }

    function redraw(...changes: unknown[]) {
        if (changes.length > 0) draw();
    }

    $: opened(modalOpen);
    $: redraw(modalOpen, scene, selected, showGrid);
</script>

<svelte:window on:keydown={keydown} on:resize={() => draw()} />

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    title="Place the robot and objects"
    size="xl"
    bind:open={modalOpen}
>
    <div class="flex flex-col lg:flex-row gap-4 text-sm">
        <div class="flex-1 min-w-0 flex flex-col gap-2">
            <div bind:this={wrapper} class="w-full">
                <canvas
                    bind:this={canvas}
                    class="block rounded-lg border border-gray-300 select-none touch-none {dragging
                        ? 'cursor-grabbing'
                        : 'cursor-grab'}"
                    on:pointerdown={pointerDown}
                    on:pointermove={pointerMove}
                    on:pointerup={pointerUp}
                    on:wheel={wheel}
                ></canvas>
            </div>
            <p class="text-gray-600">
                Drag to move. Drag the round handle, or scroll, to turn. Hold Shift for fine moves.
                Arrow keys nudge 1 cm and Q / E turn 15°.
            </p>
        </div>
        <div class="lg:w-64 shrink-0 flex flex-col gap-3">
            {#if items.length > 1}
                <div class="flex flex-wrap gap-1">
                    {#each items as obj}
                        <button
                            class="text-xs rounded-full border px-2 py-0.5 {current === obj
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'border-gray-300 hover:bg-gray-100'}"
                            on:click={() => (selected = isRobot(obj) ? '#robot' : obj.name)}
                            >{isRobot(obj) ? 'Robot' : obj.name}</button
                        >
                    {/each}
                </div>
            {/if}
            {#if current}
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 flex flex-col gap-2">
                    <div class="font-semibold text-gray-800">
                        {isRobot(current) ? 'Robot' : current.name}
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        <label class="flex flex-col text-xs text-gray-600"
                            >Across (cm)
                            <input
                                class="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
                                type="number"
                                step="0.5"
                                value={fieldX}
                                on:change={(e) => setField('x', e)}
                            />
                        </label>
                        <label class="flex flex-col text-xs text-gray-600"
                            >Down (cm)
                            <input
                                class="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
                                type="number"
                                step="0.5"
                                value={fieldY}
                                on:change={(e) => setField('y', e)}
                            />
                        </label>
                        <label class="flex flex-col text-xs text-gray-600"
                            >Heading
                            <input
                                class="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
                                type="number"
                                step="1"
                                value={fieldHeading}
                                on:change={(e) => setField('heading', e)}
                            />
                        </label>
                    </div>
                    <div class="flex flex-row gap-1">
                        <Button size="xs" color="light" class="flex-1" on:click={() => face(0)}
                            >↑</Button
                        >
                        <Button size="xs" color="light" class="flex-1" on:click={() => face(90)}
                            >→</Button
                        >
                        <Button size="xs" color="light" class="flex-1" on:click={() => face(180)}
                            >↓</Button
                        >
                        <Button size="xs" color="light" class="flex-1" on:click={() => face(270)}
                            >←</Button
                        >
                    </div>
                    <p class="text-xs text-gray-500">
                        Measured from the mat's top-left corner. Heading 0 faces up the mat, 90
                        faces right.
                    </p>
                </div>
            {/if}
            <div class="flex flex-col gap-2">
                <Toggle size="small" bind:checked={snapCm}>Snap to whole cm</Toggle>
                <Toggle size="small" bind:checked={showGrid}>Show 10 cm grid</Toggle>
            </div>
            <div class="flex flex-col gap-2">
                {#if $libraryStore.writer && $currentSceneName}
                    <Button size="sm" color="blue" on:click={saveToLibrary}
                        >Save as the start for "{$currentSceneName.replace(/\.spk$/i, '')}"</Button
                    >
                {/if}
                <div class="flex flex-row gap-2">
                    <Button size="xs" color="light" class="flex-1" on:click={resetRobot}
                        >Undo robot moves</Button
                    >
                    <Button size="xs" color="light" class="flex-1" on:click={download}
                        >Download scene</Button
                    >
                </div>
                <p class="text-xs text-gray-500">
                    Changes apply right away. Press play to try the new start.
                </p>
                {#if message}
                    <div class="text-sm text-gray-800">{message}</div>
                {/if}
            </div>
        </div>
    </div>
</Modal>
