---
name: markdown-lint
description: Author all Markdown to pass markdownlint rules (consistent headings, lists, spacing, code fences, line length). Use whenever writing or editing any .md file.
---

# Markdown Lint

## Rule (always)

**Every `.md` file this project writes or edits must pass markdownlint.** Apply these rules
whenever authoring any Markdown — docs, skills, READMEs, specs. Run `--fix` before committing.

Tooling: `markdownlint-cli2`, config in `.markdownlint.jsonc`.

## Core rules to follow

- **MD041** — first line is a single top-level `#` heading (one H1 per file).
- **MD001** — heading levels increment by one (no H2 → H4 jumps).
- **MD022** — headings surrounded by a blank line above and below.
- **MD025** — only one H1 per document.
- **MD032** — lists surrounded by blank lines.
- **MD031** — fenced code blocks surrounded by blank lines.
- **MD040** — fenced code blocks declare a language (`ts,`bash, ```mermaid).
- **MD047** — file ends with a single trailing newline.
- **MD009** — no trailing whitespace.
- **MD012** — no multiple consecutive blank lines.
- **MD004** — consistent unordered list marker (use `-`).
- **MD034** — no bare URLs; wrap in `<...>` or use `[text](url)`.
- **MD024** — no duplicate heading text within the same section level.

## Intentional relaxations (set in config)

- **MD013 (line length)** — disabled. Prose and tables wrap naturally; do not hard-wrap.
- **MD033 (inline HTML)** — allowed where needed (rare).
- **MD036 (emphasis-as-heading)** — disabled; bold labels are used intentionally in prompt
  templates and structured lists.
- **MD060 (table-column-style)** — disabled; cosmetic pipe spacing not enforced.

## Config

```jsonc
// .markdownlint.jsonc
{
  "default": true,
  "MD013": false,
  "MD033": false,
  "MD036": false,
  "MD060": false,
  "MD041": true,
  "MD040": true,
}
```

## Commands

```bash
pnpm dlx markdownlint-cli2 "**/*.md" "#node_modules"
pnpm dlx markdownlint-cli2 --fix "**/*.md" "#node_modules"
```

## Conventions

- Use `-` for unordered lists, `1.` for ordered.
- Always specify a language on code fences; use `mermaid` for diagrams
  (see `doc-with-mermaid`).
- One H1 as the title; sections start at H2.
- Run `--fix` before committing docs; include markdown lint in the pre-commit hook for
  `*.md` files (see `git-hooks-conventions`).
