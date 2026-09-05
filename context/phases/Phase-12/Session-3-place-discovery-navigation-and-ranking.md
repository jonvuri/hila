---
title: Phase 12 Session 3 — Place discovery, navigation, and ranking
kind: phase-session
state: ready
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

- [ ] Define catalog/result types for row identity, family, match target, display text, provenance,
      home/fallback facts, ancestry breadcrumb, and command identity.
- [ ] Build batched worker-backed discovery over current matrix catalogs and label/content roles.
      Avoid one unbounded reactive subscription per matrix or result.
- [ ] Extract ProseMirror text safely for matching and display.
- [ ] Include ordinary rows, view markers, promoted type-nodes, owned container/matrix subjects, and
      commands without duplicating a marker as a loose row.
- [ ] Define root workspace/matrix behavior explicitly so `[` can browse it without inventing a
      second root.
- [ ] Implement exact, prefix, word-prefix, and substring match quality. Add the label/name target
      weight, then deterministic structural tie-breaks. Reserve on-screen and recency inputs for
      Session 8.
- [ ] Make result ordering deterministic for equal inputs and catalog state.
- [ ] Generalize external navigation to `NodeRef` plus optional appearance provenance. Reuse the
      existing focus reconstruction and ancestry ladder.
- [ ] Cancel or sequence asynchronous requests so older search results cannot replace newer input.
- [ ] Expose family-filter data operations for `@`, `#`, `>`, and `[`; do not implement them as
      string-prefix hacks.

## Acceptance

- Cross-matrix names and content are discoverable without a durable global-search table.
- Views, types, containers, ordinary rows, and commands have distinct stable classifications.
- The same input and signals always produce the same order.
- Navigation reconstructs the correct rooted focus state across matrixes and never picks an
  arbitrary portal.
- Discovery work and subscriptions remain bounded as matrix and result counts grow.
- No schema or durability-policy change occurs.

## Verification

- Add pure discovery, classification, score, tie-break, race, and breadcrumb tests.
- Add stream-controller tests for cross-matrix identity and provenance navigation.
- Run relevant workspace/place tests, standard checks, and `git diff --check`.
