---
title: Current state
kind: status
state: active
updated: 2026-09-27
phase: 13
session: 5
---

# Now

Phase 13 Sessions 1–4 are complete. `hila.table` supplies registered collection and line interiors.
The shared property adapter also supplies the substrate fallback, so registered and fallback paths
do not duplicate field ownership. Hosts pass density and retain labels, grouping, relations, and
gestures.

Inline references, autocomplete, tag properties, shared fields, property rows, and aspect previews
now use canonical roles and local style boundaries. Editing, promoted-type discovery, owned-aspect
lifecycle, source reconciliation, ghost and empty states, and hover tethering remain available.
Formula and dry cells remain read-only.

The focus panel has not yet adopted the complete host-owned scaffold or recursive collection path.
X-ray has no system-edge control yet. No schema changed; the database remains reset-only at schema
version 0. All 1,304 unit tests pass.

## Read next

1. [Phase 13 front door](phases/Phase-13.md).
2. [Session 5](phases/Phase-13/Session-5-focus-panel-scaffold-and-collection-recursion.md).
3. [Architecture](Architecture.md), [Plugins](Plugins.md), [Design](Design.md), and
   [Design Faces](Design-Faces.md) for the host, line, semantic-role, and fidelity contracts.

## Boundary

Session 5 composes identity, fields, collection, and relations in the focus-panel host. It must
preserve rooted navigation, saved-view identity, query semantics, and insertion firewalls without
adding a general region-layout API or moving recursion into faces.

## Next action

Execute Phase 13 Session 5. Route loose, container, and view subjects through one host scaffold,
complete nested host recursion and fidelity inheritance, and migrate the panel's local style
boundary to canonical roles.
