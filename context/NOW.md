---
title: Current state
kind: status
state: active
updated: 2026-10-11
---

# Now

The active work on `docs/full-revamp` is the
[relational runtime exploration](explorations/Relational%20runtime%20exploration.md).
Start with that compact brief. It explores a small relational runtime, a focused standard library,
and an opinionated Hila composition; concrete shapes remain open.

## Boundary and next action

The [worked traces](explorations/Relational%20runtime%20worked%20traces.md) record items 1–5.
Atomic inline owners have optional shared labels and inferred local context. Queues are views;
recognized matrix views can create ordinary standalone rows using matrix defaults, not filter-derived
defaults. Row-to-prose transfers are dropped. Task/matrix deletion clears atoms from live prose.

Lifecycle is provisionally matrix membership plus optional ownership dependencies. Reviews depend
on cards; import receipts only reference imported notes. Object-level LWW and retained content history
support sequential, revision-checked undo. Lifecycle evidence can be retained longer than content.
If required owners cannot validly return, skip restoration, potentially the whole changeset; no
fallback standalone recovery. Physical storage and concrete sync enforcement remain open.

SRS processes independent reviews sequentially in deterministic order. Reset deletes locally known
reviews; unseen reviews arriving later survive. Start with live recomputation and test ten years of
daily due-card reviews against roughly 250–500 ms retrieval-plus-computation time. Local-only caching
is a conditional fallback; no measurements or algorithm selection are complete.

**Next action:** compare the brief's [two small runtime/library sketches](explorations/Relational%20runtime%20exploration.md#larger-exploration-next-investigations):
ordinary feature relations plus shared functions versus a minimal identity/lifecycle substrate with
focused libraries. Use the worked-trace outcomes to compare durable facts, authority, reads,
always-available enforcement, and total complexity.

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
