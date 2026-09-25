---
title: Phase 13 — Live design-system and face-runtime completion
kind: phase-plan
state: planned
updated: 2026-09-24
---

# Phase 13 — Live design-system and face-runtime completion

Phase 13 completes the host and design-system migration after Phase 12 established one stream root.
It must not restore top-level Table or Tags surfaces.

## Outcomes

- Table, inline tag, property, face-configuration, matrix-browser, editor, and system-edge surfaces
  consume canonical design roles.
- Hosts own `line` and `collection` dispatch, recursion, panel scaffold, affinity, and fidelity.
- `TemporaryLegacyFaceAdapter` and the direct embedded `TableFace` mount retire.
- Composed, substrate, and x-ray behavior is either implemented app-wide or explicitly narrowed.
- Source-row and sticky-row visual and interaction continuity is resolved.

## Fixed inputs

- [Architecture](../Architecture.md) owns the subject → recipe → face → host contract.
- [Plugins](../Plugins.md) owns the compatibility-removal list.
- [Design](../Design.md) and [Design Faces](../Design-Faces.md) own the theme, fidelity, and component
  variant contracts.
- Phase 12's single stream root, launcher parity, and retired-surface references are shipped inputs.

## Boundary

Do not add Phase 14 task/review faces before the compatibility runtime is gone. Preserve embedded
table behavior, inline tags, property editing, rooted navigation, and the system-edge route while
migrating each surface independently.

## Next action

Inventory the remaining live legacy-style and face-runtime consumers, then write the first focused
session with an ordered migration slice and verification gate.
