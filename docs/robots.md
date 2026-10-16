# Robots with moving arms

The simulator loads a robot from an LDraw file (`.mpd` or `.ldr`, as saved by
BrickLink Studio or LeoCAD). Comment lines starting with `0 !SPIKE_` say what is
plugged into the hub and which parts move. Each one applies to the part on the
next line.

| Line                                                | Meaning                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `0 !SPIKE_PORT main C`                              | The next part (a motor or sensor) is plugged into port C. The Ports button sets these. |
| `0 !SPIKE_GEARING 1`                                | The next part is a wheel, and its gearing to its motor. The Wheels button sets these.  |
| `0 !SPIKE_ROTATES main F px py pz ax ay az [ratio]` | The next part (usually a submodel such as an arm) turns with the motor on port F.      |

## Moving parts

`!SPIKE_ROTATES` turns the next part around an axle:

-   `px py pz` is a point on the axle and `ax ay az` its direction, in LDraw
    units (0.4 mm, y pointing down) in the coordinates of the file that
    contains the part. For an arm on a motor, use the middle of the motor's
    output and the direction the output points.
-   `ratio` (optional, default 1) is how many degrees the part turns for each
    degree of the motor, for gears between them; a negative ratio turns it the
    other way.
-   Turning follows the right-hand rule around the axle direction, with y up;
    if the arm goes the wrong way, reverse the direction (or use a negative
    ratio).

The part keeps turning with the motor's degrees from the start of the run, so
"set relative position" blocks don't move it. Put the whole attachment (beams,
pins, the arm's tip) in one submodel so it turns as one piece. A moving part
inside another moving part isn't supported.

A moving part bumps into walls and pushes blocks like the rest of the robot
when it is low enough to touch them. It isn't stopped by the mat or by
objects, so an arm turned too far goes through them.

## Example

`presets/robots/DrivingBase3 with arm.mpd` is Driving Base 3 with a medium
motor on port F lying on top of the hub and an arm with a paddle in front,
made by `tools/robots/make_db3_arm.py`:

```
0 !SPIKE_PORT main F
1 15 158 -188 -100 0 -1 0 1 0 0 0 0 1 54696.dat
0 !SPIKE_ROTATES main F 218 -188 -100 1 0 0 1
1 4 0 0 0 1 0 0 0 1 0 0 0 1 arm.ldr
```

Running motor F clockwise lowers the arm; about 36 degrees brings the paddle
down to the mat.

A turning part can't go through the mat. When it touches the mat its motor
stalls: the part and the motor's degree counter stop there, and the rest of
the turn is lost, as when a real arm is blocked.
