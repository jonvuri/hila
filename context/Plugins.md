# Plugins

Plugins are the agents that compose core matrixes and structural primitives to provide user-facing functionality. All user-facing features are built as plugins -- there is no privileged "built-in" feature set.

## What a plugin does

A plugin can:
- Create and manage matrixes (with schemas of its choosing).
- Request structural primitives (rank, closure, joins) for its matrixes.
- Register faces that present and interact with data.
- Run lifecycle code on init and teardown (e.g. start a background scheduler, set up timers).
- Interact with other plugins' data through the join table and shared matrix registry.

## Key principles

### Matrixes exist independently of any plugin

Matrixes are core entities. A plugin creates matrixes, but the matrixes persist in the registry regardless of the plugin's state. Plugins don't "own" matrixes in a lifecycle sense -- they create and manage them.

### No special-cased features

The outline view, the tag system, a kanban board -- these are all plugins. The core doesn't know about notes, outlines, or tags. It knows about matrixes, primitives, and plugins.

### Plugins compose, not inherit

Plugins are peers that interact through shared data (the matrix registry, join table) and through the face system. There is no plugin dependency graph -- a plugin depends on the core and its primitives, not on other plugins.

When plugins need to interact (e.g. inline tag rendering in a note), they do so through data conventions (marker formats, join table queries) rather than direct API calls between plugins.

## Pragmatic development path

The plugin system should emerge from real features, not be designed in advance:

1. Build the outline as the first plugin, structured as a module that uses core APIs.
2. Build the tags feature as the second plugin. This is where real plugin-to-plugin interaction patterns will surface.
3. Extract the formal plugin API once the patterns are clear from at least two real consumers.

Don't over-formalize the plugin registration, lifecycle, or inter-plugin communication APIs until the actual needs are understood from building real features.

## Design discipline

These principles cost nothing in complexity today but keep the architecture clean and open to future evolution. Follow them when building plugins.

### Keep plugin definitions declarative

A plugin should read like a recipe: "I need a matrix with this schema, a rank scope, a closure scope, and this face." Favor declaring *what* over prescribing *how*. Declarative definitions are easier to reason about, test, and -- if needed in the future -- represent as data.

Some plugins will also need runtime behavior that can't be expressed declaratively (e.g. an effects plugin that runs a scheduler to fire reminders at specific times). This is what lifecycle hooks (`init` / `destroy`) are for. The declarative recipe describes the plugin's data and faces; lifecycle hooks handle imperative startup and teardown.

### Route primitive operations through named core functions

Plugins should call named, parameterized core functions for all primitive operations (e.g. `core.rank.insertBetween(scope, prev, next, entry)`), not construct raw SQL. Each named function is a well-defined operation with clear inputs and outputs.

### Keep face configuration data-driven

Faces should be instantiated from plain, serializable configuration objects -- not from imperative composition. If a face config can be expressed as a simple data structure, it can be stored, shared, inspected, and composed by other tools.

### Register plugins as data, not just code

A plugin should register itself with an identity (ID, name, metadata) in the plugin system, not just be an anonymous module the app imports. Plugin identity should be a data concept, even if today the registration happens in compiled code.

### Centralize and wrap SQL access

Don't scatter raw SQL strings through plugin code. Keep queries behind named wrapper functions or a thin query-builder layer within each plugin. This makes queries inspectable, testable, and replaceable without changing call sites.

## Future direction: dynamic plugins

A potential long-term evolution of the plugin system is to make it live and dynamic -- editable at runtime by developers and end users. This section describes the vision and its known challenges. **None of this should be built until the base architecture is proven through real features.**

### The idea

Since a plugin is essentially a declarative recipe (matrixes + primitives + queries + faces), that recipe could be stored as data and edited through a UI:
- A query editor for composing SQLite queries over matrixes.
- A node graph for wiring primitives and queries together.
- Face selection and configuration for endpoint nodes.
- Progressive complexity: simple formula-like expressions for casual users, full query composition for power users.

### Known challenges

- **Expression ceiling.** Data-flow composition (query → primitive → face) covers many use cases. Event-driven logic (triggers, automations) is much harder to express visually and may require a scripting layer.
- **Security.** User-authored queries need sandboxing: read-only enforcement, scoped table access, resource limits.
- **Performance.** Dynamic/interpreted plugin logic adds overhead against the 50ms target. Manageable for simple plugins, but needs budgeting.
- **Bootstrap.** Core plugins (outline, tags) must exist before the system can display anything. There will always be a two-tier system: compiled bootstrap plugins and dynamic user plugins.
- **Two-audience UX.** Developers and end users need very different interfaces. Progressive disclosure (simple surface, power underneath) is the proven approach.

### Why the design discipline matters

The zero-cost principles above are specifically chosen so that compiled plugins written today are structurally compatible with a future dynamic system. If plugin definitions are declarative, operations are named functions, face configs are data, and queries are wrapped -- then the path from "compiled TypeScript module" to "data-driven recipe editable at runtime" is a smooth migration, not a rewrite.

## Concrete examples

### Outline plugin

The outline plugin provides the main scrollable outline view -- the primary way users organize and navigate their data.

**What it manages:**
- A "workspace" concept: which matrixes the user has placed in their outline and their top-level order.
- A rank scope (Lexorank) for the global outline entry order.
- Closure scopes for hierarchy tracking within outlined matrixes.

**Faces it provides:**
- The main outline face: a scrollable, keyboard-navigable view of all outlined matrixes and their entries.
- Entry focus view: a zoomed-in view of a subtree rooted at a specific entry.

**Key behavior:**
- Matrixes appear in the outline only when explicitly placed there by the user (or by another plugin offering to place its matrix).
- The outline plugin does not know about tags, tasks, or any other domain concept. It just ranks and displays entries.

### Tags plugin

The tags plugin provides inline tagging of note text, where each tag type is a matrix with its own schema (properties).

**What it manages:**
- Tag type matrixes (e.g. a `#task` matrix with `due_date` and `priority` columns, a `#person` matrix with `name` and `email` columns).
- Join table entries linking note rows to tag rows.
- A lightweight registry of tag types (possibly metadata in the matrix table, or its own table).

**Faces it provides:**
- Tag browser: list all tag types and their entries.
- Tag autocomplete: inline suggestions when the user types `#` in a note.
- Tag property editor: inline or sidebar editing of a tag row's properties.

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

**Tag type creation is inline.** When a user types a tag type that doesn't exist yet (e.g. `#project`), the tags plugin creates a new matrix for it. The new matrix exists in the registry but is not placed in any outline. It is surfaced through the tag browser face or can be optionally pinned into the outline by the user.

### Cross-plugin interaction example: rendering a tagged note

1. The **outline plugin** renders a note entry. It sees text content with `[[tag:8:42]]` markers.
2. It delegates marker rendering to the **tags plugin**, which resolves matrix 8, row 42 and returns the tag data (name, properties).
3. The outline face renders the tag inline with its properties, using a component provided by the tags plugin's face library.
4. If the user clicks the inline tag, the tags plugin's property editor face opens.
5. Edits to the tag row propagate through the shared matrix -- any other note referencing the same tag row sees the update.

All of this happens through data (join table queries, matrix reads) and face composition, not through a direct coupling between the outline and tags plugin code.
