---
title: Phase 12 — Launcher and shell convergence
kind: phase-plan
state: ready
updated: 2026-09-03
---

# Phase 12 — Launcher and shell convergence

Phase 12 replaces top-level view switching with the shared `/` and `⌘K` gesture model. It ships a
SQL-canonical query dialect, a global launcher, saved-view gesture authoring, and the shell changes
needed to retire the temporary Table and Tags roots.

Phase 11's durable view-place, replication, host, virtualization, and performance contracts are
inputs. Phase 12 does not complete the app-wide face runtime or style migration assigned to Phase 13.

## Outcomes

- One main-thread command registry serves slash and launcher surfaces.
- Query specs compile to self-contained stored SQL and parameterized transient execution plans.
- Matrix-backed saved queries recognize back into the same structured gesture state.
- `⌘K` finds named places, content, promoted types, containers, and commands, then reconstructs a
  rooted focus state.
- One shared overlay/list primitive supports slash and launcher interaction.
- Quick and deep launcher tempos, save-as-view, saved-view editing, and insert-ref handoff ship.
- Session history, recent deep searches, and on-screen ranking remain bounded and in memory.
- Table and Tags navigation roles have launcher/place parity before their top-level roots retire.

## Fixed boundaries

- SQL remains the only stored and executed query truth. Query specs are derived state.
- Durable gesture-authored views require a concrete matrix/type kind in v1. `everything` and
  `containers` remain transient launcher lenses until a dynamic global-search substrate exists.
- A stored query is self-contained. Transient execution may bind values through a plan derived from
  the same normalized spec.
- A view still owns no query results and exposes no insert, reparent, or drag affordance.
- The launcher is a gesture, never a place. Identity navigation follows provenance, then ownership
  home, then deterministic membership fallback.
- Commands that require a node and saves that require a home remain visible but disabled with a
  stated reason when provenance is absent.
- Formula columns are not predicate/order candidates in v1. Relative dates freeze to closed literal
  ranges. Only WHERE fragment leaves ship; CTE source and computed leaves remain deferred.
- Tab retirement requires navigation-role parity, not preservation of every obsolete Table/Tags
  manager convenience. Root schema and face administration may remain in the development system
  edge until Phase 13.
- Embedded table behavior, `TemporaryLegacyFaceAdapter`, host-wide `line`/`collection` migration,
  and remaining global face styles stay in Phase 13.
- FTS, persisted frecency, live-relative parameters, URLs, deep links, saved stream states, and
  advanced query grammar remain deferred.

## Sessions

| Session                                                                                                                | Outcome                                                                      | Depends on | State   |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------- | ------- |
| [1 — Shared command and shortcut registries](Phase-12/Session-1-command-and-shortcut-registries.md)                    | One authoritative, introspectable command and shortcut source                | Phase 11   | Ready   |
| [2 — Query spec and query runtime](Phase-12/Session-2-query-spec-and-query-runtime.md)                                 | Matched compiler/recognizer, bound execution, paging, and durable round trip | Phase 11   | Planned |
| [3 — Place discovery, navigation, and ranking](Phase-12/Session-3-place-discovery-navigation-and-ranking.md)           | Bounded global discovery and correct rooted navigation                       | Phase 11   | Planned |
| [4 — Shared overlay and selectable list](Phase-12/Session-4-shared-overlay-and-selectable-list.md)                     | Canonical overlay/list interaction and presentation                          | Phase 11   | Planned |
| [5 — Quick launcher shell](Phase-12/Session-5-quick-launcher-shell.md)                                                 | Useful global switcher with commands, filters, and help                      | 1, 3, 4    | Planned |
| [6 — Chips and deep preview](Phase-12/Session-6-chips-and-deep-preview.md)                                             | Query gesture editing and bounded read-only preview                          | 2, 4, 5    | Planned |
| [7 — Saved-view authoring and editor exits](Phase-12/Session-7-saved-view-authoring-and-editor-exits.md)               | Save, reopen/edit, focus/name, and insert-ref handoffs                       | 2, 3, 5, 6 | Planned |
| [8 — Session memory and on-screen signals](Phase-12/Session-8-session-memory-and-on-screen-signals.md)                 | Bounded history, recovery, and ranking signals                               | 3, 5, 6    | Planned |
| [9 — Surface capture, tab retirement, and closeout](Phase-12/Session-9-surface-capture-tab-retirement-and-closeout.md) | Storybook evidence, one stream root, and canonical closeout                  | 5–8        | Planned |

Sessions 1–4 have independent implementation seams and may be researched separately. Execute and
merge all sessions in number order; do not build later-session code early. The dependency column
explains architectural coupling, not permission to skip the incremental sequence.

## Phase acceptance

- `/` keeps its current table/attach behavior while `⌘K` consumes the same command entries.
- Concrete-matrix compiler output is deterministic, injection-safe, updatable, saved unchanged,
  and recognized after reload. Opaque WHERE leaves survive unrelated edits byte-for-byte.
- Per-keystroke launcher changes reuse prepared statement structure, reject stale results, and keep
  invalidation correct.
- Saved queries with semantic limits page without invalid SQL, duplicate rows, or unbounded work.
- Quick results use one deterministic flat ranking and navigate across matrixes without selecting an
  arbitrary portal.
- The complete keyboard map, pointer paths, focus restoration, disabled reasons, and dialog/listbox
  semantics pass component and real-Chrome checks.
- Deep preview never mounts a face, edits data, offers insertion, or grows beyond its window budget.
- Save-as-view creates one existing marker/`block_sources` pair under provenance, focuses it, and
  selects its default name. Reopened dialect SQL renders editable chips and retains raw SQL x-ray.
- `⌘⏎` inserts at the invoking live editor selection and cannot mutate a stale or unmounted editor.
- Session signals reset on reload and never enter schema or replication state.
- Table and Tags Storybook references land before their production roots and tabs are removed.
- Launcher open/dismiss and ranking updates cause no unrelated editor churn.

## Closeout

- [ ] Complete every focused session and its verification in order.
- [ ] Update `Query-Spec.md`, `Launcher.md`, `Architecture.md`, `Plugins.md`, `Data-Model.md`,
      `Virtualization.md`, `Design.md`, and `Design-Faces.md` where shipped truth changed.
- [ ] Reconcile Phase 13's removal list after the top-level Table/Tags roots retire. Keep its
      embedded face/runtime work explicit.
- [ ] Add durable launcher guidance to `Testing.md` and performance budgets only if the phase
      establishes reusable contracts.
- [ ] Confirm no schema change occurred. If one becomes necessary, update the durability policy and
      add the required two-replica case.
- [ ] Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test:run`.
- [ ] Build Storybook and run focused launcher, saved-view, editor-handoff, and performance E2E in
      system Chrome. Then run the full E2E suite.
- [ ] Run `git diff --check` and verify every active context link.
- [ ] Record the shipped boundary here, mark the phase complete, and route `NOW.md` to Phase 13.
