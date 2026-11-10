# Madhuram Player

Only music, no ads. An offline-first music and video player that runs in the browser.
It works with no sign-in, and can back up to your own GitHub repositories.

- [Product requirements](docs/PRD.md)
- [Architecture](docs/architecture.md)
- [Decisions](docs/DECISIONS.md)
- [Tasks](docs/TASKS.md)
- [How to run](docs/HOW-TO-RUN.md)

## Notes for custom domains

- In PWA options `navigateFallback: null` is important.
- `basepath="/"` is important in the router (`RouterProvider`), so GitHub Pages
  looks in the repo folder, not the GitHub root folder.
- GitHub Pages may ignore underscore files (for example `/assets/_DH_0222.js`).
  To fix, add a `.nojekyll` file in `public`.
- `gh-pages` may ignore dotfiles (`.nojekyll`), so use the `--dotfiles` option.
