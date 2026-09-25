---
title: Phase 13 Session 1 — Face recipe and host-runtime foundation
kind: phase-session
state: complete
updated: 2026-09-25
---

# Phase 13 Session 1 — Face recipe and host-runtime foundation

## Goal

Establish the final recipe, affinity, registration, and host-service boundary before migrating a
live surface. Remove ambiguity between an intentional table recipe and the universal substrate
fallback.

## Depends on

Phase 12 is complete. Use the subject → recipe → face → host contract in Architecture and Plugins
as the governing input.

## Requirements

- [x] Give every matrix at most one intentional stored recipe in this phase. Do not add a preferred
      pointer or alternate-recipe collection without a real multi-recipe consumer.
- [x] Stop treating an automatically provisioned table recipe as the universal fallback. Hosts must be
      able to render the implicit substrate floor without persisted table configuration.
- [x] Keep table recipes for actual table subjects and explicit table choices. Preserve normalized
      stable-column sort, filter, and slot state as durable collection presentation configuration.
- [x] Make affinity deterministic and independent of plugin registration order. A host resolves the
      intentional recipe, then the substrate floor.
- [x] Give callable `line` and `collection` registrations clear lifecycle ownership. Plugin disposal,
      replacement, reset, and failed registration must not leak stale renderers.
- [x] Define the host contribution boundary needed for navigation, insertion, recursion, and subject
      handoff without exposing shell DOM or letting a face mount another face.
- [x] Keep recipe SQL-free. Loose, container, and view subjects continue to own their child source or
      extent.

## Boundaries

- Do not migrate a live table, tag, workspace, panel, or system-edge surface in this session.
- Appearance-level recipe overrides and multiple saved recipes remain deferred.
- Do not invent a general dashboard-region API or expose pixel sizing through the plugin contract.
- The database remains reset-only at schema version 0. If this foundation changes schema shape,
  update fresh initialization, the durability policy, and two-replica reconstruction coverage.

## Acceptance

- [x] A matrix has one unambiguous intentional recipe or none.
- [x] A host can fall back to substrate without finding or creating an `hila.table` config.
- [x] Existing table sort/filter state retains stable identity and replication semantics.
- [x] Renderer registration and teardown have deterministic ownership.
- [x] The runtime contract can support Sessions 3–6 without another compatibility dispatcher.

## Verification

- [x] Exercise recipe creation, replacement, resolution, reset, plugin lifecycle, and substrate
      fallback with focused unit and integration coverage.
- [x] Update fresh reset-era initialization and verify durability policy, aggregate two-replica
      convergence, and replicated delete cascades.
- [x] Run formatter, linter, static types, the focused suites, the full unit suite, and
      `git diff --check`.

## Outcome

The typed recipe path now creates one replica-stable config ID per matrix, reuses it for explicit
replacement, and rejects ambiguous saves or moves. Same-face application is idempotent and keeps
normalized slot, sort, filter, and filter-ID state. Plugin matrix creation no longer provisions an
unused table recipe; explicit bindings initialize the recipe only when none exists, while actual
table subjects keep their explicit table path.

Hosts receive either the intentional recipe or an implicit substrate affinity. Callable `line` and
`collection` contributions are main-thread-only, owner-scoped, reactive, and committed with the
same generation boundary as commands. Replacement, failed initialization, disposal, and database
reset cannot retain stale renderers. The host service object exposes only navigation and insertion
requests plus nested-subject yielding.

No table, tag, workspace, panel, or system-edge surface migrated. The database remains reset-only
at schema version 0. Fresh initialization removes reset-era duplicate recipes, installs a unique
matrix index, and sync resolves each recipe with its normalized children as one aggregate. The
durability policy and two-replica coverage enforce that contract.

## Handoff

Session 2 consumes the host input boundary. Session 3 is the first live vertical slice and must not
begin until recipe resolution and renderer lifecycle are stable.
