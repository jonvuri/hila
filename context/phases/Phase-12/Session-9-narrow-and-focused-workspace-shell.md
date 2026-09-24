---
title: Phase 12 Session 9 — Narrow and focused workspace shell exploration
kind: phase-session
state: planned
updated: 2026-09-24
---

# Phase 12 Session 9 — Narrow and focused workspace shell exploration

## Goal

Explore how the rooted stream and its focus stack should present in one-column space. Start with
space-efficient analogs of the current multi-panel workspace, then test whether a less literal
multitasking and jumping workflow serves narrow and intentionally focused use better.

Produce visual evidence and explicit design determinations. Do not implement the selected runtime
presentation in this session.

## Why now

The current shell was designed and hardened primarily as a desktop four-column workspace. Narrow
review proved that its intentional horizontal rail does not break, but did not compare that rail
with a single-panel presentation. Earlier plans anticipated either single-column flow or a reduced
panel count without resolving the interaction model.

Tab retirement makes the stream the only primary surface. Its narrow behavior therefore needs an
intentional answer before Phase 12 closes.

## Dependencies

Sessions 1–8 and 4A must be complete. Use the current stream controller, workspace fixtures,
place-navigation contract, launcher, session memory, and Ghost/Null/Wipeout interface contract as
inputs.

## Fixed boundaries

- This is a design and creativity session. Work in fixture-driven Storybook; do not change the
  production workspace, controller, database, schema, sync, or durability behavior.
- Preserve one rooted stream. A narrow or focused presentation must not create a second root,
  silently change provenance, or make ancestry and root recovery unavailable.
- Reuse the same underlying panel-stack state, places, focus transitions, launcher, Jump back,
  editors, and commands. Explore presentation and gestures, not a parallel application model.
- Begin with direct analogs of the current stream. Explore less literal multitasking and jumping
  workflows only after their advantages over those analogs are visible.
- Treat environmental narrowness and an intentional focused/full-screen workflow as separate
  inputs. They may share a presentation, but one must not be assumed to imply the other.
- Do not overload the existing `wide`/`narrow` density axis without an explicit decision. Density
  currently changes scale and spacing without hiding data or changing state meaning.
- Keep behavior and state meaning shared across Ghost, Null, and Wipeout. Theme-specific chrome may
  express an approved shared presentation but cannot select the interaction model.
- Saved stream states, durable workspaces, browser-like tabs, URLs, and deep links remain deferred.
  Temporary comparison controls in Storybook must not imply persistence decisions.
- Any accepted runtime work is planned as a later focused session. Do not promote prototype code
  directly into production.

## Questions to settle

1. What value does simultaneous panel visibility provide at one-column width: orientation,
   comparison, fast backtracking, multitasking, or only a desktop spatial memory?
2. What is the smallest direct representation of the current focus stack that keeps the valuable
   parts—full-width paging, compressed edges, a path rail, a switcher, or another form?
3. Which panel is primary after drill-in, launcher navigation, inline-reference navigation, and
   cross-matrix reconstruction? How are its parent, siblings, children, and global root reached?
4. Should environmental narrowness select a presentation automatically? Should a focused workflow
   be an explicit reversible shell state at any width? How do the two interact during resize?
5. Which state remains mounted while only one panel is shown? Preserve editor selection, scroll,
   pending saves, virtualizer position, and focus without retaining unbounded work.
6. Are Back, ancestor jump, root return, Jump back, and `⌘K` sufficient multitasking tools, or does
   focused use need a local panel/history switcher? If so, is it only a view over existing session
   state rather than a new durable object?
7. What must remain persistently visible for orientation, and what can appear on demand without
   making navigation mysterious?

## Storybook foundation

- Extend the existing `Design/Workspace` fixture surface rather than booting SQLite or copying
  production components wholesale.
- Keep one canonical stack model and feed it to every concept. A presentation may select what is
  shown, but it must not invent different navigation data.
- Cover root-visible, exactly-four-column, root-shifted, cross-matrix, long-label, dense-content,
  empty-child, and read-only saved-view states.
- Add useful temporary controls for viewport width, environmental density, active panel, focus
  depth, presentation concept, and explicit focused-workflow state.
- Make transitions inspectable without requiring animation. Motion may reinforce direction but
  cannot carry the only explanation of a state change.

## Exploration sequence

### 1. Frame the current behavior

- [ ] Build one baseline story of the current horizontal rail at desktop and 500 × 844.
- [ ] Inventory its load-bearing gestures and signals: drill, replace, close/back, ancestor jump,
      root return, launcher entry, cross-matrix entry, active panel, and hidden-prefix breadcrumb.
- [ ] Record what the rail communicates well and what becomes costly or ambiguous in one-column
      space. Separate viewport limitations from touch, discoverability, and focus-workflow concerns.
- [ ] Define a concise comparison rubric: orientation, content space, jump cost, state continuity,
      keyboard/touch reachability, accessibility, motion dependence, and conceptual overhead.

### 2. Fan out direct stream analogs

- [ ] Create at least four meaningfully different one-column concepts over the same stack. Include
      full-width panel paging and at least three other compression strategies, such as edge peeks,
      a compact path/stack rail, an on-demand stack switcher, or a combined focus-and-children
      composition.
- [ ] Preserve the current drill/back/ancestor semantics first. Do not compensate for a weak layout
      by silently introducing new navigation state.
- [ ] Show each concept at root, two levels deep, beyond the four-panel window, and after a global
      launcher jump that reconstructs ancestry.
- [ ] Exercise pointer, keyboard, and plausible touch paths. Include visible focus, long labels,
      empty/error/loading states, and reduced motion.
- [ ] Compare concepts side by side in Ghost before spending time on theme expression.

### 3. Stress continuity and transitions

- [ ] Prototype wide-to-narrow, narrow-to-wide, and explicit enter/exit-focused transitions over
      the same live fixture state. No transition may change the logical focus target.
- [ ] Demonstrate editor selection, scroll position, nested outline state, and active panel identity
      before and after presentation changes.
- [ ] Test ancestry and root recovery when the visible panel originated from provenance, ownership
      home, deterministic membership fallback, or a cross-matrix boundary hop.
- [ ] Identify which panels must stay mounted, which may suspend, and which may be reconstructed.
      Record performance risks without designing the production mechanism prematurely.

### 4. Explore beyond literal panels

- [ ] Only after reviewing the direct analogs, build at least two alternatives that treat the focus
      stack as navigation/session context rather than visible adjacent panels. Candidate material
      includes a lightweight local switcher, transient task strip, back/forward history, or
      launcher-assisted jumping composed from existing session signals.
- [ ] Keep these alternatives rooted and non-durable. Do not smuggle saved workspaces, routes, or a
      second tab system into the exploration.
- [ ] Compare whether they improve focused work and multitasking or merely rename the same stack.
      State what is gained and what spatial information is lost.

### 5. Review and decide

- [ ] Present one comparison page containing the baseline, direct analogs, and nonliteral
      alternatives over identical fixtures and viewport controls.
- [ ] Narrow to finalists through explicit critique, not implementation convenience. Capture
      rejected concepts and the reason each failed.
- [ ] Stress finalists across Ghost, Null, and Wipeout, both polarities, narrow and wide viewports,
      keyboard, pointer/touch-sized targets, reduced motion, and long/dense content.
- [ ] Decide separately:
  - the default narrow presentation;
  - whether an explicit focused workflow exists at wide widths;
  - whether those inputs share one presentation;
  - the navigation chrome and gestures;
  - panel mounting/state-continuity expectations;
  - whether a new shell-presentation axis is required.
- [ ] Record whether the current horizontal rail remains an acceptable fallback.
- [ ] Write one or more later implementation-session plans with acceptance and migration boundaries.
      If no concept earns implementation, state that directly and preserve the current shell.

## Acceptance

- The comparison starts from the current stream rather than treating mobile as a separate app.
- At least four direct one-column analogs and two less literal workflows are materially explored.
- Every finalist preserves rooted identity, ancestry access, focus semantics, state continuity, and
  global launcher composition.
- Environmental narrowness and user-selected focused work receive separate decisions.
- The session produces a clear decision record and later implementation plan, not production code.
- No schema, durability, sync, or user-data classification changes occur.

## Verification

- Build Storybook and inspect the comparison at desktop, 720, 500 × 844, and 390 × 844 viewports.
- Review keyboard order, visible focus, accessible names, touch target sizes, reduced motion, long
  labels, dense content, and theme/polarity combinations for finalists.
- Run focused Storybook/component tests for shared-state and gesture simulations.
- Run format, lint, typecheck, the focused unit suite, Storybook build, and `git diff --check`.
- Record screenshots or a visual companion only when they carry decision rationale beyond the
  maintained Storybook stories.

## Handoff

Session 10 remains the tab-retirement and Phase 12 closeout gate. If this exploration selects a
runtime change required before tab retirement, insert its focused implementation session or
sessions between Sessions 9 and 10 and make Session 10 depend on them.
