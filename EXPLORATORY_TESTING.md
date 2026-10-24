# AI-driven exploration of the native application

This harness runs the actual Tauri executable with embedded Angular assets,
real IPC, real SQLite, native dialogs and separate PDF viewer windows. It never
substitutes browser persistence. An AI agent with terminal and local image-reading
tools can operate it through the CLI. An API key, AI SDK or MCP server is not
required; the agent supplies the exploration decisions.

## Start here

Use the Node.js, pnpm, Rust and native desktop prerequisites in [README_DEV.md](README_DEV.md).
From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm explore build
pnpm explore:smoke
pnpm explore start
pnpm explore snapshot
pnpm explore screenshot
```

`explore build` produces an opt-in instrumented debug executable in a separate
Cargo target directory, using a production Angular build. No development server
is needed. Rebuild after changing application code; stop an existing session
before rebuilding. The ordinary development and release builds omit the driver,
diagnostics and data-path override.

`explore:smoke` requires a built binary and no active exploration session. It
creates a macrocycle and named main competition through the UI, waits for autosave,
captures evidence, restarts the process and verifies the cycle survived. It then
closes the app. This verifies the harness, not the full product acceptance workflow.

`start` creates a new UUID-named run with its own SQLite directory. `restart`
keeps that directory. `stop` preserves the database and evidence. No operation
copies or replaces the trainer's normal workspace. Do not manually point an
instrumented binary at a real workspace. Prefer a dedicated desktop/test account
when exploring destructive workflows or native dialogs.

## Agent commands

Commands accept one JSON object as their final argument. Examples below use
POSIX shell quoting; an agent can also spawn Node with an argument array to avoid
shell quoting entirely. In PowerShell, pass the JSON as one literal string.
Run `pnpm explore help` for all command shapes.

```sh
pnpm explore start '{"port":4445}'
pnpm explore info
pnpm explore snapshot
pnpm explore click '{"selector":"button.new-cycle"}'
pnpm explore fill '{"selector":"input[placeholder=\"z. B. Landesmeisterschaft Halle\"]","text":"Testwettkampf"}'
pnpm explore keys '{"keys":"Tab"}'
pnpm explore saved
pnpm explore windows
pnpm explore switch '{"handle":"main"}'
pnpm explore screenshot
pnpm explore restart
pnpm explore stop
```

Take a fresh snapshot after every UI change and derive selectors from it. Controls
include their labels, values, disabled state, options and a unique structural CSS
selector. Structural selectors can change after adding/deleting rows. Ambiguous
selectors fail rather than choosing the first element. `select` accepts a select
control's option value or visible text. Screenshots and snapshots are written to
the run directory; use an image-reading tool to inspect PNG files.

`windows` lists real webview handles, including newly opened PDF viewers. Switch
to a viewer, inspect/capture it, then switch back to `main`. `request` exposes
session-relative WebDriver endpoints for scrolling/pointer actions, window sizing,
JavaScript dialog responses and other advanced operations. For example:

```sh
pnpm explore request '{"method":"POST","path":"/window/rect","body":{"width":1000,"height":750}}'
pnpm explore request '{"method":"GET","path":"/alert/text"}'
pnpm explore request '{"method":"POST","path":"/alert/dismiss","body":{}}'
```

`eval` is available for diagnostics. Avoid direct IPC writes, Angular service
calls or database edits as substitutes for user workflows. WebDriver's embedded
implementation uses DOM events for some interactions, including clicks and text
entry; these do not establish physical pointer behavior, trusted browser gestures
or native keyboard focus correctness. Use the native adapter for those checks.

`stop` and `restart` wait for **Lokal gespeichert** and refuse invalid/pending
edits. They destroy windows through WebDriver. They therefore test persistence
of completed saves, not the native close-flush behavior. Test pending-edit closure
using a real window-manager close action as described below. After that app has
exited, `restart` can relaunch the preserved session database.

## Native file, print and window interaction

WebDriver sees webviews. Native Open/Save/Print dialogs require OS desktop input
and desktop screenshots. These must remain real for native acceptance; do not
mock file paths or change production commands to bypass the picker.

The bundled `native` adapter supports Linux X11/XWayland. It needs Python 3,
libxdo, `xprop` and ImageMagick's `import` (system packages; no Python packages).
The launcher uses GTK's X11 backend, including in a Wayland desktop with XWayland.
For Fedora, the relevant packages are `python3`, `xdotool`, `xprop` and
`ImageMagick`; Debian/Ubuntu use `python3`, `xdotool`, `x11-utils` and `imagemagick`.
A headless environment also needs an X server and window manager; keep the same
display alive across CLI commands.

```sh
pnpm explore native '{"action":"windows"}'
pnpm explore native '{"action":"focus","window":"0x123456"}'
pnpm explore native '{"action":"screenshot","window":"0x123456"}'
pnpm explore native '{"action":"keys","window":"0x123456","keys":"ctrl+a"}'
pnpm explore native '{"action":"type","window":"0x123456","text":"/absolute/test/run/backup.json"}'
pnpm explore native '{"action":"keys","window":"0x123456","keys":"Return"}'
pnpm explore native '{"action":"keys","window":"0x123456","keys":"Escape"}'
pnpm explore native '{"action":"close","window":"0x123456"}'
```

Run `pnpm explore:smoke --native` to check backup cancellation, a real native
backup save and normal window-manager closure/reopen in addition to the basic
smoke. This requires the Linux adapter prerequisites and an interactive desktop.

Replace the example window ID with one from `native windows`; use an actual path
inside the run directory returned by `info`. Each command can activate its target
and verifies that the active window belongs to the isolated app process before
sending input. Save dialogs may initially select only the filename stem; use
Ctrl+A to replace the whole filename. Take another native screenshot before
accepting any overwrite or replacement. `close` sends a real window-manager close
request so the app's pending-save/close handling runs.

The native adapter refuses windows belonging to another process. A desktop
portal or external print service may own a dialog; in that case use a separately
configured OS desktop agent or a human tester and record the boundary. Native
WebDriver control is available on Windows/macOS, but this repository does not
bundle their OS-dialog adapters. Use Windows UI Automation or macOS Accessibility
with an appropriate desktop agent, or have a human handle these dialogs. Record
these steps as untested until they are actually performed. Actual printing and
packaged/installed behavior remain separate platform acceptance checks.

## Evidence and diagnostics

Each run retains:

- `session.json`: binary, process ID, platform/webview capabilities, port and paths.
- `actions.jsonl`: ordered commands, protocol requests and failures.
- `native.log`: native stdout/stderr, including failures before the UI loads.
- `snapshot-*.json`: visible text, controls, save state and up to 200 frontend
  warnings/errors/unhandled rejections for the current document.
- `screenshot-*.png` and `native-*.png`: webview and native-window evidence.
- `data/ankerzug.sqlite3`: the actual isolated persistent workspace.

All run files live under the gitignored `.exploration` directory. Actions and
screenshots contain entered data. Use synthetic planning data and fixture PDFs.
CLI-level failures are also recorded in `cli-errors.log`. A crash may leave
`session.json` or `command.lock`. Check that no command is running before removing
a stale lock. If the app was closed normally outside WebDriver, `stop` clears its
inactive session and `restart` retains its database. An unresponsive live process
requires inspection before cleanup; the CLI does not kill a recorded PID blindly.
If startup fails, it terminates only the child it just launched and retains the
run's evidence. If you need to revisit an older run, retain its data/evidence and
launch the instrumented binary manually with that dedicated directory and port;
the CLI manages one active run at a time.

The driver listens only on loopback and is enabled solely by the Cargo feature.
Keep exploration builds local and close them after testing. Do not package them
for users. The server is an unauthenticated local automation endpoint; do not
forward its port to a network or run untrusted content in the instrumented app.

## Exploration charter and reporting

Start from the authoritative acceptance workflows:

- [Release acceptance gates](#release-acceptance-gates).
- [Repeatable MVP acceptance fixture](#repeatable-mvp-acceptance-fixture).
- [Architecture and compatibility contracts](ARCHITECTURE.md).

For each charter, cover the normal workflow, boundaries, cancellation and recovery:

| Area               | Exploration targets                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Planning           | Macrocycle dates, VP1/VP2/WP/UWV/UEP proposals, multiple competitions, editable profiles                                         |
| Scheduling         | All holiday/recovery policies, three weekly slots, exclusions, repeat generation without duplicates                              |
| Timeline           | Boundary changes, split/merge/gap insertion, preview cancellation, preserving manual session decisions                           |
| Sessions/templates | Warm-up removal, relative times, blocks and reordering, independent copies, template defaults                                    |
| Navigation         | Calendar month/week, tables, filters, details, keyboard focus, smallest supported window, long German labels                     |
| Autosave           | Rapid changes, invalid input correction, write feedback, restart, native close while edits are pending                           |
| Exchange/recovery  | Native save/open cancellation and overwrite, macrocycle/template/game packages, invalid/future packages, backup/restore/recovery |
| Games/PDF          | CRUD and validation, attachments, session/template usage, multiple PDF windows, viewer save/cancel/print                         |
| Compatibility      | Both backup versions, preserved retired fields, unknown versus zero values, absolute arrow counts above 100                      |

Treat planned group data as the product scope. Do not invent individual measured
load, results evaluation, goal-achievement tracking or retired weekly comparisons.
No test may silently overwrite trainer decisions. Do not edit stored data to
manufacture successful UI acceptance. Record injected failures separately from
naturally occurring behavior.

Use this prompt with an agent that has terminal and image-reading tools:

> Read AGENTS.md and EXPLORATORY_TESTING.md. Build and start the isolated native
> application with the exploration CLI. Explore the repeatable MVP planning workflow
> and then the exchange/PDF/game workflows using synthetic data. Take fresh
> snapshots after UI changes and inspect screenshots for visual findings. Exercise
> native dialogs using the desktop adapter where supported. Verify saved edits
> after a real process restart. Compare behavior to the documented acceptance workflows and architecture contracts.
> For each suspected bug, reproduce it from a known state and report expected
> behavior, actual behavior, exact steps, severity, platform/build details and
> evidence paths. Separate confirmed defects, usability observations and untested
> steps. Do not modify application code during exploration. Preserve evidence and
> stop the test app when finished. Never claim another platform or packaged
> acceptance passed based on this run.

A report should name the tested commit and dirty worktree state, OS, binary build,
charters attempted, successful checks, reproducible findings and remaining gaps.
Attach screenshots and the relevant action/snapshot files to each finding. Promote
confirmed defects to focused deterministic regression tests after investigation.

## Infrastructure validation

```sh
pnpm explore:test
cargo test --manifest-path src-tauri/Cargo.toml --locked --features exploration exploration::tests
pnpm explore build
pnpm explore:smoke
```

CI runs the CLI contract tests and compiles/tests the optional Rust feature on all
three operating systems. Interactive exploration and OS-dialog acceptance require
a desktop session and are not claimed by those CI checks.

## Initial host validation (2026-10-22)

On Linux, the embedded build and native smoke passed, including a persisted
macrocycle across process restart, backup-dialog cancellation, backup save with
verified contents and real window-manager closure/reopen. The CLI contract tests,
180 frontend tests, 39 existing Rust tests, two exploration configuration tests,
Clippy with and without the exploration feature, rustfmt, production license
checks, changed-file formatting and local Markdown file links passed. The CLI
contract/native smoke also ran with Node.js 26.10.0 directly; this host's default
pnpm still selects Node.js 22 and emits an engine warning.

At that validation date, repository-wide Prettier reported formatting differences
in two Air plan documents. Those plans have since been removed during documentation
cleanup. Windows/macOS interactive runs, portal-owned dialogs, actual print output
and installed/package acceptance remain unverified. These infrastructure checks
do not close the product's release acceptance gates.

## Release acceptance gates

These gates retain the outstanding release obligations from the removed
implementation roadmaps. Documentation cleanup does not mark any gate passed.
Historical implementation and validation records remain in Git history; their
results apply only to the commit, platform and scope they actually tested.
The workflows below define acceptance checks, and ARCHITECTURE.md defines compatibility contracts.
Deferred features remain requirements rather than accepted implementation claims.

Version 1 covers macrocycle exchange, standalone session-template exchange,
Markdown/CSV exports, plan/session PDFs and printing, and calendar export on top
of the existing planning application. Training games are the separately specified
version-1.1 scope. Product versions do not change schema or backup-format versions.

### Version 1 checklist

- [ ] Each export/import workflow has recorded native acceptance, including an
      independent-store macrocycle round trip and single/all-template round trips.
- [ ] Imports preserve required records, template/game reference closure and
      compatibility data, remap identities safely, and reject corrupt/future,
      conflicting or stale packages without partial writes. Cancellation changes
      nothing; failed-save retry does not create duplicate copies.
- [ ] Native Open/Save dialogs, keyboard operation, selection, cancellation,
      overwrite and failure behavior pass on Windows, macOS and Linux.
- [ ] Readable exports preserve German/free text, escaping and local times.
      Actual PDFs retain wrapping, pagination, repeated headers and final lines;
      viewer opening, multiple windows, optional saving and actual print output
      pass on each supported platform. Unsupported glyphs fail explicitly.
- [ ] Calendar-client imports verify stable event identifiers, cancellation and
      moved-origin handling, floating local times across DST, Unicode/line folding
      and all-day competitions without requiring an account or network.
- [ ] Core and affected planning workflows pass, including the
      fixture below, installed offline restart, backup/restore and recovery.
- [ ] Locked frontend/native checks and packages pass. Record tested OS versions,
      architectures, Linux distributions/package formats, distribution and signing
      decisions. CI builds alone do not establish installed UI acceptance.
- [ ] Documentation agrees with actual evidence; no known data-loss defect or
      required unverified native gate remains open.

### Planning and compatibility regression

Exercise these planning and compatibility scenarios in addition to the baseline fixture:

- Preserve IDs, references, manual edits, exclusions, retained compatibility data
  and recovery records across upgrades, both backup readers, disk reopen and
  package exchange. Verify failed migration/restore rollback and stale-revision
  conflicts without recreating the database or manually repairing stored data.
  Retired material-change fields follow the explicit v3-to-v4 normalization;
  unrelated training-content material and compatibility records remain intact.
- Verify TypeScript/Rust serialization with shared v1/v2 fixtures, null versus
  zero, absolute arrow counts above 100, and preserved 0-100 legacy metadata.
  Reject unknown fields/enums and dangling references explicitly.
- Check independent load dimensions, unknown-aware totals counted once per shared
  session, partial coverage, cancelled/moved appointments and Monday boundaries.
  Retired weekly/goal editors remain absent while their stored records survive.
- Cover short/one-day cycles, leap days, DST weeks, repeated or same-day A peaks,
  post-main-competition UEP, overlapping periods/phases and missing UWV targets.
  Missing targets warn; supplied dangling references fail.
- Exercise all period modes, explicit reductions and preview overrides. Verify
  removable warm-ups, independent template copies, idempotent generation,
  persistent exclusions and explicit apply/dismiss decisions. Manual edits and
  dismissed unchanged suggestions survive saves and restarts.
- Exercise rapid/in-flight edits, invalid/failed autosave, stale previews,
  destructive confirmations and closing with pending/failed writes. Related
  operations commit atomically and never present failed persistence as saved.

### Training games and later releases

Training-game acceptance covers library
validation, single/team flags, four ratings, PDF attachments, native open/print,
standalone exchange, A4 instructions, optional session/template references and
names in exported plans. Verify attachment/reference closure, atomic imports,
backup/recovery, legacy compatibility and offline restart on all three platforms.
The game duration rating never replaces block duration in minutes.

Later feature acceptance must map the relevant requirement sections to observable
UI workflows and recorded evidence. Re-run the core fixture and affected export,
game and compatibility checks. When the full documented scope is delivered, cover
a realistic extended plan combining its competitions, holidays/camps, templates,
manual overrides, planned summaries and accepted/rejected suggestions. Do not
reintroduce retired measurement, weekly-comparison, structured-goal or
material-change workflows. A missing required platform check remains pending.

## Repeatable MVP acceptance fixture

Use a fresh test store and the following fixed data. No direct database editing
is allowed during the UI acceptance run.

1. Create "Hallensaison 2026" from 2026-09-28 to the named main competition on
   2026-12-06, discipline Halle.
2. Add school holidays from 2026-10-12 through 2026-10-25 inclusive, with the
   explicit suspended (no-training) policy; do not rely on the holiday default.
3. Preview the proposed mesocycles, record the selected configuration and
   resulting phase dates, then accept them. Move the first phase's end to 2026-10-12 and the next phase's start to 2026-10-13, leaving other phases intact.
4. Add Tuesday 18:00, Thursday 18:00, and Saturday 10:00 slots, each 120 minutes.
5. Preview 30 occurrences. The holiday policy excludes six; manually deactivate
   2026-10-29 as well. Generate the remaining **23 sessions**.
6. Verify every generated session's date-based mesocycle assignment and special
   period indicators. Verify no duplicate occurrence on repeated generation.
7. Open a session and observe the editable 30-minute warm-up. Delete it. Add
   Technik for 30 minutes, Scoring for 75, and Cool-down for 15; suggested offsets
   must be 0, 30, and 105 minutes. Autosave the complete 120-minute content.
8. Save the session as a template. Apply it to two other selected sessions using
   an explicit replacement preview. Verify content copies and untouched targets.
9. Wait for completed saves, restart the desktop app offline, and compare the
   complete saved business data, identifiers, relationships, and manual flags.
10. Back up and restore the store; repeat the restart comparison. Exercise a
    failed autosave and failed restore without accepting partial persistence.

This fixture provides deterministic dates, counts and observable results for
core planning acceptance. The former standalone requirements documents remain
available in Git history; their removal does not waive the release gates above.

## Release validation record

Retain evidence for each acceptance run. A harness smoke, mocked browser check,
automated disk-reopen test or build proves only its stated scope; none substitutes
for untested native dialogs, printing or installed platform acceptance.

```text
Release / workflow:
Test date, commit and dirty worktree state:
Requirements covered:
Decisions/documentation updated:
Actual commands and results:
Windows version, architecture, native/package/restart evidence:
macOS version, architecture, native/package/restart evidence:
Linux distribution, architecture, package format, native/package/restart evidence:
Migration, failure, and preservation checks:
Earlier acceptance checks re-run:
Evidence locations:
Outstanding checks or defects:
Completion gate: passed / pending
```
