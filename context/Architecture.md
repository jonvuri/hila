---
title: Architecture
kind: canonical
state: active
updated: 2026-10-01
---

# Architecture

This is the short narrative. Concepts are defined once in the [concept ledger](Concepts.md), and
rationale lives in the [decision log](Decisions.md). Detailed contracts live in the topic documents
linked below.

## Objectives

- Combine personal notes, outlining, documents, and structured data without duplicating data
  between surfaces.
- Keep all primary reads and writes local.
- Use SQL as the shared data and composition language.
- Make user-authored structure inspectable and safely editable by people, plugins, and future agent
  interfaces.
- Keep interactions within the [performance contract](Performance.md).
- Evolve incrementally from real consumers while keeping the whole coherent.

## Layers

```text
shell and admin surfaces
  ├─ stream root: navigation panel and retained focus panels
  ├─ hosts, rendering mounts, overlays, launcher
  └─ admin surfaces: matrix browser, face choice administration, debug tools

plugins
  ├─ faces: declarations and renderings
  ├─ default face choices
  └─ commands

core
  ├─ matrixes, columns, and typed schema operations
  ├─ edges, nodes, positions, and views
  ├─ query spec, compiler, and recognizer
  ├─ derived closure and scroll index
  └─ typed worker and client boundary

storage and replication
  ├─ SQLite in OPFS, in a worker
  ├─ changelog, changesets, and conflicts
  └─ future transport and file providers
```

The app is a Solid.js browser application. SQLite-WASM runs in a worker and persists to OPFS. UI
writes go through typed worker messages; reactive queries re-run from SQLite update notifications.

SQLite is both the store and the relational engine. Custom SQLite functions implement byte-level
algorithms such as sibling keys. Prepared SQL and transactions implement queries, structural
operations, and cache maintenance. TypeScript selects operations, binds parameters, and manages UI
state, and does not reimplement relational work in loops. User query SQL runs through a read-only
bounded edge; writes stay typed so their invariants hold ([Decision 2](Decisions.md#decision-2)).

The shell and the fallback rendering are fixed infrastructure. Plugins extend the system with
faces and commands ([Decision 8](Decisions.md#decision-8)).

## Where to look

| Concern                                        | Ledger concepts                                           | Topic                                                |
| ---------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Matrixes, edges, nodes, positions, views       | Matrix, Row, Node, Edge, Position, View, Child source     | [Data-Model](Data-Model.md)                          |
| Queries and write-back                         | Query spec, Recognizer, Writable field, Raw SQL mode      | [Query-Spec](Query-Spec.md)                          |
| Faces, face choices, hosts, renderings         | Face, Face choice, Face resolution, Host, Rendering mount | [Plugins](Plugins.md)                                |
| Navigation, places, launcher, discovery        | Place, Provenance, Ancestry resolution, Launcher          | [Launcher](Launcher.md)                              |
| Paging and inline results                      | Page, Stream item, Inline results                         | [Virtualization](Virtualization.md)                  |
| Tokens, themes, fidelity, shell layout, sticky | Visual theme, Fidelity, Shell layout, Sticky item         | [Design](Design.md), [Design-Faces](Design-Faces.md) |
| Replication and migration                      | Durability class, Schema version                          | [Sync](Sync.md)                                      |
| Budgets and guards                             | Performance guards                                        | [Performance](Performance.md), [Testing](Testing.md) |
| Future phases and deferred decisions           | none                                                      | [Plan](Plan.md)                                      |

## Trace: a stream item from SQLite to pixels

1. A workspace **row** lives in the workspace **matrix** table. Its **home** is an `own` **edge**
   whose **sibling key** orders it under its parent **node**.
2. The derived **scroll index** holds one **position** for each place the node appears, keyed by
   concatenated sibling keys, so each subtree is one contiguous key range.
3. The **navigation panel** asks for the **pages** around the viewport. The worker counts the
   filtered sequence, splices **inline results** after each recognized **view**, and gathers only
   the requested pages ([Decision 23](Decisions.md#decision-23)).
4. Each gathered position becomes one **stream item**, keyed by position
   ([Decision 24](Decisions.md#decision-24)). The item mounts ProseMirror editors for the row's
   **label** and **content** columns. A row from another matrix also shows a **field strip**.
5. The **outline variant** paints guides from row depth and continuation facts. **Sticky items**
   pin ancestors without owning editors ([Decision 32](Decisions.md#decision-32)).
6. **Semantic tokens** resolved from **polarity** and **visual theme** style the result.
7. An edit writes through a typed worker operation to the **row**. SQLite update notifications
   re-run only overlapping page queries, and the editor stays mounted.

## Trace: a view from launcher to focus panel

1. `⌘K` opens the **launcher** in Quick and captures **provenance**: the focused node and
   position.
2. Committing a **chip** moves to Deep. The **query spec** compiles to canonical SQL and a bounded
   read-only preview runs ([Decision 28](Decisions.md#decision-28)).
3. `⌘S` stores the SQL as a new **view**: a node homed under the provenance node plus one
   `block_sources` row ([Decision 9](Decisions.md#decision-9),
   [Decision 16](Decisions.md#decision-16)).
4. **Ancestry resolution** gives the view's node a rooted **place**, and the stream opens a **focus
   panel** for it ([Decision 22](Decisions.md#decision-22)).
5. The focus panel is a **host**. It builds a **subject** with child source **view** and lays out
   its **panel regions**.
6. The collection region holds a **rendering mount**. **Face resolution** finds no face choice for a
   view subject, so the mount shows the **fallback collection**
   ([Decision 18](Decisions.md#decision-18)).
7. The **recognizer** classifies each result value as a **writable field** or **read-only field**.
   The **no-ownership rule** removes add-row and structural gestures
   ([Decision 19](Decisions.md#decision-19)).
8. Reopening the view later recognizes its SQL back into chips. **Raw SQL mode** edits the same
   stored statement.
