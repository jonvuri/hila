---
title: Phase 13 Session 5B — Workspace host decision revisit
kind: phase-session
state: planned
updated: 2026-09-30
---

# Phase 13 Session 5B — Workspace host decision revisit

## Goal

Settle how workspace rows and folded blocks participate in the host runtime, using the vocabulary
and ledger from Session 5A, and rewrite the Session 6 plan to match.

## Depends on

Session 5A must be complete. Read `Concepts.md`, `Decisions.md`, and the shrunk `Architecture.md`
before anything below.

## How we got here

Session 6 execution began on 2026-09-28. The executing agent stopped before implementing because
the plan admits two readings:

- **Option A.** The workspace host keeps the row, its ProseMirror editors, and the flattened
  virtualizer as permanent scaffold. The row hands only its structured-field region to a slot that
  requests `line`. `hila.workspace` registers no interior, so the request lands on the fallback.
- **Option B.** A registered interior may replace the whole row interior or the whole folded block,
  including the editor surface.

The agent recommended A. An independent review on 2026-09-29 agreed with A but found that the plan
wording and the runtime contract disagree, and that the vocabulary made the disagreement hard to
see. The user paused Session 6 for a documentation cleanup (Session 5A) and this revisit.

## Preliminary assessment (input, not decision)

Terms below use the pre-5A vocabulary. Translate through the deprecated-terms table in
`Concepts.md`. Verify each claim against current code before relying on it.

1. **The slot is a replaceable interior by construction.** `FaceHostSlot` renders its interior as
   `Show when={rendering} fallback={substrate}`. A recipe change unmounts and remounts whatever is
   inside. The editor-churn contract in `Performance.md` and the exact mount counts in
   `e2e/performance-contract.spec.ts` forbid that for ProseMirror. This makes Option B
   unimplementable without a new preservation API that the growth rules defer. The invariant is
   implicit in code and stated nowhere. It should become a ledger invariant with a decision entry.
2. **Option A is not nominal for the row.** Sessions 4 and 5 already fixed `line` to mean one row's
   structured fields: `TableLine` is `PropertyLine`, and `SubstrateRegion` requests `line` for
   aspect rows with the aspect matrix's recipe. The stream row already has a de facto line region,
   `OutlineCellStrip`, for meshed cross-matrix rows. Replacing that strip with a slot resolved
   against the row's own matrix is a real dispatch. Plain workspace rows must render nothing there,
   because label and content are host scaffold.
3. **The collection leg of Option A was misdescribed.** The executing agent stated that the
   marker's recipe decides collection affinity, so a workspace marker lands on substrate. Shipped
   Session 5 resolves container affinity from the extent matrix (`focus-subject.ts`). A folded
   shared-container block whose extent has a table recipe would therefore resolve to the table
   collection, which is exactly the nested-paging conflict listed as a cost of B. In the stream
   there is no block region at all: folded results are rows in the outer flattened sequence with
   `is_block_row` set. The "expanded block requests `line` plus `collection`" row in the Plugins
   host table describes the focus-panel case Session 5 shipped, not the stream fold.
4. **The workspace recipe is a settings carrier, not a face choice.** `hila.workspace` declares a
   face type with label and content slots and registers no interior. It exists to carry
   `navigationOutline`, which the host consumes for Guides chrome. Session 8 intends recipes to
   carry validated component settings, so this is a deliberate extension of "recipes own rendering
   choices", but it is written nowhere. Either record that a recipe may carry host-consumed
   component settings, or drop the workspace recipe lookup.
5. **Two row ontologies exist and should stay separate.** The stream row is position-keyed,
   virtualized, and owns the editor. The slot row is a `(matrixId, rowId)` subject with no position
   and no editor. Option A is correct because the stream row contains slots for its field regions
   rather than becoming one. The phrase "row slot requests `line`" invites the conflation.
6. **Implementation caution.** Aspect lines resolve a recipe per slot. With 200 to 400 mounted
   stream rows, the host should resolve affinity once per matrix and pass it down.

The reviewer's recommendation was Option A with amendments: record the slot invariant, rewrite the
collection leg so the stream fold does not request `collection`, name what the workspace recipe is,
and resolve affinity per matrix. This session decides; the list above is evidence.

## Requirements

- Re-derive the Session 6 question from the ledger. State the decision in ledger vocabulary and
  check that each cited invariant exists as a ledger entry with a decision.
- Verify or refute each numbered point above against current code and tests.
- Decide the row participation model, the folded-block participation model, and the nature of the
  workspace recipe. Record each as a decision entry with rationale.
- Rewrite the Session 6 plan so its requirements, boundaries, and acceptance match the decisions
  and use no term that means two things.
- Correct the host-presentation table in `Plugins.md` and any ledger entry the decisions change.
- Confirm Sessions 7 through 9 remain consistent with the decisions, and note required edits.

## Boundaries

- Change no code. This session produces decisions and plans only.
- Do not begin Session 6 implementation.
- Do not reopen decisions the ledger already records unless a numbered point above shows the
  record and the code disagree.
- Do not add a general region or editor-injection API to the plan without a second real consumer.

## Acceptance

- One recorded decision each for row participation, folded-block participation, and the workspace
  recipe, with rationale and the concepts each constrains.
- The Session 6 plan is executable without interpretation and cites those decisions.
- No plan or canonical document describes the stream fold as requesting a `collection` unless the
  decision says it does.
- `Plugins.md`, `Concepts.md`, and `Decisions.md` agree with each other and with the code.

## Verification

- Read the cited code paths and tests for each numbered point and record the result in this
  document.
- Format touched Markdown, run `git diff --check`, and verify links.
- Run the Session 5A anchor and alias check.

## Handoff

Session 6 executes the rewritten plan. Update `NOW.md` to route there.
