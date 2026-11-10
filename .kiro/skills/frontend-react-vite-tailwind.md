---
name: frontend-react-vite-tailwind
description: Build the offline-first React 19 + TypeScript + Vite + Tailwind v4 PWA with a token theme, tailwind-variants primitives, TanStack Query for remote state and Dexie for local data. Use when creating or extending the web UI.
---

# Frontend — React 19 + Vite + Tailwind v4

## Stack

- React 19 + TypeScript, Vite, Tailwind CSS v4 (`@tailwindcss/vite`)
- `tailwind-variants` + `tailwind-merge` for reusable components
- `@tanstack/react-router` for routing (file routes, already in the app)
- `@tanstack/react-query` for remote state (GitHub index, playlists, public libraries)
- Dexie for local data (songs, files, playlists, outbox)
- `vite-plugin-pwa` (Workbox) for the app shell and offline
- `lucide-react` for icons
- Vitest + Testing Library (unit), Playwright (e2e)
- oxlint + prettier

## Key rules

- **No shadcn, no component library.** Build primitives ourselves.
- **Token theme.** Design tokens are CSS variables exposed with `@theme inline`, so
  `bg-primary` and `text-muted-foreground` work. Light and dark through a `.dark` class on
  `<html>`. Flat design: no gradients or shadows unless they carry meaning.
- **Never hard-code a hue in a component.** Use tokens so every palette works.
- **Reusable components** are plain function components styled with `tv()`. Props come
  from `ComponentProps<"button">` plus `VariantProps`. React 19 passes `ref` as a prop.
- **Do not use tailwind-styled-components.** Unmaintained, unreliable overrides, breaks
  event typing under React 19.
- **Remote state goes through TanStack Query**, never `useEffect` plus `useState`.
- **Local data goes through Dexie**, read with `useLiveQuery`.
- **No global client-state library** until a real need appears.
- **Native `fetch` only** (no axios, no redaxios). Use `XMLHttpRequest` only for upload progress.
- **Config is read once in `src/config.ts`**, which throws on a missing value. Never scatter
  `import.meta.env` or hardcode fallbacks. Secrets never go in `VITE_` values.
- **Pin exact versions** of every dependency (no `^` or `~`).
- Restart the dev server after installing a dependency.
- **Revoke every object URL** you create. Reset state when the source id changes.

## State management

| Kind                         | Home                                |
| ---------------------------- | ----------------------------------- |
| Remote data (GitHub, public) | TanStack Query cache                |
| Local library                | Dexie plus `useLiveQuery`           |
| Location                     | URL and the router                  |
| Form fields, toggles         | Local `useState`                    |
| Player state                 | `PlayerContext` (shared by the UI)  |
| Theme, volume, repeat        | `<html>` class plus `localStorage`  |

## Remote data (TanStack Query)

- One `QueryClient` in `query-client.ts`. Do not retry 4xx errors (except 403 rate limits
  with backoff).
- Query keys come from a factory (`libraryKeys.index(repo)`) so mutations invalidate by prefix.
- Mutations invalidate affected keys in `onSuccess`.
- GitHub reads use `ETag` and `If-None-Match`. A 304 costs no quota.
- Public libraries are read from raw URLs, not the API (no rate limit, CORS, Range).

## Storage and sync

- Every track belongs to a library: device, my GitHub, or an external public repo.
- Components talk to a `StorageProvider` interface, never to GitHub directly.
- Heavy work (split, hash, upload, download) lives in `services/`, not in components.
- Uploads run through a persisted outbox in IndexedDB that survives reloads.
- Split files by raw bytes with a manifest. Upload parts, manifest and index in one commit.

## UI conventions

- Every page that is not home has a **Back button**.
- A finished action shows a distinct success view, not just a toast.
- Surfaces are flat: a card, a border, rounded corners.
- Icons come from `lucide-react`, imported by name and sized with a class. Icon-only
  buttons need an `aria-label`.
- Interactive controls are keyboard reachable and have visible focus.
- Status badges carry meaning through tone (synced green, failed red).

## Tailwind v4 note

Tailwind v4 has no `tailwind.config.js`. Import it in CSS with `@import "tailwindcss";`
and keep theme tokens in CSS. Gradients are `bg-linear-to-r`.

## Theme palettes

Each palette is a small file in `src/themes/` that defines the same tokens for `:root` and
`.dark`: `background`, `foreground`, `card`, `card-foreground`, `primary`,
`primary-foreground`, `muted`, `muted-foreground`, `border`, `destructive`, `success`.
`index.css` imports exactly one. Text and background pairs must meet WCAG AA (4.5:1).

## Reusable component (tailwind-variants)

```tsx
import type { ComponentProps } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const button = tv({
  base: "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
  variants: {
    variant: {
      primary: "bg-primary text-primary-foreground hover:opacity-90",
      outline: "border border-border hover:bg-muted",
    },
  },
  defaultVariants: { variant: "primary" },
});

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof button>;

export function Button({ variant, className, ...props }: ButtonProps) {
  return <button className={button({ variant, className })} {...props} />;
}
```

## Project layout

```text
src/
├── main.tsx, App.tsx, AppRouter.tsx
├── config.ts            # the only reader of import.meta.env
├── index.css, themes/
├── query-client.ts
├── components/          # feature components
│   └── ui/              # tailwind-variants primitives
├── context/             # player, playlists, settings
├── hooks/
├── queries/             # TanStack Query hooks and key factories
├── routes/              # file routes
├── services/            # db, files, storage providers, sync, outbox
└── types/
```

## Verifying the UI

Run a real browser, not only the type-checker. Use `playwright-core` with the installed
Chrome. Keep throwaway test projects outside the repo. Read the screenshots; layout flaws
never fail an assertion.
