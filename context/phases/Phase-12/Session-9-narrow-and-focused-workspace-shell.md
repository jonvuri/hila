---
title: Phase 12 Session 9 — Narrow and focused workspace shell exploration
kind: phase-session
state: complete
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

## Working record

### Baseline evidence

The Storybook baseline renders the same bounded four-panel window at 1180px and 500 × 844.

- On desktop, simultaneous visibility supplies useful path orientation, adjacent comparison, and a
  stable left-to-right drill direction.
- At 500px, the rail preserves that spatial order but not its immediate value. The initial viewport
  shows the oldest retained focus while the active fourth panel remains off-screen. Horizontal
  position becomes the only active-panel cue.
- The width cost is separate from touch and discoverability. Each panel keeps usable content width,
  but reaching it requires horizontal movement; the shell offers no explicit Back, Root, or hidden
  suffix signal. Touch adds a competing horizontal-pan gesture. Intentional focus adds a different
  cost: inactive panels remain visually and semantically prominent even when screen width is ample.
- The load-bearing behavior is drill/replace, Back or close, ancestor jump, root return, `⌘K`,
  cross-matrix reconstruction, active-panel identity, and a hidden-prefix breadcrumb. Session 9
  prototypes expose these as fixed fixture controls without changing the underlying stack.

### Comparison rubric

| Dimension           | Question                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| Orientation         | Can the user name the active panel, parent direction, depth, and root?   |
| Content space       | How much useful width and height does the active subject retain?         |
| Jump cost           | How many clear actions reach parent, ancestor, sibling, child, and root? |
| State continuity    | Does presentation switching preserve one live panel identity and state?  |
| Keyboard and touch  | Are paths complete, ordered, visible, and at least 44px for touch?       |
| Accessibility       | Are landmarks, current state, names, and disabled edges explicit?        |
| Motion dependence   | Is direction and result understandable with motion removed?              |
| Conceptual overhead | Does the chrome describe the existing stack or invent another model?     |

### First direct analogs

Four direct compressions now share one fixture stack and one Back/Forward/Root/`⌘K` toolbar:

1. **Full-width paging** gives the active panel all available width. Orientation depends on the
   active identity and ancestry breadcrumb.
2. **Edge peeks** keep parent/child direction persistent at a 96px content cost. Long vertical
   labels are a visible weakness to test rather than hide.
3. **Compact path rail** keeps ancestors and active depth continuously available but duplicates
   some focus-panel breadcrumb information and consumes vertical space.
4. **On-demand stack switcher** minimizes persistent chrome and exposes the complete stack on
   request. It makes ancestry less glanceable and must prove that Back, Root, and `⌘K` are enough
   when the switcher is closed.

### Direct-analog review and selected narrow rule

Review rejected all four analogs as defaults. Full-width paging still needs carousel chrome; edge
peeks spend content width on weak context; the path rail duplicates the focus-panel breadcrumb; and
the switcher introduces a second navigation surface for little one-column value. Their shared
problem is treating simultaneous panels as a narrow-layout requirement when that spatial context is
valuable mainly in the wide stream.

The selected narrow direction is a clean degradation of the existing workspace:

- The canonical rooted focus stack does not change.
- A wide viewport keeps the current bounded last-four-panel window.
- A narrow viewport shows only the logically focused panel at full width. Root focus shows the
  existing root navigation panel. Any non-root focus shows the existing focus panel with the same
  provenance/home/membership ancestry breadcrumb used when the root is shifted offscreen.
- Narrow mode adds no persistent shell toolbar, edge peeks, path rail, switcher, history, or new
  navigation state. Existing ancestry, root recovery, Jump back, and `⌘K` remain the navigation
  vocabulary.
- Environmental narrowness selects this presentation independently of density. It does not yet
  imply an explicit focused workflow at wide widths; that remains a separate decision.

The selected Storybook comparison renders the wide root-shifted window and narrow focused panel
from the same five-panel fixture. Root-focus and cross-matrix stories cover both ends of the rule.

### Finalist stress and continuity evidence

- At 390px, 500px, and 719px, the active panel fills the available content width. At 720px and
  1180px, the current bounded rail remains intact. Viewport width, density, input mode, and theme
  remain separate fixture inputs.
- The bounded retained window stays mounted while width or the experimental wide-focus input changes
  visibility. Component tests and real Chrome preserve the active editor node, value, DOM selection,
  focus, focus-region scroll, outline scroll, disclosure state, and active panel identity.
- Provenance, ownership-home, deterministic-membership, and cross-matrix ancestry sources use the
  same focused-panel breadcrumb. Root and ancestor actions route through the existing callback.
- Long labels, dense focus and outline content, loading, empty, and error states remain usable. A
  deep narrow breadcrumb scrolls horizontally instead of compressing actions into illegible targets.
- Keyboard order reaches transition controls, root, and ancestors with visible focus. The touch
  fixture uses 44px rows and ancestry targets. Ghost, Null, and Wipeout retain one semantic structure
  in both polarities. The selected presentation has no transition or animation dependency, and its
  mobile Lighthouse accessibility score is 100.

### Decisions

- **Default narrow presentation:** at 719px or below, show only the active existing panel at full
  width. Keep the existing bounded rail at 720px or above.
- **Wide focused workflow:** do not ship one. The prototype proves it could share the same mounting
  model, but it adds a mode and control without evidence of value beyond the current rail, launcher,
  and session navigation.
- **Navigation:** add no persistent narrow chrome. Keep ancestry and root recovery in the focused
  panel, `Meta-Left` for Back, Jump back for session return, and `Mod-k` for global go/run. Preserve
  their existing command and provenance semantics.
- **Continuity and mounting:** keep every panel in the controller's bounded retained window mounted.
  Presentation only hides non-active panels. Do not suspend an editor, pending save, virtualizer,
  scroll position, or disclosure state inside that window. Positions outside the retained window
  continue to reconstruct through ancestry as they do now.
- **Focus during resize:** preserve focus and selection when they are in the active panel. If a
  resize would hide the focused ancestor panel, move focus to the active panel landmark and announce
  the presentation change.
- **Axes:** add one host-computed, runtime-only shell-presentation axis. It is separate from density,
  theme, polarity, and durable state. Environmental width selects it; there is no user-selected
  focused value in this phase.
- **Fallback:** the horizontal rail remains the shipped behavior and the acceptable wide fallback.
  Session 9A implements the selected narrow projection before tab retirement.

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

- [x] Build one baseline story of the current horizontal rail at desktop and 500 × 844.
- [x] Inventory its load-bearing gestures and signals: drill, replace, close/back, ancestor jump,
      root return, launcher entry, cross-matrix entry, active panel, and hidden-prefix breadcrumb.
- [x] Record what the rail communicates well and what becomes costly or ambiguous in one-column
      space. Separate viewport limitations from touch, discoverability, and focus-workflow concerns.
- [x] Define a concise comparison rubric: orientation, content space, jump cost, state continuity,
      keyboard/touch reachability, accessibility, motion dependence, and conceptual overhead.

### 2. Fan out direct stream analogs

- [x] Create at least four meaningfully different one-column concepts over the same stack. Include
      full-width panel paging and at least three other compression strategies, such as edge peeks,
      a compact path/stack rail, an on-demand stack switcher, or a combined focus-and-children
      composition.
- [x] Preserve the current drill/back/ancestor semantics first. Do not compensate for a weak layout
      by silently introducing new navigation state.
- [x] Show each concept at root, two levels deep, beyond the four-panel window, and after a global
      launcher jump that reconstructs ancestry.
- [x] Exercise pointer, keyboard, and plausible touch paths. Include visible focus, long labels,
      empty/error/loading states, and reduced motion.
- [x] Compare concepts side by side in Ghost before spending time on theme expression.

### 3. Stress continuity and transitions

- [x] Prototype wide-to-narrow, narrow-to-wide, and explicit enter/exit-focused transitions over
      the same live fixture state. No transition may change the logical focus target.
- [x] Demonstrate editor selection, scroll position, nested outline state, and active panel identity
      before and after presentation changes.
- [x] Test ancestry and root recovery when the visible panel originated from provenance, ownership
      home, deterministic membership fallback, or a cross-matrix boundary hop.
- [x] Identify which panels must stay mounted, which may suspend, and which may be reconstructed.
      Record performance risks without designing the production mechanism prematurely.

### 4. Test the need for nonliteral stack chrome

- [x] Review whether a local switcher, task strip, or history treatment adds enough value after the
      direct analogs. It does not: each recreates panel navigation in the one-column viewport and
      overlaps existing ancestry, Jump back, or launcher gestures.
- [x] Keep the selected presentation rooted and non-durable. It is only a projection of the current
      stack and introduces no saved workspace, route, or tab-like object.
- [x] Verify through finalist stress that existing ancestry, root recovery, Jump back, and `⌘K` are
      sufficient without new persistent narrow chrome.

### 5. Review and decide

- [x] Present one comparison page containing the baseline, direct analogs, and nonliteral
      alternatives over identical fixtures and viewport controls.
- [x] Narrow to finalists through explicit critique, not implementation convenience. Capture
      rejected concepts and the reason each failed.
- [x] Stress finalists across Ghost, Null, and Wipeout, both polarities, narrow and wide viewports,
      keyboard, pointer/touch-sized targets, reduced motion, and long/dense content.
- [x] Decide separately:
  - the default narrow presentation;
  - whether an explicit focused workflow exists at wide widths;
  - whether those inputs share one presentation;
  - the navigation chrome and gestures;
  - panel mounting/state-continuity expectations;
  - whether a new shell-presentation axis is required.
- [x] Record whether the current horizontal rail remains an acceptable fallback.
- [x] Write one or more later implementation-session plans with acceptance and migration boundaries.
      If no concept earns implementation, state that directly and preserve the current shell.

Implementation is planned in
[Session 9A — responsive workspace shell implementation](Session-9a-responsive-workspace-shell-implementation.md).

## Verification record

- Focused component suites: 11 tests passed.
- Static types passed.
- Storybook production build passed.
- Real Chrome covered 390, 500, 720, and 1180 widths; every theme/polarity pair; keyboard focus;
  touch targets; content states; ancestry sources; and live continuity.
- Lighthouse accessibility scored 100 on the stressed narrow Wipeout state. The only remaining
  report failure was Storybook's irrelevant preview-page SEO description.

## Acceptance

- The comparison starts from the current stream rather than treating mobile as a separate app.
- At least four direct one-column analogs are materially explored. Nonliteral stack chrome is built
  only if review identifies value not already supplied by ancestry, Jump back, or the launcher.
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
