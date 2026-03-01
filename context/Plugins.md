# Plugins

Plugins are the agents that compose core matrixes, traits, and the join table to provide user-facing functionality. All user-facing features are built as plugins -- there is no privileged "built-in" feature set.

## What a plugin is

A plugin is primarily a **graph of named SQL expressions** -- queries, mutations, and structural operations -- with thin TypeScript orchestration for routing, lifecycle, and UI wiring. SQL is the compositional unit; TypeScript is the glue.

A plugin definition consists of:

- **Matrixes** -- the data tables the plugin creates (with schemas of its choosing).
- **Traits** -- rank and closure traits requested for its matrixes (auto-provisioned on demand).
- **Named queries** -- parameterized SQL expressions that read data. These are the data sources for the plugin's faces.
- **Named mutations** -- parameterized SQL transactions that write data (inserts, updates, deletes, structural operations). These compose data table writes with trait operations (rank, closure) in single atomic transactions.
- **Face bindings** -- pairings of (named query, face type, slot bindings, configuration) that define how data is presented.
- **Lifecycle hooks** -- the minimal imperative surface: init, destroy, and event handlers for behavior that can't be expressed as SQL (scheduling, timers, external integrations).

## Key principles

### SQL is the primary composition language

Plugin logic lives in SQL. Named queries define what data to read. Named mutations define how to change it. TypeScript selects which named operation to execute based on user intent and binds parameters -- it does not contain data manipulation logic. See [Architecture - Execution model](./Architecture.md#execution-model).

### Matrixes exist independently of any plugin

Matrixes are core entities. A plugin creates matrixes, but the matrixes persist in the registry regardless of the plugin's state. Plugins don't "own" matrixes in a lifecycle sense -- they create and manage them.

### No special-cased features

The outline view, the note editor, the tag system, a kanban board -- these are all plugins. The core doesn't know about notes, outlines, or tags. It knows about matrixes, traits, and plugins.

### Plugins compose through SQL

Plugins are peers that interact through shared data. Plugin A queries Plugin B's matrixes with standard SQL joins. Cross-plugin interaction is data access, not API calls. The join table and shared matrix namespace are the integration surface.

## Pragmatic development path

The plugin system should emerge from real features, not be designed in advance:

1. Build the outline as the first plugin, structured as a module that uses core APIs.
2. Build the notes plugin as the second plugin. This is where face slots, cross-face data sharing, and the face configuration model get validated.
3. Build the tags plugin as the third plugin. This is where cross-plugin interaction patterns surface.
4. Extract the formal plugin API once the patterns are clear from multiple real consumers.

Don't over-formalize the plugin registration, lifecycle, or inter-plugin communication APIs until the actual needs are understood from building real features.

## Design discipline

These principles cost nothing in complexity today but keep the architecture clean and open to future evolution.

### Keep plugin definitions declarative

A plugin should read like a recipe: "I need these matrixes, these traits, these named queries, and these face bindings." Favor declaring _what_ over prescribing _how_. Declarative definitions are easier to reason about, test, and represent as data.

Some plugins will also need runtime behavior that can't be expressed declaratively (e.g. an effects plugin that runs a scheduler to fire reminders at specific times). This is what lifecycle hooks (`init` / `destroy`) are for. The declarative recipe describes the plugin's data and faces; lifecycle hooks handle imperative startup and teardown.

### Express operations as named SQL

Each plugin operation -- read or write -- should be a named, parameterized SQL expression or transaction. Named operations are inspectable, testable, and cacheable as prepared statements. The TypeScript layer calls them by name with bound parameters.

For mutations that combine data writes with trait operations (rank, closure), the named mutation is a SQL transaction that includes both. See [Traits - Combined transactions](./Traits.md#combined-transactions) for examples.

### Keep face configuration data-driven

Faces should be instantiated from plain, serializable configuration objects: a **named query** (its data source), a **face type** (how to render the results), **slot bindings** (how matrix columns map to the face's slots), and additional settings (sort, grouping, visible columns). If a face config can be expressed as a simple data structure, it can be stored, shared, inspected, and composed by other tools.

Faces are generally expected to map SQL operations and result sets to simple, tactile interfaces for the user. The user should not need to understand SQL to interact with a face -- the face translates between the relational model and direct manipulation. This is not a strict requirement (some power-user faces may expose queries or structured editors), but it is the default expectation.

### Register plugins as data, not just code

A plugin should register itself with an identity (ID, name, metadata) in the plugin system, not just be an anonymous module the app imports. Plugin identity should be a data concept, even if today the registration happens in compiled code.

## Face slot model

Face types declare **slots** -- named positions with preferred column types -- that define the face's ideal data shape. When a face is applied to a matrix, the matrix's columns are bound to the face's slots. See [Architecture - Face types and slots](./Architecture.md#face-types-and-slots) for the foundational concepts.

### Slot declarations by face type

**Outline face:**
- Slots: `primary_content` (prefers: rich text) -- the main row text, rendered as the bullet content
- Trait requirements: rank, closure
- Overflow behavior: additional columns render as horizontal side-columns alongside the primary content, like a tree-table

**Note face:**
- Slots: `title` (prefers: text), `body` (prefers: rich text)
- Trait requirements: rank (for list ordering)
- Overflow behavior: additional columns render in a property panel (collapsible top section or sidebar, like Notion page properties)

**Table face:**
- Slots: none (every column is a table column)
- Trait requirements: none
- Overflow behavior: N/A (all columns are rendered equally)

**Flashcard face:**
- Slots: `front` (prefers: rich text), `back` (prefers: rich text)
- Trait requirements: none (or rank for review ordering)
- Overflow behavior: additional columns render as metadata fields below the card

### Slot binding resolution

When a face is applied to a matrix, each slot is bound to a column via a resolution chain:

1. **Explicit binding** (manual) -- the user has configured which column maps to which slot. Stored in the face configuration. Always wins.
2. **Name match** -- if a column name matches a slot name (e.g., column `title` -> slot `title`), it auto-binds.
3. **Type + position** -- if no name match, the first column matching the preferred type binds.
4. **Fallback** -- if no match at all, the first unbound column binds regardless of type. The face renders it as best it can.

A face always renders something -- it never refuses a matrix. Rendering quality degrades gracefully when the data shape doesn't match the slots.

### Face configuration

A face configuration is a serializable data object:

```
{
  query: "SELECT ...",       // the data source (named query or custom)
  faceType: "note",          // which face type to use
  slotBindings: {            // explicit column -> slot mappings (optional overrides)
    title: "name",           // map the "name" column to the title slot
    body: "description"      // map the "description" column to the body slot
  },
  settings: { ... }          // face-type-specific settings (sort, grouping, etc.)
}
```

When a user applies a face to a matrix, a **configuration UI** shows:
- The face's slots on the left (with their preferred types)
- The matrix's columns on the right
- Auto-mapped bindings pre-filled, with dropdowns to override
- A preview of how the face would render with the current bindings

### Trait provisioning on face application

When a face type with trait requirements is applied to a matrix, the system auto-provisions the needed traits via `ensureTrait()`. For example, applying the outline face to a note matrix provisions rank and closure traits for that matrix, even though the note plugin never requested them. See [Traits - Provisioning model](./Traits.md#provisioning-model).

## Concrete examples

### Outline plugin

The outline plugin provides the main scrollable outline view -- the primary way users organize and navigate their data.

**Matrixes and traits:**

- A "workspace" concept: which matrixes the user has placed in their outline and their top-level order.
- A rank trait (Lexorank) for the global outline row order.
- Closure traits for hierarchy tracking within outlined matrixes.

**Slot declaration:**
- `primary_content` (prefers: rich text) -- renders as the row's bullet content.
- Overflow columns render as horizontal side-columns (tree-table behavior).

**Named queries:**

```sql
-- Visible rows in order (respecting collapsed state)
SELECT r.key, r.row_id, d.*
FROM rank r
JOIN mx_{mid}_data d ON r.row_id = d.id
WHERE r.matrix_id = :mid
  AND r.key >= :window_start
  AND r.key NOT IN (
    SELECT c.descendant_key FROM closure c
    WHERE c.ancestor_key IN (:collapsed_keys)
      AND c.depth > 0
  )
ORDER BY r.key
LIMIT :page_size;

-- Subtree for focus view
SELECT r.key, r.row_id, d.*
FROM rank r
JOIN mx_{mid}_data d ON r.row_id = d.id
WHERE r.key >= :focus_key
  AND r.key < substr(:focus_key, 1, length(:focus_key) - 1) || X'01'
ORDER BY r.key;

-- Breadcrumbs for a row
SELECT c.ancestor_key, c.depth
FROM closure c
WHERE c.descendant_key = :key AND c.depth > 0
ORDER BY c.depth DESC;
```

**Named mutations:**

```sql
-- Insert row after sibling (rank + closure in one transaction)
-- See Traits.md for the full combined transaction pattern.

-- Reparent subtree
-- Combines rank key rewriting + closure reparent in one transaction.
```

**Faces:**

- The main outline face: a scrollable, keyboard-navigable view bound to the visible-rows query.
- Focus view: bound to the subtree query, rooted at a specific row.

**Key behavior:**

- Matrixes appear in the outline through their identity faces, placed explicitly by the user or by a plugin.
- The outline plugin does not know about tags, notes, or any other domain concept. It just ranks and displays rows and matrixes.
- When applied to a matrix that lacks rank/closure traits, the system provisions them automatically.

### Notes plugin

The notes plugin provides an Obsidian-like document editing experience: titled notes with rich text bodies and wiki-links between them.

**Matrixes and traits:**

- A note matrix with `title` (text) and `body` (rich text, ProseMirror JSON) columns.
- A rank trait for user-defined ordering in the note list.
- No closure trait (notes are flat, connected by wiki-links rather than tree hierarchy).
- Join table rows for wiki-link references between notes.

**Slot declaration:**
- `title` (prefers: text) -- rendered as the heading at the top of the note.
- `body` (prefers: rich text) -- rendered as the main ProseMirror editor below the title.
- Overflow columns render in a property panel (Notion-style page properties).

**Named queries:**

```sql
-- All notes in list order
SELECT r.row_id, d.title, d.body
FROM rank r
JOIN mx_{mid}_data d ON r.row_id = d.id
WHERE r.matrix_id = :mid
ORDER BY r.key;

-- Single note by ID
SELECT d.title, d.body
FROM mx_{mid}_data d
WHERE d.id = :row_id;

-- Backlinks: all notes that link to a given note (via join table)
SELECT j.source_row_id, d.title
FROM joins j
JOIN mx_{mid}_data d ON j.source_row_id = d.id
WHERE j.target_matrix_id = :mid AND j.target_row_id = :target_rid
  AND j.source_matrix_id = :mid;
```

**Named mutations:**

```sql
-- Create a new note
INSERT INTO mx_{mid}_data (id, title, body)
VALUES (:row_id, :title, :default_body);

-- Update note content
UPDATE mx_{mid}_data SET title = :title, body = :body WHERE id = :row_id;
```

**Wiki-link sync (TypeScript orchestration):**

On ProseMirror doc save, extract all `wikilink` inline nodes from the body JSON and sync them to the join table:
1. Get all current wiki-link targets from the saved doc.
2. Get all current join table rows for this source note.
3. Insert new links, delete removed links (set-difference).

The join table is a **materialized index** of wiki-links for fast querying. The ProseMirror document is the source of truth.

**Faces:**

- Note list face (sidebar): scrollable list of all notes showing title and body preview, searchable.
- Single-note face (main pane): title as editable heading, body as ProseMirror editor, backlinks panel below.
- `[[` triggers wiki-link autocomplete: search notes by title, select to insert a `wikilink` inline node with the target's `(matrixId, rowId)`.

**Wiki-link inline node:**

```
{ type: 'wikilink', attrs: { matrixId: 5, rowId: 42 } }
```

Displayed as the target note's current title (resolved via a named query). Survives renames because the ID is stored, not the title text.

### Tags plugin

The tags plugin provides inline tagging of note text, where each tag type is a matrix with its own schema (properties).

**Matrixes and traits:**

- Tag type matrixes (e.g. a `#task` matrix with `due_date` and `priority` columns, a `#person` matrix with `name` and `email` columns).
- Join table rows linking note rows to tag rows.
- A lightweight registry of tag types (possibly metadata in the matrix table, or its own table).

**Named queries:**

```sql
-- All tag types
SELECT * FROM tag_types;

-- Tags applied to a specific row (via join table)
SELECT t.*, j.target_row_id
FROM mx_{tag_mid}_data t
JOIN joins j ON j.target_matrix_id = :tag_mid AND j.target_row_id = t.id
WHERE j.source_matrix_id = :source_mid AND j.source_row_id = :source_rid;

-- All rows with a specific tag (reverse lookup)
SELECT j.source_matrix_id, j.source_row_id
FROM joins j
WHERE j.target_matrix_id = :tag_mid AND j.target_row_id = :tag_rid;
```

**Faces:**

- Tag browser: list all tag types and their rows (bound to the all-tags query).
- Tag autocomplete: inline suggestions when the user types `#` in a note.
- Tag property editor: inline or sidebar editing of a tag row's properties. This face shows hydrated columns from the tag matrix, making them live-editable from wherever the tag appears.

**Inline tag design:**

Tags are referenced inside note text using inline markers. The text itself is the source of truth for which tags appear where:

```
Buy groceries [[tag:8:42]] before Friday
```

Where `8` is the tag matrix ID and `42` is the tag row ID. The join table is maintained as a **materialized index** of these markers for fast querying, not as an independent source of truth.

This means:

- Text edits naturally move tags around without offset bookkeeping.
- The join table can be rebuilt from text content if needed.
- Queries like "all notes referencing task X" go through the join table for speed.

**Tag instances are shared entities.** When two notes reference `#task:42`, they reference the same row in the task matrix. Changing the due date updates it everywhere. The join table expresses the many-to-many relationship.

**Tag type creation is inline.** When a user types a tag type that doesn't exist yet (e.g. `#project`), the tags plugin creates a new matrix for it. The new matrix (and its identity face) exists in the registry but is not placed in any outline. It is surfaced through the tag browser face or can be optionally pinned into the outline by the user.

## Cross-plugin interaction examples

### Rendering a tagged note

1. The **outline plugin** renders a note row. It sees text content with `[[tag:8:42]]` markers.
2. It delegates marker rendering to the **tags plugin**, which resolves matrix 8, row 42 via a named query and returns the tag data (name, properties).
3. The outline face renders the tag inline with its properties, using a component provided by the tags plugin's face library. The tag's columns are hydrated -- they flow from the tag matrix unmodified -- so they are live-editable in place.
4. If the user clicks the inline tag, the tags plugin's property editor face opens, showing the tag row's full properties.
5. Edits to the tag row are executed as named mutations through the tags plugin. Changes propagate through the shared matrix -- any other note referencing the same tag row sees the update via reactive query invalidation.

All of this happens through SQL (join table queries, matrix reads, named mutations) and face composition, not through a direct coupling between the outline and tags plugin code.

### Cross-face data sharing: note matrix through multiple faces

The same note matrix viewed through two different face types:

1. **Note face (default view).** The user works in the notes plugin. `title` and `body` columns auto-bind by name to the note face's slots. The user sees titled documents with rich text bodies, wiki-links, and backlinks. Additional columns (if any) appear in a property panel.

2. **Outline face (applied view).** The user applies the outline face to the note matrix. The system auto-provisions rank and closure traits for the matrix. The `title` column binds to the outline's `primary_content` slot (first text column). The `body` column becomes an overflow side-column, visible as a secondary cell alongside the title in each row. The user now has a hierarchical outline of their notes with bodies visible inline.

Both faces write to the same underlying matrix rows. An edit to a note's title in the outline face is immediately visible in the note face (via reactive query invalidation). The faces compose different traits and slot bindings over the same data.

This pattern extends to richer workflows: nesting an outline inside a note (a live embedded face bound to a filtered query), expanding an outline bullet into a full note face for longer writing (progressive depth), or opening two faces side-by-side for synchronized editing. See [Architecture - Cross-face data sharing](./Architecture.md#cross-face-data-sharing) for the full set of cross-face workflows.
