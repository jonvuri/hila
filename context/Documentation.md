---
title: Documentation maintenance
kind: instructions
state: active
updated: 2026-10-01
---

# Documentation maintenance

These rules apply whenever a session changes files under `context/`.

## Roles

- `NOW.md` records only the current outcome, immediate boundary, next action, and minimum reading.
- `README.md` routes readers by task and names each active document's role.
- `Concepts.md` owns concept names and definitions. `Decisions.md` owns rationale.
- Canonical topic documents own detailed current product and architecture contracts.
- `Plan.md` owns future phase order, dependencies, and a compact decision index.
- The current phase plan owns execution scope, ordered session state, and phase acceptance.
- Planned session documents own outcome-level requirements, boundaries, acceptance, verification,
  and handoff. They do not predict detailed implementation checklists far ahead of execution.
- Completed plans, explorations, and visuals are history. They preserve rationale but do not direct
  current work.

## Required session hygiene

When a context document changes:

1. Update every active route that depends on it.
2. Remove or qualify stale active guidance in the touched area.
3. State whether a contract is shipped, designed, or deferred when the distinction matters.
4. Promote durable decisions from a completed plan into `Decisions.md`, and update the ledger and
   the owning topic's contract to match.
5. Keep detailed chronology in phase records. Do not copy it into canonical topics.
6. Restructure a document when lookup or maintenance cost has become material. Do not split only
   because a file is long.
7. Archive inactive plans and evidence outside the active reading path. Preserve their content and
   repair links rather than rewriting history.
8. Leave `NOW.md` shorter than the plan it routes to.

## Concept ledger and decision log

Every concept has exactly one entry in [Concepts.md](Concepts.md), and every name means one thing.

- A session closeout edits the ledger's **Status** and **Code anchors** for concepts it changed.
- When a decision changes or a new one is made, add or edit its entry in
  [Decisions.md](Decisions.md). Never renumber entries; mark a replaced entry superseded.
- A closeout never appends shipped prose to a canonical topic. Shipped chronology belongs in the
  phase record. A topic changes only when its contract changes.
- A new concept gets a ledger entry before canonical documents use its name. A renamed concept keeps
  its old names under "Also called" and in the deprecated-terms table.
- Each invariant in the ledger cites a decision. Rationale is written once, in the decision entry.
- Run `npm run check:concepts` after editing the ledger or moving documents. It verifies code
  anchors, legacy names, and active links.

## Phase-plan lifecycle

A phase begins as one Markdown plan. If it needs separate session plans, convert it to:

```text
phases/Phase-N.md
phases/Phase-N/Session-1.md
```

The phase front door remains thin. It owns scope, dependencies, progress, and links. Planned session
documents own high-level requirements and gates. Add a detailed checklist only when an active
session needs one, and keep it local to that session so later work is not specified before its
inputs settle.

## Verification

For documentation-only changes:

- Format every touched Markdown file with the repository's Prettier configuration.
- Run `git diff --check`.
- Verify links affected by file moves or heading changes with `npm run check:concepts`.
- Confirm `NOW.md` and `README.md` route to the current plan and canonical topics.
