---
title: Phase 12 Session 3 — Place discovery, navigation, and ranking
kind: phase-session
state: complete
updated: 2026-09-05
---

# Phase 12 Session 3 — Place discovery, navigation, and ranking

## Goal

Build a bounded, DOM-free discovery and ranking service that can find the whole local workspace and
navigate every result through the existing place contract.

## Boundaries

- Do not build launcher presentation or session-memory signals.
- Do not add FTS, fuzzy matching, persisted search state, or a schema-backed global index.
- Do not choose an arbitrary portal. Preserve traversed provenance; identity-only navigation uses
  home, then deterministic membership fallback.

## Current seams

- `src/tags/tag-search-provider.ts` is a single-matrix discovery precedent.
- `src/workspace/stream-controller.ts` already resolves identity navigation but its external input
  accepts only a workspace row ID.
- `src/workspace/StreamView.tsx`, `App.tsx`, and workspace place queries carry navigation state.
- Matrix, column-role, promoted-node, block-source, join, and ancestry metadata live behind the
  worker/client boundary.

## Plan

- [x] Define catalog/result types for row identity, family, match target, display text, provenance,
      home/fallback facts, ancestry breadcrumb, and command identity.
- [x] Build batched worker-backed discovery over current matrix catalogs and label/content roles.
      Avoid one unbounded reactive subscription per matrix or result.
- [x] Extract ProseMirror text safely for matching and display.
- [x] Include ordinary rows, view markers, promoted type-nodes, owned container/matrix subjects, and
      commands without duplicating a marker as a loose row.
- [x] Define root workspace/matrix behavior explicitly so `[` can browse it without inventing a
      second root.
- [x] Implement exact, prefix, word-prefix, and substring match quality. Add the label/name target
      weight, then deterministic structural tie-breaks. Reserve on-screen and recency inputs for
      Session 8.
- [x] Make result ordering deterministic for equal inputs and catalog state.
- [x] Generalize external navigation to `NodeRef` plus optional appearance provenance. Reuse the
      existing focus reconstruction and ancestry ladder.
- [x] Cancel or sequence asynchronous requests so older search results cannot replace newer input.
- [x] Expose family-filter data operations for `@`, `#`, `>`, and `[`; do not implement them as
      string-prefix hacks.

## Shipped boundary

- One typed worker request scans the current semantic-role catalog without creating reactive
  subscriptions. Scanning remains linear in searchable cells until FTS. Label-only filters omit
  content columns from row projections, while retained candidates, text excerpts, breadcrumb depth
  and label length, and returned results are capped.
- Candidate reduction uses exact lightweight home or membership anchors. Full appearance and
  breadcrumb hydration remains limited to the retained candidate pool.
- One active search and one replaceable latest pending search bound rapid input. Superseded callers
  receive an explicit stale outcome.
- Results classify rows, views, promoted types, per-matrix container subjects, the existing
  workspace root, and main-thread commands. `@`, `#`, `>`, and `[` map to typed data filters.
- Ranking uses exact, prefix, word-prefix, and substring quality, then target weight and stable
  structural tie-breaks. Session 8 still owns on-screen and recency signals.
- External navigation now carries a `NodeRef` and optional appearance key. Resolution validates
  provenance, falls back to the ownership home, then reconstructs matrix-owner membership context.
  Surviving portals are returned for a future chooser and never selected from identity alone.
- Recursive ProseMirror text extraction handles nested content, malformed stored strings, and
  cyclic object input without inspecting attrs.
- No schema or durability-classification change occurred. The durability manifest descriptions now
  record semantic-role eligibility.

## Acceptance

- Cross-matrix names and content are discoverable without a durable global-search table.
- Views, types, containers, ordinary rows, and commands have distinct stable classifications.
- The same input and signals always produce the same order.
- Navigation reconstructs the correct rooted focus state across matrixes and never picks an
  arbitrary portal.
- Discovery work and subscriptions remain bounded as matrix and result counts grow.
- No schema or durability-classification change occurs; descriptive durability metadata may record
  the shipped invariant.

## Verification

- Add pure discovery, classification, score, tie-break, race, and breadcrumb tests.
- Add stream-controller tests for cross-matrix identity and provenance navigation.
- Run relevant workspace/place tests, standard checks, and `git diff --check`.
