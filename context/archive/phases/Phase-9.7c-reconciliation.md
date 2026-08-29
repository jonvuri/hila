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

- [x] **[Architecture.md](../../Architecture.md)**
  - _Hydration_ — per-cell editability is now uniform across the mesh (no per-band scope);
    the §9.6 host-matrix sharp edge is dissolved.
  - _Inline references_ — add the **portal** cell to the ref family (non-owning, structural,
    plural position); deep-mirror rendering; portals reuse the live/empty/ghost states.
  - _Identity face_ — it is the **container** border, generalized (border = membership +
    matrix-axis; not a "view").
- [x] **[Traits.md — Join](../superseded-topics/Traits-pre-reconciliation.md#join)** — introduce **portal** (non-owning, structural,
      multi-position) alongside `own` / `ref`; state the axis split: **ownership single
      (lifecycle), position plural (portals)**; anchoring note updated to place the portal.
- [x] **[Phase-8c.md](Phase-8c.md)** — clarify **owner = where created** as the _kept_
      default (not the source-matrix); the **container-not-view** reading of a type-node's
      extent; the promotion taxonomy (§6) restated as named ops (move-owner, make-a-container,
      wrap-a-set, re-home).
- [x] **[Phase-9.2.md](Phase-9.2.md) / [Phase-9.3.md](Phase-9.3.md)** — `band` →
      `(loose | container | view)` child-sourcing mode; the **`bands` table is removed**;
      **fold/merge retired**; the renderer unified at **substrate** fidelity; count+slice
      windowing replaces per-band mounts.
- [x] **[Phase-9.md §9.7](Phase-9.md#97-paradigm-convergence-forward-note)** — already points
      to this deep-dive; mark the convergence explored and the spikes' outcomes linked.
- [x] **[Plan.md](../../Plan.md)** — check open questions touched (face affinity #5, create-vs-link
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

## Changelog (what moved where)

- **[Traits.md — Join](../superseded-topics/Traits-pre-reconciliation.md#join):** added the **`portal`** kind (non-owning,
  structural, deep, multi-position) to _Join kinds_; added the **"ownership single / position
  plural"** paragraph (single-owner via the partial `WHERE kind='own'` index; move-owner is
  the only owner transfer); extended _Lifecycle rules_ with the portal detach / home-delete →
  ghost behavior; extended the _Anchoring_ note to place `ref`/`portal` as one non-owning
  family split by anchoring (the ownership × anchoring square).
- **[Architecture.md](../../Architecture.md):** _Hydration_ — added the "editability is per-cell,
  computed uniformly" note (the §9.6 host-matrix sharp edge cannot recur). _Inline references_
  — added the **"Portals: the structural member of the ref family"** subsection (deep
  transclusion, reused live/empty/ghost with the `is_ghost`-tombstone divergence, `joins`
  `kind='portal'` storage). _Identity face_ — added the **container-border-generalized**
  reading (container ≠ view ≠ mesh). _Composed/substrate fidelity_ — noted `band` → three
  child-sourcing modes, substrate-first for v1.
- **[Phase-8c.md](Phase-8c.md):** §5 — added the convergence note (owner-where-created
  **kept**, not the source-matrix; container-not-view; move-owner). §6 — added a **9.7 named
  op** column to the promotion taxonomy (move-owner / make-a-container / wrap-a-set /
  re-home).
- **[Phase-9.2.md](Phase-9.2.md):** top-of-doc status pointer; _Bands_ and _Fold / merge_
  section superseding notes; _Open sub-questions_ fold/merge entry marked closed-as-retired.
- **[Phase-9.3.md](Phase-9.3.md):** top-of-doc status pointer; _The bands table_ removal
  note (view SQL rides a block marker; count+slice windowing); two now-moot _Open questions_
  (bands sync, aspect-band-into-bands-table) struck through with the 9.7 resolution.
- **[Phase-9.md §9.7](Phase-9.md#97-paradigm-convergence-forward-note):** forward-note
  blockquote updated — both spikes complete (GO/GO), `ScrollVirtualizer` fix noted, 9.7c
  named as the remaining step before the build.
- **[Plan.md](../../Plan.md):** open questions #3 (create-vs-link) and #5 (face affinity) each
  gained a one-line confirmation that they still read correctly under the converged model.

## Final contradiction check

Swept the set for stale claims that would fight the converged model:

- No doc still describes the join table as having only two kinds, or `own` single-ownership
  without the position-plural axis. ✅
- Every surviving `bands`-table mention sits under a superseding/removal note or is struck
  through (Phase-9.2 §Bands, Phase-9.3 §The bands table + Open questions). ✅
- The three former bands (aspect / query / sub-table) appear as live surfaces only inside the
  Phase-9.x lineage docs, each now flagged as superseded; the canonical docs (Architecture /
  Traits / Plan) carry the converged `loose`/`container`/`view` framing. ✅
- All cross-doc section anchors introduced in this pass resolve to real headings. ✅
- The §9.6 host-matrix sharp edge is described as _dissolved_ in Architecture (Hydration) and
  still pointed at §9.7 as its resolution in Phase-9.md — consistent, not contradictory. ✅

**Not rewritten (intentional):** the Phase-9.x deep-dive bodies remain as design lineage
under their superseding notes — per the "state the model once" guardrail, [Phase-9.7.md](Phase-9.7.md)
is the single authoritative statement and the others reference it rather than re-explaining it.
