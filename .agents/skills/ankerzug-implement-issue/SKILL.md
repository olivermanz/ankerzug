---
name: ankerzug-implement-issue
description: Implement GitHub issues in olivermanz/ankerzug, including cloud checkout, focused Angular/Tauri changes, acceptance tests, and pull request preparation. Use when asked to implement, fix, continue, or revise an Ankerzug issue. Require every issue-related commit subject to start with gh- followed by the issue number.
---

# Implement Ankerzug issues

## Establish the task

1. Identify the issue number and translate its acceptance criteria into observable behavior and relevant checks. Ask for the issue number only when neither the request nor the active task identifies it; never invent one.
2. Inspect the existing checkout, branch, status and diff. Preserve unrelated work. Clone the repository into the cloud workspace if necessary.
3. Read repository `AGENTS.md`, applicable nested instructions, and relevant sections of `ARCHITECTURE.md`, `TECHSTACK.md` and `EXPLORATORY_TESTING.md`. Treat current files as authoritative rather than copying assumptions from a previous issue. Read import contracts when changing imports or exports.

## Gitflow

- Use `develop` as the integration branch and `main` as the release branch. Fetch the current `origin/develop` and create new issue branches from it. Reuse the existing issue branch when continuing work and review its diff against `origin/develop` before publishing.
- If `develop` is missing on the remote, report it as a blocker for PR creation. Keep `develop` as the required target.

## Implement and verify

- Complete the authorized implementation rather than stopping at a plan. Keep changes scoped to the issue; clarify only consequential ambiguity that cannot be resolved from current code and requirements.
- Keep Angular components focused on interaction and rendering, business services on validation and orchestration, data access on typed Tauri calls, and Rust on storage and native operations.
- Preserve planning records, retained compatibility fields, imports, backups and recovery. Trace references before deletion; save related changes atomically using the existing aggregate or batch path. Preserve the existing failed-save retry semantics and explicit error feedback.
- Reuse established UI patterns and approved dependencies. For dialogs and selection controls, cover keyboard operation, accessible names, cancellation, reset behavior, disabled states and repeated actions.
- Use the pinned toolchain and frozen lockfiles where available. Inspect the actual package scripts; run focused regression tests, appropriate builds/static checks, formatting checks for changed files and `git diff --check`. Broaden testing when changes or failures justify it.
- For persistence changes, cover linked records, compatibility fixtures and failed writes. Test rendered behavior as well as service logic when the issue affects UI.
- Attempt applicable native checks following `EXPLORATORY_TESTING.md`. Report exact blockers and toolchain deviations. Do not treat mocked transport or a browser-only run as native desktop/restart acceptance.
- Update governing documentation when behavior or contracts change. Keep technical documentation in English and product UI terminology in German. Do not bump release versions unless release preparation is part of the task.

## Mandatory commit naming

**Every new commit for the issue must begin with `gh-<issue-number>` followed by a space.** Apply this to implementation, tests, documentation, follow-up fixes and commits made through GitHub tools as well as local Git.

For issue #9:

- Correct: `gh-9 Add training game selection and deletion`
- Correct: `gh-9 fix: reset selection when cancelling deletion`
- Incorrect: `fix: gh-9 Add training game deletion`
- Incorrect: `#9 Add training game deletion`

Before creating each commit, verify that its subject matches `^gh-<actual-issue-number> .+` with the actual issue number substituted. Never place a conventional-commit prefix before `gh-N`. For work spanning issues, use the primary issue at the start and reference additional issues in the body. If a squash or merge commit is explicitly requested, apply the same prefix to its subject.

Check all new issue commits before publishing. Correct unpublished subjects when needed; do not rewrite already published history without authorization. Apply this convention prospectively unless the user requests a history correction.

## Publish a reviewable result

1. Inspect the final diff and stage only the intended files. Create commits with the mandatory issue prefix.
2. Publish the issue branch and create or update its PR when within the requested scope. Always set the PR base explicitly to `develop`, including for draft PRs and PRs created through the GitHub API. Verify the base after creation or update. If direct Git push lacks credentials, use the connected GitHub API without exposing credentials. Preserve the correct base tree and parent, use a guarded ref update for an existing branch, and verify that the published tree matches the tested local tree.
3. Start the PR title with the same `gh-N` prefix. Describe the concrete problem and resulting behavior; include `Closes #N` when the PR fully resolves the issue. Record checks passed, failures, toolchain deviations and unverified platform behavior. Use a draft when material validation remains outstanding.
4. Check the current CI status. Distinguish running, failed and passed checks; do not claim success based only on a submitted workflow. Do not merge or release without authorization.
5. Return the PR link, a brief description of the delivered behavior, test results and any remaining limitation. Keep the checkout usable for follow-up work.
