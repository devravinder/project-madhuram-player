---
name: testing-strategy
description: Apply a test pyramid with Vitest, Testing Library and Playwright, fake IndexedDB, and coverage gates on sync and storage logic. Use when adding or organizing tests.
---

# Testing Strategy

## Pyramid

| Layer              | Tool                                         |
| ------------------ | -------------------------------------------- |
| Unit               | Vitest                                       |
| Component          | Vitest + Testing Library                     |
| Local database     | Vitest + `fake-indexeddb` (Dexie)            |
| E2E (browser)      | Playwright, including offline mode           |
| Coverage gate      | Vitest `coverage.thresholds`                 |

## Rules

- **Fast tests run in `pnpm test`.** Browser tests run separately with `pnpm test:e2e`.
- **No real network in unit tests.** Fake the GitHub client at the module boundary
  (`vi.mock`), not `fetch` internals, except when testing the client itself.
- **Fake only what the code calls.** Make fakes behave like the real thing where it
  matters (a 409 on a stale `sha`, a 403 with `Retry-After`).
- **Specs sit beside the code** (`*.test.ts(x)`). Shared fakes live in `src/testing/`.
  Reset fakes in `beforeEach`.
- **Playwright, not Selenium.** Cover offline playback with `context.setOffline(true)`.
- Use fake timers for backoff and retry tests.
- **Prove tests can fail.** For important logic, break the code on purpose (skip the hash
  check, drop the retry) and confirm a test fails.
- Test through the public edge: the exported function or the rendered component.
- Files under test must cross the real thresholds. A "split" test needs a file over the
  part size.

## What must be covered

- Byte split and reassembly (sizes, order, hash match, last short part).
- Index merge after a conflict, and tombstones for deletes.
- Outbox resume after a reload.
- Repo rollover when the size limit is reached.
- Sync state: local-only, remote-only, synced.
- Cover image shown for the right song, and the default when none exists.

## Coverage

Vitest thresholds: 80% lines and functions, 70% branches, on the code that holds logic
(`services/`, `queries/`). Run `pnpm test:coverage` in CI. Pre-commit stays fast and does
not run tests.

## Commands

```bash
pnpm test            # unit and component
pnpm test:coverage   # with gates
pnpm test:e2e        # Playwright
```
