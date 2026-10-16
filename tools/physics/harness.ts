// Headless rollouts of the simulator's VM: compiles programs with the app's
// own Blockly blocks and generator, builds the hub from a robot .mpd with the
// app's LDraw parser, and steps the VM the way SpikeSimulator.svelte does.
// There is no WebGL here, so colour sensors read a mat function you pass in,
// and the robot's origin is midway between its two drive wheels.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as En from 'blockly/msg/en';
import * as fieldAngle from '$lib/blockly/field_angle';
import * as colourPkg from '@blockly/field-colour';
import '$lib/blockly/field_variable_getter';
import '$lib/blockly/field-bitmap';
import '$lib/blockly/field-grid-dropdown';
import '$lib/blockly/field-ultra-sound';
import '$lib/blockly/field-sound';
import '$lib/blockly/field_metadata';
import { procedureBlocks } from '$lib/blockly/procedure_blocks';
import { registerInputShadowExtension } from '$lib/blockly/shadow_input';
import { registerProcedureCallExtension } from '$lib/blockly/procedure_call_extension';
import { blocks } from '$lib/blockly/blocks';
import { loadScratchSb3 } from '$lib/scratch/sb3';
import { convertToBlockly } from '$lib/scratch/blockly';
import {
    spikeGenerator,
    resetCode,
    getCodeEvents,
    getCodeProcedures
} from '$lib/blockly/generator';
import {
    VM,
    Hub,
    Port,
    Motor,
    LightSensor,
    UltraSoundSensor,
    ForceSensor,
    Wheel,
    StringValue,
    ListValue,
    type PortType,
    type Namespace
} from '$lib/spike/vm';
import {
    loadModel,
    loadMPD,
    getUnresolvedParts,
    findPartTransform,
    type Model
} from '$lib/ldraw/components';
import * as m4 from '$lib/ldraw/m4';
import { realismStore, applyPreset, beginRealismRun, type PresetName } from '$lib/spike/realism';
import { copyScene, type SceneObject, type SceneStore } from '$lib/spike/scene';
import { WebGLCompiler } from '$lib/ldraw/gl';
import { compileRobotParts, offsetRobotParts, type RobotParts } from '$lib/spike/attachments';
import { robotToMat } from '$lib/spike/runs';

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let registered = false;
function register() {
    if (registered) return;
    registered = true;
    fieldAngle.registerFieldAngle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CommonJS default in Node
    ((colourPkg as any).registerFieldColour ?? (colourPkg as any).default.registerFieldColour)();
    Blockly.common.defineBlocksWithJsonArray(procedureBlocks);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Blockly.setLocale(En as any);
    registerInputShadowExtension(Blockly);
    registerProcedureCallExtension(Blockly);
    Blockly.defineBlocksWithJsonArray(blocks);
}

export async function llsp3State(file: string) {
    const zip = await new JSZip().loadAsync(fs.readFileSync(file));
    const sb3 = await zip.file('scratch.sb3')!.async('arraybuffer');
    const project = await loadScratchSb3(sb3);
    return convertToBlockly(project!);
}

export function compile(state: object) {
    register();
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, ws);
    if (!Blockly.Variables.nameUsedWithAnyType('message1', ws))
        ws.createVariable('message1', 'broadcast');
    resetCode();
    spikeGenerator.workspaceToCode(ws);
    const globals: Namespace = {};
    for (const v of ws.getVariablesOfType('Number')) globals[v.name] = new StringValue('0');
    for (const v of ws.getVariablesOfType('String')) globals[v.name] = new StringValue('0');
    for (const v of ws.getVariablesOfType('list')) globals[v.name] = new ListValue([]);
    for (const v of ws.getVariablesOfType('')) globals[v.name] = new StringValue('0');
    return { events: getCodeEvents(), procedures: getCodeProcedures(), globals };
}

const partNames: Record<string, string> = {
    '54696': 'motor',
    '54696p01': 'motor',
    '68488': 'motor',
    '54675': 'motor',
    '37308': 'light',
    '37316': 'distance',
    '37312': 'force',
    '39367p01': 'wheel',
    '49295p01': 'wheel'
};
const partRadius: Record<string, number> = { '39367p01': 28, '49295p01': 44 };

export interface Robot {
    model: Model;
    hub: Hub;
    lightOffsets: Record<string, { x: number; z: number }>;
    // The robot's shape and its arms, around the same origin as the wheels,
    // with the ground at y = 0.
    parts: RobotParts;
}

function partMatrix(forward: m4.Matrix4) {
    let matrix = m4.identity();
    matrix = m4.axisRotate(matrix, [1.0, 0.0, 0.0], Math.PI);
    matrix = m4.scale(matrix, 0.4, 0.4, 0.4);
    return m4.multiply(matrix, forward);
}

export function loadRobot(file: string): Robot {
    const model = loadModel('main.ldr', fs.readFileSync(file, 'utf8'));
    // No LDraw library here: stand in empty models for every library part.
    const stub = getUnresolvedParts()
        .map((p) => `0 FILE ${p}\n0 stub\n`)
        .join('');
    if (stub) loadMPD(stub);
    const hub = new Hub();
    hub.reload();
    const walk = (m: Model, fn: (s: Model['subparts'][number]) => void) => {
        for (const s of m.subparts) {
            if (s.model) {
                fn(s);
                walk(s.model, fn);
            }
        }
    };
    walk(model, (s) => {
        if (!s.port) return;
        const type = partNames[s.modelNumber.replace('.dat', '')];
        const port = s.port.port as PortType;
        if (type == 'motor') {
            hub.ports[port] = new Port('motor');
            hub.ports[port].motor = new Motor(s.id);
        } else if (type == 'light') {
            hub.ports[port] = new Port('light');
            hub.ports[port].light = new LightSensor(s.id);
        } else if (type == 'distance') {
            hub.ports[port] = new Port('distance');
            hub.ports[port].ultra = new UltraSoundSensor(s.id);
        } else if (type == 'force') {
            hub.ports[port] = new Port('force');
            hub.ports[port].force = new ForceSensor(s.id);
        }
    });
    walk(model, (s) => {
        if (!s.port) return;
        const part = s.modelNumber.replace('.dat', '');
        if (partNames[part] == 'wheel') {
            hub.wheels.push(
                new Wheel(
                    s.id,
                    partRadius[part] ?? 1,
                    s.gear_ratio ?? 1,
                    s.port.port as PortType,
                    m4.identity()
                )
            );
        }
    });
    for (const w of hub.wheels) {
        const t = findPartTransform(model, w.id)!;
        w.locationTransform = partMatrix(t.forward);
        w.applyTransform();
    }
    // Put the robot origin midway between the two drive wheels (the app uses
    // the model's bounding box centre; only a constant offset differs).
    let cx = 0,
        cz = 0;
    if (hub.wheels.length == 2) {
        cx = (hub.wheels[0].position.x + hub.wheels[1].position.x) / 2;
        cz = (hub.wheels[0].position.z + hub.wheels[1].position.z) / 2;
        for (const w of hub.wheels) {
            w.locationTransform = m4.multiply(m4.translation(-cx, 0, -cz), w.locationTransform);
            w.applyTransform();
        }
    }
    const lightOffsets: Record<string, { x: number; z: number }> = {};
    for (const [port, value] of Object.entries(hub.ports)) {
        const id = value.light?.id;
        if (value.type != 'light' || id === undefined) continue;
        const t = findPartTransform(model, id)!;
        const p = m4.transformVector(partMatrix(t.forward), [0, 0, 0, 1]);
        lightOffsets[port] = { x: p[0] - cx, z: p[2] - cz };
    }
    const compiler = new WebGLCompiler();
    const full = compiler.compileModel(model, { rescale: false });
    const parts = compileRobotParts(compiler, model, full);
    offsetRobotParts(parts, {
        x: -full.recenter.x - cx,
        y: -full.bbox.min.y,
        z: -full.recenter.z - cz
    });
    return { model, hub, lightOffsets, parts };
}

// A box standing on the mat (mm), centered at x, z: a wall when anchored, a
// block the robot can push when not.
export function boxObject(
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    anchored: boolean
): SceneObject {
    return {
        anchored,
        name: anchored ? 'wall' : 'block',
        position: { x, y: 0, z },
        rotation: 0,
        // Only the box is used for bumping.
        compiled: {
            bbox: {
                min: { x: -width / 2, y: 0, z: -depth / 2 },
                max: { x: width / 2, y: height, z: depth / 2 },
                radius: 0
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
    };
}

export interface Mat {
    // Reflected light 0..1 at a mat point (mm), and the colour hex there.
    reflected(x: number, z: number): number;
    colour(x: number, z: number): string;
}

export interface Sample {
    t: number;
    x: number;
    z: number;
    rotation: number;
    yaw: number;
    motors: Record<string, number>;
}

export interface Rollout {
    seed: number | undefined;
    samples: Sample[];
    end: Sample;
    seconds: number;
    timedOut: boolean;
    hub: Hub;
    vm: VM;
    scene: SceneStore;
}

export function setRealism(preset: PresetName, seed = 0) {
    applyPreset(preset);
    realismStore.update((s) => ({ ...s, seed }));
}

// One run, stepping at a fixed frame rate like requestAnimationFrame.
export function rollout(
    robot: Robot,
    code: ReturnType<typeof compile>,
    opts: {
        fps?: number;
        maxSeconds?: number;
        mat?: Mat;
        startRotation?: number;
        start?: { x: number; z: number; rotation: number };
        onFrame?: (s: Sample, vm: VM) => void;
        // Bump into walls and objects (the table is width x height mm).
        solid?: boolean;
        table?: { width: number; height: number };
        objects?: SceneObject[];
    } = {}
): Rollout {
    const fps = opts.fps ?? Number(process.env.FPS ?? 60);
    const maxSeconds = opts.maxSeconds ?? 150;
    const hub = robot.hub;
    hub.reset();
    const scene: SceneStore = copyScene({
        robot: {
            anchored: false,
            name: 'Robot',
            position: { x: opts.start?.x ?? 0, y: 0, z: opts.start?.z ?? 0 },
            rotation: opts.start?.rotation ?? opts.startRotation ?? 0,
            chassis: opts.solid ? robot.parts.chassis : undefined,
            moving: robot.parts.parts
        },
        objects: opts.objects ?? [],
        mapWidth: opts.table?.width,
        mapHeight: opts.table?.height
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const run = beginRealismRun();
    if (run) {
        const o = run.startOffset();
        scene.robot.position!.x += o.x;
        scene.robot.position!.z += o.z;
        scene.robot.rotation = (scene.robot.rotation ?? 0) + o.rotation;
    }
    const globals: Namespace = {};
    for (const [k, v] of Object.entries(code.globals))
        globals[k] = v instanceof ListValue ? new ListValue([]) : new StringValue('0');
    const vm = new VM('h', hub, globals, code.events, code.procedures, undefined);
    vm.start();
    const samples: Sample[] = [];
    let t = 0;
    let idle = 0;
    let run_t = 0;
    const dt = 1 / fps;
    const senseAt = (port: PortType, local: { x: number; z: number }) => {
        if (!opts.mat) return;
        const [mx, mz] = robotToMat(local, scene.robot.position!, scene.robot.rotation ?? 0);
        hub.measureReflected(port, opts.mat.reflected(mx, mz));
        hub.measureColour(port, opts.mat.colour(mx, mz));
    };
    const sense = () => {
        for (const [port, local] of Object.entries(robot.lightOffsets)) {
            senseAt(port as PortType, local);
        }
    };
    // Like the app, the VM also reads the sensors on its own clock.
    for (const [port, local] of Object.entries(robot.lightOffsets)) {
        hub.addSensorSampler(port as PortType, () => senseAt(port as PortType, local));
    }
    const snap = (): Sample => {
        const motors: Record<string, number> = {};
        for (const p of ['A', 'B', 'C', 'D', 'E', 'F'] as PortType[]) {
            const m = hub.ports[p].motor;
            if (m) motors[p] = m.relativePosition;
        }
        return {
            t,
            x: scene.robot.position!.x,
            z: scene.robot.position!.z,
            rotation: scene.robot.rotation ?? 0,
            yaw: hub.yaw,
            motors
        };
    };
    sense();
    vm.step(0, scene);
    let timedOut = false;
    let startedAt = -1;
    while (true) {
        sense();
        vm.step(dt, scene);
        t += dt;
        const s = snap();
        samples.push(s);
        opts.onFrame?.(s, vm);
        if (startedAt < 0) {
            if (vm.wait >= dt) continue; // start delay
            startedAt = t - dt;
        }
        run_t += dt;
        idle = vm.isIdle() ? idle + dt : 0;
        if (idle >= 0.5) break;
        if (run_t >= maxSeconds) {
            timedOut = true;
            break;
        }
    }
    vm.stop();
    return {
        seed: run?.seed,
        startedAt,
        samples,
        end: samples[samples.length - 1],
        seconds: Math.max(0, run_t - idle),
        timedOut,
        hub,
        vm,
        scene
    };
}

export function quiet<T>(fn: () => T): T {
    const log = console.log;
    console.log = () => {};
    try {
        return fn();
    } finally {
        console.log = log;
    }
}
