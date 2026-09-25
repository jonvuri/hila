---
title: Current state
kind: status
state: active
updated: 2026-09-24
phase: 13
session: entry
---

# Now

Phase 12 is complete. The production app mounts one stream root; the temporary Table and Tags tabs
and direct application roots are retired. `[` discovers containers, `#` discovers promoted types,
and ordinary rows, content, saved views, commands, and `/table` use rooted launcher/place routes.
Worker-free Storybook references preserve the retired surfaces.

Embedded tables, inline tags, property editing, and schema/face administration through the
development system edge remain live. All 1,235 unit tests and 165 system-browser E2E tests pass.
The unreleased app remains at reset-only schema version 0; Phase 12 changed no schema, durable data,
or replication contract.

## Read next

1. [Phase 13 front door](phases/Phase-13.md).
2. [Plugins](Plugins.md) for the compatibility-removal list.
3. [Architecture](Architecture.md), [Design](Design.md), and [Design Faces](Design-Faces.md).

## Boundary

Phase 13 completes the live design-system and face-runtime migration without restoring retired
application roots. Preserve embedded table behavior, inline tags, property editing, rooted
navigation, and the system-edge route while removing the temporary adapter and direct embedded
`TableFace` mount incrementally.

## Next action

Inventory remaining live legacy-style and face-runtime consumers. Then write the first focused
Phase 13 session with an ordered migration slice and verification gate.
