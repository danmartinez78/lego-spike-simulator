# LEGO SPIKE Simulator: handoff (2026-10-10)

## Where things live

-   **Repo:** https://github.com/danmartinez78/lego-spike-simulator (fork of
    alexandrehardy/lego-spike-simulator, GPL v2). Work is on `master`.
-   **Image:** every push to `master` runs `.github/workflows/docker.yml`, which
    builds `Dockerfile` and publishes `ghcr.io/danmartinez78/lego-spike-simulator:latest`
    (public package).
-   **Live site:** https://spike.robodan.dev (LAN: http://192.168.0.228:8093).

## Hosting (Unraid "T640", 192.168.0.228)

-   Container `lego-spike-simulator`, image `ghcr.io/danmartinez78/lego-spike-simulator:latest`,
    bridge network, port 8093 -> 8080, path `/data` -> `/mnt/user/appdata/lego-spike-simulator`.
-   Variable `LAN_WRITE_PREFIXES=192.168.0.`: devices on the home LAN that connect
    directly (not through the public URL) can save to the shared library.
-   `/data/library` = shared robots/scenes/programs; `/data/ldraw` = LDraw parts
    library (downloaded on first start; delete it to refresh).
-   Deploy = push to `master`, wait for the Action, then update the container
    (Unraid Docker tab, or the unraid MCP `update_container`).
-   Nginx Proxy Manager proxy host `spike.robodan.dev` -> 192.168.0.228:8093
    (robodan cert). Cloudflare CNAME `spike` -> robodan.dev.
-   Cloudflare Access (Zero Trust team `aged-glitter-854f.cloudflareaccess.com`)
    guards `spike.robodan.dev/coach` and `/api/admin` with the One-time PIN login
    and an email allowlist (policy "spike access"; add coaches' emails there).
    The container has `CF_ACCESS_TEAM_DOMAIN` and
    `CF_ACCESS_AUD` set, so the server checks the Access token on writes.
-   Unraid "Apply" reuses the image it already has; use Check for Updates /
    apply update (or Force Update in Advanced View) to pull a new `:latest`.

## Built so far

-   `server/server.mjs`: serves the app, the parts library and the shared library
    API (robots `.mpd`, scenes `.spk`, programs `.llsp3` + lesson card `.json`).
    Bundled presets in `presets/` are seeded once each into the library.
-   Shared library (database button); default robot/scene load on open.
-   Realism presets (Ideal / Realistic / Challenging, `?realism=` links) and the
    ▶×5 results window with A vs B comparison.
-   Example programs with lesson cards (book button), coach-only saving.
-   Coach tools page at `/coach` (`src/pages/CoachPage.svelte`), with tabs Lessons,
    Challenges, Example programs, Assignments,
    Students, Robots and maps, and AI assistants: upload, rename,
    download and delete robots, scenes and programs, choose what loads on open,
    mat previews for scenes, and a lesson card form. Roadmap for the next steps
    (class settings, team progress, homework):
    https://claude.ai/code/artifact/97bba12c-7c37-4104-81ae-94fe7e782868
-   Lessons (clipboard button in the code panel): step-by-step activities with a
    Set up button, tick-off steps and an optional check. Stored in
    `library/lessons/*.json`; imported and exported on the coach page as zip
    packages, or written with the New lesson form (live student preview). New
    and imported lessons are drafts (`"draft": true`, hidden from students)
    until a coach presses Publish. Format: `docs/lessons.md`,
    `schemas/lesson-v1.json`; the validation rules live in
    `server/lesson-rules.mjs`, shared by the server and the app. One sample
    lesson ships in `presets/lessons/`.
-   Checks (`src/lib/spike/checks.ts`): stop zone (+ heading), ordered
    waypoints, stay-out zones, follow a line (colour sensor within a corridor
    along a traced path), time limit and block rules, over 5 runs. Lessons draw
    them on the mat in the lesson editor (`CheckEditor.svelte`); students press
    Check my robot, then ▶×5. Challenges use the same engine.
    Runs now record each colour sensor's position and the run time.
-   Agent authoring, no repo needed: `GET /api/lessons/guide` (docs/lessons.md
    plus the live fields with mat sizes and robot starts, robots, programs),
    `GET /api/lessons/schema`, and `POST /api/lessons/check` (validate a
    lesson.json or package, nothing saved). These are public and read-only.
-   MCP server for coaches' AI assistants at `/mcp` (`server/mcp.mjs`, setup and
    tools in `docs/mcp.md`): lesson guide, library listing, check and save
    lessons and challenges as drafts stamped with the coach's identity (`"author"`). Same
    sign-in as `/api/admin`; for people it needs a separate Access app on
    `/mcp` with Managed OAuth, whose AUD is added to `CF_ACCESS_AUD`
    (comma-separated). The coach page's AI assistants tab explains connecting an
    assistant and the package-and-import route for chatbots without MCP. It also sets assignments as
    drafts (`draft` on the assignment; students' `/api/student/homework` skips
    them) and reads progress, and adds robots and fields: `save_field` draws a
    mat from a JSON description (`server/fields.mjs`, format in
    `docs/fields.md`; PNG inside `mat.jpg`, which browsers decode by content)
    into a `.spk` (`server/zip.mjs`). Which robots and fields an assistant
    added is in `LIBRARY_DIR/.assistant-files.json` (`server/authors.mjs`).
-   Students (coach page, Students tab): paste names, each gets a random code
    (`WORD-WORD-NN`); print cut-out code cards, copy one
    student's link, or export a CSV for a mail merge. Stored in plain text in
    `/data/team/roster.json` (`server/team.mjs`). Students sign in with the
    Sign in button in the code panel or a `/#code=...` link; `/api/student` is
    deliberately outside Cloudflare Access and limits wrong codes to 10 per
    address per 10 minutes.
-   Assignments (coach page, Assignments tab; called homework in the code, files
    and API paths): pick lessons, an optional due date and an optional `type`,
    `practice` or `prep` (prep for next meeting), shown to students as a badge;
    no type means no badge. Students see them at the top of their Lessons window. Signed-in students'
    ticked steps, check results and challenge results sync to `/data/team/students/<id>/progress.json`
    (newer lesson wins, challenge results only improve), and Hand in saves the
    current program as `students/<id>/programs/<lesson>.llsp3`. The coach grid
    shows each student's status per lesson with a download link for the program.
    Signing out clears the browser's copy of the progress. Code: `server/homework.mjs`,
    `src/lib/homework.ts`, `AssignmentsPanel.svelte`. The MCP tools are
    `list_assignments`, `save_assignment` and `delete_assignment`; the old
    `*_homework` names still work as aliases. An assignment with `checkFirst`
    blocks hand-in (server and app) until the lesson's check has passed, for
    lessons that have a check.
-   Before going public (pre-release): `/api/admin` refuses writes whose
    `Origin` is another site (it compares with `Host` or `X-Forwarded-Host`, so
    the proxy must pass the original host); drafts are left out of the public
    `/api/library` and a draft file returns 404 unless a coach asks; static files
    carry an ETag so browsers revalidate the 2.5 MB page instead of downloading
    it again. The Students tab has Download backup (`GET /api/admin/backup`, a
    zip of `team/` and `library/`; to restore, unzip it into `/data`) and New
    codes for everyone (`POST /api/admin/roster/codes`), and asks before adding
    names that look like full surnames. The guide's About tab has a privacy note.
-   Team settings (coach page, Team settings tab; `server/settings.mjs`,
    `src/lib/settings.ts`, `TEAM_DIR/settings.json`, public at `GET /api/settings`):
    what AI assistants see (`aiStudentNames`: `stats`, the default, gives
    `list_assignments` per-lesson statistics only; `names` adds each student's
    name and progress), automatic sign-out on shared computers
    (`signOutAfterMinutes`, tracked in localStorage `spike-sim-last-active`),
    team name, a copyable note for families, and Remove all
    students (`DELETE /api/admin/roster`). Optional env `HEAD_COACHES`
    (comma-separated emails) limits who can change them; unset, any coach can.
    The privacy notice is at `/privacy` (`src/pages/PrivacyPage.svelte`), linked
    from the welcome screen and the guide. Server logs name students by id, not name.
-   The code panel autosaves the program in the browser (`src/lib/blockly/autosave.ts`,
    localStorage key `spike-sim-program`) and restores it on the next visit.
-   Welcome screen, guide (? button) with block reference, About/credits.
-   Block help: hover tooltips, right-click "Explain this block".
-   Sensor graph, measure/route tool, top-down Place view.
-   Practice fields, "Driving Base 3 with distance sensor" robot.
-   Challenges (Challenges button in the code panel): goal, field, check and
    hints, auto-checked over 5 runs. Stored in `library/challenges/<id>.json`
    (the id is the file name, which lessons' `"challenge"` and students'
    progress refer to); 8 ship in `presets/challenges/` and are seeded once.
    Coaches make, edit, publish, import and delete them on the coach page's
    Challenges tab (`ChallengeEditor.svelte`, same mat CheckEditor as lessons);
    drafts are hidden from students. Format: `docs/lessons.md#challenges`,
    `schemas/challenge-v1.json`, rules in `server/lesson-rules.mjs`
    (`challengeProblems`), `POST /api/challenges/check`. App side:
    `src/lib/spike/challenges.ts` (falls back to the presets with no server).
-   Generators: `tools/examples/` (examples, fields, scenes, challenge
    solutions), `tools/robots/make_db3d.py`.

## Known limitations

-   Robots drive through obstacles (no object physics); tilt/gesture sensors
    aren't simulated; acceleration/stop-method blocks are ignored.
-   No robot builder in the site (build in BrickLink Studio / LeoCAD, load .io/.mpd).
-   Progress on lessons and challenges is per browser unless the student signs in.
-   The BIOGLOW wireframe in the live library is FIRST material (site only, not in the repo).

## Open items

-   Feedback from Pete's assistant: the native `confirm()`/`alert()` popups are
    replaced by an in-app dialog (`src/lib/confirm.ts`, `ConfirmDialog.svelte`) and
    both toolbars show text labels (`ToolButton.svelte`). Still open: the 3D mat
    rendering report (needs details of what looked wrong, and the LDraw library,
    which the cloud sandbox can't download).
-   Colour BIOGLOW mat: added as the preset `presets/scenes/BIOGLOW - colour mat.spk`
    (seeded into the library on the next container start). It was cut from a
    2200 x 1064 screenshot Pete sent, using the outer yellow dashed border as the
    field edge and stretched to 2360 x 1140 mm, so it is low resolution and about
    2% off in proportion. Swap in the real mat file if one arrives.
-   Link sharing of programs was discussed and deferred.

## Testing notes

-   The in-app browser can't render the colour sensor while hidden; use a
    separate headless Chrome (`--headless=new --use-angle=swiftshader`) driven
    over CDP against a local `node server/server.mjs`.
-   `npm run physics` (`tools/physics/`) runs the VM headless and checks Ideal
    rollouts against hand-worked geometry, the Realistic/Challenging spread, and
    the colour sensor examples on a drawn mat. Run it after touching `vm.ts` or
    `realism.ts`.
