# Physics checks

`node tools/physics/run.mjs` (or `npm run physics`) runs the simulator's own VM
headless, with no browser: it compiles programs with the app's Blockly blocks
and generator, builds the hub from `presets/robots/DrivingBase3.mpd`, and steps
the VM the way `SpikeSimulator.svelte` does.

`validate.ts` checks:

-   **Ideal** rollouts against hand-worked geometry: distances, spins, pivots and
    arcs (end position and heading), motor degrees, negative speeds, the timer,
    and that results don't depend on the frame rate.
-   **Realistic / Challenging**: the spread of 30 seeded 1 m drives, that the stop
    overshoot has no left/right bias, and that wheel slip varies run to run.
-   The colour sensor examples (stop at a line, follow a line) on a drawn mat,
    in all three settings.
-   **Bumping**: driving into the table wall stops at it, driving in at an
    angle squares up (and the gyro sees it), a wall on the field stops the
    robot, a loose block is pushed and stops at the table wall, and a robot
    that starts touching a wall can drive away.
-   **Arms** (Driving Base 3 with arm): motor F turns the arm, the arm stops at
    the mat, the raised arm passes over a block and the lowered arm pushes it.
-   **Hooks** (Driving Base 3 with hook): the hook is two boxes, stops at the
    mat with the beam above a block, rests on top of a block it is lowered
    onto, and pulls the block when the robot backs up with the hook down (not
    with it up).

It exits non-zero if a check fails. Limits: there is no WebGL, so the colour
sensor reads a mat function in the script and the distance sensor isn't
simulated; the robot's origin is midway between its drive wheels (the app uses
the model's centre, which only shifts positions by a fixed offset).

To try your own programs, write a script like `validate.ts` and pass it:
`node tools/physics/run.mjs path/to/script.ts`. `prog.ts` builds small programs
in code; `harness.ts` has `llsp3State` to load an `.llsp3` file.
