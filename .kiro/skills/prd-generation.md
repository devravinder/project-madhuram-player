---
name: prd-generation
description: Generate a concise, tech-free Product Requirements Document with a fixed 9-section structure. Use when starting a new product or feature and a PRD is needed.
---

# PRD Generation

Produce a Product Requirements Document that is concise, plain-language, and **free of
technical detail, architecture, or tech stack**.

## Process

1. Ask clarifying questions **one at a time** before writing. Wait for each answer.
2. Once clarified, generate the full PRD.
3. Save as `docs/PRD.md`.
4. Keep tech/architecture out — that belongs in a separate architecture doc.
5. The output is Markdown — follow the `markdown-lint` skill so it passes markdownlint.

## Exact section structure (do not deviate)

1. Overview
2. Problem Statement
3. Goal / Vision
4. Target Users
5. Key Features (MVP) — short list, one line each
6. Out of Scope
7. Success Metrics
8. Risks and Assumptions
9. Open Questions

## Rules

- No technical details, architecture, or tech stack.
- No detailed requirements, user stories, or acceptance criteria.
- Do not invent features not in the input — unknowns go under **Open Questions**.
- Concise: one or two pages. Plain language, no marketing fluff.

## Input template (brainstorming summary)

```text
PRODUCT_NAME: <name>
What we are building: <1-2 sentences>
Vision / goal: <core outcome>
Problem: <what is broken + why existing options fail>
Target users: <list, who + what they want>
MVP scope: <feature list>
Out of scope: <list>
Success signal: <single behavior that proves it works>
```
