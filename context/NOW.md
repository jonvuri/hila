---
title: Current state
kind: status
state: active
updated: 2026-10-08
---

# Now

The active work is the full revamp exploration on `docs/full-revamp`. Start with the
[exploration guide](explorations/Revamp%20exploration%20guide.md), then follow its reading map and current
checkpoint. Session history lives in the separate
[session record](explorations/Revamp%20session%20record.md).

## Boundary and next action

Continue scenario-led exploration, one connected question cluster at a time. Keep proposals and
research in `context/explorations/`; inspect existing code for evidence and reusable parts. The
proposal overrides the baseline where explicit; compatible unspecified fundamentals provisionally
carry forward. Implementation and canonical architecture revision come later.

Session 2 is complete: [plugin semantics and storage](explorations/Revamp%20plugin%20semantics%20and%20storage.md).
The exploration now has an accepted application/store model: explicit bindings, user-managed versus
plugin-managed data, ordinary helper homes, scoped write authority, full managed-data cleanup,
durable events, recomputed schedules, and fresh application identities after removal.

Next: [Session 3 — attachment context and editor/query behavior](explorations/Revamp%20research%20questions.md#next-session-attachment-context-and-editorquery-behavior).
Start with two inline tasks in one note, then nested attachments and moving/copying/removing sigils.
Resolve task/host identities, context, edit targets, and project-scoped query results. Keep the
accepted plugin model as the starting point; core recovery/replication enforcement and presentation
remain separate follow-throughs. No implementation or canonical-contract revision is authorized.

At wrap-up, queue the next session and request explicit approval before committing. Export each
approved commit as a separate patch for the user to apply later; this task cannot push to GitHub.
Stay on `docs/full-revamp` through the lightweight exploration.

## Historical implementation marker

[Phase 13](phases/Phase-13.md) completed Sessions 1–5 and 5A; its next planned work was
[Session 5B](phases/Phase-13/Session-5b-workspace-host-decision-revisit.md), with Session 6 paused.
Keep this as the reference point when revising the eventual implementation plan, not an instruction
to resume that sequence.
