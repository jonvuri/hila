## TODO (next, incremental steps)

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

- [ ] **Make worker more resilient on startup**
  - Reconfigure the worker core to set onmessage to a function that queues up messages while the worker core is still initializing. Only set onmessage to the main message handler once the sqlite DB and handlers are set up and ready to act. At that time, also send all the queued up messages to the handlers right away.
