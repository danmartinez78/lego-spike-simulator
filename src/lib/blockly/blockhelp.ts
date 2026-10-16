// Plain-English help for every block, used for hover tooltips, the
// "Explain this block" card and the block reference in the guide.
// Written for middle school students and new coaches.

export interface BlockHelp {
    // Short name shown as the card title, written like the block reads.
    title: string;
    // One or two sentences: what the block does. Also the hover tooltip.
    text: string;
    // A small example of when to use it.
    example?: string;
    // Something that often trips people up.
    tip?: string;
    // How the simulator differs from a real robot, if it does.
    sim?: string;
}

export interface HelpCategory {
    name: string;
    colour: string;
    types: string[];
}

const notSimulated = 'The simulator does not model tilting or shaking, so this never changes here.';
const ignored = 'The simulator ignores this setting. It runs the same as without it.';

export const blockHelp: Record<string, BlockHelp> = {
    // ---- Motor ------------------------------------------------------------
    flippermotor_motorTurnForDirection: {
        title: 'run motor for …',
        text: 'Turns one motor (or several) for a set amount: rotations, degrees or seconds. The program waits until it finishes.',
        example: 'Lift an arm on port E: run E clockwise for 90 degrees.',
        tip: 'Degrees and rotations are measured at the motor, not at the end of the arm. Gears change how far the arm moves.'
    },
    flippermotor_motorGoDirectionToPosition: {
        title: 'go to position',
        text: 'Turns a motor until its pointer reaches a position from 0 to 359 degrees, going the way you choose (shortest, clockwise or counterclockwise).',
        example: 'Put an attachment back to the same starting angle before each run.',
        tip: "Position is the motor's own dial (0 to 359), not how far it has turned in total."
    },
    flippermotor_motorStartDirection: {
        title: 'start motor',
        text: 'Starts a motor turning and keeps it going. The program moves straight on to the next block.',
        example: 'Start a spinning attachment, then drive somewhere while it spins.',
        tip: 'The motor keeps turning until a stop motor block, so remember to stop it.'
    },
    flippermotor_motorStop: {
        title: 'stop motor',
        text: 'Stops a motor that was started with start motor.'
    },
    flippermotor_motorSetSpeed: {
        title: 'set motor speed',
        text: 'Sets how fast a motor turns in later motor blocks, from 0 to 100%.',
        tip: 'Slower is often more accurate. This does not affect the movement (driving) blocks.'
    },
    flippermotor_absolutePosition: {
        title: 'motor position',
        text: "Reports where the motor's pointer is, from 0 to 359 degrees.",
        tip: 'For "how far has it turned", use relative position in More Motor instead.'
    },
    flippermotor_speed: {
        title: 'motor speed',
        text: 'Reports how fast the motor is turning right now, in percent.'
    },

    // ---- Movement ---------------------------------------------------------
    flippermove_move: {
        title: 'move for …',
        text: 'Drives the robot forward or backward (or spins it) for a distance: cm, inches, rotations, degrees or seconds. The program waits until it finishes.',
        example: 'move forward for 30 cm',
        tip: 'Set the movement motors first so the robot knows which two motors are the wheels. This only counts wheel turns, so slipping or a crooked start is not corrected.'
    },
    flippermove_startMove: {
        title: 'start moving',
        text: 'Starts driving forward or backward and keeps going. The program moves straight on to the next block.',
        example: 'start moving, then wait until the color sensor sees black, then stop moving.',
        tip: 'Always pair it with something that stops the robot, like stop moving after a wait until.'
    },
    flippermove_steer: {
        title: 'move with steering for …',
        text: 'Drives while turning, for a distance. Steering 0 goes straight, 100 or -100 spins on the spot, numbers in between make a curve.',
        example:
            'Steering 100 for 180 degrees spins the robot about a quarter turn on a small driving base.',
        tip: "How far a spin turns the robot depends on the robot's size. For exact turns, use the gyro (yaw angle)."
    },
    flippermove_startSteer: {
        title: 'start moving with steering',
        text: 'Starts driving along a curve (or spinning) and keeps going. The program moves straight on.',
        tip: 'Use it with a wait until to stop at the right moment, for example when the yaw angle reaches 90.'
    },
    flippermove_stopMove: {
        title: 'stop moving',
        text: 'Stops both movement motors.'
    },
    flippermove_movementSpeed: {
        title: 'set movement speed',
        text: 'Sets how fast the robot drives in later movement blocks, from 0 to 100%. The robot starts at 50%.',
        tip: 'Fast is not always better: the robot slides more when stopping and sensors have less time to react.'
    },
    flippermove_setMovementPair: {
        title: 'set movement motors',
        text: 'Tells the robot which two motors drive the wheels. The first letter is the left wheel and the second is the right wheel.',
        example: 'set movement motors to C + D at the top of every program.',
        tip: 'If the robot spins when it should go straight, a motor is probably on a different port or listed the wrong way round.'
    },
    flippermove_setDistance: {
        title: 'set 1 motor rotation',
        text: 'Tells the robot how far it travels for one full wheel rotation, so "move 30 cm" is accurate.',
        example: 'For the 56 mm wheels, one rotation is about 17.6 cm.',
        tip: 'Measure it: drive 10 rotations, measure the distance, divide by 10.'
    },

    // ---- Light ------------------------------------------------------------
    flipperlight_lightDisplayImageOnForTime: {
        title: 'turn on image for …',
        text: "Shows a picture on the hub's 5 by 5 light matrix for a number of seconds, then turns it off."
    },
    flipperlight_lightDisplayImageOn: {
        title: 'turn on image',
        text: "Shows a picture on the hub's light matrix and leaves it on."
    },
    flipperlight_lightDisplayText: {
        title: 'write',
        text: "Scrolls text or a number across the hub's light matrix.",
        example: 'write the reflected light value to check what the sensor sees.'
    },
    flipperlight_lightDisplayOff: {
        title: 'turn off pixels',
        text: "Turns off every light on the hub's matrix."
    },
    flipperlight_lightDisplaySetBrightness: {
        title: 'set pixel brightness',
        text: 'Sets how bright the light matrix is, from 0 to 100%.'
    },
    flipperlight_lightDisplaySetPixel: {
        title: 'set pixel',
        text: 'Turns one light of the 5 by 5 matrix on at a brightness. Column and row go from 1 to 5.'
    },
    flipperlight_lightDisplayRotate: {
        title: 'rotate display',
        text: 'Turns the picture on the light matrix a quarter turn.'
    },
    flipperlight_lightDisplaySetOrientation: {
        title: 'set display orientation',
        text: 'Chooses which way is "up" for pictures and text on the light matrix.'
    },
    flipperlight_centerButtonLight: {
        title: 'set Center Button Light',
        text: "Changes the color of the light in the hub's center button.",
        example: 'Turn it green when a mission step finishes, so you can see where the program is.'
    },
    flipperlight_ultrasonicLightUp: {
        title: 'light up distance sensor',
        text: 'Turns on the four lights around the distance sensor\'s "eyes".'
    },

    // ---- Sound ------------------------------------------------------------
    flippersound_playSoundUntilDone: {
        title: 'play sound until done',
        text: 'Plays a sound and waits for it to finish before moving on.'
    },
    flippersound_playSound: {
        title: 'start sound',
        text: 'Starts a sound and moves straight on while it plays.'
    },
    flippersound_beepForTime: {
        title: 'play beep for …',
        text: "Plays a note from the hub's speaker for a number of seconds.",
        example: 'A short beep is a handy "I got here" signal while testing.'
    },
    flippersound_beep: {
        title: 'start playing beep',
        text: 'Starts playing a note and keeps it going until stop all sounds.'
    },
    flippersound_stopSound: {
        title: 'stop all sounds',
        text: 'Stops every sound and beep.'
    },
    sound_changeeffectby: {
        title: 'change sound effect',
        text: 'Changes the pitch or left/right pan of sounds by an amount.'
    },
    sound_seteffectto: {
        title: 'set sound effect',
        text: 'Sets the pitch or left/right pan of sounds to a value.'
    },
    sound_cleareffects: {
        title: 'clear sound effects',
        text: 'Puts pitch and pan back to normal.'
    },
    sound_changevolumeby: {
        title: 'change volume',
        text: 'Makes sounds louder or quieter by an amount.'
    },
    sound_setvolumeto: {
        title: 'set volume',
        text: 'Sets the sound volume from 0 to 100%.'
    },
    sound_volume: {
        title: 'volume',
        text: 'Reports the current sound volume.'
    },

    // ---- Events -----------------------------------------------------------
    flipperevents_whenProgramStarts: {
        title: 'when program starts',
        text: 'The blocks under this run when you press play. Almost every program starts here.',
        tip: 'You can have more than one: they all start at the same time and run side by side.'
    },
    flipperevents_whenColor: {
        title: 'when color is',
        text: 'Runs the blocks under it every time the color sensor starts seeing the chosen color.'
    },
    flipperevents_whenPressed: {
        title: 'when force sensor is',
        text: 'Runs the blocks under it when the force sensor is pressed, hard-pressed or released.'
    },
    flipperevents_whenDistance: {
        title: 'when distance is',
        text: 'Runs the blocks under it when the distance sensor sees something closer than, farther than, or exactly at a distance.'
    },
    flipperevents_whenTilted: {
        title: 'when tilted',
        text: 'Runs the blocks under it when the hub is tilted in a direction.',
        sim: notSimulated
    },
    flipperevents_whenOrientation: {
        title: 'when … is up',
        text: 'Runs the blocks under it when a chosen side of the hub faces up.',
        sim: notSimulated
    },
    flipperevents_whenGesture: {
        title: 'when shaken / tapped / falling',
        text: 'Runs the blocks under it when the hub is shaken, tapped or falling.',
        sim: notSimulated
    },
    flipperevents_whenButton: {
        title: 'when hub button',
        text: 'Runs the blocks under it when the left or right hub button is pressed or released.',
        example: 'In the simulator, click the arrows under the hub picture to press the buttons.'
    },
    flipperevents_whenTimer: {
        title: 'when timer >',
        text: 'Runs the blocks under it once the timer goes past a number of seconds.',
        example: 'Stop everything after 150 seconds, the length of an FLL match.'
    },
    flipperevents_whenCondition: {
        title: 'when',
        text: 'Runs the blocks under it whenever the condition you put in it becomes true.'
    },
    event_whenbroadcastreceived: {
        title: 'when I receive',
        text: 'Runs the blocks under it when another part of the program broadcasts this message.'
    },
    event_broadcast: {
        title: 'broadcast',
        text: 'Sends a message. Every "when I receive" with the same message starts. This program carries on straight away.'
    },
    event_broadcastandwait: {
        title: 'broadcast and wait',
        text: 'Sends a message and waits until all the scripts that received it have finished.'
    },

    // ---- Control ----------------------------------------------------------
    control_wait: {
        title: 'wait seconds',
        text: 'Pauses this script for a number of seconds. Motors that were started keep going.',
        tip: 'Waiting for time is open loop. Waiting until a sensor sees something is usually more reliable.'
    },
    control_repeat: {
        title: 'repeat',
        text: 'Runs the blocks inside it a set number of times, then carries on.',
        example: 'repeat 4 times: move 30 cm, turn a quarter turn. That drives a square.'
    },
    control_forever: {
        title: 'forever',
        text: 'Runs the blocks inside it again and again until the program is stopped.',
        tip: 'Nothing after a forever ever runs. Use repeat until if you need to stop the loop.'
    },
    control_if: {
        title: 'if … then',
        text: 'Runs the blocks inside it only when the condition is true. Otherwise it skips them.'
    },
    control_if_else: {
        title: 'if … then … else',
        text: 'Checks a condition: if it is true, runs the first group of blocks, otherwise runs the second group.',
        example: 'if the sensor sees dark, steer left, else steer right. That follows a line.'
    },
    control_wait_until: {
        title: 'wait until',
        text: 'Pauses this script until the condition becomes true. Motors that were started keep going.',
        example: 'start moving, wait until the color is black, stop moving.',
        tip: 'This is the heart of closed loop control: the robot waits for the world, not for the clock.'
    },
    control_repeat_until: {
        title: 'repeat until',
        text: 'Runs the blocks inside it again and again until the condition becomes true, then carries on.',
        example:
            'repeat until the wheels have turned far enough: correct the steering with the gyro.'
    },
    flippercontrol_stopOtherStacks: {
        title: 'stop other stacks',
        text: 'Stops every other script that is running, but keeps this one going.'
    },
    flippercontrol_stop: {
        title: 'stop',
        text: 'Stops this script, or the whole program.'
    },

    // ---- Sensors ----------------------------------------------------------
    flippersensors_isColor: {
        title: 'is color?',
        text: 'True when the color sensor sees the chosen color. Use it inside if, wait until or repeat until.',
        example: 'wait until (B is color black?)'
    },
    flippersensors_color: {
        title: 'color',
        text: 'Reports the color the color sensor sees right now.'
    },
    flippersensors_isReflectivity: {
        title: 'is reflection?',
        text: 'True when the reflected light is below, above or equal to a percentage.',
        tip: 'Black is close to 0%, white is close to 100%. The edge of a black line is around 50%.'
    },
    flippersensors_reflectivity: {
        title: 'reflected light',
        text: 'Reports how much light bounces back into the color sensor, from 0% (black) to 100% (white).',
        example:
            'Line followers compare this number with 50 to know which side of the line they are on.',
        tip: 'Check the real numbers on your mat by writing them to the hub display. Light and shadows change them.'
    },
    flippersensors_isPressed: {
        title: 'is force sensor pressed?',
        text: 'True when the force sensor is pressed, hard-pressed or released.'
    },
    flippersensors_force: {
        title: 'pressure',
        text: 'Reports how hard the force sensor is pressed, in newtons or percent.'
    },
    flippersensors_isDistance: {
        title: 'is distance?',
        text: 'True when the distance sensor sees something closer than, farther than, or at a distance.',
        example: 'wait until (F is closer than 10 cm?) to stop before a wall.'
    },
    flippersensors_distance: {
        title: 'distance',
        text: 'Reports how far away the nearest object is in front of the distance sensor, in cm, inches or percent.',
        tip: 'Very close (under about 4 cm) and very far (over about 200 cm) objects may not be seen.'
    },
    flippersensors_isTilted: {
        title: 'is tilted?',
        text: 'True when the hub is tilted in the chosen direction.',
        sim: notSimulated
    },
    flippersensors_isorientation: {
        title: 'is … up?',
        text: 'True when the chosen side of the hub is facing up.',
        sim: notSimulated
    },
    flippersensors_ismotion: {
        title: 'is shaken / tapped?',
        text: 'True when the hub is being shaken, tapped or is falling.',
        sim: notSimulated
    },
    flippersensors_orientationAxis: {
        title: 'yaw / pitch / roll angle',
        text: 'Reports the gyro angle. Yaw is how far the robot has turned left (negative) or right (positive) since the last reset.',
        example: 'Turn until yaw angle > 90 to make an accurate right turn.',
        tip: 'Reset the yaw angle to 0 just before a turn or a straight drive.',
        sim: 'Only yaw changes in the simulator. Pitch and roll are always 0.'
    },
    flippersensors_resetYaw: {
        title: 'set yaw angle to 0',
        text: 'Resets the gyro so the direction the robot faces now counts as 0 degrees.',
        tip: 'Do this right before a gyro turn or gyro drive, not only at the start of the program.'
    },
    flippersensors_buttonIsPressed: {
        title: 'is hub button pressed?',
        text: 'True when the left or right hub button is pressed (or released).'
    },
    flippersensors_timer: {
        title: 'timer',
        text: 'Reports how many seconds have passed since the program started or the timer was reset.'
    },
    flippersensors_resetTimer: {
        title: 'reset timer',
        text: 'Sets the timer back to 0.'
    },

    // ---- Operators --------------------------------------------------------
    operator_random: {
        title: 'pick random',
        text: 'Reports a random whole number between the two numbers (including both).'
    },
    operator_add: { title: '+', text: 'Adds two numbers.' },
    operator_subtract: {
        title: '−',
        text: 'Subtracts the second number from the first.',
        example: 'error = reflected light − 50'
    },
    operator_multiply: {
        title: '×',
        text: 'Multiplies two numbers.',
        example: 'turn = error × 0.4 (the gain)'
    },
    operator_divide: { title: '÷', text: 'Divides the first number by the second.' },
    operator_lt: {
        title: '<',
        text: 'True when the first value is less than the second.',
        example: 'reflected light < 50 means the sensor is over the dark line.'
    },
    operator_equals: {
        title: '=',
        text: 'True when the two values are equal.',
        tip: 'Sensor readings are rarely exactly equal to a number. Use < or > instead.'
    },
    operator_gt: { title: '>', text: 'True when the first value is greater than the second.' },
    operator_and: { title: 'and', text: 'True only when both conditions are true.' },
    operator_or: { title: 'or', text: 'True when at least one of the conditions is true.' },
    operator_not: {
        title: 'not',
        text: 'Flips a condition: true becomes false and false becomes true.'
    },
    flipperoperator_isInBetween: {
        title: 'is in between?',
        text: 'True when a value is between two numbers.',
        example: 'is yaw angle between 88 and 92? checks a turn is close enough.'
    },
    operator_join: { title: 'join', text: 'Sticks two pieces of text together.' },
    operator_letter_of: { title: 'letter of', text: 'Reports one letter of a piece of text.' },
    operator_length: {
        title: 'length of',
        text: 'Reports how many letters are in a piece of text.'
    },
    operator_contains: { title: 'contains?', text: 'True when the text contains the other text.' },
    operator_mod: {
        title: 'mod',
        text: 'Reports the remainder after dividing. 7 mod 3 is 1.'
    },
    operator_round: { title: 'round', text: 'Rounds a number to the nearest whole number.' },
    operator_mathop: {
        title: 'abs / sqrt / sin …',
        text: 'Does a math function on a number, such as abs (remove the minus sign), square root or sine.',
        example:
            'abs of relative position counts wheel degrees whether the wheel turns forward or backward.'
    },

    // ---- More movement ----------------------------------------------------
    flippermoremove_movementSetStopMethod: {
        title: 'set movement stop method',
        text: 'Chooses how the wheels stop: coast (roll to a stop), brake, or hold position.',
        sim: ignored
    },
    flippermoremove_startDualSpeed: {
        title: 'start moving at left / right speed',
        text: 'Starts both wheels at their own speeds and keeps going. Different speeds make the robot curve.',
        example: 'Line followers and gyro steering use this to make small corrections.',
        tip: 'Negative speeds turn a wheel backward. 20 and -20 spins on the spot.'
    },
    flippermoremove_movementSetAcceleration: {
        title: 'set movement acceleration',
        text: 'Chooses how quickly the wheels speed up and slow down.',
        sim: ignored
    },

    // ---- More motor -------------------------------------------------------
    flippermoremotor_motorGoToRelativePosition: {
        title: 'go to relative position',
        text: 'Turns a motor until its relative position counter reaches a number of degrees.',
        example: 'Set the relative position to 0 at the start, then go to 90 and back to 0.'
    },
    flippermoremotor_motorStartPower: {
        title: 'start motor at power',
        text: 'Starts a motor at a power level without speed control. It may slow down under load.'
    },
    flippermoremotor_motorSetStopMethod: {
        title: 'set motor stop method',
        text: 'Chooses how a motor stops: coast, brake, or hold position.',
        sim: ignored
    },
    flippermoremotor_motorSetAcceleration: {
        title: 'set motor acceleration',
        text: 'Chooses how quickly a motor speeds up and slows down.',
        sim: ignored
    },
    flippermoremotor_motorSetDegreeCounted: {
        title: 'set relative position',
        text: "Resets a motor's degree counter, usually to 0.",
        example: "Reset the wheel's counter to 0, then drive until it has turned 600 degrees."
    },
    flippermoremotor_power: {
        title: 'motor power',
        text: 'Reports how much power the motor is using, in percent.'
    },
    flippermoremotor_position: {
        title: 'relative position',
        text: 'Reports how many degrees a motor has turned since its counter was last reset. It keeps counting past 360.',
        tip: 'A wheel turning backward counts down. Use abs to ignore the direction.'
    },

    // ---- More sensors -----------------------------------------------------
    flippermoresensors_setOrientation: {
        title: 'set yaw axis',
        text: 'Tells the hub which way it is mounted, so the yaw angle measures turning on the table.',
        sim: ignored
    },
    flippermoresensors_rawColor: {
        title: 'raw color',
        text: 'Reports the red, green or blue amount the color sensor measures, for finer color checks.'
    },
    flippermoresensors_acceleration: {
        title: 'acceleration',
        text: 'Reports how quickly the hub is speeding up along an axis.',
        sim: notSimulated
    },
    flippermoresensors_angularVelocity: {
        title: 'angular velocity',
        text: 'Reports how fast the hub is turning around an axis.',
        sim: notSimulated
    },
    flippermoresensors_orientation: {
        title: 'orientation',
        text: 'Reports which side of the hub is facing up.',
        sim: notSimulated
    },
    flippermoresensors_motion: {
        title: 'gesture',
        text: 'Reports the last gesture: shaken, tapped, double-tapped or falling.',
        sim: notSimulated
    },

    // ---- Variables --------------------------------------------------------
    data_variable: {
        title: 'variable',
        text: 'Reports the value stored in a variable. A variable is a named box that holds a number or text.'
    },
    data_setvariableto: {
        title: 'set variable to',
        text: 'Puts a value into a variable, replacing what was there.',
        example: 'set error to (reflected light − 50)'
    },
    data_changevariableby: {
        title: 'change variable by',
        text: 'Adds a number to a variable. Use a negative number to subtract.',
        example: 'change laps by 1'
    },
    data_listcontents: { title: 'list', text: 'Reports everything in a list.' },
    data_addtolist: { title: 'add to list', text: 'Adds an item to the end of a list.' },
    data_deleteoflist: {
        title: 'delete of list',
        text: 'Removes the item at a position in a list.'
    },
    data_deletealloflist: { title: 'delete all of list', text: 'Empties a list.' },
    data_insertatlist: { title: 'insert at list', text: 'Puts an item into a list at a position.' },
    data_replaceitemoflist: {
        title: 'replace item of list',
        text: 'Changes the item at a position in a list.'
    },
    data_itemoflist: { title: 'item of list', text: 'Reports the item at a position in a list.' },
    data_itemnumoflist: {
        title: 'item # of list',
        text: 'Reports the position of an item in a list.'
    },
    data_lengthoflist: { title: 'length of list', text: 'Reports how many items are in a list.' },
    data_listcontainsitem: {
        title: 'list contains?',
        text: 'True when the list contains the item.'
    },

    // ---- My Blocks --------------------------------------------------------
    procedures_definition: {
        title: 'define (My Block)',
        text: 'Defines your own block. The blocks under it run every time the My Block is used.',
        example: 'define DriveStraight (cm): drive straight using the gyro for that many cm.',
        tip: 'Give My Blocks clear names. Fix a My Block once and every place that uses it gets better.'
    },
    procedures_call: {
        title: 'My Block',
        text: 'Runs one of your own My Blocks, with the inputs you give it.'
    },
    argument_reporter_string_number: {
        title: 'My Block input',
        text: 'The value given to this My Block when it was used. Only works inside its own define block.'
    },
    argument_reporter_boolean: {
        title: 'My Block true/false input',
        text: 'A true or false value given to this My Block. Only works inside its own define block.'
    }
};

export function helpFor(type: string): BlockHelp | undefined {
    return blockHelp[type];
}

const extraCategories: HelpCategory[] = [
    {
        name: 'VARIABLES',
        colour: '#ff9835',
        types: [
            'data_variable',
            'data_setvariableto',
            'data_changevariableby',
            'data_listcontents',
            'data_addtolist',
            'data_deleteoflist',
            'data_deletealloflist',
            'data_insertatlist',
            'data_replaceitemoflist',
            'data_itemoflist',
            'data_itemnumoflist',
            'data_lengthoflist',
            'data_listcontainsitem'
        ]
    },
    {
        name: 'MY BLOCKS',
        colour: '#ff5d64',
        types: ['procedures_definition', 'procedures_call', 'argument_reporter_string_number']
    }
];

interface ToolboxCategory {
    kind: string;
    name?: string;
    colour?: string;
    custom?: string;
    contents?: { kind: string; type?: string }[];
}

// Categories in toolbox order, with the blocks that have help.
export function helpCategories(toolbox: { contents: ToolboxCategory[] }): HelpCategory[] {
    const result: HelpCategory[] = [];
    for (const category of toolbox.contents) {
        if (category.kind != 'category' || category.custom || !category.contents) {
            continue;
        }
        const types = category.contents
            .filter((c) => c.kind == 'block' && c.type && blockHelp[c.type])
            .map((c) => c.type!);
        if (types.length > 0) {
            result.push({ name: category.name ?? '', colour: category.colour ?? '#888', types });
        }
    }
    return result.concat(extraCategories);
}

export function categoryOf(type: string, categories: HelpCategory[]): HelpCategory | undefined {
    return categories.find((c) => c.types.includes(type));
}

export function tooltipFor(type: string): string | undefined {
    const help = blockHelp[type];
    if (!help) {
        return undefined;
    }
    return `${help.text}\n\nRight-click the block and choose "Explain this block" for more.`;
}
