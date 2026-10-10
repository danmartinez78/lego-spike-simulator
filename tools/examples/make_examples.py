"""Builds the example programs and their lesson cards.

Every example is written for Driving Base 3: drive motors on C (left) and
D (right), colour sensor on B. Output goes to examples/ as <name>.llsp3 plus
<name>.llsp3.json (the lesson card shown in the Examples panel).
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from sb3gen import *  # noqa

OUT = sys.argv[1] if len(sys.argv) > 1 else 'examples'
os.makedirs(OUT, exist_ok=True)

DEG_PER_CM = 20.5  # 56 mm wheel: 360 / (5.6 * pi)

examples = []


def save(program, card):
    filename = card['file']
    with open(os.path.join(OUT, filename), 'wb') as f:
        f.write(program.llsp3())
    with open(os.path.join(OUT, filename + '.json'), 'w', encoding='utf-8') as f:
        json.dump(card, f, indent=2)
    examples.append(card)


def setup():
    return [set_movement_motors('CD'), set_movement_speed(50)]


# ---------------------------------------------------------------------------
# 1. Drive a square (open loop)
p = Program('Drive a square')
p.script(
    when_program_starts(),
    setup()
    + [
        repeat(4, [move('forward', 30, 'cm'), steer(100, 180, 'degrees')]),
    ],
    comment='Repeat 4 times: drive one side, then spin a quarter turn.\n\n'
    'Steering 100 spins the robot on the spot. 180 wheel degrees is about a '
    'quarter turn for this robot.',
)
save(
    p,
    {
        'file': '01 Drive a square.llsp3',
        'title': 'Drive a square',
        'topic': 'Basics',
        'order': 1,
        'summary': 'Drive 30 cm, turn right, and repeat four times.',
        'what': 'The robot drives forward 30 cm, spins a quarter turn, and does that four '
        'times, so it should end up back where it started.',
        'why': 'A repeat block runs the blocks inside it again and again, so you only '
        'write one side of the square. The robot only counts how far its wheels turn. '
        'It never checks where it really is. That is called open loop.',
        'try': [
            'Change 30 to 50 to make a bigger square.',
            'Change repeat 4 to repeat 3 and the turn to 240 degrees. What shape do you get?',
            'Turn Realism to Realistic and press ▶×5. Does the robot end in the same place each time?',
        ],
        'scene': 'Practice - start box.spk',
    },
)

# ---------------------------------------------------------------------------
# 2. Square with a My Block
p = Program('Square with a My Block')
p.define(
    'Side',
    ['length'],
    [move('forward', arg('length'), 'cm'), steer(100, 180, 'degrees')],
    comment='A My Block is your own block. "Side" drives one side of the square. '
    '"length" is an input, so each time you use the block you can say how long the side is.',
)
p.script(
    when_program_starts(),
    setup() + [repeat(4, [p.call('Side', 30)])],
    comment='The main program is now short and easy to read: do "Side 30" four times.',
)
save(
    p,
    {
        'file': '02 Square with a My Block.llsp3',
        'title': 'Square with a My Block',
        'topic': 'Basics',
        'order': 2,
        'summary': 'The same square, using your own block called Side.',
        'what': 'Exactly the same square as before, but the driving and turning live '
        'inside a My Block called Side.',
        'why': 'My Blocks let you give a name to a group of blocks and reuse it. The main '
        'program reads like a sentence, and if you improve Side, every use of it gets '
        'better at once. Good teams build a toolbox of My Blocks.',
        'try': [
            'Make a rectangle: use Side 40, Side 20, Side 40, Side 20 without the repeat.',
            'Add a second input to Side for the turn amount.',
        ],
        'scene': 'Practice - start box.spk',
    },
)

# ---------------------------------------------------------------------------
# 3. Stop at a black line
p = Program('Stop at a line')
p.script(
    when_program_starts(),
    [
        set_movement_motors('CD'),
        set_movement_speed(30),
        start_moving('forward'),
        wait_until(is_color('0', 'B')),
        stop_moving(),
    ],
    comment='Start moving and keep going. The wait block keeps checking the colour '
    'sensor. As soon as it sees black, the program moves on and stops the robot.',
)
save(
    p,
    {
        'file': '03 Stop at a line.llsp3',
        'title': 'Stop at a black line',
        'topic': 'Sensors',
        'order': 3,
        'summary': 'Drive until the colour sensor sees black.',
        'what': 'The robot drives forward and stops the moment its colour sensor (port B) '
        'sees the black line.',
        'why': 'Instead of guessing a distance, the robot watches the mat. It does not '
        'matter if it started a little early or late: it always stops at the line. '
        'Using a sensor to decide when to stop is called closed loop.',
        'try': [
            'Make it faster by changing the speed to 60. Does it still stop on the line?',
            'After it stops, add a move backward 5 cm so it lines up just before the line.',
            'With Realism on Realistic, press ▶×5. Compare the end points with Drive a square.',
        ],
        'scene': 'Practice - start box.spk',
    },
)

# ---------------------------------------------------------------------------
# 4. Line follow, simple
p = Program('Follow a line (simple)')
p.script(
    when_program_starts(),
    [
        set_movement_motors('CD'),
        reset_motor_degrees('C', 0),
        repeat_until(
            gt(absolute(motor_degrees('C')), round(150 * DEG_PER_CM)),
            [
                if_else(
                    lt(reflected('B'), 50),
                    [start_dual(10, 30)],
                    [start_dual(30, 10)],
                )
            ],
        ),
        stop_moving(),
    ],
    comment='Keep going until the wheels have rolled about 150 cm.\n\n'
    'If the sensor sees dark (less than 50% light), steer left. Otherwise steer '
    'right. The robot wiggles along the edge of the line.',
)
save(
    p,
    {
        'file': '04 Follow a line (simple).llsp3',
        'title': 'Follow a line (simple)',
        'topic': 'Sensors',
        'order': 4,
        'summary': 'Wiggle along the edge of a line using light and dark.',
        'what': 'The robot follows the edge of the black oval for about 150 cm.',
        'why': 'The sensor measures how much light bounces back: white is about 100, black '
        'is near 0, and the edge of the line is in between. Over dark, the robot steers '
        'one way. Over white, it steers the other way. It zig-zags along the edge. This '
        'is the simplest kind of feedback: only two choices.',
        'try': [
            'Change 50 to 30 or 70. What happens?',
            'Make both speeds bigger. When does the robot lose the line?',
            'Swap the two start moving blocks. Which edge does it follow now?',
        ],
        'scene': 'Practice - line oval.spk',
    },
)

# ---------------------------------------------------------------------------
# 5. Line follow, smooth (proportional)
p = Program('Follow a line (smooth)')
p.script(
    when_program_starts(),
    [
        set_movement_motors('CD'),
        reset_motor_degrees('C', 0),
        repeat_until(
            gt(absolute(motor_degrees('C')), round(150 * DEG_PER_CM)),
            [
                set_var('error', sub(reflected('B'), 50)),
                set_var('turn', mul(var('error'), 0.4)),
                start_dual(add(25, var('turn')), sub(25, var('turn'))),
            ],
        ),
        stop_moving(),
    ],
    comment='error = how far the light reading is from 50 (the edge).\n'
    'turn = error × 0.4\n\n'
    'A small error gives a small correction, a big error a big one. '
    'The left wheel gets 25 + turn and the right wheel 25 − turn.',
)
save(
    p,
    {
        'file': '05 Follow a line (smooth).llsp3',
        'title': 'Follow a line (smooth)',
        'topic': 'Sensors',
        'order': 5,
        'summary': 'Steer more when far from the edge, less when close.',
        'what': 'The robot follows the edge of the oval smoothly instead of zig-zagging.',
        'why': 'The program works out an error: how far the light reading is from the '
        'edge value of 50. It steers by an amount that is proportional to the error. '
        'Engineers call this a P controller (P for proportional). The number 0.4 is '
        'the gain. Too small and the robot drifts off the line, too big and it wobbles.',
        'try': [
            'Try a gain of 0.2 and 0.8. Which follows best?',
            'Raise the base speed from 25 to 40. Do you need a different gain?',
            'Compare with the simple line follower using ▶×5.',
            'Gains that work in the simulator are a starting point. Tune them on the real robot.',
        ],
        'scene': 'Practice - line oval.spk',
    },
)

# ---------------------------------------------------------------------------
# 6. Accurate turn with the gyro
turn_body = [
    reset_yaw(),
    start_dual(20, -20),
    wait_until(gt(yaw(), sub(arg('degrees'), 1))),
    stop_moving(),
]
turn_comment = (
    'TurnRight: reset the gyro to 0, spin slowly to the right, and stop when the '
    'yaw angle reaches the target. We stop 1 degree early because the robot '
    'keeps turning a little after the motors stop.'
)
p = Program('Turn with the gyro')
p.define('TurnRight', ['degrees'], turn_body, comment=turn_comment)
p.script(
    when_program_starts(),
    [set_movement_motors('CD'), repeat(4, [p.call('TurnRight', 90), wait(0.5)])],
    comment='Turn right 90 degrees four times. The robot should face the same way it started.',
)
save(
    p,
    {
        'file': '06 Turn with the gyro.llsp3',
        'title': 'Turn with the gyro',
        'topic': 'Gyro',
        'order': 6,
        'summary': 'Turn exactly 90 degrees by watching the yaw angle.',
        'what': 'The robot turns right 90 degrees four times, using a My Block called '
        'TurnRight.',
        'why': 'The hub has a gyro sensor that measures how far the robot has turned (the '
        'yaw angle). Turning "180 wheel degrees" can be off if a wheel slips, but '
        'turning until the gyro says 90 checks the real turn. Turning right makes the yaw '
        'go up, turning left makes it go down.',
        'try': [
            'Make a TurnLeft block: spin with -20 and 20 and wait until yaw is less than the minus target.',
            'Try a faster turn speed. Do you need to stop earlier?',
            'Use TurnRight inside the square program instead of the steering turn.',
        ],
        'scene': 'Practice - start box.spk',
    },
)

# ---------------------------------------------------------------------------
# 7. Drive straight with the gyro
straight_body = [
    reset_yaw(),
    reset_motor_degrees('C', 0),
    repeat_until(
        gt(absolute(motor_degrees('C')), mul(arg('cm'), DEG_PER_CM)),
        [
            set_var('correction', mul(yaw(), 2)),
            start_dual(sub(40, var('correction')), add(40, var('correction'))),
        ],
    ),
    stop_moving(),
]
straight_comment = (
    'DriveStraight: reset the gyro and the wheel counter. Until the wheel has turned '
    'far enough, check the yaw angle. If the robot points a bit right (yaw above 0), '
    'slow the left wheel and speed up the right one to steer back. '
    f'{DEG_PER_CM} wheel degrees is about 1 cm.'
)
p = Program('Drive straight with the gyro')
p.define('DriveStraight', ['cm'], straight_body, comment=straight_comment)
p.script(
    when_program_starts(),
    [set_movement_motors('CD'), p.call('DriveStraight', 80)],
    comment='Drive 80 cm, steering with the gyro the whole way.',
)
save(
    p,
    {
        'file': '07 Drive straight with the gyro.llsp3',
        'title': 'Drive straight with the gyro',
        'topic': 'Gyro',
        'order': 7,
        'summary': 'Correct the heading all the way so the robot really drives straight.',
        'what': 'The robot drives 80 cm, constantly correcting its direction with the gyro.',
        'why': 'Real robots never drive perfectly straight: one wheel is a tiny bit bigger, '
        'or slips. The gyro notices the robot pointing off course, and the program '
        'steers back. This is another P controller: correction = yaw × 2.',
        'try': [
            'Set Realism to Challenging. Run ▶×5 with this program and with a plain move 80 cm block. Compare.',
            'Change the gain 2 to 0.5 and to 6. What happens?',
            'Use DriveStraight and TurnRight together to make an accurate square.',
            'The gyro keeps the robot pointing the way it started. If it starts crooked, it '
            'drives crooked. How could you line the robot up the same way every time?',
        ],
        'scene': 'Practice - start box.spk',
    },
)

# ---------------------------------------------------------------------------
# 8. Mission template
p = Program('Mission template')
p.define('DriveStraight', ['cm'], straight_body, comment=straight_comment)
p.define('TurnRight', ['degrees'], turn_body, comment=turn_comment)
p.script(
    when_program_starts(),
    [
        set_movement_motors('CD'),
        p.call('DriveStraight', 40),
        p.call('TurnRight', 90),
        p.call('DriveStraight', 30),
        wait(0.5),
        move('back', 30, 'cm'),
    ],
    comment='A mission is a list of steps. Each step uses a reliable My Block. '
    'Change the numbers and add steps to reach your mission model, then '
    'test it with ▶×5 on Realistic.',
)
save(
    p,
    {
        'file': '08 Mission template.llsp3',
        'title': 'Mission template',
        'topic': 'Missions',
        'order': 8,
        'summary': 'A starting point for a mission run built from reliable My Blocks.',
        'what': 'Drives 40 cm, turns right, drives 30 cm and backs up, using the '
        'DriveStraight and TurnRight My Blocks.',
        'why': 'Competition runs are long lists of moves. Building them from tested My '
        'Blocks makes them easier to read, change and debug. When something goes wrong, '
        'you fix the My Block once and every step improves.',
        'try': [
            'Plan a path to a mission model on the field, then change the steps to drive there.',
            'Add a "Stop at a black line" step to line up before an important move.',
            'Press ▶×5 on Realistic. If the end points spread out, which step needs a sensor?',
        ],
        'scene': 'Practice - start box.spk',
    },
)

print(json.dumps([e['file'] for e in examples], indent=1))
