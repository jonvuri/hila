---
title: Virtualization and bounded residency
kind: canonical
state: active
updated: 2026-10-01
---

# Virtualization and bounded residency

Every production workspace path uses bounded data and rendering residency. Total forest size,
portal expansion, or view result size must not determine the amount of row data or DOM retained
around the viewport ([Decision 23](Decisions.md#decision-23)).

## Position sequence

The global `scroll_index` materializes preorder positions over `own` and `portal` edges. Its
`global_lexkey` is the pagination key.

- One node can have several positions: its home position plus portal positions.
- Rendering identity is therefore the position key, not row identity alone
  ([Decision 24](Decisions.md#decision-24)).
- Editing and data identity still use `(matrix_id, row_id)`.
- Focus and collapse filters are applied in SQL before pagination.
- The derived index can be rebuilt from relation truth and never replicates independently.

The data manager counts the filtered sequence, divides it into fixed pages, and gathers only the
contiguous page range requested by the virtualizer. The current page size is 100 items, set by
`ROWS_PER_WINDOW`. Code says "window" for a page.

## Residency contract

`ScrollVirtualizer` maintains a visible latch pair and retains two pages beyond it in each
direction. Together they form the retained range. `THRESHOLD_DISTANCE >= 2` is a hard invariant:
the page adjacent to a visible page has another loaded page behind it.

The data manager receives the needed page set and subscribes to one bounded contiguous range from
its minimum through maximum page. Unneeded stream items and their editors leave residency. Estimated
page geometry preserves scroll extent until measured heights are available.

No production fallback may load the complete result merely because pagination is inconvenient.
Empty results, last partial pages, focus changes, inserts, deletes, collapse, and numeric scroll
jumps must all preserve the same bounded model.

## Inline results

Inline results splice a view's results into the navigation panel's flattened sequence, right
after the view's node:

1. The outer positions contribute one segment between views.
2. Each view with inline results contributes its filtered SQL `COUNT` as virtual items.
3. Page slicing maps at most one page of the flattened sequence into bounded gather requests.
4. Each gather retains the view query's own order and schema.

Only views the write-back recognizer accepts appear inline; other views show only in their focus
panel. No per-view collapse toggle exists: inline results hide only when an ancestor collapses.
Inline container results are designed but not shipped. The flattener supports container segments,
but nothing feeds them.

Inline results can straddle several pages without materializing the complete result. Gather work is
bounded by the requested page and the distinct schemas touched by that page, not by total forest
or view size. A view owns no result positions and cannot imply an insertion location
([Decision 19](Decisions.md#decision-19)).

## Rendering and navigation

- Each retained page renders only its gathered slice as stream items.
- Keys distinguish portal positions while commands resolve the underlying row.
- Keyboard navigation across a page boundary relies on the adjacent retained page.
- A stream item whose row lives in another matrix shows a field strip of its non-label fields.
- Mutations preserve focus by logical identity and scroll position by measured/estimated geometry.
- Decoration computation may inspect the retained buffer but cannot request unbounded context.
- Sticky navigation uses a bounded metadata plane for ancestry and handoff. It does not retain or
  hydrate source DOM outside the retained range.

The production browser contract asserts more than 100 and no more than 400 mounted stream items for
its large sticky-navigation fixture. The canonical mixed stress fixture combines a deep tree,
cross-matrix rows, a portal, and a view with 120 inline results; its current 1280×720 reference
retains 210 items. Any change to page size or retention distance must update the bound and its
rationale together.

The launcher Deep preview reuses the same latch and retention policy with 100-row pages and a
1,000-row semantic cap. Its contiguous query range is therefore at most six pages or 600 rows.
Unloaded preview pages retain their estimated row height until data arrives. Fast-scroll
IntersectionObserver records reconcile against numeric scroll geometry, so stale enter/exit order
cannot widen the two-page latch.

## Query and invalidation rules

- Hot page and count queries use indexed `scroll_index` ranges and SQL-side collapse.
- Count and gather filters must describe the same visible sequence.
- Page subscriptions invalidate only when their tables or structural ranges overlap a dirty set.
- A structural mutation updates or rebuilds the derived position cache before subscribers publish
  the next coherent sequence.
- View queries keep their SQL source and gathered rows separate from outer position
  ownership.

## Verification

Unit tests cover query plans, bounded slice/gather work, scale ratios, inline result boundaries,
plural positions, and invalidation fan-out. Browser tests cover multi-page scrolling, keyboard
and drag behavior across boundaries, collapse/expand, focus changes, sticky handoff, mounted-item
bounds, and exact editor lifecycle behavior.

[Performance.md](Performance.md) owns the deterministic budgets, editor-churn invariants, and
target-equivalent Chrome slowdown policy. [Testing.md](Testing.md) owns browser execution rules.
