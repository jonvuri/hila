---
title: Documentation maintenance
kind: instructions
state: active
updated: 2026-08-29
---

# Documentation maintenance

These rules apply whenever a session changes files under `context/`.

## Roles

- `NOW.md` records only the current outcome, immediate boundary, next action, and minimum reading.
- `README.md` routes readers by task and names each active document's role.
- Canonical topic documents own current product and architecture contracts.
- `Plan.md` owns future phase order, dependencies, and a compact decision index.
- The current phase plan owns execution scope, ordered checklists, and acceptance criteria.
- Completed plans, explorations, and visuals are history. They preserve rationale but do not direct
  current work.

## Required session hygiene

When a context document changes:

1. Update every active route that depends on it.
2. Remove or qualify stale active guidance in the touched area.
3. State whether a contract is shipped, designed, or deferred when the distinction matters.
4. Promote durable decisions from a completed plan into the canonical topic that owns them.
5. Keep detailed chronology in phase records. Do not copy it into canonical topics.
6. Restructure a document when lookup or maintenance cost has become material. Do not split only
   because a file is long.
7. Archive inactive plans and evidence outside the active reading path. Preserve their content and
   repair links rather than rewriting history.
8. Leave `NOW.md` shorter than the plan it routes to.

## Phase-plan lifecycle

A phase begins as one Markdown plan. If it needs separate session plans, convert it to:

```text
phases/Phase-N.md
phases/Phase-N/Session-1.md
```

The phase front door remains thin. It owns scope, dependencies, progress, and links. Session plans
own detailed execution checklists.

## Verification

For documentation-only changes:

- Format every touched Markdown file with the repository's Prettier configuration.
- Run `git diff --check`.
- Verify links affected by file moves or heading changes.
- Confirm `NOW.md` and `README.md` route to the current plan and canonical topics.
