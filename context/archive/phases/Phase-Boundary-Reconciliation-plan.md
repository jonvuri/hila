# Phase boundary reconciliation — planning brief

This fresh planning session closes Phase 10 at its original design-hardening boundary. It then
reviews the active context corpus, implementation, and roadmap as one system. The session produces
a clear source of truth and a new execution plan. It does not implement the launcher or other
product features.

Use [NOW.md](../../NOW.md) as the entry point. Read this brief before loading wider context.

## Why this session exists

Phase 10 began as a planning-first pass for app structure, design decisions, tokens, themes, and an
incremental migration sequence. It now contains implementation work that exceeds that charter.
The proposed launcher migration exposed the problem: no production launcher exists, so that work
would build a substantial shell feature instead of only migrating an approved surface.

Phase 10 can close without launcher implementation. Its central design outcomes are committed, the
approved workspace shell is live, and the retired overlaid-card implementation is removed. The
closeout must state honestly which approved contracts are shipped and which remain designed but
unimplemented.

## Session objectives

Work through these objectives as one planning and reconciliation effort:

1. **Close Phase 10 at its original boundary.** Reconfirm the charter. Record a clear
   designed/shipped/deferred matrix. Re-home incomplete implementation work instead of reporting
   full live-design conformance.
2. **Review the active context corpus.** Read all currently relevant design, architecture,
   requirements, and plan documents that contain committed but incomplete work.
3. **Reconcile the documents.** Find inconsistencies, duplication, stale statements, missing
   decisions, and unclear ownership. Consolidate or split documents when that improves authority
   and lookup cost.
4. **Create an efficient context structure.** Keep small hub documents that route agents to
   focused topic documents. Do not make every session load detailed material that it does not
   need.
5. **Archive inactive material.** Archive completed phase plans and context documents that are no
   longer needed for current planning. Preserve useful history and keep active routing concise.
6. **Review the implementation holistically.** Compare the current codebase with active design,
   architecture, requirements, and plans in both directions. Add unrecorded implementation gaps to
   the plan. Promote implementation facts that should change or refine the documented model.
7. **Rebuild the roadmap.** Reorder, resize, split, merge, or insert phases as the evidence
   requires. Do not preserve the current Phase 11 ordering only because it already exists.
8. **Establish the phase-plan structure.** Start each phase as one Markdown plan. When it needs
   session plans, convert it to a thin front-door document plus a same-named folder of focused
   session plans. The front door records phase scope, dependencies, progress, and links.
9. **Add durable documentation-hygiene instructions.** Create general instructions and link them
   from `NOW.md`. Require sessions that change context documents to keep routing accurate, remove
   stale active guidance, and restructure documents when their lookup or maintenance cost grows.
10. **Produce a fresh handoff.** Leave `NOW.md` short. Link only the new active roadmap, the next
    phase or session plan, and the minimum required reading.

## Review method

- Start with an authority map. Identify which documents own current product, architecture, design,
  requirements, roadmap, execution state, and history.
- Use focused subagents when an independent audit needs heavy context loading. Good boundaries
  include the design corpus, architecture and requirements, roadmap and phase plans, and current
  implementation. Give each subagent a narrow evidence format. The primary agent must reconcile
  their findings and make the final cross-cutting decisions.
- Review code and documents before renaming phases or moving files. Let evidence determine the new
  structure.
- Preserve historical rationale without leaving completed plans in the active reading path.
- Keep changes documentation-only unless a small diagnostic script is necessary for the audit.

## Launcher and overlay work is tabled

Do not begin launcher implementation during this session. Reconsider it only after the full review
sets the new roadmap.

The review must retain these findings as inputs:

- The launcher is designed in [Launcher.md](../../Launcher.md), but no production launcher exists.
  Calling the next step a migration hides command-registry, query compiler, search, navigation,
  persistence, editor-handoff, and session-memory work.
- The recommended shared-overlay boundary is the launcher and `/` gesture menus on one canonical
  overlay contract. Table dialogs, tag panels, face configuration, and the dev-tools drawer should
  remain with their later surface migrations unless the holistic review finds a stronger boundary.
- Saved launcher searches require named, focusable `view` nodes. The current view-block marker is
  unnamed, excluded from normal navigation, and rendered only as inline query content. The
  recommended direction is to complete that marker's place contract without creating a second SQL
  storage model. Full view-block chip authoring can remain separate.
- The launcher must land before the temporary Table and Tags tabs are removed. This dependency does
  not require either task to remain inside Phase 10.

Treat these points as reviewed recommendations, not as permission to implement them or as a fixed
phase assignment.

## Required outputs

- An honest Phase 10 closeout.
- A reconciled active documentation set with clear authority and efficient reading routes.
- An archive boundary for inactive plans and context.
- A code-versus-context gap register with dispositions.
- A reordered and re-scoped roadmap.
- The new phase and session plan structure.
- Documentation-hygiene instructions linked from `NOW.md`.
- A concise next-session handoff.

## Current-session boundary

The session that created this brief did not perform the review, move or archive documents, change
the roadmap, or plan the launcher implementation. Start those tasks only in the next fresh
planning session.
