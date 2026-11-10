# How to Run

## Prerequisites

- Node.js 22 or newer
- pnpm 12

## Install

```bash
pnpm install
```

This also enables the git hooks (Husky). Run it once per clone.

## Develop

```bash
pnpm dev
```

The first page asks for a GitHub token. Choose "Try without login" to use the app on this device only. Settings such as the library repo name and size limits
come from `.env.development`. Override locally in a git-ignored `.env.local`.

## Check

```bash
pnpm lint        # oxlint
pnpm test        # Vitest (unit; real network is blocked)
pnpm test:e2e    # Playwright in the installed Chrome, against a fake GitHub
pnpm lint:md     # markdownlint
pnpm build       # type-check and production build
```

## Deploy

The deploy domain is read from a git-ignored file, so it never lands in the repo.

```bash
cp deploy.local.sample deploy.local   # then set DEPLOY_CNAME
pnpm deploy
```

`DEPLOY_CNAME` can also come from the environment. The script builds the app and
publishes `dist` to the `deploy` branch with that domain as the CNAME.
