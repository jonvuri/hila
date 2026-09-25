---
title: Phase 13 Session 1 — Face recipe and host-runtime foundation
kind: phase-session
state: planned
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

- Give every matrix at most one intentional stored recipe in this phase. Do not add a preferred
  pointer or alternate-recipe collection without a real multi-recipe consumer.
- Stop treating an automatically provisioned table recipe as the universal fallback. Hosts must be
  able to render the implicit substrate floor without persisted table configuration.
- Keep table recipes for actual table subjects and explicit table choices. Preserve normalized
  stable-column sort, filter, and slot state as durable collection presentation configuration.
- Make affinity deterministic and independent of plugin registration order. A host resolves the
  intentional recipe, then the substrate floor.
- Give callable `line` and `collection` registrations clear lifecycle ownership. Plugin disposal,
  replacement, reset, and failed registration must not leak stale renderers.
- Define the host contribution boundary needed for navigation, insertion, recursion, and subject
  handoff without exposing shell DOM or letting a face mount another face.
- Keep recipe SQL-free. Loose, container, and view subjects continue to own their child source or
  extent.

## Boundaries

- Do not migrate a live table, tag, workspace, panel, or system-edge surface in this session.
- Appearance-level recipe overrides and multiple saved recipes remain deferred.
- Do not invent a general dashboard-region API or expose pixel sizing through the plugin contract.
- The database remains reset-only at schema version 0. If this foundation changes schema shape,
  update fresh initialization, the durability policy, and two-replica reconstruction coverage.

## Acceptance

- A matrix has one unambiguous intentional recipe or none.
- A host can fall back to substrate without finding or creating an `hila.table` config.
- Existing table sort/filter state retains stable identity and replication semantics.
- Renderer registration and teardown have deterministic ownership.
- The runtime contract can support Sessions 3–6 without another compatibility dispatcher.

## Verification

- Exercise recipe creation, replacement, resolution, reset, plugin lifecycle, and substrate
  fallback with focused unit and integration coverage.
- Verify schema policy, fresh initialization, remote reconstruction, and delete behavior if the
  stored shape changes.
- Run formatter, linter, static types, the focused suites, the full unit suite, and
  `git diff --check`.

## Handoff

Session 2 consumes the host input boundary. Session 3 is the first live vertical slice and must not
begin until recipe resolution and renderer lifecycle are stable.
