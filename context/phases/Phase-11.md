---
title: Phase 11 — Durable data and place contracts
kind: phase-plan
state: in-progress
updated: 2026-09-03
---

# Phase 11 — Durable data and place contracts

Phase 11 repairs and locks the durability boundary before the launcher creates saved views. It also
introduces the first runtime slice of the approved subject/recipe/host face model so a view can be
a normal place.

This phase does not build the launcher, retire tabs, complete the global design migration, or add
live remote transport.

## Outcomes

- Every current table and column has an explicit replication classification.
- All user-authored and user-visible durable data round-trips between two replicas.
- Future schema additions fail tests if they omit a replication classification.
- The existing view marker becomes named, focusable, and navigable without a second SQL store.
- Query ownership leaves `FaceConfig` and moves to the subject.
- A minimal host-owned `line`/`collection` path renders the focusable view.
- The migration/reset policy has a clear durability milestone.
- Sync, virtualization, data-model, plugin, and performance documents match shipped truth.
- Exact editor-churn and throttled-browser performance coverage is restored.

## Fixed decisions

- `block_sources` remains the sole stored SQL for view subjects.
- User-authored and user-visible durable data should replicate unless a reviewed exception says why
  it must be device-local.
- `closure` and `scroll_index` remain derived and untracked.
- Replication policy is explicit and schema-complete, not inferred from an incomplete hand-written
  column list.
- Phase 11 begins the target face runtime only where focusable views require it. Phase 13 completes
  the migration and removes compatibility code before Phase 14.
- Unreleased databases remain disposable until the durable dogfooding gate. This phase defines the
  gate and proves its migration runner without activating version 1.
- Performance retains deterministic CI guards and adds bounded throttled-browser backstops.

## Stage 1 — Current-schema durability inventory

**Outcome:** one reviewed manifest classifies every current table and column.

- [x] Enumerate the fresh-database schema from SQLite, including dynamic matrix data tables.
- [x] Classify each table as replicated source of truth, derived/rebuildable, or device-local.
- [x] Classify every column of each replicated core table.
- [x] Confirm that user-authored content, ownership, position truth, promoted types, view SQL, face
      recipes, plugin metadata, and schema metadata have a replicated owner.
- [x] Confirm that closure, scroll index, reactive caches, worker state, and session UI state are
      either rebuildable or intentionally local.
- [x] Record any proposed device-local user preference with its user-visible consequence and review
      it before implementation.
- [x] Review composite-key identity and delete semantics for `joins`, promoted nodes, block sources,
      and normalized face tables.

Reviewed inventory: [Stage 1 durability inventory](Phase-11-Stage-1-Inventory.md).

### Stage 1 verification

- [x] A generated schema report and the policy manifest contain the same table set.
- [x] Every fresh-schema column is classified exactly once.
- [x] Review the manifest before changing triggers or remote apply.

## Stage 2 — Repair change tracking and remote apply

**Outcome:** the current source-of-truth schema is fully tracked and safely applicable.

- [x] Track `matrix.owner_matrix_id` and `matrix.owner_row_id`.
- [x] Track `promoted_nodes` with logical composite identity and correct delete data.
- [x] Promote `block_sources` from its Phase 9.7 local-only exception to replicated source of truth.
- [x] Verify every normalized face-config table and current plugin metadata field. Replace the
      replica-local filter identity/order with stable logical identity and explicit order.
- [x] Keep derived `face_configs.slot_bindings` out of changesets while ensuring remote face-config
      inserts satisfy the physical schema and normalized slot bindings remain authoritative.
- [x] Replace or generate `CORE_TABLE_COLUMNS` from the reviewed policy so schema and tracking
      cannot drift silently.
- [x] Make remote apply and conflict detection use the manifest's logical identity for every
      replicated table, including stable text and composite keys. Do not rely on replica-local
      `rowid`.
- [x] Reconstruct and evolve dynamic matrix data tables from replicated matrix and column metadata
      before applying their rows. Install complete tracking without emitting local echo changes.
- [x] Rebuild derived closure and scroll-index state after remote structural changes, and formula
      dependencies after remote formula metadata changes. Do not sync derived rows.
- [x] Define ordering and dependency handling when a changeset creates a marker, its position, and
      its block source together.

### Stage 2 verification

- [x] Focused trigger tests cover insert, update, and delete for every repaired table/column.
- [x] Remote apply and conflict tests cover logical-key upsert and delete for stable text,
      composite, and integer identities whose values are stable across replicas.
- [x] A face config inserts remotely without transmitting the derived `slot_bindings` JSON copy,
      and its normalized bindings reconstruct the same recipe.
- [x] Applying a new matrix to a fresh replica materializes its physical data table before its rows,
      installs complete tracking, and emits no local echo changes.
- [x] A structural apply rebuilds caches without emitting local echo changes.
- [x] Formatting, lint, static types, and unit tests pass.

## Stage 3 — Make coverage durable

**Outcome:** future schema evolution cannot silently weaken sync readiness.

- [x] Add a schema-policy contract test that introspects `sqlite_schema` and table columns.
- [x] Fail on every unclassified table or column.
- [x] Fail when the replicated column set differs from installed tracking triggers.
- [x] Fail when a derived table is accidentally tracked.
- [x] Require dynamic matrix data tables to install tracking after create/add/remove/rename column
      operations.
- [x] Add a repository instruction: every schema change must update the durability policy and add a
      two-replica case or state why existing coverage is sufficient.
- [x] Document how a deliberately device-local field is proposed, reviewed, and tested.

### Stage 3 verification

- [x] Prove the guard fails by adding a temporary unclassified table and column in a test fixture.
- [x] Prove it detects a stale trigger column list.
- [x] Prove normal schema mutations keep dynamic data-table tracking complete.

## Stage 4 — Two-replica current-schema round trip

**Outcome:** user-visible state reconstructs on a second fresh replica.

- [x] Build a fixture containing workspace content, hierarchy, cross-matrix ownership, a portal,
      promoted type-node, owned matrix, inline ref/tag, face recipe, and saved view marker/SQL.
- [x] Export changes from replica A and apply them to replica B in dependency-safe order.
- [x] Compare source-of-truth state by logical identity, not row order or replica-local metadata.
- [x] Rebuild derived caches on B and compare rendered position/ancestry results.
- [x] Modify promoted/view/owner state on both replicas and cover conflict detection and retention.
- [x] Delete each composite entity and verify the remote lifecycle result.

### Stage 4 verification

- [x] Replica B reconstructs every user-visible fixture state.
- [x] Derived caches contain no replicated changelog entries.
- [x] Remote apply produces no local echo entries.
- [x] The full sync unit suite passes.

## Stage 5 — Complete the `view` place contract

**Outcome:** a view marker is a named, focusable place backed by its existing SQL.

- [x] Define which existing row field stores the view name. Do not add a parallel identity record.
- [x] Include view nodes in normal place discovery and identity navigation without rendering them as
      duplicate loose result rows.
- [x] Define home/provenance, ancestry, focus/back, rename, delete, empty, invalid-SQL, and ghost
      behavior.
- [x] Preserve the view firewall: query results own nothing and cannot imply insert position.
- [x] Keep inline folding as one presentation of the same subject, not a second view object.
- [x] Add a focus-panel collection region that renders the stored SQL result at substrate fidelity.
- [x] Keep block authoring on the current development surface; launcher/chip authoring remains Phase 12.

### Stage 5 verification

- [x] A named view can be created, focused, renamed, navigated back from, and deleted.
- [x] Inline and focused presentations use the same marker identity and `block_sources` row.
- [x] A view with no real result positions remains a valid place.
- [x] Query results cannot create ownership through the view.
- [x] Focused component and E2E coverage passes.

## Stage 6 — Begin the subject/recipe/host runtime

**Outcome:** the focusable view uses the approved runtime boundary instead of extending the legacy
one.

- [x] Move query ownership from `FaceConfig` to the `container` or `view` subject.
- [x] Remove `query` from the forward face recipe type and persistence path.
- [x] Define the minimum `line` and `collection` render registrations needed by current hosts.
- [x] Make the view focus panel request a collection rendering through a host-owned slot.
- [x] Keep identity, fields, relations, sizing, fidelity, recursion, and insert affordances
      host-owned.
- [x] Add a narrow compatibility adapter for unmigrated table/tag consumers only if required. Name
      it as temporary and assign its removal to Phase 13.
- [x] Do not implement appearance-level recipe storage or a general dashboard-region API.

### Stage 6 verification

- [x] No forward face recipe carries SQL.
- [x] The focused view's host, not its face, owns panel chrome and recursion.
- [x] Existing unmigrated faces retain behavior through the explicit temporary boundary.
- [x] Phase 13 has an enumerable removal list for every compatibility use.

### Phase 13 compatibility removal list

- Remove `TemporaryLegacyFaceAdapter` and its registration call in `App.tsx`.
- Move `TableFace` and its direct mounts in `App.tsx` and `SubTableBand.tsx` to registered
  `line`/`collection` interiors.
- Move workspace recipe settings and `FaceConfigPanel` onto host recipe resolution.
- Replace the direct `TagBrowserFace` application mount with the launcher-selected host path.

## Stage 7 — Migration policy

**Outcome:** the project knows when reset-only development ends.

- [x] Record that databases before the durability milestone may be reset.
- [x] Waive the obsolete `wikilink` migration under that policy.
- [x] Define the durability milestone and the version metadata stored with the database.
- [x] Define forward migration ordering, transactional failure behavior, backup/export expectations,
      and test fixtures after the milestone.
- [x] Require every post-milestone schema change to include a migration or an explicit compatible
      no-op proof.

### Stage 7 verification

- [x] Fresh initialization and reset remain supported.
- [x] A representative versioned migration fixture proves the runner and rollback behavior before
      the milestone is declared complete.

Version 0 remains the shipped reset-only state. The first dogfood build whose data should survive
upgrades activates the [durable dogfooding gate](../Plan.md#durable-dogfooding-gate), establishes
version 1, and enables the runner proven here.

## Stage 8 — Canonical performance coverage

**Outcome:** the active performance contract has deterministic and throttled-browser proof.

- [ ] Keep query-plan, work-count, scaling-ratio, and invalidation fan-out guards as unit-test gates.
- [ ] Restore exact ProseMirror lifecycle tests for within-page insert, page-boundary insert/delete,
      collapse, expand, and unaffected-row stability.
- [ ] Add stable-instance assertions for focus panels and workspace content across ancestry/sticky
      presentation updates.
- [ ] Define bounded browser stress fixtures for deep trees, cross-matrix rows, portals, folded
      views, and large visible result sets.
- [ ] Estimate the slowdown from this development machine to a typical downmarket target and record
      the basis.
- [ ] Compare that estimate with Chrome DevTools' maximum available CPU slowdown. Use the maximum
      throttle when it is at least as severe; otherwise apply a conservative threshold adjustment.
- [ ] Record warmed median and p95 wall-clock results, long tasks, forced layout, mounted-row bounds,
      and editor churn.
- [ ] Keep the stress suite bounded and repeatable. Do not make raw uncalibrated timing the only CI
      guard.

### Stage 8 verification

- [ ] Each deterministic guard family has a failure control.
- [ ] Exact editor-churn cases pass.
- [ ] Throttled browser results meet the documented target-equivalent budgets.
- [ ] No repeated forced layout or unexpected long task appears in the reviewed traces.

## Stage 9 — Canonical document closeout

**Outcome:** active documentation describes the implemented Phase 11 boundary.

- [ ] Update Data Model, Architecture, Plugins, Sync, Virtualization, Performance, and Testing with
      the shipped result.
- [ ] Remove Phase 11 status warnings that are no longer true.
- [ ] Record any intentionally deferred compatibility adapter in Phase 13.
- [ ] Keep `NOW.md` short and route the next session through the Phase 12 front door.

### Phase verification

- [ ] Run `npm run format`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test:run`.
- [ ] Run focused system-browser E2E and throttled performance suites outside the sandbox.
- [ ] Build Storybook if a host or face presentation changed.
- [ ] Format touched documentation and run `git diff --check`.
- [ ] Verify all active context links.

## Exit gate

Phase 12 may begin only when:

- current user-visible data round-trips between replicas;
- schema-policy tests prevent new unclassified durability state;
- saved view identity and SQL use one durable model;
- the first host-owned collection path ships without SQL in the forward face recipe;
- exact churn and target-equivalent browser performance checks pass;
- the migration/reset boundary is documented.
