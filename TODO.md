## TODO (next, incremental steps)

- [x] **Lexorank encoder utilities**

  - Implement 0x00-terminated segment keys with helpers: `makeKey`, `between(a, b)`, `nextPrefix(prefix)`.
  - Test: lexical sort equals intended order; `between` yields a key strictly between; `nextPrefix` defines subtree upper bound.

- [x] **Insert element API**

  - JS helper `insertElement({ matrixId, parentKey?, prevKey?, nextKey?, elementKind, elementId })` that computes a key and performs the insert + closure rows.
  - Test: inserting with only `prevKey` or only `nextKey` works; children appear in order by `key`.

- [x] **Create root matrix on init, with one TEXT column in data table**

  - Ensure the root matrix is created on init, with a single TEXT column named 'title' defined in its data table.

- [ ] **Root outline Face (first UI)**

  - Solid component that lists all root matrix elements using `ScrollVirtualizer` and `observeQuery`.
  - Test (integration/light): inserting via API reflects in the rendered list without reload.

- [ ] **Root outline Face - admin / debug interfaces**

  - Outline rows all have:
    - Element ID from data table
    - Ordering table key
    - Closure table rows, as breadcrumbs

- [ ] **Reorder within parent**

  - API `moveElementWithinParent(elementId, prevKey?, nextKey?)` that recomputes key; no descendant rewrites needed.
  - Test: after move, ordering by `key` matches expected.

- [ ] **Reparent element (subtree move)**

  - API `moveElementToParent(elementId, newParentId, prevKey?, nextKey?)` that assigns a new key prefix for the subtree and updates closure rows.
  - Test: subtree appears under new parent; old closure rows removed; queries reflect the move.

- [ ] **Parameterized query support**

  - Extend `observeQuery` to accept `sql` with bound parameters and a way to update params that triggers re-run.
  - Test: updating params changes emitted results without re-subscribing.

- [ ] **Make worker more resilient on startup**

  - Reconfigure the worker core to set onmessage to a function that queues up messages while the worker core is still initializing. Only set onmessage to the main message handler once the sqlite DB and handlers are set up and ready to act. At that time, also send all the queued up messages to the handlers right away.

- [ ] **Debug UI for virtualizer windows**

  - Show all relevant info for virtualizer windows and events with subtle identifiers on the UI, when in debug / admin mode.

- [ ] **Implement named and renameable columns for all matrixes**

- [ ] **Rename `element` → `row` and `ordering` → `rank` in code**

  - Rename `element_kind` → `row_kind`, `element_id` → `row_id` in schema, types, and queries.
  - Rename `ordering` table → `rank` table, and related variables/functions.
  - Update all tests to match.

- [ ] **Figure out what to extract and import from old coastline project (~/Development/coastline folder)**
