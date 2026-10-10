"""Reference solutions for the challenge cards (an answer key for coaches).

Usage: python solutions.py <output dir>. Each file is named after the challenge id.
"""
import sys, os
sys.path.insert(0, '.')
from sb3gen import *
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
DEG = 20.5

def straight_def(p, speed=40):
    p.define('DriveStraight', ['cm'], [
        reset_yaw(), reset_motor_degrees('C', 0),
        repeat_until(gt(absolute(motor_degrees('C')), mul(arg('cm'), DEG)), [
            set_var('correction', mul(yaw(), 2)),
            start_dual(sub(speed, var('correction')), add(speed, var('correction')))]),
        stop_moving()])

def turn_def(p):
    p.define('TurnRight', ['degrees'], [reset_yaw(), start_dual(15, -15), wait_until(gt(yaw(), sub(arg('degrees'), 1))), stop_moving()])

def save(name, p):
    open(os.path.join(OUT, name + '.llsp3'), 'wb').write(p.llsp3())

save('first-square', (lambda p: (p.script(when_program_starts(), [set_movement_motors('CD'), set_movement_speed(50), repeat(4, [move('forward', 30, 'cm'), steer(100, 180, 'degrees')])]), p)[1])(Program('s')))

p = Program('a'); straight_def(p); p.script(when_program_starts(), [set_movement_motors('CD'), p.call('DriveStraight', 45)]); save('target-a', p)

p = Program('b'); straight_def(p); turn_def(p); p.script(when_program_starts(), [set_movement_motors('CD'), p.call('TurnRight', 45), wait(0.3), p.call('DriveStraight', 63.6)]); save('target-b', p)

p = Program('g'); p.script(when_program_starts(), [set_movement_motors('CD'), set_movement_speed(25), start_moving('forward'), wait_until(is_color('6', 'B')), stop_moving()]); save('stop-green', p)

p = Program('t'); turn_def(p); p.script(when_program_starts(), [set_movement_motors('CD'), p.call('TurnRight', 90)]); save('exact-90', p)

p = Program('h'); straight_def(p); p.script(when_program_starts(), [set_movement_motors('CD'), p.call('DriveStraight', 80)]); save('gyro-highway', p)

dist_lt = Block('flippersensors_isDistance', {
    'PORT': Menu('flippersensors_distance-sensor-selector', 'field_flippersensors_distance-sensor-selector', 'F'),
    'VALUE': (10, 'number')}, {'COMPARATOR': '<', 'UNIT': 'cm'}, boolean=True)
p = Program('w'); p.script(when_program_starts(), [set_movement_motors('CD'), set_movement_speed(25), start_moving('forward'), wait_until(dist_lt), stop_moving()]); save('wall-stop', p)

p = Program('p'); straight_def(p); turn_def(p); p.script(when_program_starts(), [set_movement_motors('CD'), p.call('TurnRight', 33.4), wait(0.3), p.call('DriveStraight', 140.8)]); save('park-p1', p)
