# Decisions

## ADR-001: GitHub repositories as storage

Users own their data, and the app needs no backend. Trade-offs: GitHub discourages using
repos as a file host, history keeps deleted blobs, and rate limits apply. Mitigation: size
caps, private repos by default, one commit per upload.

## ADR-002: Personal access token for sign-in (v1)

A fine-grained token pasted by the user. No server and no OAuth app. It needs permission to
create repositories, which is broad. Mitigations: local-only storage, short expiry advice,
a dedicated account suggestion, and a "Remove token" action. The app cannot revoke a
token on GitHub, so removal links the user to GitHub's token settings. OAuth through a small token-exchange function is phase 2,
behind the same provider interface.

## ADR-010: Reuse an existing library repo

Sign-in first looks for the configured repo. A repo with a valid marked `index.json` is
reused. An empty repo is adopted. Any other repo is left untouched and the user picks a
new name. This protects unrelated repos that happen to share the name.

## ADR-003: REST and Git Data API, not a git client

No clone in the browser. GitHub's git endpoints lack CORS and a clone is heavy in
IndexedDB. The Git Data API gives atomic multi-file commits.

## ADR-004: Raw URLs for public reads

`raw.githubusercontent.com` has CORS and Range support and avoids the unauthenticated API
limit. Used for the index and for streaming.

## ADR-005: Byte split with a manifest

Parts are raw slices, so any format works. Playback joins them. Fragmented MP4 streaming
is deferred. The manifest format leaves room for it.

## ADR-006: Playlists in a separate file

`playlists.json` keeps playlist edits from conflicting with uploads. Playlists merge per
item by `updatedAt`. Deletes use tombstones.

## ADR-007: Offline-first, login optional

The first page is the login page, with a clear "Try without login" button. A guest choice is remembered, so the installed app opens straight into the device library, including offline. Sign-in stays available in Settings.

## ADR-008: Frontend stack follows the project skills

`tailwind-variants` instead of tailwind-styled-components, TanStack Query for remote state,
native `fetch`, pinned versions, oxlint and prettier, Vitest. The existing TanStack Router
stays; the skill's React Router default does not apply.

## ADR-009: Firebase backend removed

Sign-in and sync move to the provider layer. The `server` folder, Firebase SDK and
`redaxios` are deleted.

## ADR-010: Deleting a backed-up song asks where

When signed in, deleting a song that is on GitHub offers "Delete everywhere" or
"Remove from this device only".

- Delete everywhere removes it here, then right away on GitHub: the index entry
  becomes a tombstone (so other devices remove it), and the manifest and every
  part under `data/<id[0:2]>/<id>/` are removed from the primary and shard repos,
  freeing their space. If GitHub cannot be reached, the next full sync finishes it.
- Remove from this device only marks the sync record `deviceRemoved`. Sync and
  Upload leave the track alone; Download brings it back, and it stays in its
  playlists meanwhile.
- When signed out, a backed-up song is only removed from the device, so signing
  in later never deletes it from GitHub by surprise.

## ADR-011: New songs upload only when the user chooses

Importing or saving a song never uploads it. Settings, GitHub backup lists the songs that
are not backed up, with their size, an Upload button for each and "Upload all", so large
files can be left out.

- Sync brings in tracks and deletes, and sends edits of tracks already backed up. It does
  not upload new tracks.
- Automatic runs (app opens, connection returns, rate limit ends) only finish steps the
  user already started, or retry the exact job a pause interrupted. They never plan new
  uploads.

## ADR-012: A private home repo and several libraries

Users upload into a library they choose and share only the libraries they choose.

- A **home** repo (private) holds playlists, followed libraries, the list of libraries and the
  default. Making a library public never exposes anything personal.
- A **library** holds songs and is public or private as a whole, overflow repos included,
  because one song can be split across repos. Overflow repos are `<library>-part-N`, so
  they never clash with another library named `<library>-N`.
- Making a library public asks first, and says that anyone can download its songs and that
  songs deleted earlier stay in the repo history.
- "Copy link" copies a link to this app that opens the library in Explore.
- The app was not released before this, so there is no migration from the single-repo layout.
