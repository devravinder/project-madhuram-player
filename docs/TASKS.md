# Tasks

Legend: `[x]` done, `[~]` partial, `[ ]` not started.

## Phase 0 — Setup

- [x] Copy project skills and steering into `.kiro`
- [x] Write PRD, architecture and decisions
- [x] Add Husky, lint-staged, commitlint, markdownlint

## Phase 1 — Cleanup and migration

- [x] Delete `server/`, remove Firebase, auth, sync and background tasks
- [x] Remove `redaxios` (no remaining HTTP client yet; `fetch` from here on)
- [x] Remove shadcn `components.json`
- [x] Replace tailwind-styled-components with tailwind-variants
- [x] Add `src/config.ts` and move env and deploy values out of tracked files
- [x] Add TanStack Query and `query-client.ts`
- [x] Switch eslint to oxlint, add prettier
- [x] Pin exact dependency versions
- [x] Add Vitest, Testing Library, fake-indexeddb

## Phase 2 — Bug fixes and import

- [x] Cover image resets on song change and shows the default when missing
- [x] Revoke object URLs correctly
- [x] Fix out-of-order song loading on rapid next and previous
- [x] Lock-screen artwork uses the song cover
- [x] Import accepts MP3, M4A, AAC, FLAC, OGG, OPUS, WAV, including files with no MIME type
- [x] One unreadable file no longer stops an import
- [x] Deleting the song that is playing shows an error instead of hiding the option

## Phase 3 — Video and model

- [x] Add `kind`, `mime` and `bytes` to the song model, rename `audioId` to `mediaId`, with a Dexie migration
- [x] Video player: inline, full screen, Picture-in-Picture
- [x] Import video files (MP4, WEBM, MOV, MKV) with poster frame and duration

## Phase 4 — GitHub storage

- [x] `StorageProvider` interface and device provider
- [x] Token setup screen and validation (login first, with "Try without login")
- [x] Remove token action: clears the token, stops a running sync, keeps local data and queued steps, links to revoke on GitHub
- [x] Find an existing library repo: reuse if marked, adopt if empty, create if missing, never touch other repos, ask for another name
- [x] Recover missing shard repos by marker
- [x] Create repos, read and write `index.json` with conflict retry
- [x] Add `sha256` and `parts` to tracks when syncing (hash, parts and manifest are written at upload)
- [x] Byte split, manifest, atomic commit upload, with size and hash checks on download
- [x] Persisted outbox with resume (retry with backoff, rate-limit hold, offline stop)
- [x] Repo rollover at the size limit (a large file can span repos; leftover space is reused)
- [x] Playlists sync and tombstones (newest edit wins, deletes kept as tombstones, Recently Played stays on the device)
- [x] Sync screen: sync, upload only, download only, with status, stop and retry

## Phase 5 — Public libraries

- [x] Follow a public library by address (owner/repo or a GitHub link, no login)
- [x] Stream unsplit tracks from raw URLs
- [x] Show "file not found" for a 404 and hide tracks removed from the index
- [x] Download split tracks then play
- [x] Download as copy (one or all), and upload to own repo when signed in
- [x] Followed sources stored in the index (follow and unfollow sync across devices)

## Phase 6 — Polish

- [ ] Storage usage and persistence in settings
- [ ] Rate limit and error handling UI
- [ ] End-to-end tests for offline playback and sync
