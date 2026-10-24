# Ankerzug

An offline desktop planner for archery training, built with Angular, Rust and Tauri 2.
The first MVP implements the section 29 planning workflow. It is a development
build; the cross-platform productive-release gate remains open.

## Run locally

Install Node.js 26.10.0, pnpm 10.33.0 and Rust 1.98.1 with rustfmt/Clippy. Install the native
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
pnpm install --frozen-lockfile
pnpm desktop
```

Use `pnpm desktop` for real persistence. `pnpm start` serves the Angular frontend
on port 4200 for development; opening it in an ordinary browser explicitly reports
that the native storage is unavailable. There is no browser storage substitute.
Production assets are embedded; the packaged app needs neither Node.js nor internet.

## AI-driven native UI exploration

Use `pnpm explore build`, then `pnpm explore:smoke` to verify the native automation
path. `pnpm explore start` opens the real desktop app with isolated SQLite data;
AI agents can inspect and operate it through `pnpm explore snapshot`, `click`,
`fill`, `screenshot`, `windows` and `restart`. Linux also has a native-dialog
keyboard/screenshot adapter. Normal builds omit this instrumentation.
See [EXPLORATORY_TESTING.md](EXPLORATORY_TESTING.md) for setup, commands, platform
boundaries, evidence collection and an agent exploration prompt.

## First planning workflow

1. Create a macrocycle, training start and named A-priority main competition.
2. Add school holidays or other special periods and choose their training policy.
3. Preview the phase proposal, edit its dates/load profiles/goals and accept it, or
   create phases manually. VP1, VP2, WP, UWV and UEP are available. Add further A/B/C competitions and
   extend the cycle end deliberately for post-main training.
4. Add recurring slots with local start time, duration and optional validity dates.
5. Review all occurrences, holiday exclusions and phase assignments. Override
   individual rows as needed, then generate the selected sessions.
6. Open a session in the table. Edit or remove its warm-up, add/reorder blocks,
   and edit relative minute offsets. New blocks start after the previous block.
7. Save a session as a template, edit/duplicate the three basis templates, and
   apply a template to selected sessions, a slot, a phase or its unplanned sessions.
8. Wait for **Lokal gespeichert**. Create a backup; restore a selected JSON backup
   with explicit replacement confirmation. The previous state remains recoverable.

In **Mesozyklen**, assign a **Standardvorlage** and preview its application to
new or still unplanned sessions. The preview lists resulting contents, duration
and profiles; manually edited plans and appointments with compatibility
observations stay protected. Apply deliberately with **Inhalte übernehmen**.
Deleting a template clears its default assignments and preserves session copies.

The session editor offers phase/week-aware content alternatives, including mental
training, recovery and short taper contents. Select a content to append; optionally
fill open profile values while retaining values already set. Suggestions can be
rejected, and all accepted contents remain editable. An unplanned session also
offers **Vorherige Inhalte vorschauen** when a previous appointment has contents.
This copies planned contents independently while retaining the target's date,
duration and profile. Review the preview before accepting.

Autosave waits 450 ms after an edit and serializes complete workspace writes.
Pending, saved, invalid and failed states are visible. Failed inputs remain editable
and can be retried. A revision conflict requires loading the current saved state.
The **Mesozyklen** editor offers split, merge with the next chronological phase,
and insertion into a gap. Date-boundary changes and deletion also open a timeline
preview before changing the plan. Inputs, previews and validation errors appear
directly in the selected phase card. Review the resulting phases, goals and editable
session assignments, then choose **Timeline übernehmen** or discard the preview.
A merge keeps the first phase's settings; insertion requires a gap, so shorten a
neighbor first when needed. Planning warnings can be ignored; sessions and their
contents are preserved. Changes use the same atomic autosave and retry behavior.

The **Übersicht** shows plan statistics and macrocycle settings. **Kalender**
offers month and Monday-to-Sunday week views; choose a date or step between periods. Mesocycles appear as colored
multi-day ribbons spanning their inclusive dates, with continuations across week
rows and separate rows for overlapping phases. Click a ribbon for phase details.
Holidays and competition markers stay visible. Open a session from the calendar
in the same editor used by the table; returning preserves the calendar period.

**Trainingseinheiten** filters by mesocycle, source slot, inclusive date range,
organizational status and planned/unplanned content. The built-in warm-up does
not make generated sessions individually planned. **Mesozyklus-Ansicht öffnen**
shows descriptive goals, assigned sessions and current planned totals; partial
arrow counts show coverage. Changes and deletions update the derived views.
**Wettkämpfe** exposes existing competition controls, while **Einstellungen**
contains the planning proposal and warning configuration previously shown in the
mesocycle editor. Its read-only **Info** subpage exposes Ankerzug's Apache 2.0 terms
and the complete bundled third-party license notices for offline reading. New views
use shared planned data only.

Native window closure flushes valid pending edits before exiting; failed writes
require explicit confirmation before discarding edits.

The repeatable acceptance fixture and outstanding native release checks are in
[EXPLORATORY_TESTING.md](EXPLORATORY_TESTING.md).

## Export and import a macrocycle

Open **Export & Import** from the sidebar. Select a macrocycle to export its
complete **Makrozyklus-Paket**, or choose Markdown, CSV, calendar (ICS), or the
complete **Trainingsplan PDF (A4)**. Each export saves pending edits first and
opens the PDF viewer directly or uses the native Save As dialog for other formats.
Cancel leaves the plan unchanged. Readable exports
contain shared planned data and are distinct from restorable backups.
PDF exports immediately open a separate Ankerzug PDF viewer without a save dialog.
Click **Drucken** or press Ctrl+P (Cmd+P on macOS) to print all pages directly.
Use **Speichern unter …** in the viewer if you also want a PDF file.

**Makrozyklus-Paket importieren** opens a native file picker. Review the imported
plan, session/competition/template counts, identifier collisions and new IDs,
then accept **Als separate Kopie importieren** or cancel. Existing cycles and
records are preserved. Invalid or future packages fail explicitly. The import
saves the related cycle and required templates atomically; failed storage retains
the intended import for the normal save retry. Reopen the picker if a preview
becomes stale after edits. Import requires an Ankerzug package, not a CSV, ICS,
readable document or workspace backup.

**Druckansicht öffnen** shows a detached plan; **Trainingsplan drucken** refreshes
that snapshot after saving and opens the native webview's print dialog. Calendar
exports retain floating local HH:mm times and all-day competitions; they do not
invent a timezone. Cancelled and moved origins are cancelled events with stable
IDs. Reimport/update behavior depends on the calendar client; this is not live
synchronization, and deleted sessions are absent rather than cancellation records.

## Export and import training-session templates

In **Export & Import**, use **Vorlage exportieren** beside a template or
**Alle Vorlagen exportieren** for the complete template collection. A native
Save As dialog writes a separate template package, including descriptions,
profiles, ordered training blocks, material and all compatibility fields.

**Vorlagen-Paket importieren** works without an open macrocycle. Review the
names, block counts, durations and identifier collisions, then accept
**Vorlagen als separate Kopien importieren** or cancel. Imported templates and
blocks get new IDs; existing templates, mesocycle defaults and session copies
remain intact. Invalid/future packages fail explicitly. A failed save retains the
intended import for the normal save retry; reopening a stale preview avoids
appending duplicate copies. Macrocycle packages and template packages are distinct.

For AI conversion from a Word/PDF/text session description, use
[TEMPLATE_IMPORT_FORMAT.md](TEMPLATE_IMPORT_FORMAT.md). It is a standalone
contract reference with all fields, allowed values, conversion rules, a complete
JSON example and a copyable request.

The reusable [Ankerzug template-import skill](skills/ankerzug-template-import/SKILL.md)
guides ChatGPT through extraction, clarification, conversion and verification.
Its [ZIP package](skills/ankerzug-template-import.zip) includes the instructions
and a portable copy of the format reference. Keep the bundled reference and ZIP
in sync when updating the import contract.

## Export a training session as PDF

Open **Trainingseinheiten**, choose **Öffnen →**, and click **PDF exportieren (A4)**
in the session editor. After pending plan edits are saved, the viewer opens
directly without a PDF save dialog. The A4 portrait PDF includes session details
and the
ordered contents, times, durations and material, with automatic text wrapping and
page numbers. A date/time overview and shaded time panels structure the plan;
type, status and training areas are omitted. Continued blocks are labelled.
Cancelling the optional **Speichern unter …** dialog creates no file. Unsupported
font characters
produce an explicit error; German umlauts and ß are supported. The export works
offline in the desktop application and is separate from a restorable JSON backup.
The PDF opens in its own Ankerzug viewer window. **Drucken** and
Ctrl+P (Cmd+P on macOS) open the print dialog once all pages are ready. Each export
opens a separate window; closing it releases the in-memory document. Saving is
optional through **Speichern unter …**, and cancelling it keeps the viewer open.
Native viewer and print output still require acceptance on Windows, macOS and Linux.

## Commands

| Command                                            | Purpose                                                         |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm start`                                       | Angular development server, port 4200                           |
| `pnpm build`                                       | Strict production TypeScript/template build                     |
| `pnpm test`                                        | Angular CLI / Vitest domain, transport, autosave and UI tests   |
| `pnpm format` / `pnpm format:check`                | Format / check frontend and Markdown with Prettier              |
| `pnpm desktop`                                     | Run Tauri and the development server                            |
| `pnpm desktop:build -- --locked`                   | Build native production packages with locked Cargo dependencies |
| `pnpm desktop:build --bundles deb,rpm -- --locked` | Linux DEB/RPM packages                                          |
| `pnpm rust:test`                                   | Locked Rust persistence and contract tests                      |
| `pnpm rust:check`                                  | Locked Clippy checks, warnings treated as errors                |
| `pnpm rust:format`                                 | rustfmt check                                                   |

Pull requests run validation and package builds on Linux, Windows and macOS using
frozen frontend installs and locked Cargo operations. Branch pushes outside `main`
do not run this workflow. Successful builds upload downloadable workflow artifacts.

A push to `main` runs the same checks and builds, then publishes a GitHub release
only after all three platform jobs succeed. The release tag is `v` plus the
matching version in `package.json`, `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` and Ankerzug's entry in `src-tauri/Cargo.lock`. The first
release is `v0.0.1`. Bump those versions together in each subsequent release PR;
an existing tag fails the main build instead of replacing a published release.
Release tags target the exact built commit, and release notes are generated by GitHub.

Release assets are Linux DEB/RPM packages, a Windows NSIS installer and a macOS
`.app.tar.gz` archive that preserves executable permissions. macOS uses ad-hoc
signing; Apple certificate signing/notarization and Windows certificate signing
are not configured. CI publication does not establish offline installed-app
acceptance, restart tests or validation of supported OS/distribution versions.

The native application icons use the root `logo.png`, fitted onto a square with
transparent padding to preserve its proportions. Tauri uses the PNG/ICO/ICNS
assets in `src-tauri/icons` for window/taskbar icons and desktop packages; the
Angular UI is independent of these assets. Regenerate with
`pnpm exec tauri icon logo.png --fit contain`, keeping the desktop assets only.
Rebuild and reinstall the desktop application to update installed launcher icons.

## Data and backup

Rust creates SQLite storage in the OS-specific Tauri app-data directory for
`net.ankerzug.planner`. **Backup erstellen** opens an operating-system Save As
dialog with an Ankerzug JSON suggestion; choose the destination to protect a copy
on another device. Cancelling creates no file and leaves the workspace unchanged.
Rust validates the `.json` destination and completes a synced temporary write before
replacing an existing selected file. Restore selects a JSON file (v1 or v2) and
replaces the complete workspace atomically, retaining the previous workspace in
the database. **Stand vor Wiederherstellung** restores that copy. The aggregate
and backup size limit is 200 MiB in this MVP.

No SQL, arbitrary filesystem path, ORM entity or native implementation type
crosses the Angular boundary. See [ARCHITECTURE.md](ARCHITECTURE.md) for the
contract, migration and storage design.

## Scope and verification

The current requirements describe a shared training-group plan. Planned load
profiles, quantities and descriptive goals remain; individual measurements,
performance/results evaluation, goal-achievement tracking and measured-load
recommendations are outside scope. Planned shared-equipment changes and material
warnings are retired; material remains free text on individual training blocks.

Implemented planning features include macrocycles with independent end dates,
A/B/C competition editing, five phase types with independent load dimensions,
configurable multi-peak proposals, assignment previews, holiday modes and slot/
duration reduction, typed sessions/areas, content suggestions and configurable
planning warnings. Autosave, templates,
backup/restore/recovery and origin exclusions retain their guarantees.

Safe regeneration is available under **Trainingsslots → Regenerierung prüfen**.
Review additions, updates, removals and assignments, explicitly resolve conflicts,
then apply the preview. Trainer contents and deliberately deleted dates remain
protected; destructive removals require confirmation. Older sessions without a
generation baseline require conservative explicit decisions.

**Wochen & Soll/Ist** and **Trainingsziele** have been removed, including their
editors and structured goal displays in mesocycle details and timeline previews.
Calendar week views, planned session quantities, mesocycle load profiles and
free-text descriptions remain available. Existing weekly profiles and structured
goals remain compatibility data in storage, recovery and v1/v2 backups. Existing
profile-dependent suggestions/warnings and reference handling are preserved.
The former **Material** view is retired. Existing content-level material remains
available in session and template editors, exports, backups and PDFs.

SQLite v1 databases, recovery records and v1 backups upgrade explicitly and
transactionally. Existing mesocycle arrow values remain preserved as internal `legacyArrowCount`
metadata (0-100), never absolute arrow targets or invented volume values. Absolute arrow
counts accept zero and values over 100. Migration notes explain profiles/end dates
that need trainer review. New backups use version 2; future versions are rejected.

Version-1 data exchange, readable exports, plan PDF/printing and calendar export
are implemented; native release acceptance remains pending in
[EXPLORATORY_TESTING.md](EXPLORATORY_TESTING.md). The version-1.1 training-game
scope is defined in [requirements_training_games_v1_1.md](requirements_training_games_v1_1.md).
Other deferred planning features remain governed by the requirements; removing
implementation plans does not declare them delivered or remove their scope.
Product release labels do not change the existing schema or backup format versions.
Installed offline/restart acceptance on Windows, macOS and Linux remains required;
historical implementation checks do not establish current product acceptance.
Historical implementation plans and validation records remain available in Git history.
