# Madhuram Player

Only music, no ads. A music and video player that runs in your browser and can be
installed like an app. It works offline, with no account and no server.

## How it works

- Your songs and videos are saved inside the browser on your device, so they play offline.
- For backup, the app uses your own GitHub account as storage: it keeps your songs in
  private repositories that only you can see. Nothing goes to anyone else.
- Anyone can share music by putting it in a public repository; others can play it by name.

## How to use

1. Without sign-in: tap "Try without login", then Import songs or videos. They stay on this
   device and play offline. Explore lets you play public libraries by `owner/repo`.
2. With sign-in: paste a GitHub token with repo access. In Settings, GitHub backup:
   - Nothing uploads by itself. Open "Not backed up" to upload one song or all of them
     to your private `project-music-files` repo, leaving out large files if you like.
   - Sync brings in songs from your other devices; Download brings back removed ones.
   - Big files are split into parts; a full repo continues in `project-music-files-1`, `-2`.
   - Playlists and followed libraries sync by themselves. Removing the token keeps your music.

## For developers

- [How to run](docs/HOW-TO-RUN.md)
- [Product requirements](docs/PRD.md)
- [Architecture](docs/architecture.md)
- [Decisions](docs/DECISIONS.md)
- [Tasks](docs/TASKS.md)

Notes for hosting on a custom domain:

- In PWA options `navigateFallback: null` is important.
- `basepath="/"` is important in the router (`RouterProvider`), so GitHub Pages
  looks in the repo folder, not the GitHub root folder.
- GitHub Pages may ignore underscore files (for example `/assets/_DH_0222.js`).
  To fix, add a `.nojekyll` file in `public`.
- `gh-pages` may ignore dotfiles (`.nojekyll`), so use the `--dotfiles` option.
