# Making a field

A field is a mat the robot drives on, plus where the robot starts and any walls
or blocks standing on it. An AI assistant connected to the site (see
`docs/mcp.md`) can make one from a short JSON description with `check_field`
and `save_field`. The server draws the mat and saves it as a `.spk` scene in
the library, where lessons, challenges and students can use it straight away.

## Coordinates

-   Millimeters, with the origin in the middle of the mat.
-   `x` runs across the mat (right is positive), `z` runs down it (towards the
    bottom edge is positive), like reading a picture of the mat.
-   Headings are degrees clockwise from "up the mat": 0 is up, 90 right,
    180 down, 270 left.
-   The usual mat is 2360 × 1140 mm (an FLL-size table), so x goes from -1180 to
    1180 and z from -570 to 570.
-   The robot (Driving Base 3) is about 160 mm wide and 200 mm long. Its color
    sensor sits near the front, in the middle.

## Colors

Mat colors: `white`, `black`, `red`, `blue`, `green`, `yellow`, `grey`,
`lightgrey`, or `#rrggbb`. The named colors are the ones the simulator's
color sensor reports reliably, so use them for anything a robot should detect.
Lines to follow work best black, 20 mm wide, on white.

Wall and block colors (LEGO bricks): `black`, `blue`, `green`, `red`,
`yellow`, `white`, `grey`, `darkgrey`.

## The description

```json
{
    "schema": "spike-field/1",
    "title": "Line maze",
    "width": 2360,
    "height": 1140,
    "background": "white",
    "start": { "x": -950, "z": 300, "heading": 0 },
    "shapes": [],
    "objects": []
}
```

| Field        | Required | Notes                                                                                                    |
| ------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| `schema`     | yes      | Always `"spike-field/1"`                                                                                 |
| `title`      |          | Printed along the top of the mat, and the file name unless `save_field` gets one                         |
| `width`      |          | mm, 300 to 4000 (default 2360)                                                                           |
| `height`     |          | mm, 300 to 3000 (default 1140)                                                                           |
| `background` |          | Mat color (default white)                                                                                |
| `start`      | yes      | `x`, `z`, `heading` of the robot's center; `box: false` hides the start box, `label` changes its "START" |
| `shapes`     |          | Up to 500 things drawn on the mat, in order (later ones on top)                                          |
| `objects`    |          | Up to 30 walls and blocks standing on the mat                                                            |

### Shapes

Every shape has a `type` and an optional `colour` (black by default, gray for
text).

| `type`    | Fields                                                                                    | Draws                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `line`    | `points` `[[x, z], ...]`, `width` (mm, default 20)                                        | A thick line through the points, with round ends and corners                                                      |
| `arc`     | `x`, `z`, `radius`, `from`, `to` (headings), `width`                                      | Part of a circle, from heading `from` to `to` (0 to 360 is a full ring; `to` less than `from` goes anticlockwise) |
| `rect`    | `x`, `z` (center), `width` (across), `height` (along), `angle`, `outline`                 | A filled rectangle, turned clockwise by `angle`; with `outline` (mm) just its border                              |
| `circle`  | `x`, `z`, `radius`, `outline`                                                             | A filled circle, or a ring `outline` mm wide                                                                      |
| `polygon` | `points`, `outline`                                                                       | A filled shape with those corners, or its border                                                                  |
| `text`    | `x`, `z` (center), `text` (up to 60 characters), `size` (letter height in mm, default 40) | Capital letters, digits and common punctuation                                                                    |

### Objects

| `type`  | Fields                                                                                                                                   | Notes                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `wall`  | `x`, `z` (center), `length` (mm), `heading` (0 runs up and down the mat), `layers` (default 6, about 58 mm high), `colour` (default red) | Fixed in place. A distance sensor sees it. Built from 1×8 bricks, so the length rounds to 64 mm steps. |
| `block` | `x`, `z`, `layers` (default 3), `colour` (default blue)                                                                                  | A loose cube about 64 mm across that the robot (or its arm) pushes; it slides without turning          |

Walls also leave a light gray footprint on the mat so they show from above.
The robot stops when it drives into a wall (or the table's edge) and pushes
blocks along, so a wall is also a good place to square up against.

## Tips

-   Give the robot room: keep the start at least 150 mm from walls and lines it
    shouldn't touch at once, and the start box clear of other shapes.
-   A line-following course needs gentle curves: turns with a radius under
    about 150 mm are hard for a simple follower.
-   Label things students talk about ("A", "finish", "30 cm") with `text`.
-   After saving, the field's file name (for example `"Line maze.spk"`) is what
    a lesson or challenge puts in `"field"`. `get_field` returns the
    description again so you can change it and save with `replace: true`.

## An example

A black oval to follow, a green finish patch and a wall to stop at:

```json
{
    "schema": "spike-field/1",
    "title": "Oval and wall",
    "start": { "x": 0, "z": 330, "heading": 270 },
    "shapes": [
        { "type": "arc", "x": -300, "z": 0, "radius": 330, "from": 180, "to": 360 },
        { "type": "arc", "x": 300, "z": 0, "radius": 330, "from": 0, "to": 180 },
        {
            "type": "line",
            "points": [
                [-300, -330],
                [300, -330]
            ]
        },
        {
            "type": "line",
            "points": [
                [-300, 330],
                [300, 330]
            ]
        },
        { "type": "rect", "x": 900, "z": 0, "width": 200, "height": 60, "colour": "green" },
        { "type": "text", "x": 900, "z": 90, "text": "finish", "size": 30 }
    ],
    "objects": [{ "type": "wall", "x": 1100, "z": 0, "length": 400, "heading": 0 }]
}
```
