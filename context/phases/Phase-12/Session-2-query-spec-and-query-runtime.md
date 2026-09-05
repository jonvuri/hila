---
title: Phase 12 Session 2 — Query spec and query runtime
kind: phase-session
state: complete
updated: 2026-09-05
---

# Phase 12 Session 2 — Query spec and query runtime

## Goal

Ship the matched query-spec compiler/recognizer and the execution changes required for safe,
reusable transient queries and bounded saved views.

## Contract freeze

- [x] Update `Query-Spec.md` before implementation with the executable v1 grammar, normalized
      equivalence, invalid states, and shipped leaf subset.
- [x] Define two renderings from one normalized spec: self-contained persistent SQL and an ephemeral
      SQL template with bindings.
- [x] Restrict durable gesture specs to a concrete matrix/type. Keep `everything` and `containers`
      as transient launcher discovery modes.
- [x] Search both label- and content-role fields, with ranking differences left to Session 3.
- [x] Keep semantic `limit`; use deterministic `id` order when no membership-rank field exists.
- [x] Normalize relative dates to closed literal ranges and disable formula columns for predicates
      and order in v1.
- [x] Ship opaque WHERE fragment leaves only. Defer CTE source and computed leaves.

## Current seams

- `src/sql/recognize-updatable.ts`, `useQuery.ts`, and new `src/sql/query-spec/` modules.
- `src/core/sql-types.ts`, `core/client/sql-client*.ts`, and `core/worker/sql-handler.ts`.
- `src/core/block-marker.ts`, `matrix.ts`, and the matrix worker/client messages.
- `src/workspace/QueryBand.tsx`, `window-flatten.ts`, `gather-flatten.ts`, and
  `usePagedWorkspaceData.ts`.

## Plan

- [x] Extract shared single-statement parsing, identifier/literal handling, and AST-span helpers.
      Reject trailing SQL while allowing only the chosen harmless trailing syntax.
- [x] Add normalized spec, catalog, compile, materialize, recognize, and spec-operation modules under
      `src/sql/query-spec/`.
- [x] Resolve stable matrix, column, and node IDs only at compile/recognize boundaries. Fail
      explicitly when catalog identities or values are invalid.
- [x] Recognize chips, chips plus preserved WHERE leaves, or custom SQL with a stated reason. Split
      only top-level `AND` terms and preserve opaque text byte-for-byte.
- [x] Extend SQL client/worker messages with bindings and separate subscription identity from the
      reusable prepared template. Prevent stale async results from replacing a newer query.
- [x] Keep table invalidation correct for bound subscriptions and prove that changing only values
      does not re-prepare the statement shape.
- [x] Enforce read-only single-statement execution for user-authored view queries before exposing
      new custom-SQL chrome. Keep deliberate development SQL mutation on its separate system-edge
      path.
- [x] Wrap stored SQL that already has a semantic limit when paging it. Keep legacy no-limit views
      compatible and prove count/slice semantics at the cap.
- [x] Prove every concrete-matrix compiler output passes `recognizeUpdatableQuery` and retains the
      view ownership firewall.
- [x] Integrate compile → create → reload → recognize and structured edit → update → reload.
- [x] Heal dialect views inside `renameColumn`: recognize against the pre-rename catalog, rename,
      then recompile structured terms against the new catalog in the same transaction. Preserve and
      report stranded opaque leaves.
- [x] Add a two-replica rename-healing case because both column metadata and view SQL replicate.

## Conformance and acceptance

- [x] Use a deterministic seeded generator, or add `fast-check` deliberately, to prove
      `recognize(materialize(compile(spec))) ≡ normalize(spec)` per clause.
- [x] Prove deterministic compilation and semantic canonicalization of recognized SQL.
- [x] Cover quotes, wildcard characters, newlines, Unicode, invalid IDs, and deleted catalog items.
- [x] Exercise scope, text, every predicate operator, ordering, and limit against SQLite fixtures.
- [x] Prove a capped 120-row view folds across pages with stable order, no duplicates, and bounded
      work.
- [x] Keep invalid/custom SQL a valid named place even when it has no gesture representation.

## Verification

- Run focused query-spec, SQL client/worker, updatability, block-marker, QueryBand, gather, window,
  schema-rename, and sync tests.
- Run saved-view and performance E2E outside the sandbox after paging changes.
- Run format, lint, typecheck, unit tests, and `git diff --check`.
