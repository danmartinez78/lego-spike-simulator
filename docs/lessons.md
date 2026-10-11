# Writing lessons

A lesson is a short, step-by-step activity that students open from the
**Lessons** button in the code panel. A lesson can load a starter program, a
field and a robot, and can end with a **check**: rules the simulator uses to
decide whether the student's robot did the job, over five runs.

Coaches write lessons on the coach page (`/coach`, Lessons tab, **New lesson**),
where the check is drawn on the mat, or import a lesson package. New and
imported lessons start as **drafts**, which students can't see, until a coach
presses **Publish**.

This guide is also served by every copy of the simulator at
`/api/lessons/guide`, followed by a list of the fields, robots and programs that
copy has, with each field's mat size and the robot's starting position.

## Writing a lesson with an AI agent

An agent doesn't need the code or the repository. It needs this guide and the
site's address:

1. Read `GET /api/lessons/guide` (this guide plus the site's fields and files)
   and, if it helps, `GET /api/lessons/schema` (the JSON schema).
2. To see a field, download it with `GET /api/library/scenes/<name>`. It's a zip
   holding `scene.json` (mat size, robot start) and `mat.jpg` (the mat picture,
   whose top-left corner is x = -width/2, z = -height/2).
3. Write `lesson.json`. Use files the site already has, or bundle new ones in a
   package (below).
4. Check it with `POST /api/lessons/check`, sending the `lesson.json` or the
   `.zip` as the request body. Nothing is saved. The reply is
   `{ "ok": true|false, "errors": [...], "warnings": [...] }`. Fix every error;
   read the warnings.
5. Hand the file to a coach, who imports it on the coach page, looks it over
   (the check is drawn on the mat in the lesson editor) and publishes it.

```sh
curl -s -X POST --data-binary @lesson.json https://<site>/api/lessons/check
curl -s -X POST --data-binary @my-lesson.zip https://<site>/api/lessons/check
```

## The package

A lesson package is a `.zip` file:

```
lesson.json          the lesson (required)
programs/*.llsp3     starter programs the lesson uses (optional)
scenes/*.spk         fields the lesson uses (optional)
robots/*.mpd|.ldr    robots the lesson uses (optional)
```

The files may also sit inside one top-level folder, as happens when you zip a
folder. Importing copies every bundled file into the shared library (asking
first if that replaces something) and saves the lesson as a draft. A bare
`lesson.json` can be imported too when everything it points at is already in
the library. Starter programs are LEGO SPIKE `.llsp3` files; the easiest way to
make one is to build it in the simulator and press Save.

## lesson.json

`lesson.json` follows [`schemas/lesson-v1.json`](../schemas/lesson-v1.json).

| Field     | Required | Meaning                                                                      |
| --------- | -------- | ---------------------------------------------------------------------------- |
| `schema`  | yes      | Always `"spike-lesson/1"`.                                                   |
| `title`   | yes      | The lesson's name (up to 80 characters). It also names the file.             |
| `steps`   | yes      | At least one `{ "title"?, "text" }`. Blank lines in `text` split paragraphs. |
| `topic`   | no       | Groups lessons: Basics, Sensors, Gyro, Missions, or your own.                |
| `order`   | no       | Position within the topic, lowest first.                                     |
| `summary` | no       | One line under the title in the lesson list.                                 |
| `program` | no       | Starter program file name (`.llsp3`). Set up loads it.                       |
| `field`   | no       | Field file name (`.spk`). Required when there's a check.                     |
| `robot`   | no       | Robot file name (`.mpd` or `.ldr`). Without one, the student's robot stays.  |
| `check`   | no       | How the simulator checks the student's runs (below).                         |
| `draft`   | no       | `true` hides the lesson from students. Imports always start as drafts.       |

Write for 6th to 8th graders: short sentences, one idea per step, and say what
to press. A lesson is **done** when every step is ticked and its check has
passed.

## Checks

Students press **Check my robot**. That loads the lesson's field and robot and
the check's realism setting, but keeps their program. They press ▶︎×5; the
simulator runs the program five times and checks each run against every rule.
A run passes when it meets all the rules; the check passes when at least
`needed` of the 5 runs pass.

```json
"check": {
    "realism": "realistic",
    "needed": 4,
    "stop": {
        "zone": { "kind": "circle", "x": -900, "z": 300, "radius": 50, "label": "start" },
        "heading": { "value": 0, "tolerance": 10 }
    },
    "waypoints": [{ "kind": "box", "x1": -960, "z1": -40, "x2": -840, "z2": 40, "label": "A" }],
    "avoid": [{ "kind": "box", "x1": -700, "z1": -200, "x2": -500, "z2": 0, "label": "wall" }],
    "follow": {
        "path": [ { "x": -800, "z": 200 }, { "x": -400, "z": 200 }, { "x": -300, "z": 0 } ],
        "width": 20,
        "share": 0.9,
        "sensor": "B"
    },
    "timeLimit": 20,
    "blocks": { "use": ["repeat"], "avoid": ["wait"] }
}
```

`realism` and `needed` are required, plus at least one rule.

| Rule        | What passes                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stop`      | The robot's centre ends inside `zone`. With `heading`, it must also face `value` degrees, give or take `tolerance` (1 to 90).                                                  |
| `waypoints` | The robot's centre passes through every zone, in the order listed (up to 20).                                                                                                  |
| `avoid`     | The robot's centre never enters any of these zones (up to 20). Make zones a little bigger than the thing to avoid, since the robot is wider than its centre.                   |
| `follow`    | The colour sensor follows the line from its first point to its last, staying within `width` mm of it for at least `share` (0 to 1) of the distance it travels along the way.   |
| `timeLimit` | The program finishes within this many simulated seconds (1 to 150).                                                                                                            |
| `blocks`    | The program uses every block rule in `use` and none in `avoid`. Only blocks in stacks that run count (under an event block, or inside a My Block). This applies to all 5 runs. |

`realism` is `ideal` (a perfect robot), `realistic` or `challenging`. With
realism on, each run starts slightly differently and the wheels aren't perfect,
so `needed` of 4 or 5 on `realistic` rewards programs that use sensors.

### Coordinates

All positions are in millimetres on the mat, with (0, 0) at the centre of the
mat. `x` grows to the right and `z` grows **down** the mat picture, so the top
edge of the picture is `z = -height/2`. Headings are in degrees: 0 faces up the
mat picture, 90 faces right, 180 down, 270 left. The guide at
`/api/lessons/guide` lists each field's size and where the robot starts.

Zones are either a circle `{ "kind": "circle", "x", "z", "radius" }` (radius 10
to 1000 mm) or a box `{ "kind": "box", "x1", "z1", "x2", "z2" }` (two opposite
corners, at least 10 mm each way). Any zone can have a short `label`, shown on
the mat. Every zone and line point must be on the mat.

### Following a line

`follow.path` is the line the colour sensor should follow, as points in order
from start to end (2 to 200 points; more points for tighter curves). Trace the
**edge** the program follows (a line-follower rides the edge between black and
white), or the middle of the line with a `width` that covers both edges.

-   The check starts once the sensor first comes within `width` of the start of
    the line, so the robot can drive to the line first.
-   It must reach the last point. Progress is tracked along the line, so cutting
    a corner or driving straight to the end doesn't count.
-   `share` is how much of the way the sensor must stay within `width`. 0.9 allows
    short wobbles off the line.
-   If the first and last points are close together (a loop), the line counts as
    closed and the start is only looked for near the first point.
-   `sensor` picks the colour sensor's port when the robot has more than one.
    Without it, the first colour sensor is used.

Students see their sensor's path drawn on the mat, with a circle where it first
left the line.

### Block rules

`check.blocks.use` and `check.blocks.avoid` take these ids:

| Id                | Blocks                                                   |
| ----------------- | -------------------------------------------------------- |
| `repeat`          | repeat (a number of times)                               |
| `repeat-until`    | repeat until                                             |
| `forever`         | forever                                                  |
| `if`              | if, if-else                                              |
| `wait-until`      | wait until                                               |
| `wait`            | wait (seconds)                                           |
| `my-block`        | a call to a My Block                                     |
| `variable`        | set or change a variable                                 |
| `maths`           | + − × ÷                                                  |
| `colour-sensor`   | any colour sensor block or event                         |
| `distance-sensor` | any distance sensor block or event                       |
| `force-sensor`    | any force sensor block or event                          |
| `gyro`            | yaw angle, reset yaw and the other orientation blocks    |
| `move-for`        | move or steer for a distance or time                     |
| `start-moving`    | start moving, start steering, start moving at two speeds |
| `motor`           | single-motor run, start and go-to-position blocks        |

## An example

The sample lesson in `presets/lessons/` drives a 30 cm square on
`Practice - start box.spk`, where the robot starts at x = -900, z = 300 facing
up. Its check asks for the three other corners in order, a stop back in the
start ring facing up, and a repeat block:

```json
"check": {
    "realism": "ideal",
    "needed": 5,
    "waypoints": [
        { "kind": "circle", "x": -900, "z": 0, "radius": 60, "label": "1" },
        { "kind": "circle", "x": -600, "z": 0, "radius": 60, "label": "2" },
        { "kind": "circle", "x": -600, "z": 300, "radius": 60, "label": "3" }
    ],
    "stop": {
        "zone": { "kind": "circle", "x": -900, "z": 300, "radius": 50, "label": "start" },
        "heading": { "value": 0, "tolerance": 10 }
    },
    "blocks": { "use": ["repeat"] }
}
```

## Challenges

A challenge is a short goal students try from the **Challenges** button in the
code panel, without steps: a field, a check over five runs, and a few hints
shown one at a time. Coaches make and edit them on the coach page (Challenges
tab), where the check is drawn on the mat. New challenges start as drafts until
a coach publishes them. A challenge is stored as `<id>.json`; the id is the file
name without `.json`, and it's what a lesson's `"challenge"` points at.

```json
{
    "schema": "spike-challenge/1",
    "title": "Hit target A",
    "level": 1,
    "skill": "Driving",
    "goal": "Stop inside the 6 cm ring of target A, 4 out of 5 times, on Realistic.",
    "field": "Practice - accuracy targets.spk",
    "hints": [
        "Use the measure tool to find how far target A is from the robot.",
        "If runs spread sideways, try driving straight with the gyro."
    ],
    "check": {
        "realism": "realistic",
        "needed": 4,
        "stop": { "zone": { "kind": "circle", "x": -950, "z": -150, "radius": 60, "label": "A" } }
    }
}
```

| Field     | Meaning                                                      |
| --------- | ------------------------------------------------------------ |
| `schema`  | always `"spike-challenge/1"`                                 |
| `title`   | name, up to 80 characters                                    |
| `goal`    | what to do, how well, how often and on which realism         |
| `field`   | the `.spk` field; starting the challenge loads it            |
| `check`   | the same check as a lesson's (above)                         |
| `level`   | 1 starter, 2 getting there, 3 tricky                         |
| `skill`   | what it practises: Basics, Driving, Sensors, Gyro, Missions… |
| `robot`   | a robot other than the default, if the challenge needs one   |
| `example` | an example program (`.llsp3`) that helps                     |
| `hints`   | up to 10; nudge rather than give the answer                  |
| `order`   | position in the list, lowest first                           |
| `draft`   | `true` hides it from students                                |

Write the goal so it matches the check: if the check needs 4 of 5 runs on
Realistic, say so. Check a challenge with `POST /api/challenges/check` (the JSON
as the body; nothing is saved), and see `GET /api/challenges/schema`.

## Older lessons

Lessons written before checks existed may have `"challenge": "<id>"`, naming a
challenge. That still works: the lesson is done once the challenge is complete.
New lessons should use `check` instead.
