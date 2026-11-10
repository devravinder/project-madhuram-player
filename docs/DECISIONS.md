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
