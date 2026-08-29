# Phase 9.7a — Session: deep-portal materialization (spike)

> **Status: complete → GO on deep-in-v1.** Settled model, resolved forks, and the
> measurement-backed verdict are in [Phase-9.7a.md](Phase-9.7a.md); the prototype
> maintenance path + Stage-P0 guards are in
> [`src/perf/deep-portal-spike.ts`](../../../src/perf/deep-portal-spike.ts) /
> [`.test.ts`](../../../src/perf/deep-portal-spike.test.ts). This file is the original framing.

> Focused session doc. Goal: design and validate the incremental maintenance of a
> **multi-location `scroll_index`** — portals as extra _positions_ of a single-owned row,
> **deep** by default (a portal transcludes the node _and its owned subtree_). This is the
> meatiest subsystem the [Phase 9.7](Phase-9.7.md) convergence leaves open. Its outcome
> gates the build and feeds [Phase 9.7b](Phase-9.7b-windowing.md).

## Start prompt

> We're spiking **deep-portal materialization** for the Phase 9.7 convergence. Orient
> first: read [Phase-9.7.md](Phase-9.7.md) (esp. §4 ownership≠position, §5 portals & refs,
> §6 the one interleaved index) and [Phase-9.7-visuals.html](../visuals/Phase-9.7-visuals.html)
> diagrams 1 & 4. Then read the data-layer facts this builds on: [Phase-8b.md](Phase-8b.md)
> (global closure + pre-order scroll index, row cascade), [Phase-8c.md](Phase-8c.md) (§1
> `matrix.owner`, §5 tagging edges, §8.1 matrix-drop cascade), [Traits.md](../superseded-topics/Traits-pre-reconciliation.md)
> (rank Lexorank encoding, closure, join kinds), and [Architecture.md](../../Architecture.md)
> (Join lifecycle, Inline references/ghost states). Read the implementing code:
> `src/workspace/workspace-plugin.ts` (the `scroll_index` queries), the scroll-index
> materialization/maintenance in the worker, `src/core/closure.ts`, and the join ops.
>
> Then design the model and run a Stage-P0-style perf validation (cf. Phase-8c §7:
> EQP + `createWorkCounter`). Don't jump to code — settle the model and the guards first,
> then prototype the maintenance path. Use AskUserQuestion on genuine forks.

## The model to pin down

- **Position is plural, ownership stays single.** A row keeps its one lifecycle `own`-edge
  (in `joins`); a **portal** is a _position-only_ tie, count-unconstrained. Decide storage:
  a new join `kind` (`portal`), a dedicated table, or a `scroll_index` overlay. Single-owner
  (lifecycle/cascade) must be provably unaffected.
- **Deep materialization.** Portaling X under host H replicates X's subtree entries into
  `scroll_index` with an H-rooted `global_lexkey` prefix. Confirm the payoff: **ancestry
  per location = the lexkey prefix of that appearance** (closure-per-location for free).
- **Renderer keys by position (lexkey), not `(matrix_id, row_id)`** — a row can appear
  legitimately more than once.

## Incremental maintenance — the cases to cover

- add / remove a portal of X (± O(subtree(X)) entries);
- content edit under X (reactive; all appearances reflect it);
- add / reorder a descendant under X (update every location containing X);
- move X's owner (move-owner promotion — home relocates, a portal is left behind);
- delete X's home → **ghost** the portals (reuse the existing ref ghost state);
- recursion / cycles (portal of an ancestor of a portal) — guard with the existing
  `MAX_CASCADE_DEPTH` machinery.

## Perf guards (Stage P0)

- **Write amplification bound:** a write under X updates O(portals of X or any ancestor).
  Prove bounded; add caps and/or **lazy off-screen expansion** of large portal subtrees.
- **Index growth bound:** total ≈ base rows + Σ portaled-subtree-sizes. EQP the windowed
  scan stays a single keyset range; `createWorkCounter` the maintenance path.
- **Shallow fallback:** if deep proves too costly at scale, define the shallow-v1 (portal
  shows the node; subtree only at home) and what it forfeits.

## Decisions to resolve

- Portal storage (join kind vs. table vs. overlay).
- Deep vs. shallow for v1 (with the perf evidence).
- Ghost/empty state reuse for portals (from `@`-ref states).
- How move-owner leaves a portal behind (the Tana "Move original node" analog).

## Deliverables

- `context/Phase-9.7a.md` (or promote this file) with the settled model + a go/no-go on
  **deep-in-v1** backed by measurements, and a prototype of the maintenance path if green.
- Feeds [Phase 9.7b](Phase-9.7b-windowing.md): whether portal subtrees are materialized
  (they are, if deep ships) determines what the windowing flattener must handle.
