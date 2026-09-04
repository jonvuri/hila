---
title: Architecture
kind: canonical
state: active
updated: 2026-09-03
---

# Architecture

## Objectives

- Combine personal notes, outlining, documents, and structured data without duplicating data
  between surfaces.
- Keep all primary reads and writes local.
- Use SQL as the shared data and composition language.
- Make user-authored structure inspectable and safely editable by people, plugins, and future agent
  interfaces.
- Keep interactions within the [performance contract](Performance.md).
- Evolve incrementally from real consumers while preserving architectural coherence.

## Current platform

The shipped app is a browser application built with Solid.js. SQLite-WASM runs in a worker and
persists structured data in OPFS. UI writes go through typed worker messages and SQL operations;
reactive queries re-run from SQLite update notifications.

The trigger-based sync-readiness layer ships locally. Remote transport, attachments, and file
storage do not. See [Sync.md](Sync.md).

## Layers

```text
shell and system edge
  ├─ stream hosts, navigation, overlays, dev tools
  └─ fixed infrastructure: table floor, launcher target

plugins and faces
  ├─ plugin declarations and lifecycle
  ├─ face recipes and render registrations
  └─ commands

core
  ├─ matrix/schema operations
  ├─ ownership/ref/portal operations
  ├─ view subjects and SQL recognition
  ├─ derived closure and scroll-index caches
  └─ typed worker/client boundary

storage and replication
  ├─ SQLite in OPFS
  ├─ changelog, changesets, conflicts
  └─ future transport and file providers
```

The shell and table floor are fixed core infrastructure. Not every user-visible surface must be a
plugin. Plugins extend the system through declared data, faces, and commands; hosts keep navigation
and composition invariants centralized.

## Data boundary

Matrixes contain user-meaningful values that can be inspected and edited safely through standard
data surfaces. System tables contain relations, invariants, and derived indexes that require typed
operations.

Examples:

- Matrixes: workspace prose, task fields, review ratings, user-defined schema.
- System truth: `own`/`ref`/`portal` relations, matrix ownership, promoted-node identity, view SQL,
  face recipes.
- Derived system state: closure and scroll index.
- Device-local state: device identity, sync cursors, transient session navigation.

The exact model and invariants live in [Data-Model.md](Data-Model.md).

## Execution model

SQLite is both persistence and the primary relational computation engine.

1. **Custom SQLite functions** implement byte-level algorithms such as Lexorank key calculation.
2. **Prepared SQL and transactions** implement queries, schema mutations, row writes, structural
   operations, and cache maintenance.
3. **TypeScript orchestration** selects operations, binds parameters, routes worker messages, and
   manages UI state. It should not reimplement relational work in application loops.

Operations that maintain invariants are exposed through typed core functions and the worker/client
boundary. Arbitrary query SQL must be read-only and sandboxed. The current general worker execution
path does not yet enforce that boundary; Phase 12 must do so before exposing new custom-query
authoring. A future batch executor composes typed operations in one transaction; it does not bypass
their validation.

The unreleased app remains at reset-only schema version 0. The
[durable dogfooding gate](Plan.md#durable-dogfooding-gate) establishes version 1 when development
first promises to preserve data across upgrades. Later versions advance through contiguous forward
migrations in one transaction. The detailed migration and backup contract lives in
[Sync.md](Sync.md#migration-policy).

## Matrix and row identity

Matrix and row IDs are random positive integers safe for JavaScript serialization and cross-device
creation. Column IDs are stable independently of names. Durable column references use IDs and
resolve current names at execution.

Matrix membership defines extent and schema. The ownership forest defines lifecycle and rooted
position. They are independent axes.

## Queries and write-back

Stored SQL is the canonical query representation. The current runtime recognizes simple
updatable-query shapes so hydrated cells can write back to their source.

The approved higher-level authoring contract is [Query-Spec.md](Query-Spec.md): gestures edit a
derived spec, the spec compiles to canonical SQL, and a recognizer lifts supported SQL back into
gesture state. The compiler and gesture surfaces are Phase 12 work.

Write-back is per cell:

- hydrated values trace to a source cell and can edit it;
- computed or structurally opaque values are dry;
- view results never imply ownership or insertion position.

## Places, gestures, and the system edge

The target view layer has three kinds:

- **Places:** rooted positions in the one forest. Nodes, containers, and saved views are places.
- **Gestures:** transient keyboard-first actions. `/` makes locally; `⌘K` goes or acts globally.
- **System edge:** settings and development/operations surfaces that live above the database.

The stream is the primary surface. Local navigation uses focus panels and rooted ancestry. Global
identity navigation reconstructs a rooted focus state rather than creating a second root.

Saved views now participate in this contract. Their marker label is discoverable like another
named row, their inline block opens the marker identity, and their focus panel renders the marker's
stored SQL as a substrate collection. Empty and invalid collections remain places. Query result
rows retain source-cell write-back where recognized, but never expose structural insertion,
reparenting, drag, or ownership gestures.

The current Workspace/Table/Tags tabs are temporary. Phase 12 removes them only after the launcher
can replace their navigation role. URLs, deep links, and saved stream states remain deferred.

### Two planes

- The **position plane** is the rooted own/portal forest and has ancestry and order.
- The **membership plane** is matrix extent and schema. It has no navigable ancestry and appears
  through containers, views, and launcher lenses.

Matrix browsers are administrative lenses, not a second product root.

### Ancestry

When identity navigation needs a place, resolve in order:

1. the traversed provenance position;
2. the ownership home;
3. a deterministic membership/container fallback when no live position exists.

An arbitrary portal is never silently selected. Placeless creation homes under the node focused
when the gesture began.

The shipped stream preserves a traversed appearance key when one is available and derives ancestry
from that position. Identity-only navigation resolves the ownership home first. A deleted home can
leave ghost portal positions, but those ghosts are not focusable subjects.

## Subjects, recipes, faces, and hosts

The approved composition model is:

> Subjects own data. Recipes own rendering choices. Faces draw interiors. Hosts own chrome,
> recursion, sizing, fidelity, and navigation.

A subject is a node plus its `loose`, `container`, or `view` child-sourcing mode. A forward face
recipe contains face type, stable column bindings, and settings. It does not contain SQL.

A face type may provide:

- `line` — one row participating in a host region;
- `collection` — a row-set arrangement such as outline, grid, kanban, calendar, or review stack.

Hosts request those renderings. Faces never mount other faces directly; nested subjects yield slots
back to the host. The panel scaffold—identity, fields, collection, relations—is shell-owned.

The resolution ladder is:

1. appearance override, modeled but unstored until needed;
2. subject or matrix preferred recipe;
3. substrate floor.

The shipped Phase 11 slice keeps SQL on view subjects and lets the focus-panel host request a
registered `collection` interior. Unmigrated table consumers remain behind the explicitly
temporary `TemporaryLegacyFaceAdapter`. Phase 13 completes host dispatch and removes every
enumerated compatibility use before new product faces land. See [Plugins.md](Plugins.md).

## Fidelity and design axes

Rendering fidelity is independent of theme and density:

- **Composed:** optimized presentation with schema details implied.
- **Substrate:** explicit fields, roles, relationships, and structure.
- **X-ray:** a shell inspection state that forces substrate through descendants.

The tokens and resolver ship. App-wide host behavior remains Phase 13 work. Visual theme, polarity,
component variants, density, and fidelity must not select or mutate one another. See
[Design.md](Design.md).

## Plugins and commands

Plugins currently register metadata, matrixes, face types, face bindings, and lifecycle hooks.
Named queries/mutations are declared but not yet persisted. The target contribution surface is
faces plus commands; the shell remains fixed infrastructure.

Commands use one future registry with explicit `/` and launcher surfaces plus subject requirements.
Phase 12 extracts it from the current slash-only command list. See [Plugins.md](Plugins.md).

## Replication boundary

Every table and column must declare one of:

- replicated source of truth;
- derived/rebuildable state;
- deliberately device-local state.

The schema-complete durability policy drives tracking and remote apply. Current-schema
two-replica tests cover user-visible state, and contract tests prevent new tables or columns from
silently bypassing replication. Remote transport remains deferred. See [Sync.md](Sync.md).

## Operations and external interfaces

Read access can use sandboxed SQL. Write access must use typed operations so ownership, cascades,
schema dependencies, and replication invariants remain intact.

Future operations work will add:

- a registry-backed typed dispatcher;
- atomic batches with result references;
- Markdown import/export;
- cascade previews and safety gates;
- an agent interface after the access topology for browser-owned OPFS is decided.

An external process cannot assume direct access to browser OPFS. Phase 15 must choose an in-app
bridge, exported database, or different persistence host before implementing MCP.

## Deferred cross-cutting work

- Structural and data undo.
- Full-text-search timing.
- Labeled `ref` relations.
- Saved stream states and URL/deep-link behavior.
- Guaranteed closed-app notification delivery.
- Remote transport and file mirroring.
