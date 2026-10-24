# Technology Stack

## Purpose

This document defines the technology boundaries for Ankerzug. New code and dependencies must follow these decisions. Update this document before adopting a technology outside these boundaries.

## Approved stack

| Area | Technology | Responsibility |
| --- | --- | --- |
| Desktop application | Tauri 2 | Application shell, native integration, frontend/Rust communication, and desktop packaging |
| Native backend | Rust with Cargo | Local database, CRUD operations, persistence mapping, operating-system integration, and native resource access |
| User interface | Angular with TypeScript | Business operations, domain rules, components, routing, forms, and presentation logic |
| Styling | HTML and CSS | Layout, styling, and responsive desktop interfaces |
| Package management and command entry point | pnpm | Frontend dependencies and project development/build scripts |
| Frontend compilation | Angular CLI | Serve the frontend during development and compile production assets |
| Rust compilation | Cargo | Build, check, format, lint, and test Rust code |
| Frontend tooling runtime | Node.js | Run pnpm and Angular tooling during development and builds |

pnpm is the standard entry point for frontend and desktop workflows. It orchestrates scripts; Angular CLI compiles the frontend, and Tauri invokes Cargo to compile the Rust application. Node.js is a development/build dependency, not an application runtime requirement.

## Target platforms

- Windows desktop.
- macOS desktop.
- Linux desktop.
- Android, iOS, and a separately deployed web application are outside the initial scope.
- Build and validate release artifacts on the corresponding operating system.
- Confirm minimum OS versions, supported Linux distributions and package formats, and CPU architectures before release; these are not yet fixed.
- Keep platform-specific code isolated and provide equivalent behavior on all supported systems.

Windows development requires the Rust MSVC toolchain, Microsoft C++ Build Tools, and WebView2. macOS development requires Rust and Apple's Xcode tooling. Linux development requires Rust/Cargo, native C/C++ build tools, pkg-config, and distribution-specific Tauri development libraries, including WebKitGTK 4.1, GTK 3, and OpenSSL. Follow the official Tauri prerequisites for installation details and distribution-specific packages.

## Architecture boundaries

See ARCHITECTURE.md for the detailed responsibility split, business model contract, persistence mappers, and transaction boundaries.

- Angular owns business operations, domain rules, UI state, input handling, and presentation. Implement business operations in Angular services. Prefer standalone components and built-in framework features.
- Rust owns the local database, CRUD operations, persistence integrity, filesystem operations, and privileged native operations. Rust mappers translate between persistence models and business models.
- Use business models in typed Tauri commands and events between Angular and Rust. Validate structural inputs and persistence integrity in Rust; conduct domain validation and business operations in Angular. Return explicit errors.
- Use Tauri capabilities and scoped permissions for required native access.
- Compile Angular into static frontend assets embedded in the desktop application. Do not require a production Node.js server or server-side rendering.
- Keep one Angular frontend and one Tauri/Rust backend initially. Introduce additional services or processes only through an explicit architecture decision.

## Dependency limits

- Use pnpm exclusively for JavaScript/TypeScript dependency management; do not add npm, Yarn, or Bun lockfiles.
- Use Cargo exclusively for Rust dependency management.
- Prefer Angular, Rust standard-library, and Tauri features before adding dependencies.
- Add third-party packages, Rust crates, and Tauri plugins only for a concrete requirement. Document their purpose and check maintenance, licensing, and Windows/macOS/Linux compatibility.
- Do not introduce another frontend framework, desktop shell, backend language, or build orchestrator. React, Vue, Svelte, Electron, and additional standalone Vite/Webpack configurations are outside this stack.
- UI component libraries, CSS frameworks, external state-management libraries, databases, ORMs, cloud services, and auto-update infrastructure are not selected yet. Record the decision here before introducing them.

## Version and reproducibility policy

- Use stable releases and select mutually compatible Angular, TypeScript, and Node.js versions when scaffolding.
- Keep Tauri Rust crates, JavaScript API packages, CLI, and plugins compatible with Tauri 2.
- Pin the pnpm version through the package manager declaration in the frontend package manifest.
- Record Node.js and Rust toolchain versions in repository configuration when scaffolding.
- Commit the pnpm and Cargo lockfiles. Use frozen frontend lockfile installation and locked Cargo builds in CI.
- Git attributes enforce LF checkouts for detected text files on every platform,
  keeping Prettier checks and generated notices independent of `core.autocrlf`.
- Upgrade dependencies deliberately; do not rely on floating latest versions for reproducible builds.
- Release versions come from matching frontend, Tauri and Cargo manifests plus the
  root crate's Cargo.lock entry. The first release is 0.1.0; later release PRs bump
  those versions explicitly. Database, backup and exchange-format versions remain
  independent.
- GitHub Actions validates and packages pull requests and pushes to main; other
  branch pushes do not trigger it. Only a successful main build publishes a GitHub
  release, after all platform jobs succeed, with a new version tag pointing to the
  built commit. Existing tags are never overwritten. Only the publishing job has
  repository-content write permission; pull-request jobs retain read permission.
- Use the GitHub runner's bundled CLI for release creation and generated notes;
  no application dependency, update infrastructure or signing secret is introduced.
  Assets are Linux DEB/RPM, Windows NSIS and a permission-preserving macOS app tarball.
  macOS builds use ad-hoc signing; Apple certificate signing/notarization and
  Windows certificate signing remain unconfigured. Automated publication does not
  close the separately documented native acceptance gates.

## Development and validation

The first MVP provides pnpm scripts for frontend development/builds, Tauri development/packaging, formatting and tests. See AGENTS.md and [README_DEV.md](README_DEV.md) for commands.

- Use Angular's supported testing tools for frontend behavior and business operations. Use Cargo tests for Rust CRUD operations, persistence mappers, and database integrity.
- Format and lint Rust with rustfmt and Clippy.
- Select frontend formatting and linting tools during scaffolding and document them here.
- Validate native integration and packaged application behavior on Windows, macOS, and Linux before release.
- Keep build scripts portable across PowerShell and macOS/Linux shells.

## Official references

- [Tauri documentation](https://v2.tauri.app/)
- [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Angular documentation](https://angular.dev/)
- [pnpm documentation](https://pnpm.io/)
- [Rust documentation](https://www.rust-lang.org/learn)

## Release attribution policy

- Ankerzug-owned material is distributed under Apache License 2.0;
  third-party components retain their own licenses and are never described as
  Apache-licensed unless their own license says so.
- `pnpm licenses:generate` deterministically creates `THIRD_PARTY_NOTICES.md` from
  the locked production JavaScript and Rust dependency roots and bundled assets.
  Run `pnpm install --frozen-lockfile` and
  `cargo fetch --manifest-path src-tauri/Cargo.toml --locked` first so the
  dependency sources and their license texts are available on a clean checkout.
  `pnpm licenses:check` compares that output byte-for-byte before packaging in CI.
  Git attributes keep the generated notices checked out with LF line endings on
  every platform so Windows checkout conversion does not invalidate the check.
- Dual SPDX expressions are retained as supplied by component metadata. Apache-2.0
  components include their shipped license and any shipped NOTICE file. Noto Sans
  is attributed under SIL Open Font License 1.1 with the unmodified OFL text.
- The generated document is attribution hygiene, not legal advice. The release owner
  reviews any generator failure or required NOTICE material before release.

## MVP implementation decisions (2026-10-06)

- Angular 21.2.25 (maintained stable line compatible with Node 26.10.0), TypeScript 5.9.3, RxJS 7.8.2, pnpm 10.33.0; Tauri API/CLI 2.12.1. Exact resolved Rust versions are committed in Cargo.lock. Rust toolchain baseline: 1.98.1. Repository and CI pin Node 26.10.0.
- SQLite through rusqlite 0.40.2 with bundled SQLite; no ORM. SQLite is embedded, transactional, offline and portable across Windows/macOS/Linux. rusqlite is maintained, MIT licensed; SQLite is public domain. A versioned aggregate document preserves related planning data atomically in one SQLite transaction. This deliberately favors a small local MVP over a relational query layer; typed Rust mappers validate every read.
- serde/serde_json (MIT/Apache-2.0) implement explicit serializable contracts and a versioned backup. The existing Rust-only tauri-plugin-dialog selects a trainer-chosen JSON backup destination; no frontend filesystem permission, JS dialog plugin or new dependency is added.
- Angular CLI unit-test builder with Vitest 4 and jsdom provides isolated domain, transport and UI tests. Prettier 3 supplies frontend/document formatting, strict Angular/TypeScript compilation supplies type and template checks. These maintained MIT tools run on all three platforms. Rust uses rustfmt and Clippy. No UI library, CSS framework, state library or cloud service.
- CI runs frozen pnpm installs and locked Cargo validation on Linux, Windows and macOS. Native offline/restart UI acceptance remains a separate release gate; CI compilation alone does not establish that it passed.
- Backups use a Rust-scoped native Save As dialog for a trainer-selected JSON destination. Rust validates the extension and atomically replaces the selected file only after a complete synced temporary write; cancellation creates no file. Restore accepts a user-selected JSON file, validates the entire payload and revision, and keeps the previous document in a recovery table in the same transaction. No arbitrary filesystem paths are accepted over IPC.

## Early session PDF export (2026-10-06)

- Bring forward the single-session A4 PDF export from requirement 30.2. Use
  jsPDF 4.2.1 (maintained MIT library) for offline vector text, wrapping and
  pagination in Angular. Exclude its unused optional HTML/SVG capture modules
  (`html2canvas`, `dompurify`, `canvg`) from Angular bundling. Load the renderer only on export; no HTML capture,
  cloud service or production Node runtime is required for PDF generation.
- Bundle Noto Sans Regular (SIL Open Font License 1.1, license shipped alongside
  the font data) for German text and its supported Latin/Greek/Cyrillic glyphs.
  The font and PDF library run in each platform's Tauri webview.
- Use tauri-plugin-dialog 2.7.1 (MIT/Apache-2.0, Tauri 2 compatible) only from Rust
  for an optional native Save As dialog in the PDF viewer on Windows/macOS/Linux.
  Opening a PDF accepts bytes and a suggested filename, never a filesystem path.
  Saving uses the calling viewer's validated payload and writes only the path
  selected in that dialog. No general
  frontend filesystem or dialog permission is granted.
- Verify native dialog, overwrite/cancellation and printed A4 output on each
  supported OS before release; automated renderer tests do not establish native
  acceptance.

## Version 1 exchange and presentation exports

- Reuse the approved jsPDF/Noto Sans renderer and Rust-only tauri-plugin-dialog
  for macrocycle/template packages, Markdown, CSV, ICS and plan PDFs; no new dependencies.
  Native Open/Save dialogs select the only paths read/written, with a 20 MB limit.
- Print the Angular plan view through `window.print()` in the native webview;
  Tauri's Rust print API is macOS-only in the pinned version. Use print CSS and
  validate actual dialogs/output separately on Windows, macOS and Linux.
- Calendar exports follow [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).
  Floating local date-times preserve the stored HH:mm without inventing a timezone;
  competitions are all-day dates. No account, server or calendar dependency.

## Shared PDF viewer (2026-10-07)

- All PDF exports share one Rust operation that opens a separate Ankerzug PDF
  window directly from generated bytes, without a save dialog or file write.
  **Speichern unter …** is a separate optional action inside the viewer.
- Use Mozilla's maintained Apache-2.0 `pdfjs-dist` 6.4.299 to render the actual
  generated PDF bytes in that window. Bundle the legacy renderer and worker
  locally for offline Windows/WebView2, macOS/WKWebView and Linux/WebKitGTK use.
  Its Node.js development minimum is 22.13; the pinned Node 26.10.0 exceeds that requirement.
  Load the renderer only in the viewer. See the
  [official PDF.js examples](https://mozilla.github.io/pdf.js/examples/).
- Print the rendered A4 pages through a window-scoped Rust command that calls
  Tauri's WebView print API, hiding the viewer controls and background. This
  opens the native dialog reliably on macOS without a general print capability,
  plugin or filesystem permission. PDF bytes are scoped to the requesting
  viewer's window label and removed when the window closes.
- Viewer creation failures report an error. Cancelling or failing the optional
  Save As action leaves the open document printable and preserves existing files.
  Native opening and printing acceptance remains pending on each supported OS.

## Version 1.1 training games (2026-10-07)

Reuse SQLite aggregate storage, scoped Rust dialogs, jsPDF/Noto Sans and PDF.js;
no new dependency or general filesystem capability is needed. Store attachment
bytes as JSON integer arrays inside the workspace transaction. This deliberately
trades JSON size for atomic save/import/backup/recovery without orphaned files.
Attachments are limited to 5 MiB each; game-aware packages to 100 MiB, workspace
and backups to 200 MiB serialized UTF-8. Existing text/PDF exports retain 20 MiB.
PDF.js must successfully render every attachment page before acceptance, with no
password prompt, at most 200 pages and 25 million pixels per page and 100 million per document at 150 dpi.
These are resource limits, not a fixed attachment-count limit. Rust verifies
byte structure, IDs and references; Angular performs full PDF usability checks.

## Native AI exploration tooling (2026-10-22)

- Use the maintained WebdriverIO project's MIT-licensed
  `tauri-plugin-wdio-webdriver` 1.5.0 as an optional Cargo dependency behind
  the `exploration` feature. It supports Tauri 2 on Windows, macOS and Linux
  through an embedded loopback-only WebDriver server. No external driver,
  paid service or production frontend dependency is required.
- A Node.js standard-library CLI drives that server, records actions and
  screenshots, and starts the real application with embedded frontend assets
  and a dedicated SQLite directory. No persistence or native command is mocked.
- Exploration builds require an explicit absolute data directory and port.
  Normal builds contain neither the server nor the data-directory override.
  Use a separate Cargo target directory to keep instrumentation out of release
  artifacts. Native file/print dialogs require desktop interaction; WebDriver
  screenshots and key actions cover webviews only.
- The plugin is test infrastructure, not a substitute for packaged acceptance.
  Run native workflows on each target OS, recording any untested native dialog
  or print behavior. See [EXPLORATORY_TESTING.md](EXPLORATORY_TESTING.md).
- References: [Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/) and
  [plugin source](https://github.com/webdriverio/desktop-mobile/tree/main/packages/tauri-plugin-webdriver).
- Linux native-dialog exploration optionally uses Python 3's standard `ctypes`
  with the system's BSD-licensed libxdo, plus ImageMagick's `import` command for
  screenshots. These are development-only desktop tools, not application
  runtimes or dependencies. X11/XWayland is required; the launcher selects GTK's
  X11 backend. The adapter restricts input to windows owned by the isolated app
  process. Portal dialogs owned by another process and other operating systems
  require their own desktop automation or a human tester.
