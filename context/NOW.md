---
title: Current state
kind: status
state: active
updated: 2026-10-09
---

# Now

The active work on `docs/full-revamp` is the
[relational runtime exploration](explorations/Relational%20runtime%20exploration.md).
Start with that compact brief. It explores a small relational runtime, a focused standard library,
and an opinionated Hila composition; concrete shapes remain open.

## Boundary and next action

The [worked traces](explorations/Relational%20runtime%20worked%20traces.md) compare three storage
models. Inline-created tasks depend on owning inline units: copying creates a co-owner of the same
task, deleting the last owner deletes it, and cut-and-paste preserves it at the new location.
Co-ownership is the agreed copy behavior. Card reviews share their cards' lifecycle; import receipts
may outlive imported notes. No storage model or runtime architecture is selected.

Paused for a WIP checkpoint. Next session: read the brief, then the worked traces and their
[ordered investigations](explorations/Relational%20runtime%20worked%20traces.md#next-investigations-in-order).

- **Worked traces first:** compare token, atomic range, and shared-fragment ownership; separate
  shared task content from local prose. Trace copy/cut/delete/undo and concurrent owner changes.
  Then examine task query scope, non-inline creation, lifecycle reuse, and concrete SRS scheduling.
- **Larger exploration:** use those results for two competing small runtime/library sketches.
  Test what belongs in ordinary relations, shared storage enforcement, or reusable behavior, and
  whether one ownership rule can serve the examples without importing the old edge architecture.
  The brief's [next investigations](explorations/Relational%20runtime%20exploration.md#larger-exploration-next-investigations)
  name the questions and expected outputs.

The brief governs this exploration. Prior revamp decisions and baseline invariants are references,
not inherited constraints. Preserve the rough user-facing goals while seeking simplicity,
elegance, and coherence. Keep proposals in `context/explorations/`; implementation and canonical
architecture revision come later.

The [older revamp guide](explorations/Revamp%20exploration%20guide.md) retains its prior checkpoint
and session history. Its queued Session 3 and architectural inheritance rule do not direct this
new exploration.

At wrap-up, queue the next session and prepare changes for the user to commit. Do not commit on
the user's behalf. Stay on `docs/full-revamp` through the lightweight exploration.

## Historical implementation marker

[Phase 13](phases/Phase-13.md) completed Sessions 1–5 and 5A; its next planned work was
[Session 5B](phases/Phase-13/Session-5b-workspace-host-decision-revisit.md), with Session 6 paused.
Keep this as the reference point when revising the eventual implementation plan, not an instruction
to resume that sequence.
