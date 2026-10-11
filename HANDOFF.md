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
-   Coach tools page at `/coach` (`src/pages/CoachPage.svelte`): upload, rename,
    download and delete robots, scenes and programs, choose what loads on open,
    mat previews for scenes, and a lesson card form. Roadmap for the next steps
    (class settings, team progress, homework):
    https://claude.ai/code/artifact/97bba12c-7c37-4104-81ae-94fe7e782868
-   Welcome screen, guide (? button) with block reference, About/credits.
-   Block help: hover tooltips, right-click "Explain this block".
-   Sensor graph, measure/route tool, top-down Place view.
-   Practice fields, "Driving Base 3 with distance sensor" robot, 8 challenge
    cards with auto-checking (`src/lib/spike/challenges.ts`).
-   Generators: `tools/examples/` (examples, fields, scenes, challenge
    solutions), `tools/robots/make_db3d.py`.

## Known limitations

-   Robots drive through obstacles (no object physics); tilt/gesture sensors
    aren't simulated; acceleration/stop-method blocks are ignored.
-   No robot builder in the site (build in BrickLink Studio / LeoCAD, load .io/.mpd).
-   Progress on challenges is per browser.
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
