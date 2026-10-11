// Drawing a check's zones and line on a top-down picture of the mat.

import type { Check, Point, Zone } from '$lib/spike/checks';

export interface MatView {
    width: number;
    height: number;
    // Pixels per mm.
    scale: number;
}

export const checkColours = {
    stop: '#16a34a',
    waypoint: '#2563eb',
    avoid: '#dc2626',
    follow: '#d97706'
};

export function px(view: MatView, x: number) {
    return (x + view.width / 2) * view.scale;
}

export function pz(view: MatView, z: number) {
    return (z + view.height / 2) * view.scale;
}

// Mat coordinates (mm) of a pixel position.
export function toMat(view: MatView, x: number, y: number): Point {
    return { x: x / view.scale - view.width / 2, z: y / view.scale - view.height / 2 };
}

function zonePath(ctx: CanvasRenderingContext2D, view: MatView, zone: Zone) {
    ctx.beginPath();
    if (zone.kind == 'circle') {
        ctx.arc(px(view, zone.x), pz(view, zone.z), zone.radius * view.scale, 0, Math.PI * 2);
    } else {
        ctx.rect(
            px(view, Math.min(zone.x1, zone.x2)),
            pz(view, Math.min(zone.z1, zone.z2)),
            Math.abs(zone.x2 - zone.x1) * view.scale,
            Math.abs(zone.z2 - zone.z1) * view.scale
        );
    }
}

export function zoneCentre(zone: Zone): Point {
    return zone.kind == 'circle'
        ? { x: zone.x, z: zone.z }
        : { x: (zone.x1 + zone.x2) / 2, z: (zone.z1 + zone.z2) / 2 };
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string) {
    ctx.font = '600 12px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 9, w, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
}

function drawZone(
    ctx: CanvasRenderingContext2D,
    view: MatView,
    zone: Zone,
    colour: string,
    fill: string,
    text: string | undefined,
    selected: boolean
) {
    zonePath(ctx, view, zone);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = colour;
    ctx.lineWidth = selected ? 3.5 : 2;
    ctx.setLineDash(selected ? [] : [6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (text) {
        const c = zoneCentre(zone);
        label(ctx, text, px(view, c.x), pz(view, c.z), colour);
    }
}

export type CheckItem =
    | { kind: 'stop' }
    | { kind: 'waypoint'; index: number }
    | { kind: 'avoid'; index: number }
    | { kind: 'follow' };

export function sameItem(a: CheckItem | undefined, b: CheckItem) {
    return !!a && a.kind == b.kind && (!('index' in a) || !('index' in b) || a.index == b.index);
}

export function drawCheck(
    ctx: CanvasRenderingContext2D,
    view: MatView,
    check: Partial<Check>,
    selected?: CheckItem
) {
    if (check.follow && check.follow.path.length > 0) {
        const path = check.follow.path;
        const isSelected = selected?.kind == 'follow';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.25)';
        ctx.lineWidth = Math.max(4, check.follow.width * 2 * view.scale);
        ctx.beginPath();
        path.forEach((p, i) =>
            i == 0
                ? ctx.moveTo(px(view, p.x), pz(view, p.z))
                : ctx.lineTo(px(view, p.x), pz(view, p.z))
        );
        ctx.stroke();
        ctx.strokeStyle = checkColours.follow;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.setLineDash([8, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const [i, p] of path.entries()) {
            ctx.fillStyle = i == 0 ? checkColours.follow : '#ffffff';
            ctx.strokeStyle = checkColours.follow;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(
                px(view, p.x),
                pz(view, p.z),
                i == 0 || i == path.length - 1 ? 5 : 3,
                0,
                Math.PI * 2
            );
            ctx.fill();
            ctx.stroke();
        }
        const first = path[0];
        label(ctx, 'line start', px(view, first.x), pz(view, first.z) - 16, checkColours.follow);
        if (path.length > 1) {
            const last = path[path.length - 1];
            label(ctx, 'end', px(view, last.x), pz(view, last.z) + 16, checkColours.follow);
        }
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
    }
    check.avoid?.forEach((zone, i) =>
        drawZone(
            ctx,
            view,
            zone,
            checkColours.avoid,
            'rgba(220, 38, 38, 0.18)',
            zone.label || 'stay out',
            sameItem(selected, { kind: 'avoid', index: i })
        )
    );
    check.waypoints?.forEach((zone, i) =>
        drawZone(
            ctx,
            view,
            zone,
            checkColours.waypoint,
            'rgba(37, 99, 235, 0.14)',
            zone.label || String(i + 1),
            sameItem(selected, { kind: 'waypoint', index: i })
        )
    );
    if (check.stop) {
        const zone = check.stop.zone;
        drawZone(
            ctx,
            view,
            zone,
            checkColours.stop,
            'rgba(22, 163, 74, 0.18)',
            zone.label || 'stop',
            selected?.kind == 'stop'
        );
        const h = check.stop.heading;
        if (h) {
            // An arrow showing which way the robot must face (0 = up the mat).
            const c = zoneCentre(zone);
            const a = (h.value * Math.PI) / 180;
            const len = 26;
            const x0 = px(view, c.x);
            const y0 = pz(view, c.z) + 14;
            const x1 = x0 + Math.sin(a) * len;
            const y1 = y0 - Math.cos(a) * len;
            ctx.strokeStyle = checkColours.stop;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x1 - Math.sin(a - 0.5) * 8, y1 + Math.cos(a - 0.5) * 8);
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 - Math.sin(a + 0.5) * 8, y1 + Math.cos(a + 0.5) * 8);
            ctx.stroke();
        }
    }
}

// Draw the mat picture (lightened so the check stands out), or a plain background.
export async function drawMat(
    ctx: CanvasRenderingContext2D,
    view: MatView,
    map: Blob | ImageBitmap | undefined,
    lighten = 0.4
) {
    const w = view.width * view.scale;
    const h = view.height * view.scale;
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, w, h);
    if (map) {
        const bitmap = map instanceof Blob ? await createImageBitmap(map) : map;
        ctx.drawImage(bitmap, 0, 0, w, h);
        ctx.fillStyle = `rgba(255, 255, 255, ${lighten})`;
        ctx.fillRect(0, 0, w, h);
    }
}

// Size a canvas for a mat to fit a box, sharp on high-density screens.
export function fitCanvas(
    canvas: HTMLCanvasElement,
    mat: { width: number; height: number },
    maxWidth: number,
    maxHeight: number
): { ctx: CanvasRenderingContext2D; view: MatView } | undefined {
    const scale = Math.min(maxWidth / mat.width, maxHeight / mat.height);
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(mat.width * scale);
    const h = Math.round(mat.height * scale);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, view: { width: mat.width, height: mat.height, scale } };
}
