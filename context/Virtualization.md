# Virtualization

Pagination-first windowed rendering architecture. All data paths assume bounded, paginated loading. No unbounded queries.

## Design constraint

Every query, every render path, every data structure should assume windowed access. The system must never depend on having the full dataset in memory. Large buffers are fine; unbounded is not. Target: sub-50ms for all interactions.

## Current architecture

### Data flow (today)

```
SQL query (unbounded)
  → full result set in JS
  → client-side collapse filtering → visibleRows[]
  → ScrollVirtualizer (totalWindows=1, single monolithic window)
  → <For each={visibleRows()}> renders all rows
```

### ScrollVirtualizer

The virtualizer uses a **latch-pair** model: two IntersectionObserver-tracked windows define the viewport center, and a `THRESHOLD_DISTANCE` (currently 2) extends the rendered range on each side.

For latch pair `[A, B]`, the rendered range is `[A-2, B+2]`:

```
... [A-2: buffer] [A-1: candidate] [A: visible] [B: visible] [B+1: candidate] [B+2: buffer] ...
```

- **Visible**: in the viewport (tracked by IntersectionObserver)
- **Candidate**: adjacent to visible, likely to enter viewport next on scroll
- **Buffer**: one beyond each candidate, providing forward/backward context

Windows outside the range transition to GHOST state (not rendered). Windows entering the range become VISIBLE.

### Outline query

`buildOutlineQuery` in `outline-plugin.ts` produces an unbounded `SELECT ... ORDER BY r.key` with no LIMIT. The full result for the matrix (or focus subtree) is returned. Collapse filtering happens client-side by scanning the full `visibleRows()` array.

### Query subscriptions

`useQuery` subscribes to a SQL string via the worker's observer system. When underlying tables change, the observer re-fires with fresh results. Currently returns the complete result set per invocation.

## Required changes

### 1. Window row count floor

**Requirement**: Each window must contain at least 100 rows.

**Current state**: Windows are sized by pixel height (`minWindowHeight`), not row count. With `totalWindows=1`, row count is irrelevant.

**Change needed**: Introduce a `rowsPerWindow` concept (floor: 100, configurable higher). The page size for data loading aligns with this. `totalWindows` becomes `ceil(totalVisibleRows / rowsPerWindow)`.

The virtualizer itself may not need to enforce the row count directly — the data loading layer can ensure pages are ≥100 rows, and the virtualizer renders what it's given. But the contract between the two must specify the minimum.

### 2. Buffer window adequacy

**Requirement**: One buffer window below (and above) any window that is a candidate for becoming visible — that is, any window adjacent to a currently visible window.

**Current state**: `THRESHOLD_DISTANCE = 2` already satisfies this. For latch pair `[A, B]`:
- Candidates: `A-1`, `B+1`
- Buffers: `A-2`, `B+2`

Each candidate has exactly one buffer window beyond it.

**Conclusion**: The current threshold is sufficient. However, this is an **architectural invariant** that future changes must preserve: `THRESHOLD_DISTANCE >= 2` is a hard requirement, not a tuning parameter. Document it as such.

**Why the buffer matters**: Decoration computation (guide continuation, vector field angles) requires forward-looking context. A buffer window of ≥100 rows guarantees that every rendered row has at least 100 rows of forward context. The vector field angle ceiling (see [Outline component design](#outline-component-design)) is set to match this buffer size, so decoration computation never needs data beyond what the buffer provides.

### 3. Paginated outline queries

**Current**: `buildOutlineQuery` returns all rows for a matrix. No LIMIT.

**Change needed**: The query must be paginated. Approach:

**Keyset pagination via rank key.** The rank table orders rows by a lexicographic key. Pages are bounded by key ranges:

```sql
SELECT ... FROM rank r
WHERE r.matrix_id = ? AND r.key > ? -- after previous page's last key
ORDER BY r.key
LIMIT ?                              -- page size
```

**Challenges**:

- **Collapse filtering in SQL.** Currently collapse is client-side (skip rows below collapsed nodes). With pagination, collapsed subtrees should be excluded from the query to keep page sizes predictable. This requires the query to know which keys are collapsed, potentially via a temp table or CTE of collapsed keys. Alternatively, collapse could use key-range exclusion (`NOT BETWEEN collapsed_key AND collapsed_key_prefix_end`) since the rank key range of a subtree is a contiguous range.

- **Total count for `totalWindows`.** The virtualizer needs to know total page count. A parallel `SELECT COUNT(*)` with the same filters provides this. The count query should be efficient (indexed on rank key + matrix_id).

- **Focus subtree pagination.** When focused on a subtree, the rank key range filter already bounds the result. Pagination adds a further LIMIT within that range.

### 4. Data loading coordination

**Current**: One `useQuery` call returns the full result. Solid `reconcile` diffs it into a store.

**Change needed**: Multiple concurrent page queries, one per loaded window. A page-aware data manager replaces the single `useQuery` pattern:

- Maintain a map of `windowIndex → page data`
- When the virtualizer's visible range changes, load/unload pages
- Buffer pages are loaded but not rendered
- Pages are keyed by their starting rank key for cache stability
- On mutation (insert/delete/reparent), invalidate affected pages and re-fetch

The Solid store could hold a sparse array of pages, or a flat array of all loaded rows with page boundary metadata. The decoration computation runs on the contiguous loaded range.

### 5. Collapse state integration

**Options**:

**A. SQL-side collapse (preferred).** The paginated query excludes collapsed subtrees via rank-key-range exclusion. The client sends collapsed keys to the query builder. Page sizes reflect visible rows only. Predictable, efficient.

**B. Client-side collapse on loaded pages.** Pages are loaded without collapse filtering. Client-side filtering produces unpredictable visible row counts per page. Worse for performance and predictability.

**Recommendation**: Option A. Collapse keys can be sent as a set of key ranges to exclude. The outline query's `WHERE` clause adds `AND r.key NOT BETWEEN ? AND ?` for each collapsed subtree. This leverages the rank key's lexicographic subtree range property.

### 6. Keyboard navigation and mutations

**Arrow key navigation at page boundaries**: When the cursor moves past the first/last row of the visible range, the adjacent page must already be loaded. The buffer window ensures this — the buffer page contains the rows the cursor would navigate into.

**Insert/delete/reparent**: These mutations change the row set. The page containing the mutation and potentially adjacent pages need re-fetching. Strategy:

- After mutation, invalidate all loaded pages (let the reactive query system re-fire them)
- Alternatively, invalidate only the affected page and pages that might have shifted
- Focus/cursor state must survive page re-fetches (keyed by row ID, not position)

### 7. Scroll position stability

When pages re-fetch due to mutations, the virtualizer's scroll position must remain stable. The current repositioning logic (virtual offset + scroll compensation in `requestAnimationFrame`) handles this for window state changes. Page data changes that don't alter the window set should be transparent to the virtualizer — only the content within a rendered window changes.

## Outline component design

### Buffer-ceiling alignment

The 100-row window floor and the vector-field angle ceiling at distance 100 are deliberately aligned:

- Each buffer window contains ≥100 rows
- The angle formula reaches 90° (vertical) at distance 100
- Any subtree extending beyond the loaded buffer renders as a vertical line
- This is visually correct: "this subtree continues far below"
- No visual jumps as the user scrolls and buffer windows shift

This alignment means the decoration computation is always exact for rendered rows, with no approximation or special-casing.

### Decoration computation on partial data

`computeDecorations(theme, loadedRows)` runs on the contiguous loaded row range (visible + buffer windows). For rendered rows (visible windows only), the buffer provides sufficient forward context for all theme computations:

- **Guide continuation** (`continues[]`): requires forward-scan to next row at same depth. Buffer of 100 rows covers this for all practical tree structures.
- **Vector field angles**: `distToLastInSubtree` caps at 100. Buffer provides exact data up to the cap.
- **isVisualLast**: one-row lookahead. Buffer covers this trivially.

Rows at the trailing edge of the buffer may have incomplete forward context, but they are never rendered — they exist solely to provide context for visible rows.

## Migration path

### Step 1 — Design system outline row component ✅

Refactored `src/design/outline/` to the pagination-ready interface:

- **`OutlineRow`**: Single component, `theme` as a string enum prop. Internally switches on theme to render the correct DOM structure. Fully self-contained given its props — no cross-row dependencies at render time.
- **`computeDecorations(theme, rows)`**: Precomputes per-row decoration data from a contiguous slice of rows. Theme-selective (only computes what the theme needs). Produces `RowDecoration` per row containing `continues: boolean[]` (guide continuation), `isVisualLast: boolean` (corner-notches), and optionally `vectorSlots` (vector-field).
- **`outlineThemeClass(theme)`**: Returns the CSS class string for the container wrapping row elements, for use by the virtualizer's render callback.
- **Guide algorithm fix**: Replaced the one-row-lookahead approximation with a correct backward-pass algorithm that properly handles ancestor guide continuation across subtree boundaries.
- **Vector field angle ceiling**: Updated `distToAngle` to reach exactly 90° at distance 100 via a squared-log blend, aligned with the buffer window floor. Subtrees beyond loaded data appear as vertical guide lines.
- **`Outline` convenience wrapper**: Retained for Storybook and non-virtualized use. Accepts `OutlineNode[]` tree data, manages collapse state, calls `computeDecorations`, renders `OutlineRow` instances. Not used in the real app.

### Step 2 — Integrate with existing OutlineFace ✅

Connected the design system row component to `src/outline/OutlineFace.tsx`:

- **Adapted `OutlineRowData` to `FlatRow`**: `flatRows()` memo maps visible rows to `FlatRow` using hex rank key as `id`, `has_children === 1` → `hasChildren`, and `!collapsedKeys.has(hexKey)` → `expanded`. `data-depth` attribute on each row wrapper for test accessibility.
- **Replaced `OutlineRow` rendering**: Extracted ProseMirror editor into `OutlineRowContent` (editor-only component). Design `OutlineRow` handles indent/bullet/guides per theme. ProseMirror plugs in via `renderContent` (called once at component creation, not reactively, to avoid editor destruction on row updates). Drag handle composed as a sibling to the left of the design row.
- **Applied `outlineThemeClass`** on a wrapper div around the `ScrollVirtualizer`. Design tokens CSS imported in `src/index.tsx`; `data-theme="dark"` on `<body>`.
- **Computed decorations from `visibleRows()`**: `decorations()` memo calls `computeDecorations(theme(), flatRows())` once per reactive update. Indexed per row in the `<For>` render loop.
- **Theme selection**: Signal with hardcoded default `'workflowy-clone'`. Ready for user preference wiring.
- **Design system extensions**: Added `onZoomIn` callback prop (wired to double-click on caret/bullet). Added `data-testid="outline-bullet"`, `role`, and `aria-label` attributes to caret/bullet elements for E2E test compatibility.

### Step 3 — Multi-window virtualizer ✅

Switched from `totalWindows=1` to dynamic multi-window rendering:

- **`ROWS_PER_WINDOW = 100`** constant in OutlineFace. Each window renders a slice of `visibleRows()` at indices `[wIdx * 100, (wIdx+1) * 100)`.
- **`totalWindows = ceil(visibleRows.length / ROWS_PER_WINDOW)`** as a reactive memo. Drives the virtualizer's window count.
- **`renderWindow`** slices `visibleRows()` per window via a `createMemo`, uses global indices into `flatRows()` and `decorations()` for correct decoration alignment. Decorations are computed on the full row set (all visible rows) so buffer windows provide forward context for rendered windows.
- **`THRESHOLD_DISTANCE >= 2`** documented as a hard invariant in `ScrollVirtualizer.tsx`. The latch-pair model is unchanged.
- **ScrollVirtualizer fixes for multi-window correctness**:
  - `virtualPositions` iterates up to `totalWindows` (not just measured windows) so unmeasured ghost windows contribute their estimated height to the scroll area.
  - `getTotalHeight` returns measured height when available, `minWindowHeight` only as fallback for unmeasured windows (no longer enforces a floor on measured heights).
  - `minWindowHeight` decoupled from CSS `min-height` on window DOM elements (now hardcoded `1px`). `minWindowHeight` is purely a height estimation hint, set to `ROWS_PER_WINDOW * 28` for accurate scroll area sizing.
  - `handleWindowResize` trusts measured heights without clamping.
- **E2E tests** updated: renamed "Virtualizer totalWindows capping" to "Virtualizer windowing" with updated assertions. All 85 existing tests pass.

**E2E tests needed (for a later testing pass):**
- Verify multi-window rendering with > 100 rows (window count > 1, correct row distribution per window).
- Scroll to bottom and verify all rows are accessible (no undersized scroll area).
- Verify ProseMirror editors survive window transitions (row shifting between windows on insert/delete).
- Verify keyboard navigation across window boundaries (ArrowDown from last row of window N to first row of window N+1).
- Verify collapse/expand updates `totalWindows` correctly (large collapse reducing window count).
- Verify drag-and-drop works across window boundaries.

### Step 4 — Paginated outline queries ✅

Implemented bounded data loading infrastructure:

- **`buildPaginatedOutlineQuery`** in `outline-plugin.ts`: Supports keyset pagination (`afterKeyHex` + `LIMIT`), SQL-side collapse filtering (rank-key-range exclusion via `collapsedKeyHexes`), and focus subtree filtering. Composed from a shared `buildFilterClauses` helper. The old `buildOutlineQuery` delegates to it for backward compatibility.
- **`buildOutlineCountQuery`**: Parallel count query with the same filter clauses (focus + collapse), ready for Step 5's page-aware data manager to compute `totalWindows` from the count rather than loaded data.
- **SQL-side collapse in `OutlineFace.tsx`**: `outlineQuery` memo now passes `collapsedKeyHexes` to the paginated query builder. Client-side collapse filtering removed from `visibleRows()` — the SQL query itself excludes collapsed subtrees via `AND NOT (r.key > X'<key>' AND r.key < X'<nextPrefix>')`. The only client-side filter remaining is focus root row exclusion (shown as title, not a row).
- **`addSampleRows` fix**: Rewrote to use proper `insertRow`/`insertDataRow` (lexorank `between()`) instead of `generateRankKey`. The old `generateRankKey` created keys with text separators that broke the key-range subtree property required by SQL-side collapse.
- **Unit tests** (`outline-queries.test.ts`): 22 tests covering paginated query, count query, collapse exclusion, keyset pagination, LIMIT, focus + collapse combinations, and custom content columns — all run against real in-memory SQLite.

### Step 5 — Page-aware data manager

Replace the single `useQuery` pattern:

- Map of `windowIndex → page data` with reactive loading/unloading.
- Buffer pages loaded but not rendered.
- Pages keyed by starting rank key for cache stability.
- Mutation invalidation and re-fetch strategy.
- Focus/cursor state survives page re-fetches (keyed by row ID).

### Step 6 — Remove unbounded query path

Delete the unbounded `buildOutlineQuery`. All outline data flows through paginated queries.
