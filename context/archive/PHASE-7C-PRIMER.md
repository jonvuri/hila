# Hila — Primer for the Phase 7c design iteration

> **Purpose of this doc.** A temporary, self-contained briefing to bring a fresh agent up to speed on Hila's goals, architecture, and current state — enough context to iterate productively on the open design questions in [`context/Phase-7c.md`](context/Phase-7c.md) (the row↔table continuum). It summarizes the canonical docs in `context/` so you don't have to read all of them first, but it points to them where depth matters. The canonical docs remain the source of truth; this file is disposable.

---

## 1. What Hila is

Hila is a **local-first personal knowledge/data app** that unifies four experiences into one gestalt:

- note-taking,
- outlining,
- document authoring, and
- a personal database of spreadsheets.

The defining idea: **the same data is viewable and editable through different "faces"** (an outline, a document, a spreadsheet, a board, a flashcard…), all backed by the same SQLite tables. Two slogans capture the vision:

- "A bullet **is** a note if you zoom in far enough." (outline ↔ document axis — already delivered)
- "A cluster of bullets **is** a table if you give it columns." (outline ↔ table axis — the subject of Phase 7c)

Design north stars: **performance** (every interaction < 50ms, single-frame feel), **simplicity & composability** (a coherent whole, not a suite of disconnected features), and **incremental, intentional evolution** (build only necessary complexity; keep architecture, code, and docs internally consistent — "gestalt awareness").

Inspirations: Obsidian, Workflowy, Tana, Linear, Notion, Airtable, Google Sheets.

### Tech stack

- **Solid.js** UI (fine-grained reactivity for performance).
- **SQLite (WASM) in a Web Worker**, persisted to **OPFS**. SQLite is not just storage — it's the primary computation substrate. Relational logic (reads, writes, structural ops) is expressed in SQL; TypeScript is a thin orchestration layer.
- **ProseMirror** for rich text (per-row editor instances, JSON stored in columns).
- **OPFS** also stores binary files (content-addressed); sync to a remote provider (Dropbox first) is planned but not built.
- Reactivity: a `useQuery(sql)` hook subscribes to worker-side prepared queries; mutations invalidate and re-run affected subscriptions.

---

## 2. Architecture in one pass

Three layers, bottom to top (full detail in [`context/Architecture.md`](context/Architecture.md)):

```
Plugins (user-facing)      Outline / Notes / Tags / … — ALL features are plugins
─────────────────────────────────────────────────────────────────────
Core                       Matrix registry + data tables
                           Plugin system + face registry
                           Query engine (sandboxed SQL)
                           Trait system: rank, closure (per-matrix)
                           Join table (global)
─────────────────────────────────────────────────────────────────────
Storage & sync             SQLite (OPFS) + file store (OPFS) + sync engine
```

### Core concepts (these are the vocabulary you must internalize)

- **Matrix** — the elemental data container: a typed SQLite data table with a schema. Its addressable units are **rows**. Matrixes exist independently of any plugin and live in a **flat registry** (they are *not* nested in one big tree). A row is globally identified by `(matrix_id, row_id)`; IDs are random large integers (sync-safe).
- **Identity face** — every matrix has exactly one, lifecycle-bound to it. It is always the **table face** (every column shown as a spreadsheet column). It is the full-authority surface: only here can you delete rows, modify schema, or delete the matrix. It is also the "source" in the hydration model.
- **Traits** — per-matrix structural metadata tables the core provisions on demand (`ensureTrait(type, matrixId)`), shared by all consumers, persistent. Two exist:
  - **rank** — Lexorank tree-position ordering. *Global* table partitioned by `matrix_id`; the Lexorank key encodes both order and hierarchy (a parent's key is a prefix of its children's).
  - **closure** — per-matrix ancestor/descendant table (`mx_{id}_closure`), source of truth for tree structure + depth.
  - Traits are not plugins; they have no agency. Applying a face with trait requirements (e.g. outline) auto-provisions them.
- **Join table** — *global* infrastructure (not a trait). Cross-matrix row references with a `kind`:
  - **`ref`** — independent link ("mentions"). No lifecycle coupling. Used by `@`-references (wiki-links, FK cells, backlinks).
  - **`own`** — lifecycle-bound ("created and owns as an aspect"). Cascade-deletes the target when the source row is deleted or the join is severed. Each target row has **at most one** `own` join (single ownership). Used by `#`-tags.
  - Key ops: `createDependentRow(...)` (insert target row + `own` join atomically) and `createRefJoin(...)`.
- **Faces** — the views/interaction surfaces plugins register. Every face renders the result of a **query expression** (sandboxed SQL). Face types declare **slots** (named positions with preferred column types); a matrix's columns **bind** to slots via a resolution chain (explicit > name match > type+position > fallback). Columns that bind to no slot are **overflow columns**, rendered in a face-specific secondary area. A face never refuses a matrix — it degrades gracefully.
- **Hydration** — the editability model. A column is **hydrated** (live, editable from any face) if it traces back unmodified to a source cell; it is **dry** (read-only) if computed (formula/aggregation). Destructive ops require the identity face.
- **Ops** — all writes flow through typed, named operations (`MatrixOperationMap` registry). The same ops back the UI, plugins, MCP agents, batch executor, and test fixtures. **Batches** are atomic ordered op sequences with `$ref` forward references.
- **Column identity** — columns have stable integer IDs independent of names; durable cross-references (slot bindings, sort/filter, formulas) use the ID. Columns also carry an optional **role** (`label` or `content`) — data-level semantics independent of face slots; the workspace face locates its columns by role.

### Plugins (all features are plugins)

A plugin is "a graph of named SQL expressions + thin TS orchestration": it declares matrixes, requested traits, named queries, named mutations, face bindings, and `init`/`destroy` hooks. Plugins compose **through shared data (SQL)**, not direct API calls. The canonical example: tags + inline-references interact only via the tag registry matrix, the `joins` table, and `mx_N_data` tables. See [`context/Plugins.md`](context/Plugins.md).

The three plugins that matter for 7c:

- **Workspace plugin (`hila.workspace`)** — the primary experience. A single matrix with two columns: `label` (single-line richtext, role `label`) and `content` (multi-paragraph richtext, role `content`). Rank + closure traits. Its face is the **stream view**. Every row is simultaneously an outline bullet and a potential document.
- **Inline references plugin (`hila.inlineref`)** — shared editor infra providing `@` (ref) and `#` (tag) ProseMirror nodes, autocomplete, rendering, and join-table sync on save. Creates no matrixes of its own.
- **Tags plugin (`hila.tags`)** — manages tag types. **Each tag type is a regular matrix** with a user-defined schema (e.g. `#task` → a Tasks matrix). A registry matrix tracks which matrixes are tag types. Tagging a row with `#task` calls `createDependentRow` to make an `own`-joined **aspect row** in the task matrix. The outline row *is* a task; the aspect row holds the task data.

---

## 3. What's actually built (current state)

Phases 1–7b are complete (see [`context/Plan.md`](context/Plan.md) for the full phased plan). In practice the running app today has:

- A **stream view** (`src/workspace/StreamView.tsx`, `NavigationPanel.tsx`, `FocusPanel.tsx`): an **overlaid-cards** layout of navigation panels + focus panels arranged left-to-right, always representing a single ancestry chain. Navigation panels are the virtualized outline (Enter/Tab/Backspace/arrows/collapse/drag-drop); focus panels show one row's label header, content editor, **overflow "Properties" list**, backlinks, and a nested child navigation panel. Panel-stack state machine: append/replace/close focus panels, max 4 columns, clickable ancestor tabs, `Cmd/Ctrl+L` to focus, `Cmd+Left` to pop. Phase 7b added universal label tabs, a collapse chevron, a slimmed nav header (intra-panel zoom was removed — nav panels are locked to their focus panel's children), and a Storybook presentational split (`src/design/overlaid-cards/OverlaidCards.tsx`) with two themes (expanded-staircase, collapsed-breadcrumb).
- A **table face** (`src/table/TableFace.tsx`): full-featured but **isolated** — typed columns (text/number/date/boolean/select/reference), sort, filter, formula columns, reference cells. It is the identity face for every matrix, but is **never embedded** inside the stream view yet.
- **Inline references + tags**: `@` and `#` work in outline and content text; tag aspect rows via `createDependentRow`; tag property panel (`FieldEditor` in `src/shared/FieldEditor.tsx`); tag badge rendering (`InlineRefView`); tag browser face; full owned-join cascade lifecycle.
- **Core**: matrix registry, rank + closure traits, global join table, query sandbox, op registry, column identity + constraints + roles, face registry + slot binding, sync-readiness (unique IDs, change tracking) — but **no live sync** yet.
- Admin/debug: matrix browser, SQL runner.

### The stubs and gaps that motivate Phase 7c

These are the concrete disconnections 7c is designing around (audited in `Phase-7c.md §2`):

- **Child-matrix references are stubbed.** The `rank` schema has `row_kind` with `0 = row`, `1 = child_matrix_ref` (where `row_id` then holds the *child matrix's* id) — see `src/core/matrix.ts` line ~80. **Nothing creates a `row_kind = 1` entry**, and `FocusPanel` only renders a placeholder string: *"Child matrix reference (row_kind=1). Table face would render here."* (FocusPanel.tsx ~line 463).
- **The workspace matrix is homogeneous** (`label` + `content` only). Extra columns render as a flat "Properties" list **only** in the focus panel (overflow section via `FieldEditor`); navigation rows show no property preview.
- **The table face is isolated** — never embedded in the stream view; the "live embedded query face" workflows from `Architecture.md` are unimplemented.
- **The stream view assumes a single matrix** — its ancestry/breadcrumb model walks one matrix's closure; crossing into a child matrix is not handled.
- **Three overlapping ways to add structure already exist**: intrinsic columns (matrix-wide), `#tag` aspect rows (an `own`-join to a tag-matrix row), and child-matrix references (a row that is a whole matrix). Reconciling these is the heart of the phase.

---

## 4. Phase 7c — the design exploration you're iterating on

**This is a design-exploration phase, not a feature build.** Output is documentation and resolved decisions, then a sequence of focused follow-on sub-phases — *before* implementation. It's the row/table analog of the 7/7b breadcrumb deep dives. Full text: [`context/Phase-7c.md`](context/Phase-7c.md).

### 4.1 The settled foundation (don't relitigate unless you have strong reason)

**Two layers — separate how structure is *stored* from how it is *seen*:**

- **Data layer (stored):** everything is rows in matrixes. A row carries structure in its own columns or *attaches* structure stored in another matrix.
- **View layer (seen):** faces over a matrix or query. **Outline and table are faces, not data kinds.** The continuum is largely a view-layer phenomenon (face-swap, zoom, embed).
- **Thesis:** "homogeneous vs heterogeneous" is a *storage* distinction; "outline vs table" is a *viewing* distinction. They are orthogonal and composable.
- **Load-bearing realization:** a tag-type matrix **is** a database of records. The `#task` matrix is literally a Tasks table; each aspect row is a record; the `own` join links it to its host. "View all my tasks as a table" = the table face over the `#task` matrix. No separate "Tasks database" to invent.

**The attachment primitive (7c.0, resolved).** A node has one identity (its row) plus a set of **attachments**. An attachment binds the node to a set of rows in some matrix via a **binding**:

| Binding | Meaning | Lifecycle |
|---|---|---|
| **own-rows** | node owns specific rows in a (possibly shared) matrix via `own`-joins | cascade-delete those rows (today's `#tag` / `createDependentRow`) |
| **own-matrix** | node owns an entire dedicated matrix | cascade the whole matrix (the `row_kind = 1` path, made real) |
| **query** | node references rows matching a predicate (often node-scoped) | none — a computed `ref`-style view |

Ownership **falls out of the binding kind** — it's not a separate flag the user juggles.

**Two resolved open questions:**

1. **Cardinality is not the axis.** Single-ownership is *per target row* (each row has ≤1 owner) and holds at any cardinality, so **0..N is allowed**. The real axis is **ownership granularity**: own-rows (specific rows in a shared matrix) vs own-matrix (a dedicated matrix). "This node *is* a task" = own-rows @ cardinality 1, shown as merged inline fields. "Many tasks under this node" = same binding @ N, shown as a collection. Singleton-ness is a per-attachment display/constraint choice, not a law.
2. **One primitive, a few presets.** The aspect / collection / query trichotomy collapses into **one parametric primitive (the attachment) with three named UX presets**:

| Preset (UX gesture) | Binding | Typical cardinality | Default display |
|---|---|---|---|
| **Tag** ("this is a …") | own-rows | 0/1 | merged inline fields (property surface) |
| **Collection / sub-table** | own-rows (shared) or own-matrix (dedicated) | 0..N | a face (table / outline / board) |
| **Live view** | query | 0..N | a face, read-through (editable where hydrated) |

So: **one mechanism** under the hood (joins/queries + faces — great for ops/sync/MCP), a **small set of comprehensible gestures** at the UX layer, plus a general form for power use.

**Where intrinsic columns fit.** Intrinsic columns are the base case (structure in the node's own row). A node's **property surface** = its intrinsic columns ∪ the fields of its 0/1 owned attachments. Important consequence: the workspace ("everything") matrix **should not grow user-domain columns** (columns are matrix-wide, so a "priority" column would attach to *every* bullet). Domain structure goes through attachments. Therefore **"promote a subtree to a table" is a real matrix migration** (create a dedicated matrix via own-matrix and move/reference rows), not a free in-place face-swap. Intrinsic columns stay first-class for purpose-built matrixes.

### 4.2 The sub-phase sequence (most foundational → hardest)

- **7c.0 — Attachment model.** ✅ Resolved (above). Gates everything.
- **7c.1 — The property surface.** Intrinsic columns + 0/1 owned attachments rendered as inline fields: a consistent property list in the focus panel and a compact preview in navigation rows; the add/edit gesture; coexistence of intrinsic columns and tag fields. Builds on the existing overflow list, `FieldEditor`, tag chips. Most tangible; complementary to Phase 8.
- **7c.2 — Collections & live views.** Render a row-set under a node as an embedded face: own-rows @ 0..N (owned collections) and query bindings (live views). Node-scoped query authoring; editable-in-place hydration (Notion-linked-database style). First among collection presets — serves daily task/review cases, needs no new ownership machinery.
- **7c.3 — Dedicated sub-tables (own-matrix).** Realize `row_kind = 1`: a creation op, matrix-level ownership/lifecycle, the embedded `TableFace`, a navigation-panel collapsed preview, outline interactions around a sub-table row.
- **7c.4 — Crossing matrix boundaries.** Drill into an attached/record row as a focus panel; generalize the overlaid-cards ancestry/breadcrumb across matrix boundaries; the panel-stack state machine. Hardest — touches the stream view's core state.
- **7c.5 — Paradigm convergence (forward note).** Table face with hierarchy; outline with a column view; face-swapping a subtree. Mostly a documented direction.

Dependency shape: `7c.0 → 7c.1 → {7c.2, 7c.3} → 7c.4`, with `7c.5` as a forward note off `7c.0`/`7c.4`.

### 4.3 The open sub-questions still to resolve (the actual iteration targets)

Deferred from 7c.0, to be settled in later sub-phases — **these are likely what you'll be iterating on**:

- **own-matrix representation (→ 7c.3):** how is "this node owns matrix M" stored and cascaded? The `row_kind = 1` ref plus an ownership convention? A `matrix.owner` field? A join to the matrix's identity? How does cascade-deleting a whole matrix work?
- **node-scoped query authoring + editable-in-place hydration (→ 7c.2):** how does a user author a node-scoped predicate ("tasks whose host is in this subtree"), and how do edits in a query view write back?
- **cross-matrix ancestry/breadcrumbs and drilling (→ 7c.4):** how does the overlaid-cards model represent a chain that crosses from the workspace matrix into a tag/child matrix and back?
- **own-rows @ 0..N vs own-matrix:** do a scoped collection over a *shared* matrix and a *dedicated* matrix feel different enough to warrant distinct gestures, or do they unify in the UX? (revisit in 7c.2 / 7c.3)

### 4.4 Coordination with other phases & cross-cutting open questions

- **Phase 8 is the same mechanism.** Phase 8's `#task` / `#movie-review` aspect rows via `createDependentRow` **are** the own-rows binding; their identity faces are table faces over the tag-type matrix. Phase 8's renderer registry, tag templates, and tag property panel are the **rendering substrate** for the 7c.1 property surface. Design 7c.1 so the Phase 8 registry/panel can realize it directly. (Phase 8 detail: [`context/Phase-8.md`](context/Phase-8.md).)
- **Phase 7d** (renumbered from old 7c) is the cohesive design-system / view-hierarchy / theming pass. It deliberately **follows** 7c so the token system spans 7c's new surfaces (property surface, embedded collections, query views, cross-matrix nav). Its big open questions: is the workspace the root of all views or a peer? full set of top-level views + navigation? plugin view-composition model? one reconciled design language? ([`context/Phase-7d.md`](context/Phase-7d.md).)
- **Relevant `Plan.md` open design questions** 7c touches:
  - **#3 Singleton tags / shared aspects** — with cardinality freed, this becomes "own-rows binding (a new owned aspect) vs `@`-ref (a ref to an existing entity)." The model now expresses both.
  - **#4 Labeled/typed joins** — query/own-rows attachments would benefit from labeled joins for richer reverse lookups ("appears as Author in…"). A dependency to note; resolve if 7c.2 needs it.
  - **#5 Face affinity** — which face a child matrix renders in (7c.3) is the face-affinity question; an attachment can carry a preferred face.

---

## 5. Where things live in the code

Grounding for any design discussion that needs to reference real surfaces:

| Concern | Files |
|---|---|
| Stream view (panel-stack state, ancestry data, MAX_COLUMNS) | `src/workspace/StreamView.tsx` |
| Navigation panel (outline tree, virtualized) | `src/workspace/NavigationPanel.tsx` |
| Focus panel (label/content/**overflow "Properties"**/backlinks/children; **child-matrix-ref placeholder**) | `src/workspace/FocusPanel.tsx` |
| Presentational overlaid cards + themes (Storybook) | `src/design/overlaid-cards/OverlaidCards.tsx`, `*.stories.tsx`, `types.ts` |
| Workspace plugin (matrix, named queries: single row, ancestry, backlinks, title) | `src/workspace/workspace-plugin.ts` |
| Table face (typed columns, sort/filter, formulas, reference cells) | `src/table/TableFace.tsx`, `table-query.ts`, `formula.ts` |
| Per-column-type field editors (used by tag property panel + focus overflow) | `src/shared/FieldEditor.tsx` |
| Inline refs (`@`/`#` PM node, plugin, sync, rendering) | `src/editor/inlineref-*.ts`, `src/editor/nodeviews/InlineRefView.tsx` |
| Tags (registry, search provider, browser, property panel) | `src/tags/*` |
| Core matrix schema + **`row_kind` (0=row, 1=child_matrix_ref)** | `src/core/matrix.ts` (rank table DDL ~line 78–82) |
| Traits (rank/closure provisioning + ops) | `src/core/traits.ts` |
| Faces (registry, slot binding, config, renderer) | `src/core/face-registry.ts`, `slot-binding.ts`, `face-config.ts`, `FaceRenderer.tsx` |
| Ops registry + worker handlers | `src/core/matrix-types.ts`, `src/core/worker/matrix-handler.ts` |
| Reactive query hook | `src/sql/useQuery.ts` |

### Conventions & checks

- TypeScript, Solid.js. Prefer `type` over `interface`; prefer arrow functions over declarations.
- After substantive changes run: `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test:run`, and (E2E) `pnpm test:e2e` (run E2E with system browsers — see `AGENTS.md`; ~4 min, 110 tests).
- Phased plans use checkboxes (`- [ ]` / `- [x]`) — check items off as you complete them. But 7c is exploration: its early output is **decisions and docs**, not checked-off implementation.

---

## 6. How to engage with the 7c design questions

The user wants to dive into the **open design questions** (§4.3 above) with an independent agent. When iterating:

1. **Honor the settled model** (the data/view split and the one-attachment-primitive-with-presets, §4.1). Treat it as the foundation; only revisit with explicit, well-argued cause.
2. **Stay within the development principles:** incremental and intentional (don't over-build), gestalt-aware (keep architecture/code/docs coherent), performance-conscious.
3. **Ground proposals in the real stubs** — especially the `row_kind = 1` child-matrix path, the focus-panel overflow/property surface, the isolated table face, and the single-matrix assumption in the stream view.
4. **Respect the orthogonality with Phase 8** — the property surface (7c.1) should be realizable by Phase 8's renderer registry / property panel.
5. **Output is design**: resolved decisions, conceptual models, and (where useful) the storage/op/UX shape — captured so the canonical `context/` docs can absorb them. Implementation comes later, per sub-phase.

Canonical reading order if you want to go deeper: `Phase-7c.md` → `Architecture.md` (faces, hydration, joins, identity face) → `Traits.md` (rank/closure/join) → `Plugins.md` (workspace/inlineref/tags, slot model) → `Plan.md` (resolved decisions + open questions) → `Phase-8.md` and `Phase-7d.md` (coordination).
