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
- [x] Explore also accepts the app's share link

## Phase 6 — Polish

- [x] Storage usage and persistence in settings (device meter, per-repo GitHub meter, keep-data request)
- [x] Rate limit and error handling UI (auto-resume with time shown, sign in again, error and not-found pages)
- [x] End-to-end tests for offline playback and sync (Playwright, fake GitHub, real GitHub blocked)

## Phase 7 — Feedback fixes

- [x] Sync no longer gets a 404 for `index.json` right after creating the repo (API calls skip the browser cache)
- [x] Delete a backed-up song everywhere, or from this device only (Download brings it back)
- [x] Sync waits while the app is in the background instead of stopping as offline
- [x] Public library downloads wait out the background too
- [x] Unfinished sync steps resume when the app opens
- [x] No automatic uploads; Settings lists songs not backed up, upload one or all
- [x] Player redesign: fits every screen, main controls only, the rest under "More options"
- [x] Tap controls on the cover and video (±15s, play), double tap jumps 10s, fullscreen on video
- [x] Playback speed, share guide, shorter sync messages, bottom bar clear of phone edges
- [x] Wide videos stay landscape in phone fullscreen
- [x] Several libraries: upload into a chosen one, share only chosen ones, copy link; private home repo for playlists
- [x] Notifications can be closed with ×; in-app confirmations instead of browser pop-ups
