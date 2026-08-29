---
title: Phase-boundary reconciliation
kind: historical-record
state: archived
updated: 2026-08-29
---

# Phase-boundary reconciliation

This document records the completed reconciliation pass after Phase 10. It is the final review
surface for the Phase 10 closeout, the `context/` restructure, and the replacement roadmap. The
original brief is archived with the completed phase records.

No product implementation belongs in this session.

## Authority map

| Concern                     | Current authority                                                         | Required correction                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Execution state             | [NOW.md](../../NOW.md)                                                    | Keep it as a short handoff only.                                                                                         |
| Roadmap                     | [Plan.md](../../Plan.md)                                                  | Replace its historical implementation narrative with a concise future roadmap and decision index.                        |
| Cross-cutting architecture  | [Architecture.md](../../Architecture.md)                                  | Mark target contracts clearly and remove superseded trait-era descriptions.                                              |
| Ownership and relations     | Phase 8–9 records plus code                                               | Create a current `Data-Model.md`; archive the superseded [Traits.md](../superseded-topics/Traits-pre-reconciliation.md). |
| Plugin and face composition | [Plugins.md](../../Plugins.md)                                            | Separate shipped plugin mechanics from the designed host-composition contract.                                           |
| Query authoring             | [Query-Spec.md](../../Query-Spec.md)                                      | Keep active as a designed, unimplemented contract.                                                                       |
| Launcher                    | [Launcher.md](../../Launcher.md)                                          | Keep active as a designed, unimplemented surface.                                                                        |
| Visual system               | [Design.md](../../Design.md) and [Design-Faces.md](../../Design-Faces.md) | Remove phase chronology and keep only durable contracts and current implementation state.                                |
| Sync                        | [Sync.md](../../Sync.md)                                                  | Split shipped readiness from target live sync and re-audit current schema coverage.                                      |
| Virtualization              | [Virtualization.md](../../Virtualization.md)                              | Rewrite around the shipped paged `scroll_index` and gather contract.                                                     |
| Testing                     | [Testing.md](../../Testing.md)                                            | Keep active.                                                                                                             |
| History                     | Completed `Phase-*` plans and visual companions                           | Move outside the active reading path without rewriting their rationale.                                                  |

Code and tests settle what ships today. Canonical topic documents own intended durable contracts.
Phase records explain how and why the system reached them.

## Phase 10 closeout

The detailed closeout matrix is in [Phase-10.md](./Phase-10.md#closeout-matrix). The boundary is:

- **Shipped:** canonical token and theme contracts, the shared Ghost/Null/Wipeout workspace
  structure, bounded sticky navigation, Guides outline configuration, the production four-column
  shell, deep-window breadcrumb, and removal of the overlaid-card implementation.
- **Designed, not shipped:** the no-tab place/gesture/system-edge topology, host-owned face
  composition, shared command registry, query-spec compiler and recognizer, launcher, named saved
  views, app-wide fidelity behavior, and remaining surface migrations.
- **Deferred:** advanced query growth, URLs and saved stream states, appearance-level face
  overrides, source-row/sticky-row continuity, and product features outside the design-hardening
  charter.

This is an honest close at the original design-hardening boundary. It does not claim full live
conformance to every approved target contract.

## Code-versus-context gap register

| ID  | Finding                                                                                        | Evidence                                                                                  | Disposition                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Workspace, Table, and Tags tabs still ship although Architecture describes them as retired.    | `src/App.tsx` owns `ActiveView` and the switcher.                                         | Mark tab retirement as target state. Gate removal on launcher navigation and saved-view support.                                                                                                  |
| G2  | No production launcher or query-spec compiler/recognizer exists.                               | No `src/sql/query-spec/`; `Mod-k` still invokes insert-link.                              | Phase 12 after durable view places land.                                                                                                                                                          |
| G3  | View markers are unnamed inline blocks, not normal focusable places.                           | `src/core/block-marker.ts` and outline filtering.                                         | Complete the existing marker's place contract. Keep `block_sources` as the only SQL store.                                                                                                        |
| G4  | Commands are a local slash-only array, not the designed shared registry.                       | `src/editor/slash-commands.ts`.                                                           | Extract one registry before the launcher consumes it.                                                                                                                                             |
| G5  | The designed face composition model is not the runtime face contract.                          | `FaceConfig.query` remains; face types expose slots/overflow, not `line`/`collection`.    | Begin the subject/recipe and host contract in Phase 11. Complete runtime migration in Phase 13. Block Phase 14 on removal of the legacy contract.                                                 |
| G6  | The trait docs describe removed rank/closure provisioning.                                     | Production order is `joins.edge_key`; closure and scroll index are global derived caches. | Replace `Traits.md` with a current data-model topic, then archive it.                                                                                                                             |
| G7  | Phase 3's “every mutation is tracked” invariant is no longer true.                             | Sync coverage omits matrix owner columns, `promoted_nodes`, and `block_sources`.          | Repair and test the replication contract before durable saved views. Then add a schema-policy guard that makes every future table and column declare replicated, derived, or device-local status. |
| G8  | Sync and virtualization docs retain rank-era and pre-paging descriptions.                      | Current code rebuilds from joins and uses bounded multi-window `scroll_index` ranges.     | Reconcile both canonical topics in Phase 11 documentation stages.                                                                                                                                 |
| G9  | Fidelity tokens and resolver ship, but app-wide composed/substrate/x-ray behavior does not.    | Production does not apply the full fidelity state contract.                               | Phase 13 surface migration; do not describe it as shipped behavior.                                                                                                                               |
| G10 | `global.css` still owns most non-workspace surfaces.                                           | App shell, table, tags, face configuration, browser, editor, and panels remain there.     | Migrate one surface at a time in Phase 13.                                                                                                                                                        |
| G11 | The old Phase 11 plan assumes the removed tag-registry matrix.                                 | Production tags use promoted type-nodes.                                                  | Archive and replace the plan.                                                                                                                                                                     |
| G12 | Plugin named queries and mutations are declared but not persisted.                             | `registerPlugin` retains an implementation TODO.                                          | Reconcile the contract in Phase 11; defer batch execution to operations work.                                                                                                                     |
| G13 | There is no explicit schema migration/reset policy.                                            | Historical plans alternate between data migrations and disposable pre-alpha databases.    | Decide and document the policy in Phase 11.                                                                                                                                                       |
| G14 | Reliable notifications while the browser is closed are not guaranteed by the current platform. | Browser-only runtime has no accepted external delivery boundary.                          | Start scheduling with a feasibility gate; promise catch-up semantics, not guaranteed closed-app delivery.                                                                                         |
| G15 | A standalone MCP process cannot directly assume access to browser-owned OPFS.                  | No accepted bridge or exported-database topology exists.                                  | Decide the access topology before MCP implementation.                                                                                                                                             |

## Archive boundary

### Active after reconciliation

- Hubs: `NOW.md`, `README.md`, `Plan.md`, and [Documentation.md](../../Documentation.md).
- Canonical topics: Architecture, Data Model, Plugins, Design, Design Faces, Query Spec, Launcher,
  Sync, Virtualization, and Testing.
- The current phase front door and only the session plans it actively requires.

### Historical after reconciliation

- Completed Phase 1–10 plans, subplans, spikes, and reconciliation records.
- Phase 7c and Phase 9 design explorations.
- Phase visual companions and theme catalogs.
- Superseded unstarted Phase 11 and Phase 15 plans.
- This reconciliation brief and result after the session closes.

Applied structure:

```text
context/
  NOW.md
  README.md
  Plan.md
  Documentation.md
  Architecture.md
  Data-Model.md
  Plugins.md
  Design.md
  Design-Faces.md
  Query-Spec.md
  Launcher.md
  Sync.md
  Virtualization.md
  Testing.md
  phases/
    Phase-11.md
    Phase-11/
  archive/
    phases/
    explorations/
    visuals/
    superseded-roadmap/
```

The archive keeps completed plans and evidence outside the active reading path. Active documents
route through canonical topics and `phases/Phase-11.md`.

## Proposed roadmap

### Phase 11 — Durable data and place contracts

Repair current foundations before adding durable launcher data.

1. Create the canonical data-model topic from the shipped own/ref/portal forest, matrix ownership,
   promoted nodes, block markers, closure, and scroll-index contracts.
2. Audit changelog coverage for every current source-of-truth table and column. Keep derived caches
   untracked and rebuildable.
3. Decide whether saved-view SQL syncs. Update `block_sources` and two-replica round-trip tests to
   match.
4. Replace the hardcoded, incomplete tracking list with an explicit schema policy. Every table and
   column must be classified as replicated source of truth, derived/rebuildable state, or
   deliberately device-local state. Contract tests fail on an unclassified schema addition or a
   tracked-column mismatch.
5. Complete the existing `view` marker's named, focusable place contract without adding a second
   SQL store.
6. Re-home query ownership from `FaceConfig` to the subject. Introduce the minimum host-owned
   `line`/`collection` contract needed to render a focusable view as a place.
7. Establish a versioned migration/reset policy.
8. Reconcile the shipped plugin registration contract and its deferred named-query/mutation work.
9. Rewrite Sync and Virtualization as current contracts. Create a canonical performance contract
   and restore exact editor-churn coverage.

### Phase 12 — Launcher and shell convergence

Depends on Phase 11's durable view places and replication decision.

1. Extract the shared `/` and `⌘K` command registry.
2. Implement the query-spec compiler, recognizer, and conformance tests.
3. Build quick launcher navigation, then chips and deep tempo.
4. Add save-as-view, insert-ref handoff, provenance navigation, and session memory.
5. Establish the shared launcher and slash-menu overlay contract.
6. Capture the temporary Table and Tags surfaces, then retire their top-level tabs.

### Phase 13 — Live design-system completion

Depends on the converged shell and overlay boundary.

1. Migrate the remaining shell, table, tags, face-configuration, browser, editor, and system-edge
   surfaces from legacy global styles.
2. Complete the runtime `line`/`collection` and host-recursion migration. Remove `FaceConfig.query`,
   whole-component face dispatch, and any temporary compatibility adapter before Phase 14 begins.
3. Decide whether user-facing theme choice and persistence are required for “all three ship.”
4. Implement or explicitly narrow the app-wide composed/substrate/x-ray contract.
5. Resolve the deferred source-row/sticky-row continuity requirement.
6. Remove obsolete global styles after each surface passes behavior and visual review.

### Phase 14 — Structured aspects vertical slice

Depends on Phase 13 completing the face runtime contract. Rewrite the old Phase 11 against promoted
type-nodes. Add column defaults and a renderer registry. Ship tasks as the primary proof. Keep movie
reviews only if the second proof still earns its scope.

### Phase 15 — Operations and agent access

Formalize typed dispatch, batches, Markdown round trips, and cascade safety. Decide how an external
process reaches browser-owned data before committing to an MCP server topology.

### Phase 16 — Scheduling and notifications

Begin with browser-capability validation. Ship in-app scheduling and catch-up semantics. Treat
closed-app delivery as provider-dependent unless an external delivery boundary is accepted.

### Phase 17 — Spaced repetition

Depends on scheduling and the renderer/face registry.

### Phase 18 — Micro-journaling

Depends on scheduling and form/aggregate surfaces. It is independent of Phase 17 after those
prerequisites.

### Phase 19 — Structural ergonomics and in-place upgrades

Review the ergonomics of every structure and structural gesture after the main product surfaces
exist. Test whether users can understand and change a structure in place without rebuilding it.
Evaluate the full promotion taxonomy—label to type, member to owned aspect, shared collection to
dedicated table, subtree to table, and hostless row to contextualized home—and implement only the
upgrades that improve real workflows. Include discoverability, preview, reversibility, cascade
safety, keyboard operation, and undo expectations.

### Phase 20 — Live row-data sync

Build a transport-neutral replica engine, bootstrap/snapshot flow, and conflict UX. Dropbox is one
provider, not part of the engine contract.

### Phase 21 — Attachments and file sync

Separate local content-addressed attachment storage and UI from remote file mirroring. Local
attachments may move earlier if product priority changes.

## First-review resolutions

1. **Close Phase 10 at the design-hardening boundary.** Re-home incomplete implementation instead
   of extending the phase.
2. **Run Phase 11 before launcher implementation.** Durable saved views require current replication,
   place, face-host, and migration contracts.
3. **Enrich the existing view marker.** Keep `block_sources` as the sole SQL store; do not create a
   second saved-search model.
4. **Treat pre-alpha databases as disposable until an explicit durability milestone.** Waive the
   obsolete `wikilink` migration, but require versioned migrations after that milestone.
5. **Strengthen performance coverage.** Preserve deterministic query-plan, work-count,
   scaling-ratio, and invalidation guards. Restore exact ProseMirror mount/unmount tests. Add bounded
   wall-clock browser stress tests at Chrome DevTools' maximum available CPU slowdown when that is
   at least as severe as the estimated slowdown from this development machine to a typical
   downmarket target. Record the estimate and re-evaluate it when the development or target class
   changes.
6. **Keep unused promotion implementations out of near-term scope, but retain their product
   question.** Phase 19 will evaluate structural ergonomics and in-place upgrades holistically,
   then implement only promotions that improve real workflows.
7. **Define “all three themes ship” as runtime-capable today.** Decide in Phase 13 whether users
   need a chooser and persisted selection.
8. **Keep tasks as the next product proof after shell completion.** Make movie reviews an optional
   second proof.
9. **Preserve Phase 1–10 numbering as history and replace unstarted Phase 11 onward.**
10. **Defer MCP and closed-app notification topology choices to their feasibility gates.** They do
    not change the next three phases.

## Session checklist

- [x] Map document authority.
- [x] Audit design, architecture, requirements, roadmap, and implementation.
- [x] Draft the Phase 10 closeout boundary.
- [x] Draft the active/archive split.
- [x] Create the code-versus-context gap register.
- [x] Draft the replacement roadmap.
- [x] Add durable documentation-hygiene rules.
- [x] Resolve the first-review decisions with the user.
- [x] Reconcile canonical topic documents.
- [x] Create `Data-Model.md` and replacement future phase plans.
- [x] Move historical material and repair links.
- [x] Replace `Plan.md` with the approved roadmap.
- [x] Run final documentation formatting and link verification.
- [x] Close the reconciliation session and write the next-session handoff.
