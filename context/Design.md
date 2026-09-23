# Design System

> **Implementation status.** Canonical tokens, theme values, the component-variant registry, the
> production workspace/sticky slice, shared overlay/selectable-list primitives, and production
> Quick launcher ship. App-wide fidelity behavior and remaining face, browser, Deep launcher, and
> system-edge migrations do not. Future sequencing belongs in [Plan.md](Plan.md), not this topic
> contract.

The hila design system provides a set of design tokens, structural primitives, and interactive components that define the visual language of the application. Everything is built on SolidJS with CSS Modules and documented in Storybook.

## Design principles

- **One interface, multiple expressions.** Themes share state, content, behavior, targets,
  accessibility, and semantic meaning. A documented presentation adapter may vary geometry and
  chrome without forking product capability or interaction logic.
- **Explicit semantic states.** Hover, keyboard focus, selection, disabled, invalid, and armed danger
  stay distinct. Accent identifies focus, selection, and live paths. Red identifies risk only.
- **Readable density.** Long-form copy keeps the shared body face. Display and data faces can identify
  headings, labels, and data without entering prose.
- **Theme-contained chrome.** Ghost uses the least visible treatment that preserves comprehension.
  Null uses conventional radius, fills, and elevation. Wipeout uses hard brightness steps, square
  geometry, aligned low-poly chrome, and no glow.
- **Powers-of-two spacing.** Shared spacing uses the `1, 2, 4, 8, 16, 32, 64` px scale.

## Token system

### Files

| File                    | Role                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `src/design/tokens.css` | Single source of truth for all CSS custom properties. Storybook and the app import it. |
| `src/design/tokens.ts`  | Typed token names, axis values, and registry helpers for TypeScript consumers.         |
| `src/design/reset.css`  | Minimal global reset that uses token variables.                                        |

Session 4k replaced the old token names with this contract. It updated all then-current
design-system consumers in the same change and added no compatibility aliases. Live styles that do
not yet consume canonical tokens stay unchanged until their migration slice.

### Two token layers

The token system has two layers:

1. **Fundamental tokens** name simple palette values and reusable building blocks. Examples are
   `--palette-neutral-950`, `--space-8`, `--font-size-13`, `--radius-6`, `--duration-160`, and
   `--shadow-soft`. A component must not consume these tokens directly.
2. **Semantic tokens** name a stable purpose. Examples are `--color-canvas`,
   `--space-control-gap`, `--type-body-size`, and `--elevation-overlay`. Components consume only
   these tokens. Each semantic value references one or more fundamental values.

Theme and polarity selectors can change fundamental values and semantic references. They must not
change semantic token names. General-purpose tokens must not contain a component name. A local
component variant can define private variables inside its own stylesheet, but those variables are
not part of the canonical token API.

`--color-overlay-strong` is the deepest border-defined overlay layer. Ghost and Wipeout Quick use
it for their reviewed dark launcher surface instead of a component-local black literal.

### Canonical atom groups

| Group               | Fundamental token families                                                                               | Semantic roles                                                                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color               | `--palette-neutral-*`, `--palette-blue-*`, `--palette-violet-*`, `--palette-red-*`, `--palette-shadow-*` | `--color-canvas`, `--color-surface`, `--color-overlay`, `--color-overlay-strong`, `--color-scrim`, `--color-text-strong`, `--color-text`, `--color-text-muted`, `--color-text-faint`, `--color-inverse-surface`, `--color-inverse-text`, `--color-accent`, `--color-danger` |
| Type                | `--font-family-*`, `--font-size-*`, `--font-weight-*`, `--line-height-*`, `--letter-spacing-*`           | `--type-body-*`, `--type-label-*`, `--type-data-*`, `--type-display-*`                                                                                                                                                                                                      |
| Space               | `--space-1`, `--space-2`, `--space-4`, `--space-8`, `--space-16`, `--space-32`, `--space-64`             | `--space-control-gap`, `--space-section-gap`, `--space-panel-gap`, `--space-content-inset`                                                                                                                                                                                  |
| Geometry            | `--size-*`, `--radius-*`, `--cut-*`                                                                      | `--size-control`, `--size-row`, `--size-icon`, `--radius-control`, `--radius-surface`, `--cut-surface`                                                                                                                                                                      |
| Lines               | `--line-width-*`, `--line-style-*`                                                                       | `--color-line-subtle`, `--color-line-strong`, `--width-line`, `--width-icon-stroke`                                                                                                                                                                                         |
| Motion              | `--duration-*`, `--easing-*`                                                                             | `--duration-feedback`, `--easing-feedback`                                                                                                                                                                                                                                  |
| Elevation           | `--shadow-none`, `--shadow-soft`, `--shadow-raised`                                                      | `--elevation-none`, `--elevation-surface`, `--elevation-sticky`, `--elevation-overlay`                                                                                                                                                                                      |
| Semantic states     | Fundamental color, opacity, line, and motion values                                                      | `--color-state-hover`, `--color-state-selected`, `--color-state-focus`, `--opacity-state-disabled`, `--color-state-invalid`, `--color-state-danger-surface`, `--width-focus-ring`, `--offset-focus-ring`                                                                    |
| Optional decoration | `--decoration-size-*`, `--decoration-opacity-*`                                                          | `--color-decoration`, `--size-decoration-cut`, `--opacity-decoration-texture`                                                                                                                                                                                               |

The approved spacing scale remains `1, 2, 4, 8, 16, 32, 64` pixels. The default control and row
target is 32 pixels. A larger control can use a larger fundamental size. It must not mint a
component-specific general token.

### Dependencies

| Group               | Visual theme | Polarity | Density | Interaction or preference state |
| ------------------- | ------------ | -------- | ------- | ------------------------------- |
| Color               | Yes          | Yes      | No      | State roles only                |
| Type                | Yes          | No       | Yes     | No                              |
| Space               | No           | No       | Yes     | No                              |
| Geometry            | Yes          | No       | No      | No                              |
| Lines               | Yes          | Yes      | No      | Focus and invalid roles only    |
| Motion              | Yes          | No       | No      | Reduced motion                  |
| Elevation           | Yes          | Yes      | No      | Fidelity selects its use        |
| Semantic states     | Yes          | Yes      | No      | Yes                             |
| Optional decoration | Yes          | Yes      | No      | Reduced motion when applicable  |

Density is a host-computed `wide` or `narrow` input. It is not stored as a visual theme. The
32-pixel interaction target stays fixed in both tiers. Density can change text scale, content
inset, and gaps. It must not change state meaning or hide data.

The reduced-motion media query sets nonessential duration roles to `0ms`. It keeps scroll-linked
position continuity and final states. No component can use motion to carry information that is
otherwise absent.

### Adding new tokens

1. Add a fundamental token only when no existing building block can express the value.
2. Add or update a semantic role in `src/design/tokens.css`.
3. Make the semantic role reference fundamental tokens.
4. Add the typed name or axis value to `src/design/tokens.ts`.
5. Update the token stories and contract tests.
6. Update all current consumers in the same change. Do not add an old-name alias.

## Theme system

Visual theme, polarity, component variant, and rendering fidelity are separate axes.

- **Polarity** is `dark` or `light`. The `data-theme` attribute controls this axis.
- **Visual theme** is Ghost, Null, or Wipeout. All three are approved to ship.
- **Component variant** selects one local visual treatment, such as a navigation outline or table
  treatment. It does not create a new global theme. An explicit component value stays unchanged
  when the visual theme changes.
- **Rendering fidelity** is composed or substrate, with x-ray as an orthogonal inspection state. It
  does not create a theme fork.

| Visual theme | Role                   | Approved treatment                                                                                                                     |
| ------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Ghost        | Base contract          | Quiet resting chrome, square geometry, neutral layers, and minimum explicit affordances                                                |
| Null         | Conventional extension | Moderate radius, familiar blue state signals, filled controls, and soft elevation                                                      |
| Wipeout      | Instrument extension   | Hard brightness steps, instrument type, disciplined violet signals, one-cut geometry, aligned ticks and notches, and unlit VFD texture |

Null and Wipeout preserve Ghost's interface contract, content behavior, state meaning, and target
sizes. Themes normally vary through fundamental values, semantic references, and optional
decoration. A component may also expose an explicit theme-selected presentation adapter when its
canonical contract documents the allowed geometry and all behavior remains shared. The launcher is
the first approved use of this seam.

### Attributes and inheritance

```typescript
type Polarity = 'dark' | 'light'
type VisualTheme = 'ghost' | 'null' | 'wipeout'
type Density = 'narrow' | 'wide'
```

- `data-theme="dark|light"` selects polarity. The fallback is `dark`.
- `data-visual-theme="ghost|null|wipeout"` selects visual theme. The fallback is `ghost`.
- Both attributes can exist on the document root or on an isolated preview scope. Descendants
  inherit the resolved custom properties.
- A nested scope that changes either axis must expose both resolved attributes. This keeps a nested
  visual-theme change independent from the inherited polarity.
- Missing or unknown values resolve to the fallback in TypeScript before attributes are written.
  CSS root defaults provide the same fallback when script has not run.

Each resolved polarity and visual-theme pair assigns the fundamental palette, type, geometry,
motion, elevation, and decoration values. The semantic declarations then reference those values.
Components do not select a palette. Theme-name branching belongs only at a documented presentation
adapter boundary; it must not spread into data, state, or interaction logic.

Storybook exposes separate `polarity` and `visualTheme` toolbar values through one decorator.
The focused theme preview can keep its local `visualTheme` control. The forward navigation
specimen uses the approved Guides treatment and does not expose a single-option outline control.

### Fidelity inputs

```typescript
type RenderingFidelity = 'composed' | 'substrate'

type FidelityInput = {
  fidelity?: RenderingFidelity
  xray?: boolean
}
```

The host resolves fidelity in this order:

1. An active x-ray value resolves every descendant to `substrate`.
2. An explicit local fidelity wins when x-ray is off.
3. The value inherits from the parent scope.
4. The root fallback is `composed`.

`data-fidelity="composed|substrate"` exposes the resolved value to CSS. `data-x-ray="true"` records
the global inspection state at the workspace root. X-ray does not change polarity, visual theme,
component variants, or stored face recipes.

Composed rendering can use `--color-surface`, `--color-overlay`, and the semantic elevation roles.
Substrate rendering uses explicit line and label roles and selects `--elevation-none`. It must
expose all fields and relationship metadata. It can use surface brightness steps, but it must not
use elevation to imply hidden structure. X-ray applies the substrate rules at every scope and is
the identity-face conformance check.

### Accessibility ownership

Session 4k resolved the ThemeCard defects that exposed these durable ownership rules.

| Open ThemeCard finding                  | Owner                         | Required work                                                                                                 |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Faint 10-pixel labels have low contrast | Text semantic tokens and type | Reserve faint text for supplemental content. Meet contrast at the rendered size and weight for required text. |
| Decorative specimens have names         | ThemeCard markup              | Remove invalid names. Hide decorative marks from assistive technology.                                        |
| Inputs lack stable identifiers          | ThemeCard controls            | Give each input a stable `id` and `name`. Associate each visible label with its input.                        |
| Keyboard focus must stay distinct       | State tokens and components   | Use the focus color, width, and offset roles. Do not reuse selection as the only focus signal.                |

These are defects. They are not part of Ghost, Null, or Wipeout character.

### Migration status

Steps 1–5 below shipped in Phase 10. Steps 6–8 are re-homed by the phase-boundary reconciliation.
The approved roadmap owns their future order.

1. Implement both token layers and migrate all current design-system and approved specimen
   consumers in one change. Delete the old token names and the temporary ThemeCard role layer.
2. Rebuild sticky navigation as a bounded, VS Code-inspired widget in Storybook. Disable boundary
   rubber-band for this view.
3. Adapt the approved widget to paged production data and the production virtualizer.
4. Migrate the live shell and stream to the approved workspace, themes, sticky model, and
   navigation-outline configuration.
5. Session 4q removed the executable overlaid-card implementation and its legacy styles after live
   review.
6. The shared overlay/selectable-list primitives shipped in Phase 12 Session 4. Session 4A approved
   provisional theme-specific launcher shells over one interface contract. Quick shipped in Session
   5; migrate Deep in Session 6, then keep evaluating the Wipeout expression through dogfooding.
7. Capture the retiring Table and Tags views in Storybook. Then remove their top-level tabs.
8. Migrate faces and browsers one at a time. Apply composed, substrate, and x-ray fidelity as an
   independent axis.

### Sticky navigation

The approved navigation uses one bounded sticky widget inside its native vertical scrollport. The
source outline remains the only tree. Sticky copies expose named actions, but they do not own tree
items, editors, drag behavior, or selection state.

The primary sticky stack is the expanded ancestry of the first visible nested position. Each row
uses a canonical 32-pixel slot and its visible-subtree end for push-off. One secondary drill dock
represents the focused target when normal flow or the primary stack does not represent it. The
dock yields to the same tree appearance in the primary stack and takes its canonical slot on the
first push pixel.

Production paging uses `global_lexkey` as the ordered appearance identity and `(matrix_id,
row_id)` as logical row identity. A bounded metadata plane supplies ancestry, subtree ends,
post-window continuation, and drill resolution when source rows are not mounted. It does not widen
the rendered range. The virtualizer supplies scroll and retained geometry values. Scroll handlers
must not read row layout.

The widget stops at the content viewport and cannot cover the native scrollbar. The workspace
title masks outgoing rows. `overscroll-behavior: none` belongs only to the navigation scrollport.
Normal push-off reuses the sticky DOM and writes only the final row transform.

## Component inventory

Design-system components live in `src/design/` and its focused `outline/`, `table/`, `theme-card/`,
and `workspace/` directories.

### Structural primitives

| Component         | File                  | Description                                                                                 |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------- |
| `CornerNotchBox`  | `CornerNotchBox.tsx`  | Container with L-bracket corner decorations. Props: `children`, `maxWidth?`.                |
| `InvertedHeading` | `InvertedHeading.tsx` | Inline-block heading with inverted bg/fg. Props: `children`, `size?: 'sm' \| 'md' \| 'lg'`. |
| `SectionHeading`  | `SectionHeading.tsx`  | Large, light-weight organizational heading. Props: `children`.                              |
| `Divider`         | `Divider.tsx`         | Horizontal rule (32px short or full-width). Props: `full?: boolean`.                        |

### Interactive components

| Component                             | File                         | Description                                                                                                                                   |
| ------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                              | `Button.tsx`                 | Multi-variant button. Props: `variant?: 'primary' \| 'secondary' \| 'ghost' \| 'destructive' \| 'icon'`, `disabled?`, `children`, `onClick?`. |
| `TextInput`                           | `TextInput.tsx`              | Bottom-border input with corner notch decoration. Props: `placeholder?`, `value?`, `onInput?`, `fullWidth?`.                                  |
| `TabBar` / `Tab`                      | `TabBar.tsx`                 | Underline tab navigation. `TabBar` wraps `Tab` children. `Tab` props: `active?`, `children`, `onClick?`.                                      |
| `Badge`                               | `Badge.tsx`                  | Inline label with surface background. Props: `children`.                                                                                      |
| `ContextMenu`                         | `ContextMenu.tsx`            | Floating menu container. `ContextMenuItem` props: `children`, `shortcut?`, `muted?`, `onClick?`. `ContextMenuSeparator` has no props.         |
| `SelectableList`                      | `overlay/SelectableList.tsx` | Controlled stable-ID listbox with shared keyboard, pointer, unavailable-reason, and active-descendant behavior.                               |
| `CenteredOverlay` / `AnchoredOverlay` | `overlay/Overlay.tsx`        | Native modal-palette and nonmodal cursor-anchored shells with stacked dismissal, focus restoration, and viewport-aware positioning.           |

### Grid system

| Component       | File       | Description                                                           |
| --------------- | ---------- | --------------------------------------------------------------------- |
| `GridContainer` | `Grid.tsx` | Max-width 1024px centered container with horizontal padding.          |
| `GridRow`       | `Grid.tsx` | CSS Grid row with 16 columns and a semantic panel gap.                |
| `GridCol`       | `Grid.tsx` | Column that spans 1-16 columns. Props: `span?`, `smSpan?`, `mdSpan?`. |

Breakpoints:

- **< 512px**: single column (all columns collapse to full width)
- **sm (512px)**: 8-column grid
- **md (768px)**: 12-column grid
- **lg (1024px+)**: 16-column grid

## Naming conventions

- **Components**: PascalCase (`CornerNotchBox.tsx`).
- **CSS Modules**: PascalCase matching the component (`CornerNotchBox.module.css`).
- **Stories**: PascalCase matching the component (`CornerNotchBox.stories.tsx`).
- **Storybook titles**: All under `Design/` prefix (e.g., `Design/Button`).
- **CSS class names**: camelCase in modules (maps to `styles.className`).
- **CSS tokens**: kebab-case with a group prefix, such as `--palette-`, `--space-`, `--type-`,
  `--color-`, or `--elevation-`.

## Storybook

Run with `pnpm storybook`. Configuration:

- `.storybook/main.ts` — framework config, CSS Modules plugin.
- `.storybook/preview.ts` — imports tokens and reset, then applies the polarity and visual-theme
  decorator.

Token documentation stories (color palette, spacing, typography) are in `src/design/tokens.stories.tsx`.

## Migration notes

The existing `src/global.css` contains hardcoded colors and styles for the app shell, sidebar,
outline face, note face, and matrix browser. These styles are not canonical-token consumers. Each
planned migration slice replaces its full local style boundary without compatibility aliases. See
[Design-Faces.md](Design-Faces.md) for the plan.
