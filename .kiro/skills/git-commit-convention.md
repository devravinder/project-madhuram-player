---
name: git-commit-convention
description: Commit only after the user verifies a completed task, with a short conventional message under 10 words. Use when finishing any task or discrete unit of work.
---

# Git Commit Convention

## Rule

After **every completed task**, leave the changes **uncommitted** and wait. The user reviews
them in their editor's source control view. Commit only after the user says it is verified.
Keep the message **short — 10 words max**.

## Format

Conventional commits, imperative mood, lowercase after the type:

```text
<type>: <short summary>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`.

## Rules

- Summary **under 10 words**. No trailing period.
- One commit per task — do not batch unrelated changes.
- Stage specific files by name, not `git add .` / `-A`.
- Do not `--amend` already-pushed commits; prefer new commits.
- Do not skip hooks (`--no-verify`) unless explicitly asked.
- Never modify git config.

## Good examples

```text
docs: add PRD and decisions
feat: add github storage provider
fix: reset cover image on song change
test: cover file split and reassembly
chore: pin dependency versions
```

## Bad examples

```text
updated some files and fixed the upload thing and also docs   # too long, vague
WIP                                                            # meaningless
feat: Added GitHub Upload.                                     # capitalized, trailing period
```

## Flow per task

1. Finish the task.
2. Update `docs/TASKS.md` — mark the task `[x]` (or `[~]` if partial).
3. If the task changed how to run/use anything, update `docs/HOW-TO-RUN.md`.
4. Stage the specific files changed (including the docs above).
5. Commit with a short conventional message, only after the user verifies.
6. Pause for review before the next task.
