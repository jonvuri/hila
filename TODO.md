## TODO (next, incremental steps)

- [ ] **Add write execution + subscription invalidation**

  - Client exposes `execute(sql: string)` that posts a write to the worker.
  - Worker executes DDL/DML and, on success, re-runs all subscribed queries and posts fresh results.
  - Test: subscribing to a `SELECT` then inserting via `execute` yields an updated result emission.
  - Context/approach:
    - Use Vitest (jsdom) with a real Web Worker via `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`.
    - In worker, fall back to in-memory DB when OPFS is unavailable: `new sqlite3.oo1.DB(':memory:', 'c')`.
    - Extend client with `execute(sql)` that posts `{ type: 'execute', sql }` and resolves on `'executeAck'` or rejects on `'executeError'`.
    - In worker, handle `'execute'`: `db.exec(sql)`, then re-run all prepared subscribed statements and post fresh results, then `post({ type: 'executeAck' })`.
    - Test flow: subscribe to `SELECT COUNT(*) AS n FROM elements`, await first non-null emission, `execute(INSERT ...)`, await next non-null emission, expect `n` increments.
    - Deterministic setup: `beforeAll` creates table if needed and clears it to a known state.

- [ ] **Bootstrap minimal schema (v0)**

  - Create tables: `elements(id INTEGER PRIMARY KEY, parent_id INTEGER, key BLOB, type TEXT, payload TEXT)`, `closure(ancestor INTEGER, descendant INTEGER, depth INTEGER)`, and shared `ordering(key BLOB PRIMARY KEY, element_id INTEGER)`.
  - Seed a root element and its closure rows.
  - Test: tables exist, root seeded, basic `SELECT * FROM elements` works.

- [ ] **Lexorank encoder utilities**

  - Implement 0x00-terminated segment keys with helpers: `makeKey`, `between(a, b)`, `nextPrefix(prefix)`.
  - Test: lexical sort equals intended order; `between` yields a key strictly between; `nextPrefix` defines subtree upper bound.

- [ ] **Insert element API**

  - JS helper `insertElement({ parentId, prevKey?, nextKey?, type, payload })` that computes a key and performs the insert + closure rows.
  - Test: inserting with only `prevKey` or only `nextKey` works; children appear in order by `key`.

- [ ] **Subtree query helper**

  - Provide `selectSubtreeByKeyRange(parentKey)` that emits `[key >= P AND key < nextPrefix(P))` SQL.
  - Test: adding grandchildren returns in subtree query; boundary cases covered.

- [ ] **Root outline Face (first UI)**

  - Solid component that lists root children using `ScrollVirtualizer` and `observeQuery(selectSubtreeByKeyRange(rootKey))`.
  - Test (integration/light): inserting via API reflects in the rendered list without reload.

- [ ] **Reorder within parent**

  - API `moveElementWithinParent(elementId, prevKey?, nextKey?)` that recomputes key; no descendant rewrites needed.
  - Test: after move, ordering by `key` matches expected.

- [ ] **Reparent element (subtree move)**

  - API `moveElementToParent(elementId, newParentId, prevKey?, nextKey?)` that assigns a new key prefix for the subtree and updates closure rows.
  - Test: subtree appears under new parent; old closure rows removed; queries reflect the move.

- [ ] **Parameterized query support**
  - Extend `observeQuery` to accept `sql` with bound parameters and a way to update params that triggers re-run.
  - Test: updating params changes emitted results without re-subscribing.
