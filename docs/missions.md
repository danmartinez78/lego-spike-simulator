# Team missions

Missions hold the team's own programs for the season's missions on the
competition field. They are team code, so they are kept apart from the public
library: only coaches and students signed in with their code can see them.
Anyone who opens the site without signing in sees a "Sign in" message instead.

## For students

The **Missions** button (flag) in the code panel lists the team's missions.
Each one shows what the robot has to do, the team's notes, a link to the
mission video, and buttons to load the mission field and to open FIRST's
guided mission if the coach added it.

Below that is every saved **version** of the team's program, newest first,
with who saved it, when, and what changed. **Open** loads a version into the
code panel. After improving it in the simulator, students type what they
changed and press **Save version**. Versions are never overwritten, and a new
version remembers which one it was made from. The version marked **Team's run**
is the one the robot runs at the competition.

## For coaches

The coach page's **Missions** tab:

-   **New mission** sets the number, name, season, what the robot has to do,
    team notes, a video address, the field and robot, and FIRST's guided
    mission (a program from the public Programs tab).
-   **Add a version from a file** brings in a `.llsp3` saved in the SPIKE app,
    with a note such as "Saturday meeting" and the day it was saved.
-   **Make it the team's run** marks the version the robot runs; **Download**
    saves any version as a `.llsp3` for the SPIKE app.
-   Coaches can delete versions and missions. Students can only add versions.

Coaches' AI assistants can do the same through the MCP tools `list_missions`,
`save_mission`, `add_mission_version` and `get_mission_version` (see
[mcp.md](mcp.md)).

## Storage

Missions live in `TEAM_DIR` (normally `/data/team`), next to the roster and
students' progress, and are included in Download backup:

```
missions/<id>/mission.json               number, title, season, goal, notes,
                                         video, field, robot, guided, current
missions/<id>/versions.json              every version, oldest first
missions/<id>/versions/<version>.llsp3   the programs
```

A version is `{ id, number, note, saved, by, from? }`, where `by` is
`{ kind: "student", id, name }` or `{ kind: "coach", name }` (the coach's
email). Students see a student's first name and "Coach". When a coach removes a
student from the team, their versions stay, labeled "A former teammate".

The API is `/api/student/missions` (signed-in students: list, get a version,
add a version) and `/api/admin/missions` (coaches: everything else). The code is
in `server/missions.mjs`, `src/lib/missions.ts`, `src/components/MissionsDialog.svelte`
and `src/components/coach/MissionsPanel.svelte`.
