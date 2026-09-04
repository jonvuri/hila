---
title: Virtualization and bounded residency
kind: canonical
state: active
updated: 2026-09-03
---

# Virtualization and bounded residency

Every production workspace path uses bounded data and rendering residency. Total forest size,
portal expansion, or folded query size must not determine the amount of row data or DOM retained
around the viewport.

## Position sequence

The global `scroll_index` materializes preorder positions over `own` and `portal` edges. Its
`global_lexkey` is the pagination key.

- One logical row can have several positions: its home plus portal appearances.
- Rendering identity is therefore the position key, not row identity alone.
- Editing and data identity still use `(matrix_id, row_id)`.
- Focus and collapse filters are applied in SQL before pagination.
- The derived index can be rebuilt from relation truth and never replicates independently.

The data manager counts the filtered sequence, divides it into fixed pages, and gathers only the
contiguous page range requested by the virtualizer. The current page size is
`ROWS_PER_WINDOW = 100`.

## Residency contract

`ScrollVirtualizer` maintains a visible latch pair and retains two windows beyond it in each
direction. `THRESHOLD_DISTANCE >= 2` is a hard invariant: the window adjacent to a visible window
has another loaded buffer behind it.

The data manager receives the needed window set and subscribes to one bounded contiguous range
from its minimum through maximum page. Unneeded rows and their editors leave residency. Estimated
window geometry preserves scroll extent until measured heights are available.

No production fallback may load the complete result merely because pagination is inconvenient.
Empty results, last partial pages, focus changes, inserts, deletes, collapse, and numeric scroll
jumps must all preserve the same bounded model.

## Folded blocks

Container and view blocks participate in one flattened virtual sequence:

1. The outer position contributes one segment unless a folded block replaces it.
2. A folded block contributes its filtered SQL `COUNT` as virtual rows.
3. Window slicing maps at most one page of the flattened sequence into bounded gather requests.
4. Each gather retains the block query's own order and schema.

A block can straddle several windows without materializing its complete result. Gather work is
bounded by the requested page and the distinct schemas touched by that page, not by total forest
or block size. A view owns no result positions and cannot imply an insertion location.

## Rendering and navigation

- Each retained window renders only its gathered slice.
- Keys distinguish portal appearances while commands resolve the underlying logical row.
- Keyboard navigation across a page boundary relies on the adjacent retained window.
- Mutations preserve focus by logical identity and scroll position by measured/estimated geometry.
- Decoration computation may inspect the retained buffer but cannot request unbounded context.
- Sticky navigation uses a bounded metadata plane for ancestry and handoff. It does not retain or
  hydrate source DOM outside the normal window range.

The production browser contract asserts more than 100 and no more than 400 mounted rows for its
large sticky-navigation fixture. The canonical mixed stress fixture combines a deep tree,
cross-matrix rows, a portal, and a 120-row folded view; its current 1280×720 reference retains 210
rows. Any change to page size or retention distance must update the bound and its rationale
together.

## Query and invalidation rules

- Hot page and count queries use indexed `scroll_index` ranges and SQL-side collapse.
- Count and gather filters must describe the same visible sequence.
- Page subscriptions invalidate only when their tables or structural ranges overlap a dirty set.
- A structural mutation updates or rebuilds the derived position cache before subscribers publish
  the next coherent sequence.
- Dynamic block queries keep their SQL source and gathered rows separate from outer position
  ownership.

## Verification

Unit tests cover query plans, bounded slice/gather work, scale ratios, flattened block boundaries,
plural positions, and invalidation fan-out. Browser tests cover multi-window scrolling, keyboard
and drag behavior across boundaries, collapse/expand, focus changes, sticky handoff, mounted-row
bounds, and exact editor lifecycle behavior.

[Performance.md](Performance.md) owns the deterministic budgets, editor-churn invariants, and
target-equivalent Chrome slowdown policy. [Testing.md](Testing.md) owns browser execution rules.
