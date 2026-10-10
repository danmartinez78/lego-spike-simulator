<script lang="ts">
    // Live graph of sensor and motor readings. One row per reading, sharing a
    // time axis. While running it shows the last few seconds; after the run
    // it shows the whole run, and hovering reads values at any moment.
    import { onDestroy, onMount } from 'svelte';
    import { CloseButton } from 'flowbite-svelte';
    import { telemetryStore, graphOpen, type Series, type Telemetry } from '$lib/spike/telemetry';

    const liveWindow = 10;
    const rowHeight = 52;
    const labelWidth = 150;
    const padTop = 6;
    const axisHeight = 20;

    let canvas: HTMLCanvasElement;
    let wrapper: HTMLDivElement;
    let width = 600;
    let hidden = new Set<string>();
    let hoverX: number | undefined = undefined;
    let observer: ResizeObserver | undefined;

    // Hide optional rows (motors) the first time each one appears.
    let seen = new Set<string>();
    function noticeSeries(t: Telemetry) {
        let changed = false;
        for (const s of t.series) {
            if (!seen.has(s.id)) {
                seen.add(s.id);
                if (s.optional) {
                    hidden.add(s.id);
                    changed = true;
                }
            }
        }
        if (changed) {
            hidden = hidden;
        }
    }

    $: noticeSeries($telemetryStore);

    function visible(t: Telemetry): Series[] {
        return t.series.filter((s) => !hidden.has(s.id));
    }

    function toggle(id: string) {
        if (hidden.has(id)) {
            hidden.delete(id);
        } else {
            hidden.add(id);
        }
        hidden = hidden;
    }

    function format(value: number, unit: string) {
        const digits = Math.abs(value) >= 100 ? 0 : 1;
        return `${value.toFixed(digits)}${unit == '°' ? '°' : ' ' + unit}`;
    }

    function range(s: Series, from: number, to: number): [number, number] {
        if (s.min !== undefined && s.max !== undefined) {
            return [s.min, s.max];
        }
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = from; i < to; i++) {
            lo = Math.min(lo, s.values[i]);
            hi = Math.max(hi, s.values[i]);
        }
        if (!Number.isFinite(lo)) {
            return [0, 1];
        }
        if (hi - lo < 10) {
            const mid = (hi + lo) / 2;
            lo = mid - 5;
            hi = mid + 5;
        }
        return [lo, hi];
    }

    function draw(t: Telemetry, hover: number | undefined) {
        if (!canvas) {
            return;
        }
        const rows = visible(t);
        const height = Math.max(rows.length, 1) * rowHeight + padTop + axisHeight;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
        ctx.textBaseline = 'middle';

        const n = t.times.length;
        const plotLeft = labelWidth;
        const plotWidth = Math.max(10, width - plotLeft - 8);
        if (n == 0) {
            ctx.fillStyle = '#6b7280';
            ctx.fillText('Press play to record sensor readings.', plotLeft, padTop + rowHeight / 2);
            return;
        }
        const end = t.times[n - 1];
        const start = t.running ? Math.max(t.times[0], end - liveWindow) : t.times[0];
        const span = Math.max(end - start, 0.5);
        let first = 0;
        while (first < n - 1 && t.times[first] < start) first++;
        const xOf = (time: number) => plotLeft + ((time - start) / span) * plotWidth;

        // Sample under the cursor
        let hoverIndex = n - 1;
        if (hover !== undefined && hover >= plotLeft) {
            const time = start + ((hover - plotLeft) / plotWidth) * span;
            hoverIndex = first;
            while (hoverIndex < n - 1 && t.times[hoverIndex] < time) hoverIndex++;
        }

        rows.forEach((s, row) => {
            const top = padTop + row * rowHeight;
            const [lo, hi] = range(s, first, n);
            const yOf = (v: number) => top + 6 + (1 - (v - lo) / (hi - lo)) * (rowHeight - 14);

            // Row background and guide lines
            ctx.fillStyle = row % 2 == 0 ? '#f9fafb' : '#ffffff';
            ctx.fillRect(plotLeft, top, plotWidth, rowHeight);
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(plotLeft, top + rowHeight - 0.5);
            ctx.lineTo(plotLeft + plotWidth, top + rowHeight - 0.5);
            ctx.stroke();
            if (lo < 0 && hi > 0) {
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(plotLeft, yOf(0));
                ctx.lineTo(plotLeft + plotWidth, yOf(0));
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Label and value
            ctx.fillStyle = s.colour;
            ctx.beginPath();
            ctx.arc(10, top + rowHeight / 2 - 8, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#374151';
            ctx.fillText(s.label, 20, top + rowHeight / 2 - 8);
            ctx.fillStyle = '#111827';
            ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
            ctx.fillText(format(s.values[hoverIndex], s.unit), 20, top + rowHeight / 2 + 10);
            ctx.font = '12px ui-sans-serif, system-ui, sans-serif';

            // Scale labels
            ctx.fillStyle = '#9ca3af';
            ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(format(hi, s.unit), plotLeft - 4, top + 8);
            ctx.fillText(format(lo, s.unit), plotLeft - 4, top + rowHeight - 8);
            ctx.textAlign = 'left';
            ctx.font = '12px ui-sans-serif, system-ui, sans-serif';

            // Trace
            ctx.strokeStyle = s.colour;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            for (let i = first; i < n; i++) {
                const x = xOf(t.times[i]);
                const y = yOf(s.values[i]);
                if (i == first) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        });

        // Time axis
        const axisTop = padTop + rows.length * rowHeight;
        ctx.fillStyle = '#6b7280';
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
        const step = span > 60 ? 10 : span > 20 ? 5 : span > 6 ? 2 : span > 2 ? 1 : 0.5;
        for (let time = Math.ceil(start / step) * step; time <= end + 1e-6; time += step) {
            const x = xOf(time);
            ctx.fillRect(x, axisTop, 1, 4);
            ctx.textAlign = 'center';
            ctx.fillText(`${Number(time.toFixed(1))}s`, x, axisTop + 12);
        }
        ctx.textAlign = 'left';

        // Cursor
        if (hover !== undefined && hover >= plotLeft) {
            const x = xOf(t.times[hoverIndex]);
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, padTop);
            ctx.lineTo(x + 0.5, axisTop);
            ctx.stroke();
            const timeLabel = `${t.times[hoverIndex].toFixed(2)}s`;
            const labelWidth = ctx.measureText(timeLabel).width + 10;
            ctx.fillStyle = '#111827';
            ctx.beginPath();
            ctx.roundRect(x - labelWidth / 2, axisTop + 3, labelWidth, 16, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(timeLabel, x, axisTop + 12);
            ctx.textAlign = 'left';
        }
    }

    function move(event: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        hoverX = event.clientX - rect.left;
    }

    onMount(() => {
        observer = new ResizeObserver(() => {
            width = wrapper.clientWidth;
        });
        observer.observe(wrapper);
        width = wrapper.clientWidth;
    });

    onDestroy(() => observer?.disconnect());

    // Redraw when the data, the cursor, the size or the hidden rows change.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    function redraw(t: Telemetry, hover: number | undefined, w: number, h: Set<string>) {
        draw(t, hover);
    }

    $: redraw($telemetryStore, hoverX, width, hidden);
</script>

<div
    bind:this={wrapper}
    class="bg-white/95 backdrop-blur border-t border-gray-300 shadow-lg flex flex-col max-h-[60%] {$$props.class}"
>
    <div class="flex flex-row items-start gap-3 px-3 py-2 border-b border-gray-200">
        <div class="flex flex-col shrink-0">
            <span class="font-semibold text-sm text-gray-800">Sensor graph</span>
            <span class="text-xs text-gray-500">
                {$telemetryStore.running
                    ? `Live · last ${liveWindow} s`
                    : $telemetryStore.times.length > 0
                      ? 'Whole run · hover to read values'
                      : 'Press play to start'}
            </span>
        </div>
        <div class="flex-1 flex flex-row flex-wrap justify-end gap-1.5">
            {#each $telemetryStore.series as s}
                <button
                    class="text-xs rounded-full border px-2 py-0.5 flex items-center gap-1 transition-colors {hidden.has(
                        s.id
                    )
                        ? 'border-gray-200 text-gray-400 bg-white'
                        : 'border-gray-300 text-gray-800 bg-gray-50'}"
                    on:click={() => toggle(s.id)}
                    title={hidden.has(s.id) ? `Show ${s.label}` : `Hide ${s.label}`}
                >
                    <span
                        class="inline-block w-2 h-2 rounded-full"
                        style="background-color: {hidden.has(s.id) ? '#d1d5db' : s.colour}"
                    ></span>
                    {s.label}
                </button>
            {/each}
        </div>
        <CloseButton size="sm" class="shrink-0" on:click={() => graphOpen.set(false)} />
    </div>
    <div class="overflow-y-auto">
        <canvas
            bind:this={canvas}
            class="block w-full cursor-crosshair"
            on:mousemove={move}
            on:mouseleave={() => (hoverX = undefined)}
        ></canvas>
    </div>
</div>
