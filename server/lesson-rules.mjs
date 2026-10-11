// Rules for lesson files (schemas/lesson-v1.json), shared by the server and
// the simulator so both accept exactly the same lessons. Plain JavaScript with
// JSDoc types, because the server runs without a build step.

/**
 * @typedef {{ kind: 'circle', x: number, z: number, radius: number, label?: string }
 *     | { kind: 'box', x1: number, z1: number, x2: number, z2: number, label?: string }} Zone
 * @typedef {{ x: number, z: number }} Point
 * @typedef {{
 *     realism: 'ideal' | 'realistic' | 'challenging',
 *     needed: number,
 *     stop?: { zone: Zone, heading?: { value: number, tolerance: number } },
 *     waypoints?: Zone[],
 *     avoid?: Zone[],
 *     follow?: { path: Point[], width: number, share: number, sensor?: string },
 *     timeLimit?: number,
 *     blocks?: { use?: string[], avoid?: string[] }
 * }} Check
 * @typedef {{ width: number, height: number }} MatSize
 * @typedef {{
 *     mats?: Record<string, MatSize>,
 *     files?: { programs: string[], scenes: string[], robots: string[] },
 *     challenges?: string[]
 * }} LessonContext
 */

export const realismNames = ['ideal', 'realistic', 'challenging'];

// Blocks a check can ask for (or rule out). Each rule matches any of its block types.
export const blockRules = [
    { id: 'repeat', label: 'Repeat (a number of times)', types: ['control_repeat'] },
    { id: 'repeat-until', label: 'Repeat until', types: ['control_repeat_until'] },
    { id: 'forever', label: 'Forever', types: ['control_forever'] },
    { id: 'if', label: 'If or if-else', types: ['control_if', 'control_if_else'] },
    { id: 'wait-until', label: 'Wait until', types: ['control_wait_until'] },
    { id: 'wait', label: 'Wait (seconds)', types: ['control_wait'] },
    { id: 'my-block', label: 'A My Block', types: ['procedures_call'] },
    {
        id: 'variable',
        label: 'Set or change a variable',
        types: ['data_setvariableto', 'data_changevariableby']
    },
    {
        id: 'maths',
        label: 'Maths (+ − × ÷)',
        types: ['operator_add', 'operator_subtract', 'operator_multiply', 'operator_divide']
    },
    {
        id: 'colour-sensor',
        label: 'Colour sensor',
        types: [
            'flippersensors_color',
            'flippersensors_isColor',
            'flippersensors_reflectivity',
            'flippersensors_isReflectivity',
            'flippermoresensors_rawColor',
            'flipperevents_whenColor'
        ]
    },
    {
        id: 'distance-sensor',
        label: 'Distance sensor',
        types: [
            'flippersensors_distance',
            'flippersensors_isDistance',
            'flipperevents_whenDistance'
        ]
    },
    {
        id: 'force-sensor',
        label: 'Force sensor',
        types: ['flippersensors_force', 'flippersensors_isPressed', 'flipperevents_whenPressed']
    },
    {
        id: 'gyro',
        label: 'Gyro (yaw angle)',
        types: [
            'flippersensors_orientationAxis',
            'flippersensors_resetYaw',
            'flippermoresensors_orientation',
            'flippermoresensors_setOrientation',
            'flippermoresensors_angularVelocity'
        ]
    },
    {
        id: 'move-for',
        label: 'Move for a distance',
        types: ['flippermove_move', 'flippermove_steer']
    },
    {
        id: 'start-moving',
        label: 'Start moving',
        types: ['flippermove_startMove', 'flippermove_startSteer', 'flippermoremove_startDualSpeed']
    },
    {
        id: 'motor',
        label: 'Single motor blocks',
        types: [
            'flippermotor_motorTurnForDirection',
            'flippermotor_motorStartDirection',
            'flippermotor_motorGoDirectionToPosition'
        ]
    }
];

const textFields = ['topic', 'summary', 'program', 'field', 'robot', 'challenge'];
const isNumber = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Ids of the challenges a lesson links to: "challenges", plus the single
 * "challenge" older lessons have. Students see them once the lesson is done.
 * @param {Record<string, any> | undefined} lesson
 * @returns {string[]}
 */
export function relatedChallenges(lesson) {
    const ids = Array.isArray(lesson?.challenges) ? lesson.challenges : [];
    const all =
        typeof lesson?.challenge === 'string' && lesson.challenge
            ? [lesson.challenge, ...ids]
            : ids;
    return [...new Set(all.filter((/** @type {unknown} */ id) => typeof id === 'string' && id))];
}

/**
 * @param {unknown} value
 * @param {string} where
 * @param {MatSize | undefined} mat
 * @param {string[]} errors
 */
function checkZone(value, where, mat, errors) {
    const zone = /** @type {Record<string, unknown>} */ (value);
    if (!zone || typeof zone !== 'object') {
        errors.push(`${where} must be a zone object`);
        return;
    }
    if (zone.label !== undefined && typeof zone.label !== 'string') {
        errors.push(`${where}: "label" must be text`);
    }
    /** @type {[number, number][]} */
    let corners = [];
    if (zone.kind === 'circle') {
        if (!isNumber(zone.x) || !isNumber(zone.z) || !isNumber(zone.radius)) {
            errors.push(`${where}: a circle needs numbers x, z and radius (mm)`);
            return;
        }
        const r = /** @type {number} */ (zone.radius);
        if (r < 10 || r > 1000) errors.push(`${where}: radius must be 10 to 1000 mm`);
        const x = /** @type {number} */ (zone.x);
        const z = /** @type {number} */ (zone.z);
        corners = [
            [x, z],
            [x, z]
        ];
    } else if (zone.kind === 'box') {
        if (![zone.x1, zone.z1, zone.x2, zone.z2].every(isNumber)) {
            errors.push(`${where}: a box needs numbers x1, z1, x2 and z2 (mm)`);
            return;
        }
        const [x1, z1, x2, z2] = /** @type {number[]} */ ([zone.x1, zone.z1, zone.x2, zone.z2]);
        if (Math.abs(x2 - x1) < 10 || Math.abs(z2 - z1) < 10) {
            errors.push(`${where}: a box must be at least 10 mm each way`);
        }
        corners = [
            [x1, z1],
            [x2, z2]
        ];
    } else {
        errors.push(`${where}: "kind" must be "circle" or "box"`);
        return;
    }
    if (mat) outsideMat(corners, where, mat, errors);
}

/**
 * @param {[number, number][]} points
 * @param {string} where
 * @param {MatSize} mat
 * @param {string[]} errors
 */
function outsideMat(points, where, mat, errors) {
    const w = mat.width / 2;
    const h = mat.height / 2;
    if (points.some(([x, z]) => Math.abs(x) > w || Math.abs(z) > h)) {
        errors.push(`${where} is off the mat (x must be -${w} to ${w}, z must be -${h} to ${h})`);
    }
}

/**
 * @param {unknown} value
 * @param {MatSize | undefined} mat
 * @param {string[]} errors
 */
function checkCheck(value, mat, errors) {
    const check = /** @type {Record<string, unknown>} */ (value);
    if (!check || typeof check !== 'object' || Array.isArray(check)) {
        errors.push('"check" must be an object');
        return;
    }
    if (!realismNames.includes(/** @type {string} */ (check.realism))) {
        errors.push(`check.realism must be one of ${realismNames.join(', ')}`);
    }
    if (
        !Number.isInteger(check.needed) ||
        /** @type {number} */ (check.needed) < 1 ||
        /** @type {number} */ (check.needed) > 5
    ) {
        errors.push('check.needed must be a whole number from 1 to 5 (runs out of 5)');
    }
    let rules = 0;
    if (check.stop !== undefined) {
        rules++;
        const stop = /** @type {Record<string, unknown>} */ (check.stop);
        checkZone(stop?.zone, 'check.stop.zone', mat, errors);
        if (stop?.heading !== undefined) {
            const heading = /** @type {Record<string, unknown>} */ (stop.heading);
            if (!isNumber(heading?.value) || !isNumber(heading?.tolerance)) {
                errors.push('check.stop.heading needs numbers value and tolerance (degrees)');
            } else if (
                /** @type {number} */ (heading.tolerance) < 1 ||
                /** @type {number} */ (heading.tolerance) > 90
            ) {
                errors.push('check.stop.heading.tolerance must be 1 to 90 degrees');
            }
        }
    }
    for (const key of ['waypoints', 'avoid']) {
        if (check[key] === undefined) continue;
        rules++;
        const list = check[key];
        if (!Array.isArray(list) || list.length === 0 || list.length > 20) {
            errors.push(`check.${key} must be a list of 1 to 20 zones`);
            continue;
        }
        list.forEach((zone, i) => checkZone(zone, `check.${key}[${i}]`, mat, errors));
    }
    if (check.follow !== undefined) {
        rules++;
        const follow = /** @type {Record<string, unknown>} */ (check.follow);
        const path = follow?.path;
        if (!Array.isArray(path) || path.length < 2 || path.length > 200) {
            errors.push('check.follow.path must be a list of 2 to 200 points');
        } else if (!path.every((p) => p && isNumber(p.x) && isNumber(p.z))) {
            errors.push('check.follow.path points need numbers x and z (mm)');
        } else if (mat) {
            outsideMat(
                path.map((p) => [p.x, p.z]),
                'check.follow.path',
                mat,
                errors
            );
        }
        if (
            !isNumber(follow?.width) ||
            /** @type {number} */ (follow.width) < 5 ||
            /** @type {number} */ (follow.width) > 200
        ) {
            errors.push('check.follow.width must be 5 to 200 mm (either side of the line)');
        }
        if (
            !isNumber(follow?.share) ||
            /** @type {number} */ (follow.share) <= 0 ||
            /** @type {number} */ (follow.share) > 1
        ) {
            errors.push('check.follow.share must be more than 0 and at most 1');
        }
        if (follow?.sensor !== undefined && !/^[A-F]$/.test(String(follow.sensor))) {
            errors.push('check.follow.sensor must be a port letter A to F');
        }
    }
    if (check.timeLimit !== undefined) {
        rules++;
        if (
            !isNumber(check.timeLimit) ||
            /** @type {number} */ (check.timeLimit) < 1 ||
            /** @type {number} */ (check.timeLimit) > 150
        ) {
            errors.push('check.timeLimit must be 1 to 150 seconds');
        }
    }
    if (check.blocks !== undefined) {
        const blocks = /** @type {Record<string, unknown>} */ (check.blocks);
        const ids = blockRules.map((r) => r.id);
        for (const key of ['use', 'avoid']) {
            const list = blocks?.[key];
            if (list === undefined) continue;
            if (!Array.isArray(list)) {
                errors.push(`check.blocks.${key} must be a list`);
                continue;
            }
            rules += list.length;
            for (const id of list) {
                if (!ids.includes(id)) {
                    errors.push(
                        `check.blocks.${key}: unknown block rule "${id}" (use one of ${ids.join(', ')})`
                    );
                }
            }
        }
    }
    if (rules === 0) {
        errors.push(
            'The check needs at least one rule: stop, waypoints, avoid, follow, timeLimit or blocks'
        );
    }
}

/**
 * Everything wrong with a lesson. Errors stop it being saved; warnings are
 * things to fix that don't (for example a file that isn't in the library yet).
 *
 * @param {unknown} value
 * @param {LessonContext} [context]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function lessonProblems(value, context = {}) {
    /** @type {string[]} */
    const errors = [];
    /** @type {string[]} */
    const warnings = [];
    const lesson = /** @type {Record<string, any>} */ (value);
    if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) {
        return { errors: ['A lesson must be a JSON object'], warnings };
    }
    if (lesson.schema !== 'spike-lesson/1')
        errors.push('The lesson needs "schema": "spike-lesson/1"');
    if (typeof lesson.title !== 'string' || lesson.title.trim() === '') {
        errors.push('The lesson needs a title');
    } else if (lesson.title.length > 80) {
        errors.push('The title must be 80 characters or fewer');
    }
    if (!Array.isArray(lesson.steps) || lesson.steps.length === 0) {
        errors.push('The lesson needs at least one step');
    } else {
        lesson.steps.forEach((/** @type {any} */ step, /** @type {number} */ i) => {
            if (!step || typeof step.text !== 'string' || step.text.trim() === '') {
                errors.push(`Step ${i + 1} needs some text`);
            }
            if (step && step.title !== undefined && typeof step.title !== 'string') {
                errors.push(`Step ${i + 1}: "title" must be text`);
            }
        });
    }
    for (const field of textFields) {
        if (lesson[field] !== undefined && typeof lesson[field] !== 'string') {
            errors.push(`"${field}" must be text`);
        }
    }
    if (lesson.order !== undefined && !isNumber(lesson.order))
        errors.push('"order" must be a number');
    if (lesson.draft !== undefined && typeof lesson.draft !== 'boolean') {
        errors.push('"draft" must be true or false');
    }
    if (lesson.challenges !== undefined) {
        if (
            !Array.isArray(lesson.challenges) ||
            lesson.challenges.length > 10 ||
            !lesson.challenges.every((/** @type {unknown} */ c) => typeof c === 'string' && c)
        ) {
            errors.push('"challenges" must be a list of up to 10 challenge ids');
        }
    }
    if (context.challenges) {
        for (const id of relatedChallenges(lesson)) {
            if (!context.challenges.includes(id)) {
                errors.push(`There is no challenge called "${id}"`);
            }
        }
    }
    if (lesson.check !== undefined) {
        if (!lesson.field)
            errors.push('A lesson with a check needs a "field" for the check to use');
        checkCheck(lesson.check, lesson.field ? context.mats?.[lesson.field] : undefined, errors);
    }
    if (context.files) {
        /** @type {[string, 'programs' | 'scenes' | 'robots'][]} */
        const refs = [
            ['program', 'programs'],
            ['field', 'scenes'],
            ['robot', 'robots']
        ];
        for (const [field, kind] of refs) {
            const name = lesson[field];
            if (typeof name === 'string' && name && !context.files[kind].includes(name)) {
                warnings.push(`"${field}": ${name} isn't in the library or the package`);
            }
        }
    }
    return { errors, warnings };
}

/**
 * Everything wrong with a challenge (schemas/challenge-v1.json): a short goal
 * on a field, checked over five runs, with hints but no steps.
 *
 * @param {unknown} value
 * @param {LessonContext} [context]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function challengeProblems(value, context = {}) {
    /** @type {string[]} */
    const errors = [];
    /** @type {string[]} */
    const warnings = [];
    const challenge = /** @type {Record<string, any>} */ (value);
    if (!challenge || typeof challenge !== 'object' || Array.isArray(challenge)) {
        return { errors: ['A challenge must be a JSON object'], warnings };
    }
    if (challenge.schema !== 'spike-challenge/1')
        errors.push('The challenge needs "schema": "spike-challenge/1"');
    if (typeof challenge.title !== 'string' || challenge.title.trim() === '') {
        errors.push('The challenge needs a title');
    } else if (challenge.title.length > 80) {
        errors.push('The title must be 80 characters or fewer');
    }
    if (typeof challenge.goal !== 'string' || challenge.goal.trim() === '') {
        errors.push('The challenge needs a goal: one or two sentences saying what to do');
    }
    if (typeof challenge.field !== 'string' || challenge.field.trim() === '') {
        errors.push('The challenge needs a "field" (a .spk scene) for the check to use');
    }
    for (const field of ['skill', 'robot', 'example']) {
        if (challenge[field] !== undefined && typeof challenge[field] !== 'string') {
            errors.push(`"${field}" must be text`);
        }
    }
    if (challenge.level !== undefined && ![1, 2, 3].includes(challenge.level)) {
        errors.push('"level" must be 1 (starter), 2 (getting there) or 3 (tricky)');
    }
    if (challenge.order !== undefined && !isNumber(challenge.order))
        errors.push('"order" must be a number');
    if (challenge.draft !== undefined && typeof challenge.draft !== 'boolean') {
        errors.push('"draft" must be true or false');
    }
    if (challenge.hints !== undefined) {
        if (
            !Array.isArray(challenge.hints) ||
            challenge.hints.length > 10 ||
            !challenge.hints.every((/** @type {unknown} */ h) => typeof h === 'string' && h.trim())
        ) {
            errors.push('"hints" must be a list of up to 10 pieces of text');
        }
    }
    if (challenge.check === undefined) {
        errors.push('The challenge needs a "check": how the simulator decides it passed');
    } else {
        const mat =
            typeof challenge.field === 'string' ? context.mats?.[challenge.field] : undefined;
        checkCheck(challenge.check, mat, errors);
    }
    if (context.files) {
        /** @type {[string, 'programs' | 'scenes' | 'robots'][]} */
        const refs = [
            ['example', 'programs'],
            ['field', 'scenes'],
            ['robot', 'robots']
        ];
        for (const [field, kind] of refs) {
            const name = challenge[field];
            if (typeof name === 'string' && name && !context.files[kind].includes(name)) {
                warnings.push(`"${field}": ${name} isn't in the library`);
            }
        }
    }
    return { errors, warnings };
}
