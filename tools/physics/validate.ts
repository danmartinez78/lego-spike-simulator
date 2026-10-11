// Physics checks: Ideal rollouts against hand-worked geometry, and Realistic /
// Challenging rollouts for spread and bias. Prints a table and exits non-zero
// if a check fails. Run with: node tools/physics/run.mjs
import * as P from './prog';
import { realismStore, presets, type PresetName } from '$lib/spike/realism';

type H = typeof import('./harness');

let failures = 0;
function expect(label: string, value: number, want: number, tol: number) {
    const ok = Math.abs(value - want) <= tol;
    if (!ok) failures++;
    console.log(
        `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(48)} ${value.toFixed(2).padStart(9)}  want ${want.toFixed(2)} ±${tol}`
    );
}
function expectRange(label: string, value: number, lo: number, hi: number) {
    const ok = value >= lo && value <= hi;
    if (!ok) failures++;
    console.log(
        `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(48)} ${value.toFixed(2).padStart(9)}  want ${+lo.toFixed(2)} to ${+hi.toFixed(2)}`
    );
}
const wrap = (r: number) => ((((r + 180) % 360) + 360) % 360) - 180;
const meanSd = (a: number[]) => {
    const m = a.reduce((s, x) => s + x, 0) / a.length;
    return [m, Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length)];
};

export default async function (h: H) {
    const robot = h.loadRobot(h.repo + '/presets/robots/DrivingBase3.mpd');
    const [w0, w1] = robot.hub.wheels;
    const track = Math.hypot(w0.position.x - w1.position.x, w0.position.z - w1.position.z);
    const circ = 2 * Math.PI * w0.radius; // mm per wheel rotation
    const degPerSec = (pct: number) => (pct / 100) * 135 * 6; // motor degrees per second
    const run = (prog: object, opts = {}) =>
        h.quiet(() =>
            h.rollout(
                robot,
                h.quiet(() => h.compile(prog)),
                { maxSeconds: 60, ...opts }
            )
        );
    const pair = P.pair('CD');

    console.log(
        `\nIdeal: Driving Base 3, track ${track.toFixed(1)} mm, wheel ${circ.toFixed(1)} mm per rotation`
    );
    h.setRealism('ideal');
    let r = run(P.program(pair, P.speed(50), P.move('forward', 50, 'cm')));
    expect('move 50 cm: distance (mm, 17.5 cm per rotation)', r.end.z, (500 / 175) * circ, 0.5);
    expect('move 50 cm: heading', wrap(r.end.rotation), 0, 0.01);
    r = run(P.program(pair, P.move('forward', 10, 'cm')));
    expect('move 10 cm with no speed set (hub default 50%)', r.end.z, (100 / 175) * circ, 0.5);
    r = run(P.program(pair, P.speed(100), P.move('forward', 2, 'rotations')));
    expect('move 2 rotations: distance', r.end.z, 2 * circ, 0.3);
    r = run(P.program(pair, P.speed(50), P.steer(100, 180, 'degrees')));
    expect(
        'spin (steer 100) 180 wheel degrees: turn',
        -wrap(r.end.rotation),
        ((0.5 * circ) / (track / 2)) * (180 / Math.PI),
        0.05
    );
    expect('spin: stays on the spot', Math.hypot(r.end.x, r.end.z), 0, 0.1);
    r = run(P.program(pair, P.speed(50), P.steer(30, 2, 'rotations')));
    expect(
        'steer 30 for 2 rotations: turn',
        -wrap(r.end.rotation),
        ((2 * circ * 0.6) / track) * (180 / Math.PI),
        0.05
    );
    {
        // Left 50%, right 40% for 2 s: an arc, checked against circle geometry.
        r = run(P.program(pair, P.dual(50, 40), P.wait(2), P.stopMove()));
        const dl = (degPerSec(50) * 2 * circ) / 360;
        const dr = (degPerSec(40) * 2 * circ) / 360;
        const theta = (dl - dr) / track;
        const radius = (dl + dr) / 2 / theta;
        expect('arc 50/40 for 2 s: turn', -wrap(r.end.rotation), (theta * 180) / Math.PI, 0.05);
        expect('arc 50/40 for 2 s: x (right is -x)', r.end.x, -radius * (1 - Math.cos(theta)), 0.5);
        expect('arc 50/40 for 2 s: z', r.end.z, radius * Math.sin(theta), 0.5);
        const r20 = h.quiet(() =>
            h.rollout(
                robot,
                h.quiet(() => h.compile(P.program(pair, P.dual(50, 40), P.wait(2), P.stopMove()))),
                { fps: 20 }
            )
        );
        const r144 = h.quiet(() =>
            h.rollout(
                robot,
                h.quiet(() => h.compile(P.program(pair, P.dual(50, 40), P.wait(2), P.stopMove()))),
                { fps: 144 }
            )
        );
        expect(
            'arc: same end at 20 and 144 frames per second',
            Math.hypot(r20.end.x - r144.end.x, r20.end.z - r144.end.z),
            0,
            0.1
        );
    }
    r = run(P.program(pair, P.dual(50, 45), P.wait(3), P.stopMove()));
    expect(
        'gentle arc 50/45 for 3 s: turn',
        -wrap(r.end.rotation),
        (((degPerSec(5) * 3 * circ) / 360 / track) * 180) / Math.PI,
        0.05
    );
    r = run(P.program(P.motorFor('E', 'clockwise', 90, 'degrees')));
    expect('motor E clockwise 90 degrees', r.end.motors.E, 90, 0.5);
    r = run(P.program(P.motorFor('E', 'clockwise', 1, 'rotations')));
    expect('motor E clockwise 1 rotation', r.end.motors.E, 360, 0.5);
    r = run(P.program(P.motorSpeed('E', -50), P.motorFor('E', 'clockwise', 1, 'rotations')));
    expect('motor E at -50% clockwise 1 rotation (turns back)', r.end.motors.E, -360, 0.5);
    {
        let started = -1;
        const t = run(
            P.program(
                P.waitUntil(P.gt(P.val(P.timer()), P.numIn(2))),
                P.motorFor('E', 'clockwise', 0.1, 'seconds')
            ),
            {
                onFrame: (
                    s: { t: number },
                    vm: { hub: { ports: { E: { motor: { on: boolean } } } } }
                ) => {
                    if (started < 0 && vm.hub.ports.E.motor.on) started = s.t;
                }
            }
        );
        expectRange('wait until timer > 2: seconds after start', started - t.startedAt, 2.0, 2.05);
    }

    // Realism: 30 seeded runs of a 1 m drive per setting.
    const N = 30;
    const straight = h.quiet(() =>
        h.compile(P.program(pair, P.speed(50), P.move('forward', 100, 'cm')))
    );
    const batch = (settings: object) => {
        const heading: number[] = [];
        const lateral: number[] = [];
        const along: number[] = [];
        for (let i = 0; i < N; i++) {
            realismStore.set({
                ...presets.ideal,
                preset: 'custom',
                ...settings,
                seed: 1000 + i
            } as never);
            const r = h.quiet(() => h.rollout(robot, straight, { maxSeconds: 60 }));
            heading.push(wrap(r.end.rotation));
            lateral.push(r.end.x);
            along.push(r.end.z);
        }
        return { heading: meanSd(heading), lateral: meanSd(lateral), along: meanSd(along) };
    };
    console.log(`\nRealism: ${N} runs of move 100 cm at 50% (mean ± sd)`);
    const spread: Record<string, number> = {};
    for (const p of ['ideal', 'realistic', 'challenging'] as PresetName[]) {
        const b = batch({ ...presets[p], preset: p });
        spread[p] = b.heading[1];
        console.log(
            `     ${p.padEnd(12)} heading ${b.heading[0].toFixed(1)} ± ${b.heading[1].toFixed(1)}°   sideways ${b.lateral[0].toFixed(0)} ± ${b.lateral[1].toFixed(0)} mm   distance ${b.along[0].toFixed(0)} ± ${b.along[1].toFixed(0)} mm`
        );
    }
    expect('ideal: heading spread', spread.ideal, 0, 0.001);
    expectRange('realistic: heading spread (°)', spread.realistic, 0.5, 4);
    expectRange('challenging: heading spread (°)', spread.challenging, spread.realistic, 12);
    const over = batch({ stopOvershootDeg: presets.challenging.stopOvershootDeg });
    expect('stop overshoot alone: no left/right bias (°)', over.heading[0], 0, 0.3);
    expectRange(
        'stop overshoot alone: carries the robot on (mm)',
        over.along[0] - (1000 / 175) * circ,
        0.1,
        5
    );
    const slip = batch({ wheelSlipPct: presets.challenging.wheelSlipPct });
    expectRange('wheel slip alone: varies run to run (° sd)', slip.heading[1], 0.3, 5);

    // Colour sensor programs on a drawn mat: white, with a black band.
    const white = 0.95;
    const black = 0.08;
    const spot = 8; // mm across the sensor's view
    const cover = (u: number, a: number, b: number) =>
        Math.max(0, Math.min(u + spot / 2, b) - Math.max(u - spot / 2, a)) / spot;
    const mat = (c: (x: number, z: number) => number) => ({
        reflected: (x: number, z: number) => white + (black - white) * c(x, z),
        colour: (x: number, z: number) => (c(x, z) > 0.5 ? '#000000' : '#f4f4f4')
    });
    const sensor = robot.lightOffsets.B;
    const sensorAt = (s: { x: number; z: number; rotation: number }) => {
        const a = (s.rotation * Math.PI) / 180;
        return [
            s.x + Math.cos(a) * sensor.x + Math.sin(a) * sensor.z,
            s.z - Math.sin(a) * sensor.x + Math.cos(a) * sensor.z
        ];
    };
    const examples = h.repo + '/presets/programs/';
    const stopState = await h.llsp3State(examples + '03 Stop at a line.llsp3');
    const followState = await h.llsp3State(examples + '05 Follow a line (smooth).llsp3');
    const stop = h.quiet(() => h.compile(stopState!));
    const follow = h.quiet(() => h.compile(followState!));
    console.log('\nColour sensor examples (20 runs each with realism)');
    for (const p of ['ideal', 'realistic', 'challenging'] as PresetName[]) {
        let worstStop = 0;
        let worstFollow = 0;
        for (let i = 0; i < (p == 'ideal' ? 1 : 20); i++) {
            realismStore.set({ ...presets[p], preset: p, seed: 500 + i });
            const a = h.quiet(() =>
                h.rollout(robot, stop, { mat: mat((x, z) => cover(z, 500, 520)) })
            );
            worstStop = Math.max(worstStop, Math.abs(sensorAt(a.end)[1] - 500));
            let dev = 0;
            h.quiet(() =>
                h.rollout(robot, follow, {
                    mat: mat((x) => cover(x, sensor.x - 40, sensor.x)),
                    onFrame: (s) => (dev = Math.max(dev, Math.abs(sensorAt(s)[0] - sensor.x)))
                })
            );
            worstFollow = Math.max(worstFollow, dev);
        }
        expectRange(`${p}: stop at a line, worst miss (mm)`, worstStop, 0, 5);
        expectRange(`${p}: follow a line, worst wander (mm)`, worstFollow, 0, 30);
    }
    console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
    return failures == 0;
}
