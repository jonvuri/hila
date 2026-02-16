# Architecture

## Objectives

- Create an app that combines the experiences of personal note taking / outlining and maintaining a personal database of spreadsheets into one unified experience.
- Focus on performance - the results of all interactions should take place in under 50ms, for a snappy and fluid feel.
- Focus on simplicity and composability - functionality that works completely and harmoniously together as a gestalt experience, rather than a disconnected suite of features.

## Development principles

### Incremental and intentional evolution

Only tackle complexity that is necessary right now. Don't build abstractions, frameworks, or systems ahead of proven need. At the same time, stay aware of high-level goals and potential future directions, and let that awareness inform today's decisions -- not by building for the future, but by not painting into corners.

Any aspect of the design or implementation may change as concrete outcomes reveal better approaches. Treat the architecture as a living document, not a fixed spec.

### Gestalt awareness

As the design and implementation evolve, every change should be considered in context of the whole. The architecture, code, and documentation should remain internally consistent, well-structured, and clean at all times -- not just locally correct but coherent as a unified whole.

This applies to documentation as much as code: when one part of the architecture changes, all related parts should be updated to reflect the change, so that the full picture is always accurate and navigable.

## Inspiration

- Obsidian
- Workflowy
- Tana
- Linear
- Notion
- Airtable
- Google Sheets
- https://github.com/callumalpass/tasknotes/blob/main/docs/features/task-management.md

## Tech stack

### Local-first app

- The app is a Javascript app meant to run in a browser environment, but local-first and with no external dependencies - it runs as a local app once loaded and stores all of its data locally.
- In the future, asynchronous remote syncing of the database will be added, but syncing should occur in the background after optimistic local edits are made.

### Database (Local SQLite)

- All data is stored locally in SQLite, in the same browser environment (using the WASM SQLite build and web workers).

### Solid.js UI

- The app is built with Solid.js, a lightweight and super-performant reactive UI library, in order to serve the performance objectives.

## Layered architecture

The system is organized in four layers, from bottom to top:

```
┌───────────────────────────────────────────────────┐
│  Plugins (user-facing)                            │
│  ┌──────────┐ ┌──────┐ ┌────────┐ ┌─────┐         │
│  │ Outline  │ │ Tags │ │ Kanban │ │ ... │         │
│  └──────────┘ └──────┘ └────────┘ └─────┘         │
├───────────────────────────────────────────────────┤
│  Structural primitives (core building blocks)     │
│  ┌──────────┐ ┌─────────┐ ┌──────┐                │
│  │  Rank    │ │ Closure │ │ Join │                │
│  └──────────┘ └─────────┘ └──────┘                │
├───────────────────────────────────────────────────┤
│  Core                                             │
│  ┌────────────────┐ ┌──────────────┐ ┌──────────┐ │
│  │ Matrix registry│ │ Plugin system│ │  Query   │ │
│  │ + data tables  │ │ + face reg.  │ │  engine  │ │
│  └────────────────┘ └──────────────┘ └──────────┘ │
├───────────────────────────────────────────────────┤
│  SQLite (storage + computation)                   │
└───────────────────────────────────────────────────┘
```

### Core

The core provides the foundation: creating and managing **matrixes** (typed data tables), a **plugin system** for registering plugins and faces, a **query engine** for sandboxed evaluation of SQL expressions over matrixes, and raw SQLite access.

### Structural primitives

The core provides a small set of well-optimized, well-tested structural building blocks that plugins can request for their matrixes. These are not plugins themselves -- they are capabilities that the core provisions and manages on behalf of plugins. See [Primitives](./Primitives.md) for detailed specs.

- **Rank** -- Lexorank-based row ordering within a scope.
- **Closure** -- ancestor/descendant hierarchy tracking.
- **Join** -- cross-matrix row references.

### Plugins

Plugins compose core matrixes and structural primitives to provide user-facing functionality. Each plugin can create matrixes, request primitives for them, and register faces. See [Plugins](./Plugins.md) for the plugin model and concrete examples.

### Faces

Faces are the views and interaction surfaces that plugins provide. Every face renders the result of a **query expression** -- a sandboxed SQL query evaluated against the matrix namespace. The query determines what data the face shows; the face type determines how it's rendered and what interactions are available.

Faces update optimistically with user input and propagate updates to underlying data asynchronously. If updates fail, faces retry and get user input if intervention is needed.

Faces can represent:

- A matrix's full contents (the **identity face** -- see below).
- A filtered, sorted, or grouped subset of a matrix.
- A joined view across multiple matrixes.
- Aggregations, computed results, or dashboards.
- Forms to insert new rows.
- Lightweight always-on surfaces (e.g. a notification tray that reactively shows fired reminders or status updates). Not every face is a full panel -- a face can be as small as a badge or toast.

## Execution model

SQLite is not just the storage layer -- it is the primary computation and data manipulation substrate. All relational logic (reads, writes, structural operations) is expressed in SQL and executes inside the SQLite engine. TypeScript serves as a thin orchestration layer that routes user actions to the appropriate SQL operations and wires results to the UI.

### Three tiers

| Tier | What lives here | Examples |
|---|---|---|
| **Custom SQLite functions** | Byte-level algorithms that are procedural by nature, registered as deterministic SQLite functions at init. They execute inside the SQLite engine and can be called from any SQL statement. | `lexo_between(prev, next)` for Lexorank key computation, `lexo_next_prefix(key)` for subtree bounds |
| **Prepared SQL transactions** | All relational operations: queries, data mutations, structural primitive operations. Expressed as parameterized SQL and kept as prepared statements in the worker for repeated use. | Closure maintenance (`INSERT ... SELECT` for ancestor relationships), rank key rewriting, data table inserts/updates, join table operations |
| **TypeScript orchestration** | Routing: which prepared statement to execute for a given user action. Binding parameters. Error handling. UI event dispatch. No data manipulation logic. | Determining which insert case applies (after sibling? first child? at end?), binding the parameters, executing the prepared transaction |

### Why SQL-first

**Atomic transactions.** Operations that span multiple related tables (ordering + closure + data) execute as a single SQL transaction. No partial states, no JS-interleaved failure modes.

**Prepared statements.** Frequently executed operations (insert row, reorder, query visible rows) are prepared once and reused with different bound parameters. The SQLite engine skips parsing and planning on reuse. The worker can keep statements warm and send reactive updates immediately when subscribed queries are invalidated.

**Minimal round trips.** Set-based SQL operations replace fetch-loop-insert patterns. For example, creating closure relationships for a new child row is a single `INSERT ... SELECT` that generates all ancestor rows inside the engine, rather than querying ancestors to JavaScript, looping, and inserting one at a time.

**One computational substrate.** The same SQL that powers user-facing query expressions (formula columns, live searches, face data sources) also powers core operations (rank, closure, joins). Plugins compose SQL for both reads and writes. There is one language for data, not two.

### Boundary: what stays in TypeScript

TypeScript handles things that are not relational:

- **UI rendering and interaction** (Solid.js components, event handlers).
- **Routing logic** (determining which operation to execute based on user intent).
- **Worker communication** (message passing between the main thread and the SQLite worker).
- **Lifecycle management** (plugin init/destroy, scheduling).
- **Non-relational algorithms** that are registered as custom SQLite functions (the functions themselves are authored in TypeScript but execute inside SQLite).

The guiding principle: **prefer SQL** whenever it is nearly as simple as the TypeScript alternative and the benefits (atomicity, prepared statements, fewer round trips) apply well. SQL is a strong default, not a strict requirement. If an operation would be significantly simpler or more maintainable in TypeScript outside the SQL engine, do it in TypeScript -- the goal is clarity and fitness, not purity. TypeScript is the orchestrator; SQL is the preferred operator.

## Core concepts

### Matrix

- **Matrixes** are the elemental data container of the app. A matrix is a typed SQLite data table with a schema (columns and types).
- A matrix's data table is a normal, user-expandable SQLite rowid table. Columns use default settings (no extra constraints), but can otherwise contain any kind of data.
- Each matrix has exactly one **identity face** that is lifecycle-bound to it. Creating a matrix creates its identity face; deleting the identity face deletes the matrix. The identity face is the matrix's representation in the outline and the full-authority surface for managing its contents.
- Matrixes can be created by users, by plugins, or programmatically. The matrix registry may include metadata (such as a `source` or `plugin_id`) to track provenance.

### Row

- **Rows** are the addressable units within a matrix -- they correspond directly to rows in the matrix's SQLite data table.
- Each row has a locally unique `rowid` within its matrix. A row is globally identified by its `(matrix_id, rowid)` pair.
- Rows carry typed column values as defined by the matrix's schema, including both literal columns (user-editable data) and formula columns (SQL expressions evaluated per-row).

### Query expression

SQLite is the user-facing computation engine. A **query expression** is a sandboxed SQL query that produces a result set for a face to render. Every face receives its data through a query expression, making query evaluation the uniform interface between data and presentation.

Query expressions appear at three granularities:

- **Face query** -- the data source for a face. The identity face's query is implicitly `SELECT * FROM matrix_N`. Other faces have explicit queries that may filter, join, aggregate, or compute over one or more matrixes.
- **Formula column** -- a matrix column whose value is a SQL expression evaluated per-row, with access to the current row's values. Formula columns appear alongside literal columns in query results but are not directly editable.
- **Inline expression** -- a SQL expression embedded in text content that evaluates to a scalar value rendered inline.

#### Sandboxing

Query expressions run in a read-only sandbox using SQLite's authorizer callback:

- **Read-only.** Only `SELECT` operations are authorized. `INSERT`, `UPDATE`, `DELETE`, and DDL are rejected at parse time.
- **Table scoping.** Only matrix data tables are accessible, not internal system tables (matrix registry, rank tables, closure tables, plugin config).
- **Resource limits.** Step limits via `sqlite3_progress_handler` prevent runaway queries. Result sets are capped.
- **No side effects.** Dangerous functions (e.g. `load_extension()`) are blocked. Only pure, deterministic functions are available.

#### Name resolution

The query engine resolves human-readable matrix names to their underlying tables, so queries reference matrixes by name rather than internal ID. Custom SQL functions provide ergonomic shortcuts for common patterns (e.g. following join references).

#### Reactive updates

All data mutations flow through prepared SQL transactions in the worker. When a mutation touches a table, the worker invalidates and re-evaluates any prepared subscription whose query reads from that table. Subscriptions for currently visible faces fire immediately; off-screen faces are marked stale and re-evaluated lazily when scrolled into view.

### Identity face

The **identity face** is the canonical face for a matrix, bound to it 1-to-1. It is the matrix's representation in the outline and the full-context, full-authority surface for its data.

**What the identity face shows:**

- All columns (literal and formula, with formula columns visually distinct).
- All rows (no filter applied).
- The matrix schema (column names, types, which columns are formulas).
- The matrix identity (name, metadata).

**What the identity face uniquely permits (beyond what other faces allow):**

- Row deletion.
- Schema modification (add, remove, rename columns; define formula columns).
- Matrix deletion (deleting the identity face deletes the matrix).

The identity face is also the **source** in the hydration model -- the pool from which data flows downstream to other faces.

### Hydration

The hydration model governs what is editable and what is read-only across all faces. Data originates at its **source** (the identity face for a matrix) and **flows** downstream through query expressions to other faces.

#### Hydrated columns

A column in a face's query result is **hydrated** if it has flowed from its source matrix without modification -- the face has the matrix ID, the rowid, and the column value corresponds directly to a literal column in the source table. Hydrated columns are live and editable from any face, because editing them writes back to a specific, identifiable cell in a specific source row.

Join reference columns are hydrated like any other column. A visible join reference can be edited (relinked to a different target row), cleared (unlinked), or filled (creating a new link). These operations translate to changes on the join table, but from the user's perspective it is simply editing a visible cell value. If the join reference column is not selected in the query, the join relationship is invisible and untouchable.

#### Dry columns

A column is **dry** if it is computed -- a formula column, an aggregation, or a derived expression in the query. Dry columns are read-only. There is no source cell to write back to.

#### Row addition

New rows can be added from any face where the source matrix is unambiguous. When adding a row through a filtered face, the filter criteria are used as default values for the new row.

#### Destructive operations

Water only flows downstream from the source. Destructive operations -- row deletion, schema modification, matrix deletion -- require being at the source: the identity face. This ensures the user has full context (all columns, all rows, the complete picture) before destroying data.

This does not mean deletion is absolutely never available outside the identity face, but if offered, it would be a special, confirmation-gated operation -- not the default affordance. The default state of non-identity faces is: edit what you can see, add new things, but don't destroy what you might not fully see.

#### Summary

| Operation | Any face (hydrated) | Identity face |
|---|---|---|
| Edit a literal column value | ✓ | ✓ |
| Edit a join reference | ✓ (if column visible) | ✓ |
| Add a new row | ✓ (if source unambiguous) | ✓ |
| Delete a row | ✗ (default) | ✓ |
| Modify schema | ✗ | ✓ |
| Delete the matrix | ✗ | ✓ |

## UI concepts

- Performance is king - everything in a single frame.
- Simple, obvious keyboard shortcuts for everything.
- Outline is maximally easy to work with as an outline.
  - Drag-and-drop reordering with handles.
