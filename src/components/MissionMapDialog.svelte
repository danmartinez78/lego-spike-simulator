<script lang="ts">
    // The mission planning map: the field's mat with numbered pins on the
    // missions and the robot's trips between them. The team saves maps with
    // the team data and prints them to plan a match.
    import { Button, Modal } from 'flowbite-svelte';
    import { askConfirm } from '$lib/confirm';
    import { entryTitle, libraryStore, readMat, type MatPicture } from '$lib/library';
    import { missionFields, missionLabel, missionsStore } from '$lib/missions';
    import { drawMat, fitCanvas, px, pz, toMat, type MatView } from '$lib/spike/checkdraw';
    import {
        deletePlan,
        drawPlan,
        listPlans,
        pinRadius,
        savePlan,
        tripColors,
        tripVisits,
        type Plan,
        type PlanPoint
    } from '$lib/plans';
    import { studentStore } from '$lib/team';

    export let modalOpen = false;

    $: coach = !$studentStore && !!$libraryStore.writer;
    $: scenes = $libraryStore.index.scenes.map((s) => s.name);

    let plans: Plan[] = [];
    let plan: Plan = blankPlan();
    let saved = JSON.stringify(plan);
    $: changed = JSON.stringify(plan) != saved;
    let message = '';
    let busy = false;

    let mode: 'pin' | 'trip' = 'pin';
    let activeTrip = 0;

    let canvas: HTMLCanvasElement | undefined;
    let width = 0;
    let mat: MatPicture | undefined;
    let matFailed = false;
    let view: MatView | undefined;

    function defaultField() {
        const fromMission = $missionsStore.flatMap((m) => missionFields(m))[0];
        return fromMission ?? scenes[0] ?? '';
    }

    function blankPlan(): Plan {
        return { title: '', field: '', pins: [], trips: [], notes: '' };
    }

    function startNew() {
        plan = { ...blankPlan(), title: 'Our match plan', field: defaultField() };
        saved = JSON.stringify(plan);
        activeTrip = 0;
        mode = 'pin';
    }

    function show(p: Plan) {
        plan = structuredClone(p);
        saved = JSON.stringify(plan);
        activeTrip = 0;
        mode = 'pin';
    }

    $: openDialog(modalOpen, !!$studentStore, coach);

    async function openDialog(open: boolean, student: boolean, asCoach: boolean) {
        if (!open || !(student || asCoach)) return;
        message = '';
        busy = true;
        try {
            plans = await listPlans(asCoach);
            const same = plans.find((p) => p.id && p.id == plan.id);
            if (same && !changed) show(same);
            else if (!plan.field) {
                if (plans.length > 0) show(plans[0]);
                else startNew();
            }
        } catch (e) {
            message = `Could not load the maps: ${(e as Error).message}`;
        } finally {
            busy = false;
        }
    }

    async function leaveChanges() {
        return (
            !changed ||
            (await askConfirm("This map has changes you haven't saved. Leave them?", {
                confirmLabel: 'Leave them',
                danger: true
            }))
        );
    }

    async function pickPlan(id: string) {
        if (!(await leaveChanges())) {
            plans = plans;
            return;
        }
        message = '';
        if (id == '') startNew();
        else {
            const found = plans.find((p) => p.id == id);
            if (found) show(found);
        }
    }

    async function save() {
        busy = true;
        message = '';
        try {
            plan.pins = plan.pins.map((p, i) => ({
                ...p,
                number: Number.isInteger(p.number) ? p.number : i + 1
            }));
            const result = await savePlan(coach, plan);
            plans = await listPlans(coach);
            show(result);
            message = 'Saved. Everyone on the team can open this map now.';
        } catch (e) {
            message = `Could not save the map: ${(e as Error).message}`;
        } finally {
            busy = false;
        }
    }

    async function remove() {
        if (!plan.id) return;
        if (
            !(await askConfirm(`Delete the map "${plan.title}" for the whole team?`, {
                confirmLabel: 'Delete',
                danger: true
            }))
        )
            return;
        busy = true;
        message = '';
        try {
            await deletePlan(coach, plan.id);
            plans = await listPlans(coach);
            if (plans.length > 0) show(plans[0]);
            else startNew();
        } catch (e) {
            message = `Could not delete the map: ${(e as Error).message}`;
        } finally {
            busy = false;
        }
    }

    async function close() {
        if (await leaveChanges()) {
            if (changed) {
                const found = plans.find((p) => p.id == plan.id);
                if (found) show(found);
                else startNew();
            }
            modalOpen = false;
        }
    }

    // ---- Pins and trips ---------------------------------------------------------

    function nextNumber() {
        return plan.pins.reduce((n, p) => Math.max(n, p.number), 0) + 1;
    }

    function addTrip() {
        const n = plan.trips.length;
        plan.trips = [
            ...plan.trips,
            {
                name: `Trip ${n + 1}`,
                color: tripColors[n % tripColors.length],
                notes: '',
                points: []
            }
        ];
        activeTrip = n;
        mode = 'trip';
    }

    function removePin(i: number) {
        plan.pins = plan.pins.filter((_, j) => j != i);
    }

    async function removeTrip(i: number) {
        const trip = plan.trips[i];
        if (
            trip.points.length > 1 &&
            !(await askConfirm(`Delete ${trip.name || `trip ${i + 1}`}?`, {
                confirmLabel: 'Delete',
                danger: true
            }))
        )
            return;
        plan.trips = plan.trips.filter((_, j) => j != i);
        activeTrip = Math.max(0, Math.min(activeTrip, plan.trips.length - 1));
    }

    function undoPoint() {
        const trip = plan.trips[activeTrip];
        if (!trip) return;
        trip.points = trip.points.slice(0, -1);
        plan = plan;
    }

    // ---- The canvas ---------------------------------------------------------------

    // Only when the field changes, so clicks don't reload the picture.
    let loadedField: string | undefined;
    let bitmap: ImageBitmap | undefined;
    async function loadMat(name: string) {
        if (name == loadedField) return;
        loadedField = name;
        mat = undefined;
        bitmap = undefined;
        matFailed = false;
        if (!name) return;
        try {
            const picture = await readMat(name);
            const decoded = picture.map ? await createImageBitmap(picture.map) : undefined;
            if (loadedField != name) return;
            bitmap = decoded;
            mat = picture;
        } catch {
            if (loadedField == name) matFailed = true;
        }
    }

    function draw(...changes: unknown[]) {
        void changes;
        if (!canvas || !mat || width == 0) return;
        const maxHeight = Math.max(240, window.innerHeight * 0.62);
        const fitted = fitCanvas(canvas, mat, width, maxHeight);
        if (!fitted) return;
        view = fitted.view;
        drawMat(fitted.ctx, fitted.view, bitmap, 0.2);
        drawPlan(fitted.ctx, fitted.view, plan, 1, mode == 'trip' ? activeTrip : undefined);
    }

    $: loadMat(plan.field);
    $: draw(canvas, bitmap, mat, width, plan, mode, activeTrip);

    type Grab = { kind: 'pin'; index: number } | { kind: 'point'; trip: number; index: number };
    let grab: Grab | undefined;

    function eventPoint(event: PointerEvent | MouseEvent) {
        const rect = canvas!.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function hit(at: { x: number; y: number }): Grab | undefined {
        if (!view) return undefined;
        const v = view;
        const near = (p: PlanPoint, r: number) =>
            Math.hypot(px(v, p.x) - at.x, pz(v, p.z) - at.y) <= r;
        const pin = plan.pins.findLastIndex((p) => near(p, pinRadius(1) + 2));
        if (pin >= 0) return { kind: 'pin', index: pin };
        // The trip being drawn first, so its points are easy to move.
        const order = [activeTrip, ...plan.trips.map((_, i) => i).filter((i) => i != activeTrip)];
        for (const t of order) {
            if (!plan.trips[t]) continue;
            const index = plan.trips[t].points.findLastIndex((p) => near(p, 8));
            if (index >= 0) return { kind: 'point', trip: t, index };
        }
        return undefined;
    }

    function clampToMat(p: PlanPoint): PlanPoint {
        if (!view) return p;
        const hw = view.width / 2;
        const hh = view.height / 2;
        return {
            x: Math.round(Math.max(-hw, Math.min(hw, p.x))),
            z: Math.round(Math.max(-hh, Math.min(hh, p.z)))
        };
    }

    function pointerDown(event: PointerEvent) {
        if (!view || event.button != 0) return;
        const at = eventPoint(event);
        grab = hit(at);
        // Drawing a trip, a click on a pin adds a point right on it.
        let snap: PlanPoint | undefined;
        if (grab?.kind == 'pin' && mode == 'trip') {
            const pin = plan.pins[grab.index];
            snap = { x: pin.x, z: pin.z };
            grab = undefined;
        }
        if (grab) {
            canvas!.setPointerCapture(event.pointerId);
            if (grab.kind == 'point') activeTrip = grab.trip;
            return;
        }
        const p = clampToMat(toMat(view, at.x, at.y));
        if (mode == 'pin') {
            plan.pins = [...plan.pins, { ...p, number: nextNumber(), label: '' }];
        } else {
            if (plan.trips.length == 0) addTrip();
            const trip = plan.trips[activeTrip];
            trip.points = [...trip.points, snap ?? p];
            plan = plan;
        }
    }

    function pointerMove(event: PointerEvent) {
        if (!grab || !view) return;
        const at = eventPoint(event);
        const p = clampToMat(toMat(view, at.x, at.y));
        if (grab.kind == 'pin') {
            plan.pins[grab.index] = { ...plan.pins[grab.index], ...p };
        } else {
            plan.trips[grab.trip].points[grab.index] = p;
        }
        plan = plan;
    }

    function pointerUp(event: PointerEvent) {
        if (grab && canvas?.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }
        grab = undefined;
    }

    // Double-click a trip point to take it out.
    function doubleClick(event: MouseEvent) {
        const found = hit(eventPoint(event));
        if (found?.kind != 'point') return;
        const trip = plan.trips[found.trip];
        trip.points = trip.points.filter((_, i) => i != found.index);
        plan = plan;
    }

    // ---- Printing -----------------------------------------------------------------

    function escape(text: string) {
        return text.replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
        );
    }

    async function printMap() {
        // Opened right away, before anything slow, so browsers don't block it.
        const win = window.open('', '_blank');
        if (!win) {
            message = 'Your browser blocked the print window. Allow pop-ups for this site.';
            return;
        }
        win.document.write('<p style="font-family:system-ui">Getting the map ready…</p>');
        try {
            if (!mat) throw new Error("the field's mat isn't loaded");
            const pixels = 2600;
            const scale = pixels / mat.width;
            const printView: MatView = { width: mat.width, height: mat.height, scale };
            const c = document.createElement('canvas');
            c.width = pixels;
            c.height = Math.round(mat.height * scale);
            const ctx = c.getContext('2d')!;
            await drawMat(ctx, printView, bitmap, 0.15);
            drawPlan(ctx, printView, plan, pixels / 1000);
            const image = c.toDataURL('image/png');
            const pins = [...plan.pins].sort((a, b) => a.number - b.number);
            const pinRows = pins
                .map(
                    (p) =>
                        `<li><b class="pin">${p.number}</b> ${escape(p.label || '(no name yet)')}</li>`
                )
                .join('');
            const tripRows = plan.trips
                .map((t, i) => {
                    const visits = tripVisits(t, plan.pins);
                    return `<li><span class="swatch" style="background:${t.color}"></span>
                        <b>${escape(t.name || `Trip ${i + 1}`)}</b>
                        ${visits.length ? ` · pins ${visits.join(', ')}` : ''}
                        ${t.notes ? `<div class="note">${escape(t.notes)}</div>` : ''}
                        <div class="line"></div></li>`;
                })
                .join('');
            const date = new Date().toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            });
            win.document.open();
            win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${escape(plan.title)}</title>
<style>
@page { size: landscape; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: #111827; margin: 0; }
h1 { font-size: 18px; margin: 0 0 2px; }
.sub { font-size: 11px; color: #4b5563; margin-bottom: 6px; }
img { width: 100%; display: block; border: 1px solid #9ca3af; }
.legend { display: flex; gap: 24px; margin-top: 8px; font-size: 12px; }
.legend > div { flex: 1; }
h2 { font-size: 13px; margin: 0 0 4px; }
ul { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 16px; }
li { break-inside: avoid; margin-bottom: 4px; }
.pin { display: inline-block; min-width: 18px; padding: 0 4px; border-radius: 9px;
  background: #111827; color: #fff; text-align: center; font-size: 11px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.swatch { display: inline-block; width: 22px; height: 5px; vertical-align: middle;
  margin-right: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.note { color: #374151; }
.line { border-bottom: 1px solid #9ca3af; height: 16px; }
.notes { white-space: pre-wrap; }
</style></head><body>
<h1>${escape(plan.title)}</h1>
<div class="sub">${escape(entryTitle(plan.field))} · printed ${escape(date)}</div>
<img src="${image}" alt="The mat with the mission pins and the robot's trips">
<div class="legend">
  <div><h2>Missions</h2><ul>${pinRows || '<li>No pins yet</li>'}</ul></div>
  <div><h2>Trips</h2><ul style="columns:1">${tripRows || '<li>No trips yet</li>'}</ul></div>
  ${plan.notes ? `<div><h2>Notes</h2><div class="notes">${escape(plan.notes)}</div></div>` : ''}
</div>
</body></html>`);
            win.document.close();
            const img = win.document.querySelector('img');
            const go = () => {
                win.focus();
                win.print();
            };
            if (img && !img.complete) img.onload = go;
            else go();
        } catch (e) {
            win.close();
            message = `Could not print the map: ${(e as Error).message}`;
        }
    }

    $: missionNames = $missionsStore.map((m) => missionLabel(m));
</script>

<Modal
    backdropClass="fixed inset-0 z-[80] bg-gray-900 bg-opacity-50 dark:bg-opacity-80"
    dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-[90] w-full p-4 flex"
    size="xl"
    bodyClass="p-0"
    open={modalOpen}
    dismissable={false}
    outsideclose={false}
>
    <svelte:fragment slot="header">
        <div class="flex flex-row items-start w-full gap-3">
            <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900">Mission planning map</h3>
                <p class="text-sm text-gray-500">
                    Put a numbered pin on each mission, then draw the robot's trips from the launch
                    area. Print it to plan your match.
                </p>
            </div>
            <Button size="sm" color="light" on:click={close}>Close</Button>
        </div>
    </svelte:fragment>

    {#if !$studentStore && !coach}
        <div class="p-6 text-gray-800">
            Planning maps are for our team only. Sign in with the code from your coach first.
        </div>
    {:else}
        <div class="flex flex-col gap-3 p-4 text-gray-800">
            <div class="flex flex-wrap items-end gap-2">
                <label class="flex flex-col text-xs text-gray-600">
                    Map
                    <select
                        class="rounded-lg border-gray-300 text-sm py-1.5"
                        value={plan.id ?? ''}
                        on:change={(e) => pickPlan(e.currentTarget.value)}
                    >
                        {#each plans as p}
                            <option value={p.id}>{p.title}</option>
                        {/each}
                        <option value="">{plan.id ? '+ New map' : 'New map (not saved yet)'}</option
                        >
                    </select>
                </label>
                <label class="flex flex-col text-xs text-gray-600">
                    Name
                    <input
                        type="text"
                        class="rounded-lg border-gray-300 text-sm py-1.5 w-48"
                        bind:value={plan.title}
                        maxlength="80"
                    />
                </label>
                <label class="flex flex-col text-xs text-gray-600">
                    Field
                    <select
                        class="rounded-lg border-gray-300 text-sm py-1.5"
                        bind:value={plan.field}
                    >
                        {#each scenes as scene}
                            <option value={scene}>{entryTitle(scene)}</option>
                        {/each}
                    </select>
                </label>
                <div class="flex gap-2 ms-auto">
                    <Button
                        size="sm"
                        disabled={busy || !changed || !plan.title.trim()}
                        on:click={save}>{changed ? 'Save' : 'Saved'}</Button
                    >
                    <Button size="sm" color="light" disabled={busy || !mat} on:click={printMap}
                        >Print</Button
                    >
                    {#if plan.id}
                        <Button size="sm" color="light" disabled={busy} on:click={remove}
                            >Delete</Button
                        >
                    {/if}
                </div>
            </div>
            {#if message}
                <div class="text-sm rounded-lg bg-blue-50 text-blue-900 px-3 py-2">{message}</div>
            {/if}

            <div class="flex flex-col lg:flex-row gap-4">
                <div class="flex-1 min-w-0 flex flex-col gap-2">
                    <div class="flex flex-wrap items-center gap-2 text-sm">
                        <span class="text-gray-600">Click on the mat to</span>
                        <button
                            class="rounded-full px-3 py-1 border {mode == 'pin'
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white border-gray-300 hover:bg-gray-50'}"
                            on:click={() => (mode = 'pin')}>add a mission pin</button
                        >
                        <button
                            class="rounded-full px-3 py-1 border {mode == 'trip'
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white border-gray-300 hover:bg-gray-50'}"
                            on:click={() => {
                                mode = 'trip';
                                if (plan.trips.length == 0) addTrip();
                            }}>draw a trip</button
                        >
                        <span class="text-xs text-gray-500"
                            >{mode == 'trip'
                                ? 'Click a pin to drive right to it. Drag a point to move it, double-click to take it out.'
                                : 'Drag a pin to move it.'}</span
                        >
                    </div>
                    <div bind:clientWidth={width} class="w-full">
                        {#if matFailed}
                            <p class="text-sm text-gray-500">
                                Couldn't load the field {plan.field}.
                            </p>
                        {:else}
                            <canvas
                                bind:this={canvas}
                                class="block rounded-md border border-gray-300 touch-none {mode ==
                                'pin'
                                    ? 'cursor-cell'
                                    : 'cursor-crosshair'}"
                                on:pointerdown={pointerDown}
                                on:pointermove={pointerMove}
                                on:pointerup={pointerUp}
                                on:pointercancel={pointerUp}
                                on:dblclick={doubleClick}
                                >The field's mat with the mission pins and trips.</canvas
                            >
                        {/if}
                    </div>
                </div>

                <aside
                    class="lg:w-80 shrink-0 flex flex-col gap-4 text-sm lg:max-h-[65dvh] lg:overflow-y-auto"
                >
                    <section class="flex flex-col gap-1">
                        <h4 class="font-semibold text-gray-900">Mission pins</h4>
                        {#if plan.pins.length == 0}
                            <p class="text-gray-500">
                                Pick "add a mission pin" and click on each mission you plan to do.
                            </p>
                        {/if}
                        <datalist id="plan-missions">
                            {#each missionNames as name}
                                <option value={name}></option>
                            {/each}
                        </datalist>
                        {#each plan.pins as pin, i}
                            <div class="flex items-center gap-1">
                                <input
                                    type="number"
                                    min="0"
                                    max="99"
                                    class="w-14 rounded-lg border-gray-300 text-sm py-1 px-2"
                                    aria-label="Pin number"
                                    bind:value={pin.number}
                                />
                                <input
                                    type="text"
                                    class="flex-1 min-w-0 rounded-lg border-gray-300 text-sm py-1 px-2"
                                    placeholder="Mission name"
                                    list="plan-missions"
                                    maxlength="60"
                                    bind:value={pin.label}
                                />
                                <button
                                    class="px-2 py-1 text-gray-500 hover:text-red-600"
                                    aria-label="Delete pin {pin.number}"
                                    title="Delete pin"
                                    on:click={() => removePin(i)}>✕</button
                                >
                            </div>
                        {/each}
                    </section>

                    <section class="flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                            <h4 class="font-semibold text-gray-900 flex-1">Trips</h4>
                            <Button size="xs" color="light" on:click={addTrip}>+ New trip</Button>
                        </div>
                        {#if plan.trips.length == 0}
                            <p class="text-gray-500">
                                A trip is one time the robot leaves the launch area and comes back.
                            </p>
                        {/if}
                        {#each plan.trips as trip, i}
                            <div
                                class="rounded-lg border p-2 flex flex-col gap-1 {mode == 'trip' &&
                                activeTrip == i
                                    ? 'border-gray-900 bg-gray-50'
                                    : 'border-gray-200'}"
                            >
                                <div class="flex items-center gap-1">
                                    <span
                                        class="w-4 h-4 rounded-full shrink-0"
                                        style="background:{trip.color}"
                                    ></span>
                                    <input
                                        type="text"
                                        class="flex-1 min-w-0 rounded-lg border-gray-300 text-sm py-1 px-2"
                                        aria-label="Trip name"
                                        maxlength="60"
                                        bind:value={trip.name}
                                    />
                                    <button
                                        class="px-2 py-1 text-gray-500 hover:text-red-600"
                                        aria-label="Delete {trip.name}"
                                        title="Delete trip"
                                        on:click={() => removeTrip(i)}>✕</button
                                    >
                                </div>
                                <input
                                    type="text"
                                    class="rounded-lg border-gray-300 text-sm py-1 px-2"
                                    placeholder="Notes, like attachment or start angle"
                                    maxlength="300"
                                    bind:value={trip.notes}
                                />
                                <div class="flex items-center gap-2 text-xs text-gray-600">
                                    <span class="flex-1"
                                        >{trip.points.length} point{trip.points.length == 1
                                            ? ''
                                            : 's'}{#if tripVisits(trip, plan.pins).length}
                                            · pins {tripVisits(trip, plan.pins).join(
                                                ', '
                                            )}{/if}</span
                                    >
                                    {#if mode == 'trip' && activeTrip == i}
                                        <button
                                            class="underline disabled:opacity-40"
                                            disabled={trip.points.length == 0}
                                            on:click={undoPoint}>Undo point</button
                                        >
                                    {:else}
                                        <button
                                            class="underline"
                                            on:click={() => {
                                                activeTrip = i;
                                                mode = 'trip';
                                            }}>Draw</button
                                        >
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </section>

                    <section class="flex flex-col gap-1">
                        <h4 class="font-semibold text-gray-900">Notes</h4>
                        <textarea
                            class="rounded-lg border-gray-300 text-sm"
                            rows="3"
                            maxlength="2000"
                            placeholder="Anything else for the match"
                            bind:value={plan.notes}
                        ></textarea>
                        {#if plan.updated}
                            <p class="text-xs text-gray-500">
                                Last saved by {plan.by ?? 'someone'} on {new Date(
                                    plan.updated
                                ).toLocaleDateString(undefined, {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric'
                                })}
                            </p>
                        {/if}
                    </section>
                </aside>
            </div>
        </div>
    {/if}
</Modal>
