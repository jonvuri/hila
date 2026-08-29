# Phase 9.7b — Windowing & height-variance (spike outcome)

> Outcome of the spike framed in [Phase-9.7b-windowing.md](Phase-9.7b-windowing.md). Settles
> the **count + slice** flattening mechanics for `view`/shared-container blocks, and returns a
> measurement-backed verdict on the two perf risks: per-window multi-source gather latency, and
> height-variance windowing jitter. Feeds [Phase 9.7c](Phase-9.7c-reconciliation.md) (doc
> reconciliation).
>
> **Prototype:** [`src/perf/windowing-spike.ts`](../../../src/perf/windowing-spike.ts) (segment /
> window-slice / gather math) + [`.test.ts`](../../../src/perf/windowing-spike.test.ts) (Stage-P0
> guards, 4 tests). Not wired into `usePagedWorkspaceData` — that is the 9.7 build proper.
>
> **Also fixed as part of this spike:** a pre-existing bug in
> [`ScrollVirtualizer.tsx`](../../../src/virtualizer/ScrollVirtualizer.tsx) where windowing never
> actually engaged once a panel was embedded in `OverlaidCards`' scrolling card — see §3. This
> was blocking, not incidental: 9.7b's height-variance question is about the windower's
> behavior, and the windower wasn't running.

## 1. The settled model

Per [Phase-9.7.md §6](Phase-9.7.md#6-the-one-interleaved-index) and
[Phase-9.7-visuals.html](../visuals/Phase-9.7-visuals.html) diagram 4: the displayed sequence is
`scroll_index` (materialized: loose children, dedicated containers, deep-portal subtrees — all
ordinary rows per [Phase 9.7a](Phase-9.7a.md)) with each **block marker** — one real
`scroll_index` row standing for a `view` result or a shared container's extent — expanded
_inline_ to its cached `COUNT`. Windowing happens over that flattened sequence.

**Segments.** The flattened sequence chunks into `materialized` segments (ordinary runs between
block markers, sized by an index-backed `COUNT` over the marker-delimited key range) and `block`
segments (one per marker, sized by its cached count). A prefix-sum over segment sizes gives each
segment a `virtualStart`/`virtualSize` in the flattened offset space —
`computeSegments(db, blocks, rangeStart, rangeEnd)`, O(blocks-in-range) queries, not O(forest).

**Windowing.** `sliceWindow(segments, windowIndex, rowsPerWindow)` intersects a window's virtual
range `[W·rowsPerWindow, (W+1)·rowsPerWindow)` against the segment list, producing one
`SliceRequest` per overlapping segment — a keyset range + `LIMIT`/`OFFSET` into the marker-gap
for materialized segments, or an `offset`/`limit` slice into the block's own order for block
segments. A window entirely inside one segment produces one request; a window straddling a block
boundary produces exactly one request per side, **never more than segments crossed** — proven in
`windowing-spike.test.ts`.

**No lonely window.** Because segment sizes (not segment _counts_) drive the window boundaries, a
1-row block does not get a window to itself — the window keeps pulling subsequent segments until
its budget (`ROWS_PER_WINDOW`) is filled. Verified directly: a 1-row block placed among ordinary
rows renders inline within a single window alongside 9 ordinary rows on each side.

**Gather.** `gatherWindow(db, requests)` executes each request (one `scroll_index` range query,
or the block's own `slice(db, offset, limit)`) and concatenates in segment order — the results
are already in flattened-sequence order because the segments were.

**Cached `COUNT` invalidation.** No new schema or invalidation machinery is needed. A block's
`COUNT` is just another live SQL query subscribed the same way `usePagedWorkspaceData`'s
`totalRows` already is (`useQuery`/`addObserver`, tables-visited reactive invalidation). The 9.7
build proper wires each block marker's count query into that existing subscription path;
`windowing-spike.ts`'s `Block.count` stands in for the live value in the prototype.

**Nested blocks: deferred for v1**, per [Phase-9.7.md §9](Phase-9.7.md#9-open-decisions-and-their-resolutions).
`Block.slice` returns plain rows; nothing in the model expands a block's own source further. No
guard exercises it because there is nothing to exercise — the deferral is structural (the type
signature doesn't support it), not a runtime check.

## 2. Perf validation (Stage P0) — the go/no-go evidence

From [`windowing-spike.test.ts`](../../../src/perf/windowing-spike.test.ts) (4/4 pass), deterministic
guards (work-count + EQP, not wall-clock, per the harness's existing philosophy):

| Guard                  | Claim                                                                                                                 | Result                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Exact coverage**     | gathering every window of a 730-virtual-row flattened sequence (150 gap + 500 block + 80 gap) yields exactly 730 rows | exact, no gap/overlap                                                                                  |
| **Straddling window**  | a window crossing a segment boundary gathers from exactly the sources it crosses                                      | `['materialized','block']` / `['block','materialized']`, never a third source                          |
| **No lonely window**   | a 1-row block doesn't get its own window                                                                              | one window returns `['materialized','block','materialized']` summing to the window budget              |
| **Scale independence** | per-window gather cost is bounded by `ROWS_PER_WINDOW`, not forest/block size                                         | `measureWindowGather(2000,500) === measureWindowGather(20000,5000) === 100`                            |
| **No sort step (EQP)** | both source kinds ride an ordered walk, no `TEMP B-TREE`, no `AUTOMATIC` index, at a 4000-row mesh + 500-row block    | confirmed for both the materialized-segment query and the block's own `ORDER BY id LIMIT/OFFSET` query |

### 2.1 Wall-clock pass (ad hoc, not committed — same precedent as Phase 9.7a §3.1)

| Scenario                          | `computeSegments` | Straddling-window gather | Mid-block-window gather |
| --------------------------------- | ----------------- | ------------------------ | ----------------------- |
| forest=2,000, block=500           | 0.35ms            | 0.25ms                   | 0.18ms                  |
| forest=20,000, block=500          | 3.03ms            | 0.23ms                   | 0.18ms                  |
| forest=20,000, block=5,000        | 3.03ms            | 0.22ms                   | 0.19ms                  |
| forest=20,000, block=500×5 blocks | 7.46ms            | 0.65ms                   | 0.19ms                  |

Every single-window gather — the operation that actually runs on scroll — is **0.2–0.65ms**,
three orders of magnitude under the 50ms/single-frame budget, flat across a 10× increase in
forest size, block size, and block count. `computeSegments` (which scales with the number of
blocks _in range_, not forest size) stays single-digit-ms even at 5 simultaneous blocks. **The
multi-source gather is not a perf risk.**

## 3. Pre-existing bug found and fixed: windowing didn't engage in the composed app

While setting up a live scroll test for §4, a 762-row outline showed **all 8 windows mounted
simultaneously, immediately on load, at every scroll position** — the `GHOST`/`VISIBLE` unmount
logic never engaged. Root cause: [`ScrollVirtualizer`](../../../src/virtualizer/ScrollVirtualizer.tsx)
used its own `.scrollContainer` div (`containerRef`) as the `IntersectionObserver` root. But
every panel was wrapped by the historical `OverlaidCards` renderer in a
`.card-inner` div (`overflow-y: auto`) — the _actual_ scrolling element sits two DOM levels
above `containerRef`. `.scrollContainer` itself never establishes real overflow (it just grows
to fit its content under a broken flex-height chain), so as an `IntersectionObserver` root it
never clips, and every window reports `isIntersecting: true` forever.

The existing Playwright suite (`e2e/virtualizer-multiwindow.spec.ts`) didn't catch this because
it only exercises ~150–200 rows, which all fall inside the eager `INITIAL_NEEDED_WINDOWS =
{0,1,2,3}` pool (rows 0–399) regardless of whether scroll-driven mounting works.

**Fix** (in `ScrollVirtualizer.tsx`): resolve the nearest actual scrollable ancestor
(`findScrollRoot` — walks up from `containerRef.parentElement` for the first
`overflow-y: auto|scroll` ancestor, falling back to `containerRef` itself for genuinely
standalone/self-scrolling usage) and use it, not `containerRef`, as both the
`IntersectionObserver` root and the `scrollTop` compensation target for the `BLOCK_SIZE`
repositioning logic.

**Verified live** (chrome-devtools MCP against the real dev server, 762-row fixture): after the
fix, scrolling `.card-inner` through 0%→100% shows windows mounting/unmounting correctly
(`[0,1,2,3]` → `[0,1,2,3,4]` → `[0,1,2,3,4,5]` → `[2,3,4,5,6,7]` → `[3,4,5,6,7]` → `[4,5,6,7]`),
and `e2e/virtualizer-multiwindow.spec.ts` (6/6) plus the full suite (796/796) still pass. This
fix is a prerequisite for §4 — without it there is no windowing to observe jitter in.

## 4. Height variance — live-validated decision

**The existing mechanism is genuinely measured, not fixed — at window granularity.** Each
window's real DOM height is captured via `ResizeObserver` once mounted; `virtualPositions` uses
that measured height for any window ever visited, falling back to `minWindowHeight`
(`ROWS_PER_WINDOW × ESTIMATED_ROW_HEIGHT_PX`) only for windows never yet mounted. A
`THRESHOLD_DISTANCE = 2` buffer pre-mounts (and thus pre-measures) windows up to two ahead of
the true visible range.

**Live measurement** (post-fix, same 762-row fixture, a mixed-height batch — 17 rows with real
multi-paragraph content interleaved among 83 plain bullet rows — placed in window 6):

| Window             | Content                 | Estimate (100 × 32px) | Real measured height | Error                                                                     |
| ------------------ | ----------------------- | --------------------- | -------------------- | ------------------------------------------------------------------------- |
| 0–5 (plain)        | 100 uniform bullet rows | 3,200px               | 4,100–4,254px        | **+28–33%** (baseline — the flat constant already undershoots plain rows) |
| 6 (mixed)          | 83 plain + 17 tall rows | 3,200px               | 4,714px              | **+47%**                                                                  |
| 7 (plain, partial) | 60 uniform bullet rows  | 1,920px               | 2,460px              | +28% (same ratio, prorated)                                               |

Block-composition variance measurably widens the estimate error beyond the already-present
baseline error (28–33% → 47% with just 17% of the window's rows being "tall"). This confirms the
Phase 9.7 doc's concern is real, not hypothetical.

**But it doesn't manifest as visible jitter under realistic scrolling.** A stepped scroll
through the exact window-5→6 transition, tracking a stable anchor row's
`getBoundingClientRect().top` against the requested `scrollTop` delta at each step, measured
**zero unexplained movement** at every step — including the step where window 6's real height
(4,714px) replaced its 3,200px estimate. Why: `THRESHOLD_DISTANCE`'s pre-fetch buffer measures
window 6 _before_ the user scrolls far enough to see it (it mounts as a lookahead buffer window
while the user is still inside window 5), so the correction happens off-screen. A single large
jump (a fast flick past the buffer entirely) also landed cleanly with no post-landing settle in
the one scenario tested. (A separate, narrower limitation was observed: an extremely large jump
from a cold/just-loaded state, before any intersection baseline is established, can strand the
virtualizer on stale content — a general virtualizer-discovery gap, orthogonal to height
variance, not investigated further here.)

### Decision: no new dynamic-offset machinery for v1

Given the live evidence — real jitter risk exists in the _estimate_, but the existing
window-granularity `ResizeObserver` + lookahead-buffer mechanism already absorbs it under normal
scrolling — **9.7b ships count+slice windowing without building per-row dynamic offsets.** The
window-level measured-offset mechanism (already implemented, now actually engaged thanks to the
§3 fix) is sufficient. This is the same shape of decision as 9.7a's cap+lazy lever: the
simpler mechanism ships, a documented refinement stays on the shelf.

**Documented lever, not built for v1:** if a future workload produces block-dominated windows
with much larger estimate error than measured here (e.g. a window entirely inside a
grid-coalesced or multi-field-substrate block, rather than the 17%-mixed case tested), a
cheap first refinement is a **composition-aware `minWindowHeight`** — since the count+slice
segments already carry the block/materialized split, a window's _estimate_ could be computed
per-window from its segment mix instead of one global `ESTIMATED_ROW_HEIGHT_PX` constant,
without touching the window-granularity model at all. Full per-row dynamic offsets (a real
offset cache, react-window's `VariableSizeList`-style) stay off the table unless this cheaper
lever proves insufficient.

## 5. Nested blocks (block-in-block)

**Deferred for v1**, confirming [Phase-9.7.md §9](Phase-9.7.md#9-open-decisions-and-their-resolutions).
`Block.slice` in the prototype returns rows directly with no further flattening — the type
signature has no hook for a nested marker, so there is nothing to guard against at runtime. If a
future `view` query's result set could itself contain a block marker, that is new-model work,
not a v1 gap to close.

## 6. Verdict — **GO on count+slice windowing, no per-row dynamic offsets for v1**

The count+slice flattening is feasible within the <50ms/single-frame budget: every measured
per-window gather is sub-millisecond, flat across a 10× scale increase in forest/block size
(§2). Height variance is a real but already-mitigated risk: the existing window-granularity
measured-offset mechanism, once actually engaged (the §3 fix), absorbs the added estimate error
from block composition without visible jitter under normal and fast scrolling (§4). The
IntersectionObserver-root fix is a genuine, independently-valuable bug fix that the 9.7 build
should land regardless of the rest of Phase 9.7 — it was silently defeating windowing (and thus
the unbounded-DOM-size perf property) for any panel embedded in `OverlaidCards`, which is _all_
of them.

## 7. Hand-off

- **[Phase 9.7c](Phase-9.7c-reconciliation.md):** reconcile `bands` table removal / count+slice
  windowing into [Phase-9.2.md](Phase-9.2.md)/[Phase-9.3.md](Phase-9.3.md) per their checklist
  items; note the `ScrollVirtualizer` fix in [Architecture.md](../../Architecture.md) if it documents
  the virtualizer's IntersectionObserver usage.
- **The 9.7 build proper:**
  - Wire real block markers into `scroll_index` maintenance (a marker is minted as an ordinary
    `scroll_index` participant per [Phase-9.7.md §6](Phase-9.7.md#6-the-one-interleaved-index));
    generalize `usePagedWorkspaceData`'s window-range query to call `computeSegments`/
    `sliceWindow`/`gatherWindow` (or their real-schema equivalents) instead of a single
    `buildPaginatedOutlineQuery` range scan.
  - Subscribe each visible block's `COUNT` via the existing `useQuery`/`addObserver` reactive
    path (no new invalidation machinery — see §1).
  - Carry the `ScrollVirtualizer` fix (`findScrollRoot`) forward as-is; it already shipped as
    part of this spike (see `src/virtualizer/ScrollVirtualizer.tsx`) and is covered by the
    existing `e2e/virtualizer-multiwindow.spec.ts` suite.
  - If a real block-dominated workload shows visible jitter beyond what §4 measured, reach for
    the composition-aware `minWindowHeight` lever before a full per-row offset cache.
