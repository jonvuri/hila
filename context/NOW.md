---
title: Current state
kind: status
state: active
updated: 2026-09-25
phase: 13
session: 4
---

# Now

Phase 13 Sessions 1–3 are complete. The embedded table is the first live registered collection.
Its container host owns title, insertion, navigation, extent, and fidelity while the face owns the
table interior. The direct mount and `TemporaryLegacyFaceAdapter` are gone.

Table editing, insertion, sort, filter, formula, reference, reorder, boundary-hop, and bounded
100-row paging remain available. Thin line, corner notch, and cell dots use canonical semantic
roles and stay independent from visual theme, polarity, and fidelity. Missing recipes and
unavailable renderings fail visibly without changing subject or recipe state.

Inline tags and property editing retain their current paths for Session 4. X-ray has no system-edge
control yet. No schema changed; the database remains reset-only at schema version 0. All 1,280 unit
tests pass.

## Read next

1. [Phase 13 front door](phases/Phase-13.md).
2. [Session 4](phases/Phase-13/Session-4-inline-tags-and-property-line-surfaces.md).
3. [Architecture](Architecture.md), [Plugins](Plugins.md), [Design](Design.md), and
   [Design Faces](Design-Faces.md) for the host, line, semantic-role, and fidelity contracts.

## Boundary

Session 4 migrates inline references, tag properties, shared fields, and aspect-row interiors. It
must preserve their data lifecycle and host ownership without restoring a Tag Browser root, adding
Phase 14 product semantics, or turning property popovers into collection faces.

## Next action

Execute Phase 13 Session 4. Add host-consumable line interiors and canonicalize the complete
inline/property style boundary while preserving editing, ghosting, discovery, reconciliation, and
hover behavior.
