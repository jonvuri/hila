---
title: Concept ledger
kind: canonical
state: active
updated: 2026-10-01
---

# Concept ledger

One entry per concept, ordered from storage atoms upward. Each name means one thing. Search for
an old word: every legacy document name and code identifier appears under "Also called", and the
[deprecated terms](#deprecated-terms) table maps old names to new ones.

Field rules:

- **Kind** is data, presentation, runtime, or policy.
- **Owner** is the topic document that holds the detailed contract.
- **Invariants** cite [decisions](Decisions.md). Rationale lives only there.
- **Relates to** lists the earlier concepts an entry builds on, plus siblings at its level.
- **Code anchors** are repository paths. `npm run check:concepts` verifies that they exist.
- **Status** is shipped, designed, or deferred.

## Storage

### Matrix

- **Name:** matrix
- **Also called:** table, matrix table, `matrix`, `mx_<id>_data`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#matrixes-and-columns)
- **Definition:** A typed SQLite data table plus one registry row with a random stable ID, a
  title, an optional source plugin, and an optional owning node. Every row belongs to exactly one
  matrix, which fixes its columns.
- **Invariants:** User-meaningful data lives in matrixes ([Decision 2](Decisions.md#decision-2)).
  Every matrix except the workspace root has an owning node ([Decision 3](Decisions.md#decision-3)).
  A matrix outlives the plugin that created it ([Decision 31](Decisions.md#decision-31)).
- **Relates to:** none
- **Code anchors:** `src/core/matrix.ts`
- **Status:** shipped

### Column

- **Name:** column
- **Also called:** stable column ID, `matrix_columns`, `ColumnDefinition`, `managed_by`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#matrixes-and-columns)
- **Definition:** One typed column of a matrix, with a stable ID, a mutable name, a SQLite type, a
  display type, an order, and optional constraints. A plugin can mark a column as managed so it
  cannot be removed by accident.
- **Invariants:** Durable references use column IDs, never names ([Decision 1](Decisions.md#decision-1)).
- **Relates to:** Matrix
- **Code anchors:** `src/core/matrix.ts`
- **Status:** shipped

### Column role

- **Name:** column role
- **Also called:** role, semantic role, label role, content role, `SemanticColumnRole`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#matrixes-and-columns)
- **Definition:** A column may carry `label` (short identifying text used by navigation, references,
  and search) or `content` (long rich text). A matrix has at most one of each, and only physical
  `TEXT` columns qualify.
- **Invariants:** The workspace matrix has exactly one label column and one content column and no
  user-domain columns ([Decision 3](Decisions.md#decision-3)).
- **Relates to:** Column
- **Code anchors:** `src/core/semantic-role.ts`
- **Status:** shipped

### Formula column

- **Name:** formula column
- **Also called:** formula, `formula_column_deps`, `ƒ`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#matrixes-and-columns)
- **Definition:** A column whose value is computed from other columns of the same row. It is
  read-only and cannot carry a column role.
- **Invariants:** Formula values are read-only fields ([Decision 20](Decisions.md#decision-20)).
- **Relates to:** Column
- **Code anchors:** `src/table/formula.ts`, `src/core/matrix.ts`
- **Status:** shipped

### Row

- **Name:** row
- **Also called:** data row, logical row, record, `(matrix_id, row_id)`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#matrixes-and-columns)
- **Definition:** One record in one matrix, identified by matrix ID and row ID. A row can be
  discussed apart from any place in the tree; its tree role is the node.
- **Invariants:** A row has exactly one ownership home ([Decision 5](Decisions.md#decision-5)).
  Editing targets the row, not a position ([Decision 24](Decisions.md#decision-24)).
- **Relates to:** Matrix, Column; siblings Node and Stream item
- **Code anchors:** `src/core/matrix.ts`
- **Status:** shipped

### Field

- **Name:** field
- **Also called:** cell, property, property field, column value
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#matrixes-and-columns)
- **Definition:** One column value of one row, as shown or edited. "Cell" is used only for the
  intersection in a table grid.
- **Invariants:** Write-back is decided per field ([Decision 20](Decisions.md#decision-20)).
- **Relates to:** Row, Column
- **Code anchors:** `src/shared/FieldEditor.tsx`, `src/shared/property-surface.ts`
- **Status:** shipped

### Edge

- **Name:** edge, with **edge kind** `own`, `ref`, or `portal`
- **Also called:** join, relation, relationship, `joins`, `JoinKind`, `kind`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#the-ownership-forest)
- **Definition:** One row in the global `joins` table, pointing from a source row to a target row.
  `own` makes the target a child with a lifecycle home. `ref` is a non-owning association. `portal`
  places the target at an additional position.
- **Invariants:** Only `own` cascades; `own` and `portal` carry sibling keys
  ([Decision 4](Decisions.md#decision-4)). Ownership is single
  ([Decision 5](Decisions.md#decision-5)).
- **Relates to:** Row
- **Code anchors:** `src/core/matrix.ts`, `src/core/tree.ts`, `src/core/portal.ts`
- **Status:** shipped

### Sibling key

- **Name:** sibling key
- **Also called:** edge key, `edge_key`, lexorank key, rank key, `rank`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#own)
- **Definition:** A byte string on an `own` or `portal` edge that orders the target among its
  siblings. Keys are local to one parent.
- **Invariants:** `ref` edges carry no key ([Decision 4](Decisions.md#decision-4)).
- **Relates to:** Edge
- **Code anchors:** `src/core/lexorank.ts`, `src/core/tree.ts`
- **Status:** shipped

### Root sentinel

- **Name:** root sentinel
- **Also called:** `(0, 0)`, `ROOT_MATRIX_ID`, `ROOT_ROW_ID`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#own)
- **Definition:** The virtual parent of every top-level row. It is not a real row.
- **Invariants:** Every live row has one inbound `own` edge, top-level rows from the sentinel
  ([Decision 5](Decisions.md#decision-5)).
- **Relates to:** Edge
- **Code anchors:** `src/core/ids.ts`
- **Status:** shipped

### Durability class

- **Name:** durability class
- **Also called:** replication policy, durability policy, `DurabilityClass`,
  `CORE_DURABILITY_POLICY`
- **Kind:** policy
- **Owner:** [Sync](Sync.md#durability-policy)
- **Definition:** Every table and column is replicated source of truth, derived and rebuildable, or
  deliberately device-local. A contract test fails when anything is unclassified.
- **Invariants:** Every field declares a class ([Decision 11](Decisions.md#decision-11)).
  Device-local needs review ([Decision 38](Decisions.md#decision-38)). Derived caches never
  replicate ([Decision 39](Decisions.md#decision-39)).
- **Relates to:** none
- **Code anchors:** `src/core/durability-policy.ts`, `src/core/durability-policy-audit.ts`
- **Status:** shipped

## Tree and identity

### Node

- **Name:** node
- **Also called:** `NodeRef`, tree node
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#the-ownership-forest)
- **Definition:** A row together with its place in the tree: one home and one or more positions. A
  node is what can be focused, nested, and navigated. It shares the row's identity.
- **Invariants:** One home, plural positions ([Decision 5](Decisions.md#decision-5)).
- **Relates to:** Row, Edge; siblings Row and Stream item
- **Code anchors:** `src/core/tree.ts`
- **Status:** shipped

### Home

- **Name:** home
- **Also called:** ownership home, creation site, home position, `homeKeyOf`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#own)
- **Definition:** The position under a node's single `own` parent. It records where the row was
  created and decides its lifecycle.
- **Invariants:** Membership never moves a home ([Decision 6](Decisions.md#decision-6)).
- **Relates to:** Node, Edge
- **Code anchors:** `src/core/portal.ts`, `src/core/tree.ts`
- **Status:** shipped

### Position

- **Name:** position, as **home position** or **portal position**
- **Also called:** appearance, portal appearance, position key, `global_lexkey`,
  `AppearanceProvenance`, `PlaceAppearance`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#scroll-index)
- **Definition:** One place in the rooted tree where a node appears. A node has one home position
  and zero or more portal positions.
- **Invariants:** Position is plural ([Decision 5](Decisions.md#decision-5)). Rendering keys use
  positions ([Decision 24](Decisions.md#decision-24)).
- **Relates to:** Node, Home, Sibling key
- **Code anchors:** `src/core/scroll-index.ts`, `src/core/place-navigation.ts`
- **Status:** shipped

### Orphaned position

- **Name:** orphaned position
- **Also called:** ghost, ghost portal, ghost position, `is_ghost`, `insertGhostMarker`,
  `deleteHomeGhostingPortals`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#portal)
- **Definition:** A portal position that survives after its node's home was deleted. It shows that
  something was here but cannot be focused or opened.
- **Invariants:** Deleting a home orphans surviving portal positions ([Decision 5](Decisions.md#decision-5)).
- **Relates to:** Position, Home
- **Code anchors:** `src/core/portal.ts`, `src/core/scroll-index.ts`
- **Status:** shipped

### Closure

- **Name:** closure
- **Also called:** `closure`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#closure)
- **Definition:** A derived table of every ancestor and descendant pair reachable through `own`
  edges. It answers ancestry questions. Portals do not enter it.
- **Invariants:** Derived and rebuildable, never replicated ([Decision 39](Decisions.md#decision-39)).
- **Relates to:** Edge, Node
- **Code anchors:** `src/core/closure.ts`
- **Status:** shipped

### Scroll index

- **Name:** scroll index
- **Also called:** `scroll_index`, position index
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#scroll-index)
- **Definition:** A derived table of every position in preorder over `own` and `portal` edges. Its
  key concatenates sibling keys along the path, so any subtree is one contiguous key range.
- **Invariants:** Identity lookup is non-unique ([Decision 5](Decisions.md#decision-5)). Derived,
  never replicated ([Decision 39](Decisions.md#decision-39)).
- **Relates to:** Position, Sibling key
- **Code anchors:** `src/core/scroll-index.ts`
- **Status:** shipped

### Extent

- **Name:** extent
- **Also called:** membership plane, membership, matrix extent
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#matrix-ownership-and-type-nodes)
- **Definition:** The set of all rows in one matrix, regardless of where each sits in the tree. The
  tree with homes and positions is the other plane.
- **Invariants:** Extent and position are independent ([Decision 6](Decisions.md#decision-6)).
- **Relates to:** Matrix, Position
- **Code anchors:** `src/core/face-types.ts`
- **Status:** shipped

### Container node

- **Name:** container node, as **dedicated** or **shared**
- **Also called:** container, matrix owner, type container, dedicated container, sub-table,
  `owner_matrix_id`, `getMatrixOwner`, `isSharedMatrix`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#matrix-ownership-and-type-nodes)
- **Definition:** A node that owns a whole matrix. A dedicated container homes the matrix rows
  beneath itself. A shared container collects rows created in many places.
- **Invariants:** Owning a matrix does not change any row's home ([Decision 6](Decisions.md#decision-6)).
- **Relates to:** Node, Matrix, Extent
- **Code anchors:** `src/core/matrix.ts`
- **Status:** shipped

### Type node

- **Name:** type node
- **Also called:** type, type-node, promoted node, promoted type, tag type, `TagType`,
  `promoted_nodes`, `promoteNode`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#matrix-ownership-and-type-nodes)
- **Definition:** A container node promoted to act as a named type. Its label is the type name, and
  it appears in `#` completion and the launcher's `#` family.
- **Invariants:** The matrix title is a derived display cache of the label ([Decision 2](Decisions.md#decision-2)).
- **Relates to:** Container node
- **Code anchors:** `src/core/matrix.ts`, `src/tags/tag-types.ts`
- **Status:** shipped

### Aspect

- **Name:** aspect
- **Also called:** tag, tag aspect, tag property, attachment, owned aspect, `AspectPreview`,
  `createHostlessAspectRow`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#matrix-ownership-and-type-nodes)
- **Definition:** A row in a type node's matrix that describes another node. Typing `#Task` or
  using `/attach` creates one. "Tag" names only the `#` gesture.
- **Invariants:** An aspect has one home like any row ([Decision 5](Decisions.md#decision-5)).
- **Relates to:** Type node, Node
- **Code anchors:** `src/core/matrix.ts`, `src/shared/property-surface.ts`
- **Status:** shipped

### Inline reference

- **Name:** inline reference
- **Also called:** inlineref, wikilink, `InlineRefView`
- **Kind:** data
- **Owner:** [Plugins](Plugins.md#inline-references-and-tags)
- **Definition:** A ProseMirror node in rich text that points to another row through a `ref` edge.
  It caches display text for the dangling state.
- **Invariants:** A reference never deletes its target ([Decision 4](Decisions.md#decision-4)).
- **Relates to:** Edge
- **Code anchors:** `src/editor/nodeviews/InlineRefView.tsx`
- **Status:** shipped

### Dangling reference

- **Name:** dangling reference
- **Also called:** ghost reference, ghost state
- **Kind:** data
- **Owner:** [Plugins](Plugins.md#inline-references-and-tags)
- **Definition:** An inline reference whose target no longer exists. It keeps its cached text so
  prose still reads correctly.
- **Invariants:** Removing the target never rewrites the referencing prose silently
  ([Decision 4](Decisions.md#decision-4)).
- **Relates to:** Inline reference
- **Code anchors:** `src/editor/nodeviews/InlineRefView.tsx`
- **Status:** shipped

### View

- **Name:** view
- **Also called:** saved view, view block, view node, view marker, marker, marker node, block
  marker, saved query, `≔`, `block_sources`, `ViewBlockRow`, `createViewBlock`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#views)
- **Definition:** A node plus one stored SQL statement keyed by that node. The node's label is the
  view's name, and its home is where it was created. "The view's node" names the node half when it
  matters. "View" names nothing else.
- **Invariants:** A view owns its SQL ([Decision 16](Decisions.md#decision-16)). Its results own
  nothing ([Decision 19](Decisions.md#decision-19)). It stays a place when empty or invalid
  ([Decision 40](Decisions.md#decision-40)).
- **Relates to:** Node, Edge
- **Code anchors:** `src/core/block-marker.ts`, `src/core/matrix.ts`
- **Status:** shipped

## Addressing

### Child source

- **Name:** child source, with values **loose**, **container**, and **view**
- **Also called:** child-sourcing mode, mode, `FaceSubject.mode`
- **Kind:** data
- **Owner:** [Data-Model](Data-Model.md#child-sources)
- **Definition:** The rule for where a node's children come from. Loose children are the node's
  own owned and portal positions. Container children are the extent of the matrix it owns. View
  children are the results of its SQL.
- **Invariants:** View children own nothing ([Decision 19](Decisions.md#decision-19)). Container
  children follow extent, not position ([Decision 6](Decisions.md#decision-6)).
- **Relates to:** Node, Container node, View, Extent
- **Code anchors:** `src/core/face-types.ts`
- **Status:** shipped

### Subject

- **Name:** subject
- **Also called:** face subject, `FaceSubject`, `LooseSubject`, `ContainerSubject`, `ViewSubject`
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#subjects)
- **Definition:** The thing a host shows the children of: a node plus its child source. A container
  subject also carries the owned matrix ID, and a view subject carries the SQL.
- **Invariants:** Subjects own data, face choices own presentation ([Decision 8](Decisions.md#decision-8)).
- **Relates to:** Node, Child source
- **Code anchors:** `src/core/face-types.ts`, `src/workspace/focus-subject.ts`
- **Status:** shipped

### Place

- **Name:** place
- **Also called:** focusable place, `PlaceNavigationTarget`
- **Kind:** runtime
- **Owner:** [Launcher](Launcher.md#places-and-navigation)
- **Definition:** A node that a focus panel can show at a rooted position. Ordinary nodes,
  container nodes, type nodes, and views are places.
- **Invariants:** One rooted surface ([Decision 7](Decisions.md#decision-7)). Views remain places
  when broken ([Decision 40](Decisions.md#decision-40)).
- **Relates to:** Node, Position
- **Code anchors:** `src/core/place-navigation.ts`
- **Status:** shipped

### Provenance

- **Name:** provenance
- **Also called:** provenance node, appearance key, `LauncherInvocation`
- **Kind:** runtime
- **Owner:** [Launcher](Launcher.md#places-and-navigation)
- **Definition:** The position or node captured when a gesture began, such as the focused node when
  the launcher opens. Navigation and creation use it to stay near where the user was.
- **Invariants:** Provenance is the first step of ancestry resolution ([Decision 22](Decisions.md#decision-22)).
- **Relates to:** Position, Place
- **Code anchors:** `src/core/place-navigation.ts`, `src/launcher/invocation.ts`
- **Status:** shipped

### Ancestry resolution

- **Name:** ancestry resolution
- **Also called:** `resolvePlaceNavigation`
- **Kind:** runtime
- **Owner:** [Launcher](Launcher.md#places-and-navigation)
- **Definition:** The order used to give a node a rooted position when navigation arrives by
  identity: provenance, then home, then a deterministic membership fallback.
- **Invariants:** A portal position is never chosen from identity alone ([Decision 22](Decisions.md#decision-22)).
- **Relates to:** Provenance, Home, Extent
- **Code anchors:** `src/core/place-navigation.ts`, `src/core/portal.ts`
- **Status:** shipped

## Queries

### Query spec

- **Name:** query spec, with dimensions **query kind**, **query scope**, text, where, order, limit
- **Also called:** spec, `QuerySpec`, `NormalizedQuerySpec`, kind, scope
- **Kind:** runtime
- **Owner:** [Query-Spec](Query-Spec.md)
- **Definition:** An in-memory structure that gestures edit and that compiles to canonical SQL.
  Query kind picks the matrix, and query scope fences results to a subtree.
- **Invariants:** SQL is the only stored form ([Decision 9](Decisions.md#decision-9)). No projection
  dimension ([Decision 35](Decisions.md#decision-35)). Relative dates freeze at compile
  ([Decision 36](Decisions.md#decision-36)).
- **Relates to:** Matrix, Column, Node
- **Code anchors:** `src/sql/query-spec/types.ts`
- **Status:** shipped

### Recognizer

- **Name:** recognizer, with its matched **compiler**
- **Also called:** recognize, `QueryRecognition`, `recognize-updatable`, catalog
- **Kind:** runtime
- **Owner:** [Query-Spec](Query-Spec.md#recognition-and-equivalence)
- **Definition:** Code that lifts stored SQL back into a query spec and classifies write-back. The
  compiler emits SQL the recognizer accepts by construction.
- **Invariants:** Recognition is recomputed on read ([Decision 21](Decisions.md#decision-21)).
  Write-back is per field ([Decision 20](Decisions.md#decision-20)).
- **Relates to:** Query spec, View
- **Code anchors:** `src/sql/query-spec`, `src/sql/recognize-updatable.ts`
- **Status:** shipped

### Escalation tier

- **Name:** escalation tier: chips, chips with leaves, custom SQL
- **Also called:** tier, opaque leaf, `chips-with-leaves`, `custom-sql`
- **Kind:** runtime
- **Owner:** [Query-Spec](Query-Spec.md#escalation-tiers)
- **Definition:** A fact about a view's SQL. Dialect SQL shows full chips; unrecognized terms become
  opaque leaf chips; SQL outside the dialect shows one custom-query chip.
- **Invariants:** Computed on read, never stored ([Decision 21](Decisions.md#decision-21)).
- **Relates to:** Recognizer
- **Code anchors:** `src/sql/query-spec/types.ts`
- **Status:** shipped

### Raw SQL mode

- **Name:** raw SQL mode
- **Also called:** custom mode, x-ray, view SQL
- **Kind:** runtime
- **Owner:** [Query-Spec](Query-Spec.md#surfaces-and-lifetimes)
- **Definition:** The view editor's mode for editing SQL directly. Drafts validate and recognize
  live before Apply.
- **Invariants:** No silent rewriting of hand-written SQL ([Decision 9](Decisions.md#decision-9),
  [Decision 21](Decisions.md#decision-21)).
- **Relates to:** View, Recognizer
- **Code anchors:** `src/workspace/SavedViewStructuredAuthoring.tsx`
- **Status:** shipped

### Writable field

- **Name:** writable field
- **Also called:** hydrated cell, source-cell write-back
- **Kind:** runtime
- **Owner:** [Query-Spec](Query-Spec.md#write-back-by-construction)
- **Definition:** A query result value that traces to one source field, so editing it edits that
  source row.
- **Invariants:** Per-field recognition ([Decision 20](Decisions.md#decision-20)). Compiled SQL
  selects every column ([Decision 35](Decisions.md#decision-35)).
- **Relates to:** Field, Recognizer
- **Code anchors:** `src/sql/recognize-updatable.ts`
- **Status:** shipped

### Read-only field

- **Name:** read-only field
- **Also called:** dry cell, dry value, computed value
- **Kind:** runtime
- **Owner:** [Query-Spec](Query-Spec.md#write-back-by-construction)
- **Definition:** A computed, aggregated, formula, or opaque value that cannot edit a source.
- **Invariants:** Per-field recognition ([Decision 20](Decisions.md#decision-20)).
- **Relates to:** Field, Recognizer; sibling Writable field
- **Code anchors:** `src/sql/recognize-updatable.ts`
- **Status:** shipped

### No-ownership rule

- **Name:** no-ownership rule
- **Also called:** view firewall, firewall, ownership firewall
- **Kind:** policy
- **Owner:** [Data-Model](Data-Model.md#invariants)
- **Definition:** Query results never own rows, create rows, or imply a position. View collections
  and inline results offer no structural gestures.
- **Invariants:** [Decision 19](Decisions.md#decision-19).
- **Relates to:** View, Child source
- **Code anchors:** `src/workspace/FocusCollectionHost.tsx`, `src/workspace/NavigationPanel.tsx`
- **Status:** shipped

## Presentation configuration

### Face

- **Name:** face
- **Also called:** face type, `FaceTypeDefinition`, `faceTypeId`, `face_type_id`, `hila.table`,
  `hila.workspace`, face registry
- **Kind:** presentation
- **Owner:** [Plugins](Plugins.md#faces)
- **Definition:** A plugin's named way to present rows. It has a declaration (name, column slots,
  overflow behavior) and up to two renderings, all under one ID.
- **Invariants:** Plugins contribute faces ([Decision 8](Decisions.md#decision-8)). Faces register
  only after a consumer needs them ([Decision 42](Decisions.md#decision-42)).
- **Relates to:** Column
- **Code anchors:** `src/core/face-types.ts`, `src/core/face-registry.ts`,
  `src/table/table-face-type.ts`
- **Status:** shipped

### Column slot

- **Name:** column slot, with **column slot binding**
- **Also called:** slot, slot binding, `SlotDeclaration`, `face_slot_bindings`, `slot_bindings`,
  `ResolvedSlotBinding`
- **Kind:** presentation
- **Owner:** [Plugins](Plugins.md#column-slots)
- **Definition:** A named column position a face declares, such as the workspace face's `label`. A
  face choice binds each slot to a column ID; unbound slots fall back through name match, preferred
  type and order, then a fallback column.
- **Invariants:** Bindings store column IDs ([Decision 1](Decisions.md#decision-1)).
- **Relates to:** Face, Column
- **Code anchors:** `src/core/slot-binding.ts`, `src/core/face-types.ts`
- **Status:** shipped

### Face choice

- **Name:** face choice
- **Also called:** recipe, face recipe, face config, face configuration, intentional recipe,
  preferred recipe, `FaceRecipe`, `FaceConfig`, `face_configs`, `applyFaceToMatrix`
- **Kind:** data
- **Owner:** [Plugins](Plugins.md#face-choices)
- **Definition:** The one stored row that says which face presents a matrix. It holds the face ID,
  column slot bindings, settings such as component variants, and sort and filter state.
- **Invariants:** At most one per matrix, never created automatically
  ([Decision 14](Decisions.md#decision-14)). Never contains SQL
  ([Decision 16](Decisions.md#decision-16)). Never stores fidelity
  ([Decision 25](Decisions.md#decision-25)).
- **Relates to:** Face, Column slot, Matrix
- **Code anchors:** `src/core/face-config.ts`, `src/core/face-types.ts`
- **Status:** shipped

### Default face choice

- **Name:** default face choice
- **Also called:** face binding, `FaceBinding`, `faceBindings`
- **Kind:** presentation
- **Owner:** [Plugins](Plugins.md#current-plugin-runtime)
- **Definition:** A face choice a plugin declares for its own matrix. Registration applies it only
  when that matrix has no face choice yet.
- **Invariants:** Never overwrites an existing choice ([Decision 14](Decisions.md#decision-14)).
- **Relates to:** Face choice
- **Code anchors:** `src/core/plugin-types.ts`, `src/core/plugin.ts`
- **Status:** shipped

### Per-position face choice

- **Name:** per-position face choice
- **Also called:** appearance override, appearance-level recipe, rung 1
- **Kind:** presentation
- **Owner:** [Plugins](Plugins.md#face-resolution)
- **Definition:** A designed first step of face resolution: one position could present its node with
  a different face. Nothing stores it.
- **Invariants:** Deferred until a real consumer exists ([Decision 42](Decisions.md#decision-42)).
- **Relates to:** Face choice, Position
- **Code anchors:** none
- **Status:** deferred

### Sort and filter state

- **Name:** sort and filter state
- **Also called:** presentation state, normalized sort/filter, `face_sort_config`,
  `face_filter_configs`
- **Kind:** data
- **Owner:** [Plugins](Plugins.md#face-choices)
- **Definition:** Durable table sort and filter rows attached to a face choice. They use stable
  column IDs and filter IDs with explicit order.
- **Invariants:** Not subject SQL or untyped settings ([Decision 37](Decisions.md#decision-37)).
  Column IDs only ([Decision 1](Decisions.md#decision-1)).
- **Relates to:** Face choice, Column
- **Code anchors:** `src/core/face-config.ts`
- **Status:** shipped

### Component variant

- **Name:** component variant, including the **outline variant** and the **table treatment**
- **Also called:** variant, treatment, `navigationOutline`, `tableTreatment`, Guides,
  `ComponentVariantRegistry`
- **Kind:** presentation
- **Owner:** [Design-Faces](Design-Faces.md)
- **Definition:** A keyed local look for one component, stored in face choice settings. The
  outline variant has one value, Guides. The table treatment has three.
- **Invariants:** Registry-validated and independent of other axes
  ([Decision 10](Decisions.md#decision-10), [Decision 33](Decisions.md#decision-33)).
- **Relates to:** Face choice
- **Code anchors:** `src/design/tokens.ts`
- **Status:** shipped

### Semantic token

- **Name:** semantic token, built from **fundamental tokens**
- **Also called:** semantic role, design role, canonical role, `semanticTokenNames`
- **Kind:** presentation
- **Owner:** [Design](Design.md#token-system)
- **Definition:** A CSS custom property named for a purpose, such as `--color-canvas`. It
  references fundamental tokens, which name raw palette and scale values.
- **Invariants:** Components consume semantic tokens only, without aliases
  ([Decision 34](Decisions.md#decision-34)).
- **Relates to:** none
- **Code anchors:** `src/design/tokens.css`, `src/design/tokens.ts`
- **Status:** shipped

### Polarity

- **Name:** polarity
- **Also called:** dark, light, `data-theme`, `Polarity`
- **Kind:** presentation
- **Owner:** [Design](Design.md#theme-system)
- **Definition:** Dark or light. The `data-theme` attribute sets it.
- **Invariants:** Independent axis ([Decision 10](Decisions.md#decision-10)).
- **Relates to:** Semantic token
- **Code anchors:** `src/design/tokens.ts`
- **Status:** shipped

### Visual theme

- **Name:** visual theme: Ghost, Null, Wipeout
- **Also called:** theme, `VisualTheme`, `data-visual-theme`, `VITE_HILA_VISUAL_THEME`
- **Kind:** presentation
- **Owner:** [Design](Design.md#theme-system)
- **Definition:** One of three expressions of a single interface contract. The startup environment
  selects it.
- **Invariants:** One contract ([Decision 10](Decisions.md#decision-10)). Startup selection only
  ([Decision 15](Decisions.md#decision-15)).
- **Relates to:** Semantic token; sibling Polarity
- **Code anchors:** `src/design/tokens.ts`, `src/design/startup-theme.ts`
- **Status:** shipped

### Theme scope

- **Name:** theme scope
- **Also called:** isolated preview scope, `resolveThemeScope`
- **Kind:** presentation
- **Owner:** [Design](Design.md#attributes-and-inheritance)
- **Definition:** An element that sets polarity or visual theme for its descendants.
- **Invariants:** A nested scope exposes both attributes so axes stay independent
  ([Decision 10](Decisions.md#decision-10)).
- **Relates to:** Polarity, Visual theme
- **Code anchors:** `src/design/tokens.ts`
- **Status:** shipped

### Theme geometry adapter

- **Name:** theme geometry adapter
- **Also called:** presentation adapter, presentation shell, presentation boundary
- **Kind:** presentation
- **Owner:** [Design](Design.md#theme-system)
- **Definition:** A documented seam where a visual theme may change a component's geometry and
  chrome while behavior stays shared. The launcher is its only user.
- **Invariants:** Theme branching appears only here ([Decision 10](Decisions.md#decision-10)).
- **Relates to:** Visual theme
- **Code anchors:** `src/launcher/QuickLauncher.tsx`
- **Status:** shipped

### Density

- **Name:** density
- **Also called:** `Density`, wide, narrow
- **Kind:** runtime
- **Owner:** [Design](Design.md#dependencies)
- **Definition:** A host-computed `wide` or `narrow` input that can change text scale, inset, and
  gaps.
- **Invariants:** Never stored; 32-pixel targets fixed ([Decision 41](Decisions.md#decision-41)).
  Independent axis ([Decision 10](Decisions.md#decision-10)).
- **Relates to:** Semantic token
- **Code anchors:** `src/design/tokens.ts`
- **Status:** shipped

### Fidelity

- **Name:** fidelity, with values **composed** and **substrate**
- **Also called:** rendering fidelity, `RenderingFidelity`, `FidelityInput`, `data-fidelity`
- **Kind:** runtime
- **Owner:** [Design](Design.md#fidelity-inputs)
- **Definition:** How explicitly a rendering shows structure. Composed may imply schema details
  behind a polished look.
- **Invariants:** Runtime only, never stored ([Decision 25](Decisions.md#decision-25)). Independent
  axis ([Decision 10](Decisions.md#decision-10)).
- **Relates to:** none
- **Code anchors:** `src/design/tokens.ts`, `src/core/face-runtime.tsx`
- **Status:** shipped

### Substrate

- **Name:** substrate
- **Also called:** `'substrate'`, substrate fidelity
- **Kind:** runtime
- **Owner:** [Design](Design.md#fidelity-inputs)
- **Definition:** The fidelity value that shows every field, role, and relationship explicitly and
  uses no elevation to imply hidden structure. "Substrate" names nothing else.
- **Invariants:** The fallback rendering always draws at substrate ([Decision 18](Decisions.md#decision-18)).
- **Relates to:** Fidelity
- **Code anchors:** `src/design/tokens.ts`
- **Status:** shipped

### X-ray

- **Name:** x-ray
- **Also called:** `data-x-ray`, xray, `FaceFidelityRoot`
- **Kind:** runtime
- **Owner:** [Design](Design.md#fidelity-inputs)
- **Definition:** A transient inspection state that forces substrate fidelity through every
  descendant rendering mount. The shell root owns it.
- **Invariants:** Transient ([Decision 25](Decisions.md#decision-25)). Passes substrate to
  registered renderings rather than swapping them ([Decision 18](Decisions.md#decision-18)).
- **Relates to:** Substrate
- **Code anchors:** `src/core/face-runtime.tsx`
- **Status:** shipped

### Fidelity scope

- **Name:** fidelity scope
- **Also called:** fidelity cascade, `useFaceFidelity`
- **Kind:** runtime
- **Owner:** [Design](Design.md#fidelity-inputs)
- **Definition:** A boundary that resolves fidelity for descendants: x-ray first, then local, then
  inherited, then composed.
- **Invariants:** Runtime only ([Decision 25](Decisions.md#decision-25)).
- **Relates to:** Fidelity, X-ray
- **Code anchors:** `src/core/face-runtime.tsx`
- **Status:** shipped

## Host runtime

### Rendering

- **Name:** rendering, with **rendering kind** `line` or `collection`
- **Also called:** interior, renderer, face rendering, callable rendering, `FaceRenderingKind`,
  `FaceRenderRegistration`, `FaceRenderingContribution`, `TableFace`, `TableLine`
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#renderings)
- **Definition:** A component a face registers for one rendering kind. A line rendering draws one
  row's fields; a collection rendering arranges a set of rows. It draws only its own area.
- **Invariants:** Never mounts another rendering ([Decision 17](Decisions.md#decision-17)).
  Owner-scoped registration ([Decision 30](Decisions.md#decision-30)).
- **Relates to:** Face, Subject, Fidelity, Density
- **Code anchors:** `src/core/face-runtime.tsx`, `src/table/TableLine.tsx`, `src/table/TableFace.tsx`
- **Status:** shipped

### Face resolution

- **Name:** face resolution, with **resolution order** and **steps**
- **Also called:** affinity, recipe affinity, resolution ladder, rung, `FaceAffinity`,
  `resolveFaceAffinity`, `resolveFocusCollectionAffinity`
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#face-resolution)
- **Definition:** Choosing what a rendering mount shows. The order is the per-position face choice
  (deferred), the matrix face choice, then the fallback rendering. A container subject resolves
  against its owned matrix.
- **Invariants:** Deterministic, one choice per matrix ([Decision 14](Decisions.md#decision-14)).
- **Relates to:** Face choice, Per-position face choice, Subject
- **Code anchors:** `src/core/face-affinity.ts`, `src/workspace/focus-subject.ts`
- **Status:** shipped

### Fallback rendering

- **Name:** fallback rendering, as **fallback line** or **fallback collection**
- **Also called:** substrate floor, universal substrate floor, implicit floor, substrate fallback,
  substrate collection, `SUBSTRATE_FACE_AFFINITY`, `PropertyLine`, `PropertyRow`
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#face-resolution)
- **Definition:** What a rendering mount shows when no face choice exists or the face has no
  rendering for that kind. The fallback line is `PropertyLine` over the shared property row
  component, which the table line rendering also uses.
- **Invariants:** Always present and always substrate ([Decision 18](Decisions.md#decision-18)).
  Never stored ([Decision 14](Decisions.md#decision-14)).
- **Relates to:** Face resolution, Substrate
- **Code anchors:** `src/shared/PropertyLine.tsx`, `src/shared/PropertyRow.tsx`,
  `src/workspace/FocusCollectionHost.tsx`
- **Status:** shipped

### Host

- **Name:** host
- **Also called:** face host, panel host, container host, collection host, workspace host
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#hosts)
- **Definition:** A shell component that owns an area and decides what goes in it. It owns chrome,
  sizing, fidelity, navigation, insertion, and nesting, and it contains rendering mounts.
- **Invariants:** Hosts own chrome and nesting ([Decision 8](Decisions.md#decision-8)).
- **Relates to:** Subject, Rendering
- **Code anchors:** `src/workspace/FocusCollectionHost.tsx`
- **Status:** shipped

### Rendering mount

- **Name:** rendering mount
- **Also called:** host slot, slot, row slot, face slot, `FaceHostSlot`
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#hosts)
- **Definition:** The one place in host code that resolves a face, mounts the registered rendering
  or the fallback, applies the fidelity scope, and catches yielded subjects.
- **Invariants:** Requires a fallback ([Decision 18](Decisions.md#decision-18)). Exposes no mount
  callback ([Decision 17](Decisions.md#decision-17)).
- **Relates to:** Host, Face resolution, Fallback rendering, Fidelity scope
- **Code anchors:** `src/core/face-runtime.tsx`
- **Status:** shipped

### Host context

- **Name:** host context
- **Also called:** host presentation
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#hosts)
- **Definition:** The kind of place a host asks for a rendering, which decides the rendering kind.
  Shipped contexts are the focus-panel collection region and each aspect line in the aspect
  region.
- **Invariants:** Hosts choose the rendering kind ([Decision 8](Decisions.md#decision-8)).
- **Relates to:** Host, Rendering
- **Code anchors:** `src/workspace/FocusCollectionHost.tsx`, `src/workspace/SubstrateRegion.tsx`
- **Status:** shipped

### Host services

- **Name:** host services
- **Also called:** `FaceHostServices`, `FaceInsertionRequest`, region services
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#hosts)
- **Definition:** The capabilities a host passes to a rendering: request navigation, request
  insertion, and yield a subject.
- **Invariants:** No shell DOM or mount callback ([Decision 17](Decisions.md#decision-17)). A richer
  contract waits for a real consumer ([Decision 42](Decisions.md#decision-42)).
- **Relates to:** Host, Rendering
- **Code anchors:** `src/core/face-runtime.tsx`
- **Status:** shipped

### Yield

- **Name:** yield
- **Also called:** nested-subject yielding, `yieldSubject`, `renderYieldedSubject`
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#hosts)
- **Definition:** A rendering hands a nested subject back to its host. The host resolves it and
  shows it in a nested rendering mount under the inherited fidelity scope.
- **Invariants:** [Decision 17](Decisions.md#decision-17).
- **Relates to:** Host services, Subject
- **Code anchors:** `src/core/face-runtime.tsx`
- **Status:** shipped

### Destination parent

- **Name:** destination parent
- **Also called:** host, `host` prop
- **Kind:** runtime
- **Owner:** [Data-Model](Data-Model.md#portal)
- **Definition:** The node a portal or move-owner gesture places a row under. In a focus panel it
  is the focused node; in the navigation panel it is the item's parent.
- **Invariants:** One owner per row ([Decision 5](Decisions.md#decision-5)).
- **Relates to:** Node, Edge
- **Code anchors:** `src/workspace/row-gestures.tsx`
- **Status:** shipped

## Shell and stream

### Shell

- **Name:** shell
- **Also called:** app shell, workspace shell, `WorkspaceShell`
- **Kind:** runtime
- **Owner:** [Design](Design.md#shell-layout)
- **Definition:** The fixed infrastructure that mounts the stream root, overlays, and admin
  surfaces. It is not a plugin.
- **Invariants:** One stream root ([Decision 7](Decisions.md#decision-7)). Hosts own chrome ([Decision 8](Decisions.md#decision-8)).
- **Relates to:** Host
- **Code anchors:** `src/workspace/WorkspaceShell.tsx`, `src/App.tsx`
- **Status:** shipped

### Stream root

- **Name:** stream root
- **Also called:** stream, one stream root, product root
- **Kind:** runtime
- **Owner:** [Launcher](Launcher.md#places-and-navigation)
- **Definition:** The single top-level surface: the navigation panel followed by retained focus
  panels. No other top-level surface exists.
- **Invariants:** [Decision 7](Decisions.md#decision-7).
- **Relates to:** Shell
- **Code anchors:** `src/workspace/StreamView.tsx`, `src/workspace/stream-controller.ts`
- **Status:** shipped

### Navigation panel

- **Name:** navigation panel
- **Also called:** outline, loose outline, root panel, source outline, `NavigationPanel`
- **Kind:** runtime
- **Owner:** [Virtualization](Virtualization.md)
- **Definition:** The virtualized tree under the current top node, with sticky ancestry. It renders
  stream items and inline results in one flattened sequence.
- **Invariants:** Bounded residency ([Decision 23](Decisions.md#decision-23)).
- **Relates to:** Stream root, Scroll index
- **Code anchors:** `src/workspace/NavigationPanel.tsx`
- **Status:** shipped

### Stream item

- **Name:** stream item
- **Also called:** row, stream row, outline row, workspace row, source row, `.outline-row`,
  `WorkspaceRowData`
- **Kind:** runtime
- **Owner:** [Virtualization](Virtualization.md#rendering-and-navigation)
- **Definition:** One rendered line of the navigation panel, keyed by position. It owns its row's
  ProseMirror editors, disclosure, drag handle, guides, and drill action. Inline results also render
  as stream items, with synthetic keys, no editors of their own, and no ownership gestures. "Item"
  names nothing else except qualified forms such as sticky item.
- **Invariants:** Keyed by position ([Decision 24](Decisions.md#decision-24)). The only tree item
  and editor owner ([Decision 32](Decisions.md#decision-32)). Editor churn is asserted
  ([Decision 12](Decisions.md#decision-12)).
- **Relates to:** Position, Node, Row; siblings Node and Row
- **Code anchors:** `src/workspace/NavigationPanel.tsx`, `src/workspace/usePagedWorkspaceData.ts`
- **Status:** shipped

### Field strip

- **Name:** field strip
- **Also called:** `OutlineCellStrip`, `outline-cell-strip`, meshed cross-matrix row
- **Kind:** runtime
- **Owner:** [Virtualization](Virtualization.md#rendering-and-navigation)
- **Definition:** A strip under a stream item whose row lives in another matrix, showing that row's
  non-label fields as editors. Plain workspace rows show nothing there. It edits fields directly
  and does not use the fallback line rendering.
- **Invariants:** Label and content stay stream item editors ([Decision 3](Decisions.md#decision-3)).
- **Relates to:** Stream item, Field
- **Code anchors:** `src/workspace/NavigationPanel.tsx`
- **Status:** shipped

### Sticky item

- **Name:** sticky item, within **sticky navigation**
- **Also called:** sticky row, sticky copy, drill dock, `ProductionStickyNavigation`
- **Kind:** runtime
- **Owner:** [Design](Design.md#sticky-navigation)
- **Definition:** A pinned copy of an ancestor stream item at the top of the navigation panel. The
  drill dock pins the focused target when nothing else shows it.
- **Invariants:** Never owns editing, drag, selection, or tree semantics ([Decision 32](Decisions.md#decision-32)).
- **Relates to:** Stream item
- **Code anchors:** `src/workspace/ProductionStickyNavigation.tsx`, `src/workspace/production-sticky.ts`
- **Status:** shipped

### Inline results

- **Name:** inline results, as **inline view results** or **inline container results**
- **Also called:** folded block, folded results, block, fold, band, `is_block_row`, `foldedKey`,
  `viewBlock`, `containerBlock`
- **Kind:** runtime
- **Owner:** [Virtualization](Virtualization.md#inline-results)
- **Definition:** A view's results spliced into the navigation panel's flattened sequence right
  after the view's node. Only views the recognizer accepts appear inline. Inline container results
  are designed; the splicing code supports them, but nothing feeds them.
- **Invariants:** Own nothing ([Decision 19](Decisions.md#decision-19)). Bounded
  ([Decision 23](Decisions.md#decision-23)). Degrade to zero items when invalid
  ([Decision 40](Decisions.md#decision-40)).
- **Relates to:** View, Navigation panel, No-ownership rule
- **Code anchors:** `src/workspace/window-flatten.ts`, `src/workspace/gather-flatten.ts`
- **Status:** shipped for views; designed for containers

### Page

- **Name:** page, with **retained range**
- **Also called:** window, `ROWS_PER_WINDOW`, `THRESHOLD_DISTANCE`, residency, latch
- **Kind:** runtime
- **Owner:** [Virtualization](Virtualization.md#residency-contract)
- **Definition:** The virtualizer's unit of 100 consecutive items. The retained range keeps the
  visible pair plus two pages each side mounted.
- **Invariants:** Bounded residency ([Decision 23](Decisions.md#decision-23)). Mounted-item bounds
  asserted ([Decision 12](Decisions.md#decision-12)).
- **Relates to:** Navigation panel
- **Code anchors:** `src/virtualizer/ScrollVirtualizer.tsx`, `src/workspace/usePagedWorkspaceData.ts`
- **Status:** shipped

### Focus panel

- **Name:** focus panel
- **Also called:** `FocusPanel`, `StreamPanel`
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#hosts)
- **Definition:** A host that shows one place with panel regions.
- **Invariants:** Hosts own chrome and nesting ([Decision 8](Decisions.md#decision-8)).
- **Relates to:** Place, Host, Subject
- **Code anchors:** `src/workspace/FocusPanel.tsx`
- **Status:** shipped

### Panel regions

- **Name:** panel regions: identity, fields, collection, relations
- **Also called:** panel scaffold, scaffold, regions
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#hosts)
- **Definition:** The four areas the shell owns in a focus panel: label and content editors, the
  node's own fields, the subject's children, and backlinks.
- **Invariants:** Faces supply only collection contents ([Decision 8](Decisions.md#decision-8)).
- **Relates to:** Focus panel
- **Code anchors:** `src/workspace/FocusPanel.tsx`
- **Status:** shipped

### Aspect region

- **Name:** aspect region
- **Also called:** substrate region, `SubstrateRegion`, aspect band
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#hosts)
- **Definition:** The collection region for a loose subject. It lists owned aspects grouped under
  shared same-schema headers, with a rendering mount per aspect line.
- **Invariants:** Field editing has one owner through the fallback line ([Decision 18](Decisions.md#decision-18)).
- **Relates to:** Panel regions, Aspect, Rendering mount
- **Code anchors:** `src/workspace/SubstrateRegion.tsx`
- **Status:** shipped

### Retained panels

- **Name:** retained panels
- **Also called:** four-panel window, panel window
- **Kind:** runtime
- **Owner:** [Design](Design.md#shell-layout)
- **Definition:** Up to four mounted focus panels, kept alive so editors, scroll, and pending saves
  survive navigation.
- **Invariants:** Stay mounted in every shell layout ([Decision 26](Decisions.md#decision-26)).
- **Relates to:** Focus panel, Stream root
- **Code anchors:** `src/workspace/stream-controller.ts`
- **Status:** shipped

### Shell layout

- **Name:** shell layout: single-panel or rail
- **Also called:** shell presentation, single-panel mode, narrow mode, bounded rail, bounded-rail,
  `WorkspaceShellPresentation`, `data-shell-presentation`
- **Kind:** runtime
- **Owner:** [Design](Design.md#shell-layout)
- **Definition:** At a shell width of 719 pixels or less only the active panel shows; at 720 or
  more panels sit in a bounded rail.
- **Invariants:** Runtime only; hidden panels stay mounted and inert ([Decision 26](Decisions.md#decision-26)).
- **Relates to:** Retained panels, Shell
- **Code anchors:** `src/workspace/WorkspaceShell.tsx`
- **Status:** shipped

## Gestures and discovery

### Command

- **Name:** command
- **Also called:** `CommandDescriptor`, command registry, `hila.attach`
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#commands)
- **Definition:** A registered action with discovery metadata and a callable implementation.
- **Invariants:** Main-thread only ([Decision 29](Decisions.md#decision-29)). Owner-scoped ([Decision 30](Decisions.md#decision-30)).
- **Relates to:** none
- **Code anchors:** `src/command-registry.ts`, `src/editor/structural-commands.ts`
- **Status:** shipped

### Command surface

- **Name:** command surface: slash or launcher
- **Also called:** surface, `CommandSurface`
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#commands)
- **Definition:** Where a command is offered.
- **Invariants:** Slash and launcher consume the same entries ([Decision 29](Decisions.md#decision-29)).
- **Relates to:** Command
- **Code anchors:** `src/command-registry.ts`
- **Status:** shipped

### Command target

- **Name:** command target
- **Also called:** subject, command subject, `CommandInvocationContext`
- **Kind:** runtime
- **Owner:** [Plugins](Plugins.md#commands)
- **Definition:** The node a command acts on. The launcher captures it when it opens; slash uses
  the node being edited. Commands that require one show a disabled reason without it.
- **Invariants:** Captured at gesture start ([Decision 22](Decisions.md#decision-22)).
- **Relates to:** Command, Node, Provenance
- **Code anchors:** `src/command-registry.ts`, `src/launcher/invocation.ts`
- **Status:** shipped

### Launcher

- **Name:** launcher, with **Quick** and **Deep**
- **Also called:** `⌘K`, Mod-k, quick switcher, tempo, `QuickLauncher`, `DeepPreview`
- **Kind:** runtime
- **Owner:** [Launcher](Launcher.md)
- **Definition:** The global find-and-act overlay. Quick is the ranked text list; Deep begins when a
  chip commits and shows a bounded read-only preview.
- **Invariants:** A gesture, never a place ([Decision 28](Decisions.md#decision-28), [Decision 7](Decisions.md#decision-7)).
- **Relates to:** Command, Place, Query spec
- **Code anchors:** `src/launcher/QuickLauncher.tsx`, `src/launcher/DeepPreview.tsx`
- **Status:** shipped

### Family

- **Name:** family, with **family browse** and sigil filter tokens
- **Also called:** sigil, filter token, lens, browse lens, `DiscoveryFamily`, `LauncherFamilyFilter`
- **Kind:** runtime
- **Owner:** [Launcher](Launcher.md#family-narrowing-sigil-filter-tokens-d31)
- **Definition:** A class of launcher results: named things, type nodes, commands, or containers. A
  sigil narrows to one family; a sigil alone browses it.
- **Invariants:** Filter tokens never enter the query spec ([Decision 9](Decisions.md#decision-9)).
- **Relates to:** Launcher
- **Code anchors:** `src/launcher/model.ts`, `src/discovery/types.ts`
- **Status:** shipped

### Chip

- **Name:** chip
- **Also called:** chip row, glyph, source chip, opaque leaf
- **Kind:** runtime
- **Owner:** [Query-Spec](Query-Spec.md#the-interactive-grammar)
- **Definition:** One committed query spec term shown as object, operator glyph, and value.
- **Invariants:** Chips are derived from SQL ([Decision 21](Decisions.md#decision-21)).
- **Relates to:** Query spec, Escalation tier
- **Code anchors:** `src/launcher/query-authoring.ts`, `src/launcher/query-grammar.ts`
- **Status:** shipped

### Discovery

- **Name:** discovery
- **Also called:** discovery catalog, ranking, `queryDiscoveryCatalog`, `rankDiscoveryResults`
- **Kind:** runtime
- **Owner:** [Launcher](Launcher.md#one-list-one-ranking-d21--d23)
- **Definition:** The worker scan and deterministic ranking behind launcher results.
- **Invariants:** Deterministic within a session ([Decision 27](Decisions.md#decision-27)).
- **Relates to:** Launcher, Family
- **Code anchors:** `src/core/discovery.ts`, `src/discovery/ranking.ts`
- **Status:** shipped

### Session memory

- **Name:** session memory
- **Also called:** Jump back, Recents, recent Deep searches, `SessionMemoryStore`
- **Kind:** runtime
- **Owner:** [Launcher](Launcher.md#the-empty-state-d24--d32)
- **Definition:** One in-memory store of focus recency, canceled Deep searches, and on-screen
  identities.
- **Invariants:** Never persisted or replicated ([Decision 27](Decisions.md#decision-27)).
- **Relates to:** Launcher, Discovery
- **Code anchors:** `src/session/session-memory.ts`
- **Status:** shipped

## Platform and policy

### Plugin

- **Name:** plugin, including the **workspace plugin** and the **table plugin**
- **Also called:** `PluginDefinition`, `PluginRegistration`, `plugins`, `workspacePlugin`,
  `tablePlugin`
- **Kind:** policy
- **Owner:** [Plugins](Plugins.md)
- **Definition:** A registered package that declares matrixes, faces, default face choices,
  renderings, commands, and lifecycle hooks.
- **Invariants:** Contributes faces and commands ([Decision 8](Decisions.md#decision-8)).
  Transactional and owner-scoped ([Decision 30](Decisions.md#decision-30)). Matrixes outlive it
  ([Decision 31](Decisions.md#decision-31)).
- **Relates to:** Face, Command, Matrix
- **Code anchors:** `src/core/plugin-types.ts`, `src/core/plugin.ts`, `src/workspace/workspace-plugin.ts`
- **Status:** shipped

### Admin surfaces

- **Name:** admin surfaces, including the **matrix browser**
- **Also called:** system edge, dev tools, development system edge, administrative lens,
  `MatrixBrowser`, `FaceConfigPanel`
- **Kind:** policy
- **Owner:** [Launcher](Launcher.md#places-and-navigation)
- **Definition:** Settings and development tools above user data: the matrix browser, face choice
  administration, Reset DB, and the debug sidebar.
- **Invariants:** Not product roots ([Decision 7](Decisions.md#decision-7)).
- **Relates to:** Shell
- **Code anchors:** `src/admin/MatrixBrowser.tsx`, `src/core/FaceConfigPanel.tsx`
- **Status:** shipped

### Schema version

- **Name:** schema version, with the **durable dogfooding gate**
- **Also called:** `user_version`, migration runner, reset-only
- **Kind:** policy
- **Owner:** [Sync](Sync.md#migration-policy)
- **Definition:** The integer schema version. It stays 0 and reset-only until the gate freezes
  version 1.
- **Invariants:** [Decision 13](Decisions.md#decision-13).
- **Relates to:** Durability class
- **Code anchors:** `src/core/schema-migrations.ts`
- **Status:** shipped (dormant runner); gate designed

### Performance guards

- **Name:** performance guards
- **Also called:** deterministic guards, editor churn counters, `debugState`
- **Kind:** policy
- **Owner:** [Performance](Performance.md)
- **Definition:** Query-plan, work-count, scaling, fan-out, and churn assertions, plus a throttled
  browser backstop.
- **Invariants:** [Decision 12](Decisions.md#decision-12).
- **Relates to:** Page, Stream item
- **Code anchors:** `src/perf`, `src/debug/debugState.ts`, `e2e/performance-contract.spec.ts`
- **Status:** shipped

## Deprecated terms

| Old term                                           | Use instead              |
| -------------------------------------------------- | ------------------------ |
| affinity, recipe affinity                          | face resolution          |
| appearance                                         | position                 |
| appearance override                                | per-position face choice |
| block, folded block, fold                          | inline results           |
| block marker, marker, view marker, marker node     | view (the view's node)   |
| cell (outside a table grid), property              | field                    |
| child-sourcing mode                                | child source             |
| command subject                                    | command target           |
| dry cell                                           | read-only field          |
| face (bare, meaning recipe or component)           | face choice or rendering |
| face binding                                       | default face choice      |
| face config, face configuration, recipe            | face choice              |
| face type                                          | face                     |
| four-panel window                                  | retained panels          |
| ghost (position)                                   | orphaned position        |
| ghost (reference)                                  | dangling reference       |
| host (gesture destination)                         | destination parent       |
| host presentation                                  | host context             |
| host slot, slot (UI)                               | rendering mount          |
| hydrated cell                                      | writable field           |
| interior, renderer                                 | rendering                |
| intentional recipe, preferred recipe               | face choice              |
| lens, browse lens                                  | family browse            |
| administrative lens                                | matrix browser           |
| narrow mode, single-panel mode, shell presentation | shell layout             |
| outline, loose outline, root panel                 | navigation panel         |
| outline row, stream row, workspace row, source row | stream item              |
| panel scaffold                                     | panel regions            |
| presentation adapter                               | theme geometry adapter   |
| presentation state                                 | sort and filter state    |
| promoted node, type-node, tag type                 | type node                |
| property adapter, property row                     | fallback line rendering  |
| resolution ladder, rung                            | resolution order, step   |
| saved query, saved view, view block, view node     | view                     |
| semantic role (tokens)                             | semantic token           |
| semantic role (columns)                            | column role              |
| sticky row                                         | sticky item              |
| substrate floor, substrate fallback                | fallback rendering       |
| substrate region                                   | aspect region            |
| system edge, dev tools                             | admin surfaces           |
| tag, tag aspect, tag property                      | aspect                   |
| treatment (generic)                                | component variant        |
| view firewall                                      | no-ownership rule        |
| window (virtualizer)                               | page                     |
| x-ray (raw SQL editing)                            | raw SQL mode             |
