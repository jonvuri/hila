# Phase 9.7b — Session: windowing & height-variance (spike)

> **Status: complete → GO on count+slice windowing, no per-row dynamic offsets for v1.**
> Settled mechanics, the perf verdict, a pre-existing `ScrollVirtualizer` bug found and fixed
> along the way, and the live-validated height-variance decision are in
> [Phase-9.7b.md](Phase-9.7b.md); the prototype is
> [`src/perf/windowing-spike.ts`](../../../src/perf/windowing-spike.ts) /
> [`.test.ts`](../../../src/perf/windowing-spike.test.ts). This file is the original framing.

> Focused session doc. Goal: prototype the **count + slice** flattening that lets `container`
> and `view` blocks render **all N rows inline** in the one outline (no drill-down, no nested
> virtualizer), and validate the two perf risks — per-window multi-source gather at **<50ms**
> and **height variance** across heterogeneous rows. From the [Phase 9.7](Phase-9.7.md)
> convergence; best run after [Phase 9.7a](Phase-9.7a-deep-portals.md) (whether portal
> subtrees are materialized changes what must be flattened).

## Start prompt

> We're spiking the **windowing / height-variance** model for the Phase 9.7 convergence.
> Orient first: read [Phase-9.7.md](Phase-9.7.md) §6 (the one interleaved index; "count +
> slice") and [Phase-9.7-visuals.html](../visuals/Phase-9.7-visuals.html) diagram 4. Read the current
> virtualization + paging stack: `src/virtualizer/ScrollVirtualizer.tsx`,
> `src/workspace/usePagedWorkspaceData.ts`, `src/workspace/NavigationPanel.tsx` (windowed
> render), and `src/workspace/workspace-plugin.ts` (`buildPaginatedOutlineQuery`,
> `buildOutlineCountQuery`, the `scroll_index` keyset scan). Note the <50ms / single-frame
> principle in [AGENTS.md](../../../AGENTS.md) and the Playwright perf-testing notes.
>
> Then build a prototype and **measure**. If [Phase 9.7a](Phase-9.7a-deep-portals.md) has
> landed, use its result (materialized portal subtrees are just more `scroll_index` rows;
> only `view`s and shared-container extents need count+slice). Use AskUserQuestion on the
> fixed-estimate vs. measured-offsets fork once you have numbers.

## The model to prototype

- **Flattened displayed sequence** = `scroll_index` rows, with each _gather-positioned_ block
  expanded inline to its row count. Window by `ROWS_PER_WINDOW` over that sequence.
- **Block contributes its `COUNT` to window budgets** (a 1-row block doesn't get a lonely
  window; the window keeps pulling the next nodes). A large block **spans windows**, each
  rendering a **slice by offset** (keyset / `LIMIT` into the block's matrix-rank or query
  order).
- **Cached `COUNT` per block**, feeding a **prefix-sum** for offset math; invalidated when
  the block's underlying tables change (reuse tables-visited invalidation).
- **Per-window gather may touch ≥1 source** — a `scroll_index` keyset range plus, when a
  window straddles a block, one block-slice. **Render-only** flattening — no `own`-edges
  minted, so the firewall holds.

## What to measure / decide

- **<50ms per window** with a large inline block (build a **500-instance `#task` container**
  and a cross-subtree `view`); a straddling window = one `scroll_index` range + one bounded
  slice. Confirm the multi-source gather stays in budget.
- **Height variance (the likely real friction).** Bullets vs. coalesced grid rows vs.
  multi-field substrate rows have different heights; fixed `ESTIMATED_ROW_HEIGHT_PX`
  windowing may jitter the scrollbar. **Decide: keep fixed estimates, or move to
  measured/dynamic offsets** (measure-on-render + offset map). This is orthogonal to the
  count bookkeeping and is the thing most likely to need real prototyping.
- **Nested blocks (block-in-block)** — confirm deferred/disallowed for v1, or specify the
  minimal handling.

## Deliverables

- A prototype (behind the existing virtualizer where possible) + a measurements table
  (50ms budget across window shapes; scroll-smoothness with mixed heights).
- `context/Phase-9.7b.md` (or promote this file) recording the count+slice mechanics, the
  fixed-vs-measured decision with evidence, and the block-`COUNT` invalidation approach.
