# Repository guide for agents

## Project and current state

Ankerzug is a local desktop application for planning archery training from the
start of a macrocycle through a main competition. It targets Windows, macOS, and
Linux with Angular, TypeScript, Rust, and Tauri 2.

The repository contains the first Angular/Tauri/SQLite MVP, manifests, lockfiles,
toolchain configuration, tests and a three-platform CI workflow. Cross-platform
native release acceptance is still pending. Treat the stack and architecture below as approved plans;
inspect the repository again before assuming an implementation or command exists.

## Governing documents

- [TECHSTACK.md](TECHSTACK.md): approved technologies, dependency limits,
  platforms, and reproducibility policy.
- [ARCHITECTURE.md](ARCHITECTURE.md): responsibility split, business models,
  persistence mapping, transactions, and validation strategy.
- [EXPLORATORY_TESTING.md](EXPLORATORY_TESTING.md): native test harness, repeatable
  acceptance fixture, release gates and validation evidence. Complete the applicable release checks
  before declaring a release accepted.

The former standalone requirements documents are retained in Git history.
Their removal does not authorize changes to product scope or compatibility.

Read the relevant sections before changing behavior. Keep these documents
consistent with implementation decisions. Record a technology decision in
TECHSTACK.md before introducing a technology outside its approved boundaries.
Distinguish historical implementation notes from current contracts: SQLite schema
v6 stores business-data v2 and separate local app preferences, while backup and exchange formats have independent
versions. Follow the explicit migration and normalization policies in
ARCHITECTURE.md; preservation requirements do not prohibit those documented
transformations or require readable exports to contain retired compatibility data.
For template/game import changes, also read [TEMPLATE_IMPORT_FORMAT.md](TEMPLATE_IMPORT_FORMAT.md)
and the [game import reference](skills/ankerzug-game-import/references/GAME_IMPORT_FORMAT.md).
Keep affected skill references and ZIP packages synchronized with their contracts.

## Specialist agent definitions

Project-scoped Codex roles are defined in `.codex/agents/`:

- [rust-coder](.codex/agents/rust-coder.toml): Rust/Tauri implementation and backend tests.
- [rust-reviewer](.codex/agents/rust-reviewer.toml): independent Rust review, including database, import, backup and recovery compatibility.
- [angular-coder](.codex/agents/angular-coder.toml): Angular implementation and frontend tests.
- [angular-reviewer](.codex/agents/angular-reviewer.toml): independent Angular review, including compatibility through editing, serialization, imports and backup workflows.
- [e2e-tester](.codex/agents/e2e-tester.toml): isolated native exploration and acceptance evidence.

Use only the roles relevant to the assigned task. These definitions supplement
this guide; shared rules remain here. Coders implement fixes, reviewers report
findings without editing code, and the tester preserves reproducible evidence.
Both reviewers treat incompatible changes and silent data loss as blocking
findings and require older database/import/backup fixture coverage for affected
paths. Roles inherit session model settings and permissions.

## Architecture rules

- Angular business services own domain validation, training calculations,
  scheduling, and use-case orchestration. Keep components focused on interaction,
  form binding, and rendering; keep calculations testable independently of Tauri.
- Angular data-access services wrap typed Tauri calls and handle transport errors.
  Angular must not access the database directly or receive SQL, database rows,
  ORM entities, or Rust implementation types.
- Rust owns local storage, CRUD, structural input validation, storage integrity,
  migrations, and privileged native operations. Do not duplicate training rules
  in Rust repositories or command handlers.
- Rust mappers explicitly convert persistence models to business models and
  create/update inputs to persistence data. Invalid stored values produce errors
  rather than silent defaults.
- Exchange plain serializable business models using matching TypeScript types
  and Rust structs. Keep field names, enum values, optional fields, and collection
  shapes aligned. Boundary identifiers are strings; date-only values use
  YYYY-MM-DD and are distinct from local times and timestamps.
- Angular computes intended changes. Rust saves related changes atomically via
  typed batch or aggregate commands when needed; separate frontend calls do not
  share a database transaction. Report persistence failures explicitly.

## Stack and dependencies

- Use pnpm for JavaScript/TypeScript dependencies and development scripts, Angular
  CLI for frontend compilation, and Cargo for Rust. Do not add npm, Yarn, or Bun
  lockfiles or a separate build orchestrator.
- Prefer standalone Angular components, framework features, HTML/CSS, Rust's
  standard library, and Tauri capabilities with scoped permissions. Production
  frontend assets are embedded in the desktop application.
- SQLite with bundled rusqlite is the approved persistence choice in TECHSTACK.md.
  An ORM, UI library, CSS framework, external state management, cloud services,
  and update infrastructure remain undecided. Record new choices in
  TECHSTACK.md before adding them; justify dependencies by a concrete requirement,
  maintenance, licensing, and Windows/macOS/Linux compatibility.
- When scaffolding, select compatible stable versions, keep Tauri packages
  compatible with version 2, pin pnpm in the package manifest, record Node.js and
  Rust toolchains, and commit pnpm and Cargo lockfiles. CI should use frozen
  frontend installs and locked Cargo builds.
- Keep scripts portable across PowerShell and macOS/Linux shells. Isolate platform
  differences and validate release artifacts on their corresponding OS.

## Product and change guidance

- Use the documented concepts: macrocycle, mesocycle, training slot, training
  session, training content, special period, and template.
- Automate results that follow deterministically from existing data. Keep
  suggestions editable and never silently overwrite trainer decisions.
- Follow the documented product scope and acceptance workflow when implementing features.
  The version-2 implementation uses VP1/VP2/WP/UWV/UEP and independent volume, intensity
  and specificity profiles; absolute session/block arrow counts are separate.
  Migrated optional mesocycle legacyArrowCount retains its original 0-100
  meaning; never reinterpret it as an absolute count or load dimension. Preserve
  transactional v1 conversion and both backup readers. Follow ARCHITECTURE.md
  for compatibility contracts and EXPLORATORY_TESTING.md for acceptance. Include
  configured holidays and recovery periods in planning.
- The corrected scope is shared group planning. Keep planned load profiles,
  quantities, free-text descriptions and organizational appointment status. Do not
  introduce individual measurements, performance/results evaluation,
  goal-achievement tracking or recommendations based on measured training load.
  The weekly comparison and structured-goal features are retired; keep their
  stored records and existing reference/profile handling for compatibility.
  Material planning covers shared equipment and training topics. Superseded v2
  fields remain compatibility data until a separately authorized code adaptation;
  preserve existing storage, recovery and both backup readers without data loss.
- Keep technical documentation in English and preserve German product terminology. Update related documents when decisions change.
- Keep changes focused on the task and preserve existing staged, unstaged, and
  untracked work. Do not scaffold the application as a side effect of a
  documentation task.

## Validation

Review Markdown, local links, consistency between governing documents, and
whitespace. Use `git diff --check` and inspect new files separately.

Actual commands from package.json:

- `pnpm install --frozen-lockfile`: reproducible frontend install.
- `pnpm start`: Angular development server on port 4200 (native persistence requires Tauri).
- `pnpm build`: strict Angular production build.
- `pnpm test`: Angular CLI/Vitest domain, transport, autosave and rendered UI checks.
- `pnpm format` / `pnpm format:check`: Prettier frontend/Markdown format/check.
- `pnpm desktop`: Tauri development application.
- `pnpm desktop:build -- --locked`: native production packaging with locked Cargo dependencies.
- `pnpm desktop:build --bundles deb,rpm -- --locked`: Linux packages; CI uses msi on Windows and dmg on macOS.
- `pnpm rust:test`: locked Cargo tests.
- `pnpm rust:check`: locked Clippy for all targets, warnings treated as errors.
- `pnpm rust:format`: rustfmt check.

Strict Angular/TypeScript builds and Clippy are the MVP static checks. Native
prerequisites are documented in TECHSTACK.md and README_DEV.md. Never use a browser
persistence substitute as evidence of desktop acceptance.
For implementation changes:

- Test Angular domain rules independently of Tauri and storage, and verify
  data-access command and error contracts.
- Test Rust mappers, CRUD, constraints, migrations, and transaction rollback.
- Verify TypeScript/Rust serialization of identifiers, dates, enums, and optional
  values.
- Validate the EXPLORATORY_TESTING.md acceptance workflow, including data persistence after
  an application restart. Verify native and packaged behavior on all supported
  platforms before release.
- Run checks relevant to the change and report what was run, what failed, and any
  platform or tooling checks that could not be performed.

## AI-driven native exploration

Read [EXPLORATORY_TESTING.md](EXPLORATORY_TESTING.md) before an exploratory UI
test session. Use `pnpm explore build` and the exploration CLI to operate the real
Tauri application with isolated SQLite data. `pnpm explore:smoke` verifies the
infrastructure and restart persistence. Keep findings reproducible and retain
evidence. WebDriver and Linux native-dialog coverage do not establish untested
platform, printing or packaged release acceptance.
