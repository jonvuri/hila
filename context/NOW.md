---
title: Current state
kind: status
state: active
updated: 2026-10-15
---

# Now

Active work on `docs/full-revamp` is the [relational runtime exploration](explorations/Relational%20runtime%20exploration.md).
Tasks/SRS have starting policies; runtime sketches and outlining now have recorded provisional outcomes.
No implementation, benchmark, migration, or canonical architecture revision has been performed.

## Current checkpoint

- [Task/SRS traces](explorations/Relational%20runtime%20worked%20traces.md): atomic owners, shared labels,
  view semantics, standalone rows, lifecycle/LWW/history/undo, sequential reviews and simple reset.
- [Runtime sketches](explorations/Relational%20runtime%20sketches.md): a narrow shared feature lifecycle
  layer is the leading direction. Known atom retirement survives target restoration; unknown offline
  atoms may become valid after same-identity restoration, regardless of arrival order.
- [Outline traces](explorations/Relational%20outline%20exploration.md): shared records across notes,
  outlines, and tables; ordered placement separate from lifetime; mirrors share children; lower-half
  split identity; guarded merges; gesture-specific subtree deletion; Unplaced discovery candidate.
  Latest preference is to exclude placement cycles. Concurrent-move enforcement is not settled.

## Next action

Pause for the user to select the next investigation after reviewing the
[older-concept evidence and candidate traces](explorations/Relational%20concept%20review.md).
Recommended candidates: placement integrity/Unplaced, then a mixed project across notes/outline/table
covering matrix and view places, field bindings, insertion defaults, and mixed-schema children.
Query/cache feasibility follows concrete query shapes. This is a recommendation, not an adopted plan.

## Boundary

The brief governs. Older revamp decisions and baseline invariants are references, not inherited
constraints. Keep proposals under `context/explorations/` and preserve rough user-facing goals.
Stay on `docs/full-revamp`; prepare changes for review and do not commit without instruction.

The older revamp guide's queued Session 3 does not direct this exploration. Historical implementation
marker: [Phase 13](phases/Phase-13.md) completed Sessions 1–5 and 5A; Session 5B was next with Session 6
paused. It remains a reference for eventual implementation planning, not an instruction to resume.
