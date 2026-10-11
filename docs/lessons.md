# Lesson packages

A lesson is a short, step-by-step activity that students open from the
**Lessons** button in the code panel. Coaches write lessons on the coach page
(`/coach`, Lessons tab, **New lesson**) or import a lesson package.

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
first if that replaces something) and saves the lesson. A bare `lesson.json`
can be imported too when everything it points at is already in the library.

## lesson.json

`lesson.json` follows [`schemas/lesson-v1.json`](../schemas/lesson-v1.json).

```json
{
    "schema": "spike-lesson/1",
    "title": "Stop at a black line",
    "topic": "Sensors",
    "order": 3,
    "summary": "Drive until the colour sensor sees black.",
    "steps": [
        {
            "title": "Open the starter program",
            "text": "The robot drives forward and stops when the colour sensor sees black."
        },
        { "title": "Try it", "text": "Change the speed to 60. Does it still stop on the line?" }
    ],
    "program": "03 Stop at a line.llsp3",
    "field": "Practice - start box.spk",
    "challenge": "stop-green"
}
```

| Field       | Required | Meaning                                                                      |
| ----------- | -------- | ---------------------------------------------------------------------------- |
| `schema`    | yes      | Always `"spike-lesson/1"`.                                                   |
| `title`     | yes      | The lesson's name. It also names the file in the library.                    |
| `steps`     | yes      | At least one `{ "title"?, "text" }`. Blank lines in `text` split paragraphs. |
| `topic`     | no       | Groups lessons: Basics, Sensors, Gyro, Missions, or your own.                |
| `order`     | no       | Position within the topic, lowest first.                                     |
| `summary`   | no       | One line under the title in the lesson list.                                 |
| `program`   | no       | Starter program file name (`.llsp3`).                                        |
| `field`     | no       | Field file name (`.spk`).                                                    |
| `robot`     | no       | Robot file name (`.mpd` or `.ldr`).                                          |
| `challenge` | no       | Id of a built-in challenge in `src/lib/spike/challenges.ts`.                 |

Students press **Set up** to load the program, field and robot, tick off each
step, and open the challenge, which the simulator checks with ▶×5. A lesson
shows as done when every step is ticked and its challenge (if any) has passed.
Progress is kept in each student's browser for now.

## Writing lessons with an AI assistant

Give the assistant this file and `schemas/lesson-v1.json`, describe the
lesson, and ask for a `lesson.json` (plus any starter program). Zip it as above
and import it on the coach page. The server checks the lesson when it is
saved, so a malformed one is rejected with a message saying what to fix.

The starter lessons in `presets/lessons` are generated from the example lesson
cards by `tools/examples/make_lessons.py`.
