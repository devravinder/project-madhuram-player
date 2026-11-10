# Madhuram Player — Product Requirements

## 1. Overview

Madhuram Player is an offline-first music and video player that runs in the browser and
installs like an app. It works immediately with no account. People who want a backup, or want
their library on more than one device, can connect their own online storage account.

## 2. Problem Statement

Music apps need accounts, subscriptions and a constant connection. Files people already own
are scattered across devices, and moving them around is manual. Services that do sync files
keep them on someone else's servers, and the user never owns the storage.

## 3. Goal / Vision

A personal media library that:

- opens and plays instantly, with or without a connection;
- needs no sign-in for everyday use;
- keeps the user's files in storage the user owns and controls;
- lets anyone share a library that others can listen to without signing in.

## 4. Target Users

- **The owner**: keeps a personal library of songs and videos and wants it on all devices.
- **Casual listeners**: want to play local files with no setup and no account.
- **Followers**: want to listen to a library someone else has shared, with no sign-in.
- **Non-technical users**: expect a simple guided setup, not developer tools.

## 5. Key Features (MVP)

- Play audio and video files from the device, fully offline.
- Add files to the library, with title, artist and cover picture picked up automatically.
- Playlists, queue, shuffle, repeat, sleep timer and lock-screen controls.
- Install on phone or desktop and use with no connection.
- Optional sign-in to back up the library to the user's own online storage.
- Remove the saved sign-in token from the app at any time, with one action.
- Restore the same library on another device.
- Reuse an existing library in the user's storage instead of creating a new one.
- Large files are split automatically so they fit storage limits, and are joined on playback.
- Follow a public library by its address and play from it without downloading.
- Download a track from a public library as the user's own copy.
- Sync control in settings: send local files to online storage, or bring them back.
- Save playlists online together with the library.

## 6. Out of Scope

- Accounts, payments or storage run by this product.
- Streaming catalogs, recommendations or social features.
- Converting or re-encoding media.
- Editing track tags inside the app.
- Making a user's storage public on their behalf.
- Offline play of a public library without an explicit download.
- Languages other than English.
- A guided "create my library" flow.

## 7. Success Metrics

- A first-time visitor plays a local file within one minute, with no sign-in.
- The installed app starts and plays with no connection.
- A library restored on a second device matches the first (tracks and playlists).
- A file larger than the storage limit uploads, restores and plays correctly.
- Switching songs never shows the previous song's picture.

## 8. Risks and Assumptions

- Online storage providers may limit file size, total size or request rate, and may change terms.
- Sharing copyrighted material in a public library can lead to takedowns. The owner is responsible.
- Sign-in needs a permission grant broad enough to create storage areas. Users must understand the risk.
- Browsers can clear local data on low storage, especially on iPhone. Backup mitigates this.
- Assumes most audio files are under the file size limit and video is the main case for splitting.

## 9. Open Questions

None at this time.

## Decisions from Open Questions

- A followed public library is not kept offline by listening. A track is available offline only when the user downloads it.
- If a shared library's owner removes a track, it disappears from the list the next time the library refreshes. If it still shows from an older view and the file is gone, playing it shows a clear "file not found, unable to play" message.
- The app is English only at launch.
- No guided "create my library" flow in the first release.
