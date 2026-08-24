---
title: Current state
kind: status
state: active
updated: 2026-08-24
phase: phase-10
session: phase-10-session-4n-integrated-sticky-widget
---

# Now

Phase 10 Session 4m is complete. Guides is the only forward navigation-outline variant and the
default. Its dim rails align with parent heading text and end at the bottom edge of the last child
text. The compact disclosure gutter does not move labels. Expanded controls appear on hover or
focus. Leaf bullets are optional and off by default. Their gutter stays reserved when they are
hidden. Sticky headings keep normal depth indentation and use guides without background or border
chrome.

Decoration calculation and paint remain separate from shared row behavior and accessible
semantics. The window contract carries stable global identity, pre-window ancestry, post-window
continuation, and one-row look-ahead. Focused tests prove guide parity across window seams. The old
`Design/Outline` stories preserve the five original renderers as historical references. The
rejected forward adapters are removed.

The live app, production configuration, production faces, and executable overlaid-card archive
remain unchanged. Their migration stays in the later planned slices.

## Current verification

- `npm run format` passes.
- `npm run lint` passes with 14 existing warnings and no errors.
- `npm run typecheck` passes.
- All 871 unit tests pass. The optional bullet test confirms the same 20-pixel root indent when
  bullets are visible or hidden.
- `pnpm build-storybook` passes.
- Focused registry, guide, accessibility, and virtual-window tests pass.
- Chrome DevTools confirms 32-pixel row geometry and no horizontal overflow. Guide x alignment has
  zero measured error. The terminal guide is within 0.1 pixels of the last child text edge.
- Pointer disclosure, keyboard focus, sticky scrolling, narrow width, all three visual themes, and
  both polarities pass.
- Lighthouse accessibility, best practices, and agentic checks score 100. Chrome DevTools reports
  no browser issues.

## Read for Session 4n

1. The [integrated sticky-widget session plan](Phase-10-Session-4n-plan.md).
2. The [Session 4l and 4m outcomes](Phase-10-Sessions-4j-4m-plan.md#session-4l--make-sticky-transitions-seamless).
3. The [approved navigation outline](Design-Faces.md#navigation-outline).
4. The [testing guide](Testing.md) before browser work.

## Next action

Start Session 4n Stage 1. Record the current baseline and lock the integrated widget state and
scroll contracts before renderer changes.

## Documentation boundary

Until Phase 10 settles, limit cleanup to routing, current-state accuracy, and clear historical
markers. The broader documentation audit remains deferred until after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file with the
completed outcome, verification, next session, and minimum reading set.
