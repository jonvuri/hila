# Phase 9.7c — Session: reconcile the model into the canonical docs

> Focused session doc. Goal: fold the [Phase 9.7](Phase-9.7.md) convergence — plus whatever
> [9.7a](Phase-9.7a-deep-portals.md) / [9.7b](Phase-9.7b-windowing.md) validated — back into
> the foundational docs so the whole set is internally coherent (the gestalt-awareness
> principle). Run **last**, so it encodes spike-validated reality, not aspiration.

## Start prompt

> We're reconciling the Phase 9.7 convergence into the canonical architecture docs. Read
> [Phase-9.7.md](Phase-9.7.md) in full (esp. §11 "docs to reconcile") and the outcomes of
> [Phase-9.7a.md](Phase-9.7a-deep-portals.md) and [Phase-9.7b.md](Phase-9.7b-windowing.md).
> Then, for each target doc below, read the affected sections and make the edits so the
> model is stated once, consistently, everywhere — updating code references as needed. This
> is a documentation-coherence pass, not new design: where a spike changed a detail, encode
> the validated version; where something is still open, leave a crisp forward note rather
> than inventing. Keep the docs' existing voice and structure. Run the doc set through a
> final read to confirm no contradictions remain.

## The reconciliation checklist (from Phase-9.7.md §11)

- [ ] **[Architecture.md](Architecture.md)**
  - *Hydration* — per-cell editability is now uniform across the mesh (no per-band scope);
    the §9.6 host-matrix sharp edge is dissolved.
  - *Inline references* — add the **portal** cell to the ref family (non-owning, structural,
    plural position); deep-mirror rendering; portals reuse the live/empty/ghost states.
  - *Identity face* — it is the **container** border, generalized (border = membership +
    matrix-axis; not a "view").
- [ ] **[Traits.md — Join](Traits.md#join)** — introduce **portal** (non-owning, structural,
  multi-position) alongside `own` / `ref`; state the axis split: **ownership single
  (lifecycle), position plural (portals)**; anchoring note updated to place the portal.
- [ ] **[Phase-8c.md](Phase-8c.md)** — clarify **owner = where created** as the *kept*
  default (not the source-matrix); the **container-not-view** reading of a type-node's
  extent; the promotion taxonomy (§6) restated as named ops (move-owner, make-a-container,
  wrap-a-set, re-home).
- [ ] **[Phase-9.2.md](Phase-9.2.md) / [Phase-9.3.md](Phase-9.3.md)** — `band` →
  `(loose | container | view)` child-sourcing mode; the **`bands` table is removed**;
  **fold/merge retired**; the renderer unified at **substrate** fidelity; count+slice
  windowing replaces per-band mounts.
- [ ] **[Phase-9.md §9.7](Phase-9.md#97-paradigm-convergence-forward-note)** — already points
  to this deep-dive; mark the convergence explored and the spikes' outcomes linked.
- [ ] **[Plan.md](Plan.md)** — check open questions touched (face affinity #5, create-vs-link
  #3) still read correctly under the converged model.

## Guardrails

- **State the model once.** Prefer a single authoritative definition (Phase-9.7.md) that the
  others reference, over re-explaining it in each doc.
- **Don't relitigate.** Settled decisions (owner-where-created, container, portal family,
  two-tier delete, single-owner/plural-position) are inputs, not open questions.
- **Forward notes for the still-open.** Anything a spike left genuinely open stays a labeled
  forward note.

## Deliverables

- Edited canonical docs, mutually consistent; a short changelog of what moved where; a final
  contradiction check across the `context/` set.
