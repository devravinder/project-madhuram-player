---
name: git-hooks-conventions
description: Set up Husky, lint-staged and commitlint so lint, format and conventional commits run automatically. Use when configuring repo quality gates or git hooks.
---

# Git Hooks & Conventions

## Tools

- **Husky** manages git hooks.
- **lint-staged** runs tools only on staged files.
- **commitlint** with `@commitlint/config-conventional` enforces commit messages.
- **oxlint** and **prettier** lint and format TS and JS.
- **markdownlint-cli2** lints Markdown.

## Hooks

- `pre-commit` runs lint-staged (lint and format on changed files).
- `commit-msg` runs commitlint.

## lint-staged

```js
// lint-staged.config.js
export default {
  "*.{ts,tsx,js,jsx,mjs,cjs}": ["oxlint", "prettier --write"],
  "*.md": ["markdownlint-cli2 --fix", "prettier --write"],
  "*.{json,yaml,yml,css}": ["prettier --write"],
};
```

## commitlint

```js
// commitlint.config.js
export default { extends: ["@commitlint/config-conventional"] };
```

## Conventional commits

`<type>: <summary>` with types feat, fix, docs, refactor, test, chore, build, ci, perf.
See `git-commit-convention` for the per-task rule.

## Notes

- Keep hooks enabled. Do not use `--no-verify` unless explicitly asked.
- Store hook scripts as executable (`git add --chmod=+x .husky/pre-commit`); Windows never
  sets the bit itself.
- Check a fresh clone with `git ls-files --eol` so no file shows `i/crlf`.
