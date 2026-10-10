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
-   Cloudflare Access for saving from outside the LAN is supported
    (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, protect `/api/admin`) but not set up.

## Built so far

-   `server/server.mjs`: serves the app, the parts library and the shared library
    API (robots `.mpd`, scenes `.spk`, programs `.llsp3` + lesson card `.json`).
    Bundled presets in `presets/` are seeded once each into the library.
-   Shared library (database button); default robot/scene load on open.
-   Realism presets (Ideal / Realistic / Challenging, `?realism=` links) and the
    ▶×5 results window with A vs B comparison.
-   Example programs with lesson cards (book button), coach-only saving.
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

-   Feedback from Pete's assistant: "Open" on examples froze in automated
    testing (likely the native `confirm()`; replace with an in-app confirm),
    add text labels to the toolbar, check the 3D mat rendering report.
-   Colour BIOGLOW mat: the `.spk` received was corrupted in transit
    (binary treated as text). Waiting on a zipped copy or the JPG/PNG to add it
    to the library. Reply to Pete drafted in the old thread.
-   Link sharing of programs was discussed and deferred.

## Testing notes

-   The in-app browser can't render the colour sensor while hidden; use a
    separate headless Chrome (`--headless=new --use-angle=swiftshader`) driven
    over CDP against a local `node server/server.mjs`.
