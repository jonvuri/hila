# Plan

The long-term, high-level plan for this project:

## Objectives

- Create an app that combines the experiences of personal note taking / outlining and maintaining a personal database of spreadsheets into one unified experience.
- Focus on performance - the results of all interactions should take place in under 50ms, for a snappy and fluid feel.
- Focus on simplicity and composability - functionality that works completely and harmoniously together as a gestalt experience, rather than a disconnected suite of features.

## Basic architecture

### Local-first app

- The app is a Javascript app meant to run in a browser environment, but local-first and with no external dependencies - it runs as a local app once loaded and stores all of its data locally.
- In the future, asynchronous remote syncing of the database will be added, but syncing should occur in the background after optimistic local edits are made

### Database (Local SQLite)

- All data is stored locally in SQLite, in the same browser environment (using the WASM SQLite build and web workers).

### Solid.js UI

- The app is built with Solid.js, a lightweight and super-performant reactive UI library, in order to serve the performance objectives.

## Basic concepts

### Matrix

- 'Matrixes' are the top level concept of the app, the elemental building block everything else is based on.
- Matrixes represent an _ordered outline_ of heterogeneous elements. Elements can be any kind of unique addressable entity. For instance, elements can be _data rows_ or _references to child matrixes_. They can potentially be more kinds of entities in the future.
- Individual matrixes have two component tables:

  - A **data table**.
  - A **closure table**.

- All matrices share a third table:

  - The **ordering table**.

- Matrixes can contain other matrixes. Child matrixes are anchored at a specific element position of the parent matrix.
- There is always a _root matrix_ that can never be deleted. All other matrixes are children of the root matrix or other matrixes.

#### Data table

- A normal, user-expandable SQLite rowid table holding the matrix's data rows. Columns use default settings (no extra constraints), but can otherwise contain any kind of data.

#### Closure table

- A metadata table with one row for every ancestor-descendant relationship in the matrix, including the identity relationship between an element and itself.

#### Ordering table (shared, global)

- Maintains the **global ordering of all elements across all matrixes**.
- Uses **Lexorank with `0x00`-terminated, variable-length segments** (no length headers):

  - **Segment content bytes:** `0x01..0xFF` (never `0x00`).
  - **Terminator:** each segment ends with a single `0x00`.
  - **Key:** concatenation of one or more terminated segments.
  - **Natural sort:** plain lexicographic BLOB order over the key equals outline order.
  - **Parent/child relation:** a parent’s key is a strict prefix ending in `0x00`; a child appends another terminated segment. Parents always sort before descendants.

- **Subtree range query:** for a node key `P`, the subtree is `[P, nextPrefix(P))`, where `nextPrefix(P)` is `P` with its **final `0x00` incremented to `0x01`**. If no upper bound exists (rare edge), the subtree extends to table end.
- **Fractional indexing / insert-between:** generate a child segment strictly between two sibling segments. If no room at current length, **extend the segment** by appending bytes (no ancestor changes required).
- **Reordering semantics:** large reordering operations (including reparenting that rewrites descendant keys) are acceptable by design.
- **Benefits of this encoding:**

  - Variable lengths at the same level do **not** break sorting.
  - No sibling can accidentally be a prefix of another sibling (prefix implies ancestry only).
  - Simple, fast windowed scans and subtree operations.

### Face

- 'Faces' are the views and interaction surfaces for matrixes and their elements.
- Faces update optimistically with user input, and propagate their updates to the underlying elements asynchronously. If updates fail, faces will retry, and get user input if intervention is needed.
- Faces always interact with matrixes somehow but don't necessarily correspond to any set elements. They can represent:

  - One or more matrix elements or parts of elements.
  - Forms to insert new elements.
  - Arbitrary SQLite queries over data tables.
  - etc.
