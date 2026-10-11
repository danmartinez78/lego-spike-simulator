<script lang="ts">
    // Plan a route on the mat: click waypoints and read off how far to drive
    // and how much to turn for each step.
    import { tick } from 'svelte';
    import { Button, Modal, Toggle } from 'flowbite-svelte';
    import { sceneStore } from '$lib/spike/scene';

    export let modalOpen = false;

    interface Point {
        x: number;
        z: number;
    }

    interface Step {
        kind: 'turn' | 'drive';
        value: number;
        text: string;
    }

    let canvas: HTMLCanvasElement | undefined;
    let wrapper: HTMLDivElement | undefined;
    let points: Point[] = [];
    let hover: Point | undefined = undefined;
    let fromRobot = true;
    let showGrid = true;
    let inches = false;
    let copied = false;
    let bitmap: ImageBitmap | undefined = undefined;
    let bitmapSource: Blob | undefined = undefined;
    let scale = 0.3;

    $: scene = $sceneStore;
    $: robotPoint = {
        x: scene.robot.position?.x ?? 0,
        z: scene.robot.position?.z ?? 0
    } as Point;
    $: robotHeading = headingVector(scene.robot.rotation ?? 0);
    $: route = fromRobot ? [robotPoint, ...points] : points;
    $: steps = buildSteps(route, fromRobot, inches);
    $: total = legLengths(route).reduce((a, b) => a + b, 0);

    // The robot faces -z (up the mat image) at 180 degrees, and turning left
    // increases its rotation.
    function headingVector(rotation: number): Point {
        const r = (rotation * Math.PI) / 180;
        return { x: Math.sin(r), z: Math.cos(r) };
    }

    function legLengths(route: Point[]) {
        const result: number[] = [];
        for (let i = 1; i < route.length; i++) {
            result.push(Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z));
        }
        return result;
    }

    // Signed turn from one direction to another: positive is a right turn
    // (clockwise when looking down at the mat).
    function turnBetween(a: Point, b: Point) {
        const cross = a.x * b.z - a.z * b.x;
        const dot = a.x * b.x + a.z * b.z;
        return (Math.atan2(cross, dot) * 180) / Math.PI;
    }

    function distanceText(mm: number, useInches: boolean) {
        return useInches ? `${(mm / 25.4).toFixed(1)} in` : `${(mm / 10).toFixed(1)} cm`;
    }

    function turnText(degrees: number) {
        const rounded = Math.round(Math.abs(degrees));
        if (rounded == 0) {
            return 'Keep going straight';
        }
        return `Turn ${degrees > 0 ? 'right' : 'left'} ${rounded}°`;
    }

    function buildSteps(route: Point[], withHeading: boolean, useInches: boolean): Step[] {
        const result: Step[] = [];
        let heading: Point | undefined = withHeading ? robotHeading : undefined;
        for (let i = 1; i < route.length; i++) {
            const dx = route[i].x - route[i - 1].x;
            const dz = route[i].z - route[i - 1].z;
            const length = Math.hypot(dx, dz);
            if (length < 1) {
                continue;
            }
            const direction = { x: dx / length, z: dz / length };
            if (heading) {
                const turn = turnBetween(heading, direction);
                if (Math.round(Math.abs(turn)) > 0) {
                    result.push({ kind: 'turn', value: turn, text: turnText(turn) });
                }
            }
            result.push({
                kind: 'drive',
                value: length,
                text: `Drive ${distanceText(length, useInches)}`
            });
            heading = direction;
        }
        return result;
    }

    function toCanvas(p: Point) {
        return {
            x: (p.x + scene.mapWidth / 2) * scale,
            y: (p.z + scene.mapHeight / 2) * scale
        };
    }

    function toMat(event: MouseEvent): Point {
        const rect = canvas!.getBoundingClientRect();
        const cx = ((event.clientX - rect.left) / rect.width) * canvas!.clientWidth;
        const cy = ((event.clientY - rect.top) / rect.height) * canvas!.clientHeight;
        return { x: cx / scale - scene.mapWidth / 2, z: cy / scale - scene.mapHeight / 2 };
    }

    async function loadBitmap(map: Blob | undefined) {
        if (map === bitmapSource) {
            return;
        }
        bitmapSource = map;
        bitmap = map ? await createImageBitmap(map) : undefined;
    }

    function label(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        colour: string
    ) {
        ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
        const w = ctx.measureText(text).width + 10;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - 10, w, 20, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#111827';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y + 0.5);
        ctx.textAlign = 'left';
    }

    function arrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, colour: string) {
        const a = toCanvas(from);
        const b = toCanvas(to);
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - 10 * Math.cos(angle - 0.4), b.y - 10 * Math.sin(angle - 0.4));
        ctx.lineTo(b.x - 10 * Math.cos(angle + 0.4), b.y - 10 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
    }

    async function draw() {
        await tick();
        if (!canvas || !wrapper || !modalOpen) {
            return;
        }
        await loadBitmap(scene.map);
        const available = wrapper.clientWidth;
        scale = Math.min(available / scene.mapWidth, 560 / scene.mapHeight);
        const w = Math.round(scene.mapWidth * scale);
        const h = Math.round(scene.mapHeight * scale);
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(0, 0, w, h);
        if (bitmap) {
            ctx.drawImage(bitmap, 0, 0, w, h);
        }
        if (showGrid) {
            ctx.strokeStyle = 'rgba(37, 99, 235, 0.18)';
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

        // Obstacles
        for (const obj of scene.objects) {
            if (!obj.position) continue;
            const p = toCanvas(obj.position);
            ctx.fillStyle = 'rgba(75, 85, 99, 0.6)';
            ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
        }

        // Robot start and heading
        const r = toCanvas(robotPoint);
        ctx.fillStyle = 'rgba(234, 88, 12, 0.18)';
        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 70 * scale + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const nose = {
            x: robotPoint.x + robotHeading.x * 170,
            z: robotPoint.z + robotHeading.z * 170
        };
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        const n = toCanvas(nose);
        ctx.lineTo(n.x, n.y);
        ctx.stroke();
        arrowHead(ctx, robotPoint, nose, '#ea580c');

        // Route
        const full = hover ? [...route, hover] : route;
        const lengths = legLengths(full);
        for (let i = 1; i < full.length; i++) {
            const a = toCanvas(full[i - 1]);
            const b = toCanvas(full[i]);
            const preview = hover && i == full.length - 1;
            ctx.strokeStyle = preview ? 'rgba(37, 99, 235, 0.7)' : '#2563eb';
            ctx.lineWidth = 3;
            ctx.setLineDash(preview ? [6, 5] : []);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.setLineDash([]);
            arrowHead(ctx, full[i - 1], full[i], preview ? 'rgba(37, 99, 235, 0.7)' : '#2563eb');
            label(
                ctx,
                distanceText(lengths[i - 1], inches),
                (a.x + b.x) / 2,
                (a.y + b.y) / 2,
                '#2563eb'
            );
        }
        // Turn labels at each corner
        let heading: Point | undefined = fromRobot ? robotHeading : undefined;
        for (let i = 1; i < full.length; i++) {
            const dx = full[i].x - full[i - 1].x;
            const dz = full[i].z - full[i - 1].z;
            const length = Math.hypot(dx, dz);
            if (length < 1) continue;
            const direction = { x: dx / length, z: dz / length };
            if (heading) {
                const turn = turnBetween(heading, direction);
                if (Math.round(Math.abs(turn)) > 0) {
                    const c = toCanvas(full[i - 1]);
                    label(
                        ctx,
                        `${turn > 0 ? '↻' : '↺'} ${Math.round(Math.abs(turn))}°`,
                        c.x,
                        c.y - 22,
                        '#7c3aed'
                    );
                }
            }
            heading = direction;
        }
        for (const p of points) {
            const c = toCanvas(p);
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }

    function click(event: MouseEvent) {
        points = [...points, toMat(event)];
        copied = false;
    }

    function undo() {
        points = points.slice(0, -1);
    }

    function clear() {
        points = [];
    }

    async function copySteps() {
        const text = steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            copied = true;
        } catch {
            copied = false;
        }
    }

    function keydown(event: KeyboardEvent) {
        if (!modalOpen) return;
        if (event.key == 'Backspace' || (event.key == 'z' && (event.ctrlKey || event.metaKey))) {
            event.preventDefault();
            undo();
        }
    }

    // Redraw whenever anything shown on the mat changes.
    function redraw(...changes: unknown[]) {
        if (changes.length > 0) {
            draw();
        }
    }

    $: redraw(modalOpen, points, hover, fromRobot, showGrid, inches, scene);
</script>

<svelte:window on:keydown={keydown} on:resize={() => draw()} />

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    title="Measure and plan a route"
    size="xl"
    bind:open={modalOpen}
>
    <div class="flex flex-col lg:flex-row gap-4 text-sm">
        <div class="flex-1 min-w-0 flex flex-col gap-2">
            <div bind:this={wrapper} class="w-full">
                <canvas
                    bind:this={canvas}
                    class="block rounded-lg border border-gray-300 cursor-crosshair select-none"
                    on:click={click}
                    on:mousemove={(e) => (hover = toMat(e))}
                    on:mouseleave={() => (hover = undefined)}
                ></canvas>
            </div>
            <p class="text-gray-600">
                Click on the mat to add waypoints. The orange circle is the robot and its arrow
                shows which way it faces. Grid squares are 10 cm. Backspace removes the last point.
            </p>
        </div>
        <div class="lg:w-64 shrink-0 flex flex-col gap-3">
            <div class="flex flex-col gap-2">
                <Toggle size="small" bind:checked={fromRobot}>Start at the robot</Toggle>
                <Toggle size="small" bind:checked={showGrid}>Show 10 cm grid</Toggle>
                <Toggle size="small" bind:checked={inches}>Show inches</Toggle>
            </div>
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 flex flex-col gap-1">
                <div class="font-semibold text-gray-800">Route</div>
                {#if steps.length == 0}
                    <div class="text-gray-500">
                        {fromRobot
                            ? 'Click where the robot should go first.'
                            : 'Click two points to measure between them.'}
                    </div>
                {/if}
                <ol class="flex flex-col gap-1">
                    {#each steps as step, i}
                        <li class="flex items-center gap-2">
                            <span
                                class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold text-white {step.kind ==
                                'turn'
                                    ? 'bg-violet-600'
                                    : 'bg-blue-600'}">{i + 1}</span
                            >
                            <span>{step.text}</span>
                        </li>
                    {/each}
                </ol>
                {#if steps.length > 0}
                    <div class="border-t border-gray-200 mt-1 pt-1 text-gray-600">
                        Total driving: <b>{distanceText(total, inches)}</b>
                    </div>
                {/if}
            </div>
            <div class="flex flex-row flex-wrap gap-2">
                <Button size="xs" color="light" on:click={undo} disabled={points.length == 0}
                    >Undo</Button
                >
                <Button size="xs" color="light" on:click={clear} disabled={points.length == 0}
                    >Clear</Button
                >
                <Button size="xs" color="blue" on:click={copySteps} disabled={steps.length == 0}
                    >{copied ? 'Copied!' : 'Copy steps'}</Button
                >
            </div>
            <p class="text-xs text-gray-500">
                Distances are measured from the center of the robot. Turns are what the robot needs
                to do at each point, so they match a TurnRight / TurnLeft My Block that resets the
                yaw angle each time.
            </p>
        </div>
    </div>
</Modal>
