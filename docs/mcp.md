# Connecting an AI assistant (MCP)

Coaches can connect Claude, or any other assistant that speaks MCP, to the
simulator at `https://<site>/mcp`. The assistant can then read the lesson guide,
look through the library, check lessons and challenges and save them as drafts,
set assignments and read students' progress, and add robots and fields (including
drawing a new mat from a description). Each coach signs in as themselves, so
everything an assistant saves is stamped with that coach's email.

## Tools

| Tool                   | What it does                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `whoami`               | Which coach the connection is signed in as                                         |
| `get_lesson_guide`     | The lesson guide plus this site's fields (mat sizes), robots and programs          |
| `get_lesson_schema`    | The JSON schema for `lesson.json`                                                  |
| `list_library`         | Lessons and challenges (title, draft, author), fields, robots and example programs |
| `get_lesson`           | One lesson's JSON                                                                  |
| `check_lesson`         | Errors and warnings for a lesson, without saving                                   |
| `save_lesson`          | Save a lesson as a draft; `replace` updates your own draft                         |
| `delete_lesson`        | Delete one of your own drafts                                                      |
| `get_challenge_schema` | The JSON schema for a challenge                                                    |
| `get_challenge`        | One challenge's JSON                                                               |
| `check_challenge`      | Errors and warnings for a challenge, without saving                                |
| `save_challenge`       | Save a challenge as a draft; its id is the file name without `.json`               |
| `delete_challenge`     | Delete one of your own draft challenges                                            |
| `list_assignments`     | Assignments with each student's status on each lesson                              |
| `save_assignment`      | Save an assignment (title, lessons, type, due date, note) as a draft               |
| `delete_assignment`    | Delete one of your own draft assignments                                           |
| `get_field_guide`      | How to describe a field as JSON (`docs/fields.md`)                                 |
| `check_field`          | Errors and warnings for a field description, without saving                        |
| `save_field`           | Draw the mat and save the field as a `.spk` scene                                  |
| `get_field`            | A field's mat size, robot start and objects, and its description if it has one     |
| `upload_field`         | Add an existing `.spk` scene (base64)                                              |
| `upload_robot`         | Add an LDraw `.mpd`/`.ldr` robot model (text or base64)                            |
| `delete_field`         | Delete a field your assistant added, if nothing uses it                            |
| `delete_robot`         | Delete a robot your assistant added, if nothing uses it                            |

Rules: saved lessons, challenges and assignments are always drafts, so students
only see them after a coach presses **Publish** on the coach page. An assistant
can't replace a published one or another coach's draft, and can only delete its
own coach's drafts.

An assignment's optional `type` is `practice` (going over what was taught) or
`prep` (getting ready for the next meeting); students see it as a badge.
`save_assignment` takes an `id` to update your own draft. The tools used to be
called `list_homework`, `save_homework` (assignment under `homework`) and
`delete_homework`; those names still work.

Robots and fields have no drafts: they are in everyone's Robot and Field
pickers as soon as they're saved, marked "From an assistant" on the coach page.
An assistant can only add new names, and replace or delete the ones its own
coach's assistant added (`LIBRARY_DIR/.assistant-files.json` keeps track; a
coach replacing, renaming or deleting the file on the coach page takes it
over). It can't delete one a lesson, challenge or example uses, or the
default. Fields drawn with `save_field` keep their description in the `.spk`
(`field.json`) so `get_field` can hand it back for changes.

## For coaches: connecting

-   **Claude (web, desktop, mobile):** Settings, Connectors, Add custom connector.
    Name it "SPIKE Simulator" and use the URL `https://spike.robodan.dev/mcp`.
    Claude opens the coach sign-in page; enter your email and the code it sends.
-   **Claude Code:** `claude mcp add --transport http spike https://spike.robodan.dev/mcp`,
    then `/mcp` in Claude Code to sign in.
-   **ChatGPT, Meta Muse and others:** add a custom connector (or MCP server)
    with the same URL in the assistant's settings, then sign in the same way.

Then ask, for example: "Write a lesson on turning with the gyro using the turn
rose field, with a check that the robot stops facing 90°."

## For the site owner: Cloudflare Access setup

The server accepts the same sign-ins as `/api/admin`: a Cloudflare Access token
or a direct LAN connection (`LAN_WRITE_PREFIXES`). Assistants can't type a
one-time PIN into a browser redirect, so `/mcp` uses Access's **Managed OAuth**,
which turns the Access login into an OAuth sign-in that MCP clients understand.

1. Zero Trust, Access controls, Applications, Add an application, Self-hosted.
   Name "spike MCP", public hostname `spike.robodan.dev`, path `mcp`.
2. Attach the same email policy as the coach page, so one list of coaches
   covers both.
3. Advanced settings: turn on **Managed OAuth**, turn on **Allow localhost
   clients** and **Allow loopback clients** (Claude Code, Copilot in VS Code,
   Cursor and other assistants on the coach's own computer), and under Allowed
   redirect URIs add one line per web assistant the coaches use:

    | Assistant                                             | Redirect URI                                            |
    | ----------------------------------------------------- | ------------------------------------------------------- |
    | Claude (web, desktop, mobile)                         | `https://claude.ai/api/mcp/auth_callback`               |
    | ChatGPT                                               | `https://chatgpt.com/connector_platform_oauth_redirect` |
    | Meta Muse (from other servers' setups, not Meta docs) | `https://agent.meta.ai/api/hatch/oauth/callback`        |

    If a coach's assistant fails to sign in with a redirect error, its address
    is missing here; it's usually in that assistant's connector docs.

4. Copy the new app's AUD tag and add it to the container's `CF_ACCESS_AUD`,
   comma-separated after the existing one.

Scripts with no person behind them can use an Access service token instead:
add a Service Auth policy with the token to the "spike MCP" app and send the
`CF-Access-Client-Id` and `CF-Access-Client-Secret` headers. Saves are then
stamped with the token's client id.

## Protocol notes

`/mcp` is stateless MCP over HTTP: every request is a JSON-RPC `POST` and gets a
JSON reply (no server-sent events, no sessions). Code: `server/mcp.mjs`.
