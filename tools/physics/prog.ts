/* eslint-disable @typescript-eslint/no-explicit-any -- builds loose Blockly JSON */
// Tiny builder for Blockly JSON programs.
let n = 0;
const id = () => 'b' + ++n;
export const num = (v: number) => ({
    shadow: { id: id(), type: 'math_number', fields: { NUM: String(v) } }
});
export const sh = (type: string, v: string) => ({
    shadow: { id: id(), type, fields: { ['field_' + type]: v } }
});
export const blk = (
    type: string,
    inputs: Record<string, any> = {},
    fields: Record<string, any> = {}
) => ({ id: id(), type, inputs, fields });
export const val = (b: any) => ({ block: b });
export function program(...stmts: any[]) {
    const top: any = blk('flipperevents_whenProgramStarts');
    top.x = 0;
    top.y = 0;
    let cur = top;
    for (const s of stmts) {
        cur.next = { block: s };
        cur = s;
    }
    return { blocks: { languageVersion: 0, blocks: [top] } };
}
export function chain(...stmts: any[]) {
    for (let i = 0; i < stmts.length - 1; i++) stmts[i].next = { block: stmts[i + 1] };
    return stmts[0];
}
export const speed = (p: number) => blk('flippermove_movementSpeed', { SPEED: num(p) });
export const pair = (p: string) =>
    blk('flippermove_setMovementPair', { PAIR: sh('flippermove_movement-port-selector', p) });
export const move = (dir: string, v: number, unit: string) =>
    blk(
        'flippermove_move',
        { DIRECTION: sh('flippermove_custom-icon-direction', dir), VALUE: num(v) },
        { UNIT: unit }
    );
export const steer = (s: number, v: number, unit: string) =>
    blk(
        'flippermove_steer',
        { STEERING: sh('flippermove_rotation-wheel', String(s)), VALUE: num(v) },
        { UNIT: unit }
    );
export const dual = (l: number, r: number) =>
    blk('flippermoremove_startDualSpeed', { LEFT: num(l), RIGHT: num(r) });
export const stopMove = () => blk('flippermove_stopMove');
export const wait = (s: number) =>
    blk('control_wait', {
        DURATION: { shadow: { id: id(), type: 'math_positive_number', fields: { NUM: String(s) } } }
    });
export const motorFor = (port: string, dir: string, v: number, unit: string) =>
    blk(
        'flippermotor_motorTurnForDirection',
        {
            PORT: sh('flippermotor_multiple-port-selector', port),
            DIRECTION: sh('flippermotor_custom-icon-direction', dir),
            VALUE: num(v)
        },
        { UNIT: unit }
    );
export const motorSpeed = (port: string, v: number) =>
    blk('flippermotor_motorSetSpeed', {
        PORT: sh('flippermotor_multiple-port-selector', port),
        SPEED: num(v)
    });
export const motorStart = (port: string, dir: string) =>
    blk('flippermotor_motorStartDirection', {
        PORT: sh('flippermotor_multiple-port-selector', port),
        DIRECTION: sh('flippermotor_custom-icon-direction', dir)
    });
export const motorStop = (port: string) =>
    blk('flippermotor_motorStop', { PORT: sh('flippermotor_multiple-port-selector', port) });
export const timer = () => blk('flippersensors_timer');
export const resetTimer = () => blk('flippersensors_resetTimer');
export const gt = (a: any, b: any) => blk('operator_gt', { OPERAND1: a, OPERAND2: b });
export const lt = (a: any, b: any) => blk('operator_lt', { OPERAND1: a, OPERAND2: b });
export const waitUntil = (cond: any) => blk('control_wait_until', { CONDITION: val(cond) });
export const yaw = () => blk('flippersensors_orientationAxis', {}, { AXIS: 'yaw' });
export const resetYaw = () => blk('flippersensors_resetYaw');
export const reflect = (port: string) =>
    blk('flippersensors_reflectivity', { PORT: sh('flippersensors_color-sensor-selector', port) });
export const numIn = (v: number) => ({
    shadow: { id: id(), type: 'text', fields: { TEXT: String(v) } }
});
