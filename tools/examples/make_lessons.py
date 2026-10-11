"""Make the starter lessons in presets/lessons from the example lesson cards.

Run from the repository root: python3 tools/examples/make_lessons.py
"""

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
PROGRAMS = ROOT / "presets" / "programs"
LESSONS = ROOT / "presets" / "lessons"

# Example program -> challenge that practises it (see src/lib/spike/challenges.ts).
CHALLENGES = {
    "01 Drive a square.llsp3": "first-square",
    "03 Stop at a line.llsp3": "stop-green",
    "06 Turn with the gyro.llsp3": "exact-90",
    "07 Drive straight with the gyro.llsp3": "gyro-highway",
    "08 Mission template.llsp3": "target-b",
}


def main():
    LESSONS.mkdir(parents=True, exist_ok=True)
    for card_file in sorted(PROGRAMS.glob("*.llsp3.json")):
        card = json.loads(card_file.read_text())
        program = card_file.name[: -len(".json")]
        steps = [
            {"title": "Open the starter program", "text": card["what"]},
            {"title": "Why it works", "text": card["why"]},
        ]
        steps += [{"title": f"Try it {i + 1}", "text": t} for i, t in enumerate(card.get("try", []))]
        challenge = CHALLENGES.get(program)
        if challenge:
            steps.append(
                {
                    "title": "Take the challenge",
                    "text": "Start the challenge, then press ▶︎×5. "
                    "The simulator checks your runs for you.",
                }
            )
        lesson = {
            "schema": "spike-lesson/1",
            "title": card["title"],
            "topic": card["topic"],
            "order": card.get("order"),
            "summary": card.get("summary", ""),
            "steps": steps,
            "program": program,
        }
        if card.get("scene"):
            lesson["field"] = card["scene"]
        if challenge:
            lesson["challenge"] = challenge
        name = re.sub(r"[^\w .()+-]", "_", card["title"]).strip() + ".json"
        (LESSONS / name).write_text(json.dumps(lesson, indent=2, ensure_ascii=False) + "\n")
        print("wrote", name)


if __name__ == "__main__":
    main()
