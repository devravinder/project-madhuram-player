---
name: doc-with-mermaid
description: Author documentation in Markdown and use Mermaid diagrams for all architecture and design visuals. Use when writing architecture, design, or flow docs.
---

# Documentation with Mermaid

## Rule

All documentation is **Markdown**. For **architecture and design** visuals, use **Mermaid**
diagrams embedded in the Markdown (not ASCII art, not external image files).

**Always follow the `markdown-lint` skill** when writing or editing any Markdown — every
`.md` file must pass markdownlint rules (notably MD040: every code fence declares a
language; use `mermaid` for diagrams).

## When to use which diagram

| Need                                       | Mermaid diagram            |
| ------------------------------------------ | -------------------------- |
| Component architecture           | `flowchart` or `graph`     |
| Request / message flow over time           | `sequenceDiagram`          |
| Data model / entities                      | `erDiagram`                |
| state of a resource (e.g. upload lifecycle) | `stateDiagram-v2`          |
| Hosting and environments            | `flowchart` with subgraphs |
| Phases / milestones                        | `gantt` or `timeline`      |

## Conventions

- One diagram per concept; keep it readable over exhaustive.
- Use `subgraph` to group by library, repo, or environment.
- Label edges with the action/event (`push blob`, `index updated`).
- Keep node names short; explain detail in prose below the diagram.
- Always pair a diagram with a sentence or two of prose context.

## Examples

### Architecture (flowchart)

```mermaid
flowchart LR
  UI[PWA player] --> DB[(IndexedDB)]
  UI -->|stream| PUB[Public repo]
  UI -->|token| API[GitHub API]
  API --> R1[(library repo)]
  API --> R2[(library repo 1)]
```

### Flow (sequenceDiagram)

```mermaid
sequenceDiagram
  participant U as App
  participant G as GitHub API
  U->>G: create blobs (parts)
  U->>G: create tree and commit
  U->>G: update branch ref
  G-->>U: 200 (or 409 on conflict)
  U->>G: refetch index and retry
```

### Upload lifecycle (stateDiagram)

```mermaid
stateDiagram-v2
  [*] --> Queued
  Queued --> Uploading: online
  Uploading --> Synced: commit ok
  Uploading --> Queued: network error
  Uploading --> Failed: permanent error
  Failed --> Queued: retry
  Synced --> [*]
```

### Data model (erDiagram)

```mermaid
erDiagram
  LIBRARY ||--o{ TRACK : holds
  TRACK ||--o{ PART : "split into"
  TRACK {
    string id
    string title
    string kind
  }
  PART {
    int n
    string repo
    string path
  }
```
