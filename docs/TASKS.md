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

## Phase 3 — Video and model

- [x] Add `kind`, `mime` and `bytes` to the song model, rename `audioId` to `mediaId`, with a Dexie migration
- [ ] Video player: inline, full screen, Picture-in-Picture
- [x] Import video files (MP4, WEBM, MOV, MKV) with poster frame and duration

## Phase 4 — GitHub storage

- [ ] `StorageProvider` interface and device provider
- [x] Token setup screen and validation (login first, with "Try without login")
- [~] Remove token action: clears the token and keeps local data, with a link to revoke on GitHub (outbox stop comes with the outbox)
- [ ] Find an existing library repo: reuse if marked, adopt if empty, else ask for a new name
- [ ] Recover missing shard repos by marker
- [ ] Create repos, read and write `index.json` with conflict retry
- [ ] Add `sha256` and `parts` to tracks when syncing\n- [ ] Byte split, manifest, atomic commit upload
- [ ] Persisted outbox with resume
- [ ] Repo rollover at the size limit
- [ ] Playlists sync and tombstones
- [ ] Sync screen: push local, pull remote

## Phase 5 — Public libraries

- [ ] Follow a public library by address
- [ ] Stream unsplit tracks from raw URLs
- [ ] Show "file not found" for a 404 and hide tracks removed from the index
- [ ] Download split tracks then play
- [ ] Download as copy, and upload to own repo when signed in
- [ ] Followed sources stored in the index

## Phase 6 — Polish

- [ ] Storage usage and persistence in settings
- [ ] Rate limit and error handling UI
- [ ] End-to-end tests for offline playback and sync
