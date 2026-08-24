# Design System

The hila design system provides a set of design tokens, structural primitives, and interactive components that define the visual language of the application. Everything is built on SolidJS with CSS Modules and documented in Storybook.

## Design principles

- **One structure.** Ghost defines shared markup, behavior, targets, and visibility. Null and Wipeout
  change values and optional decoration only.
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

| File                    | Role                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/design/tokens.css` | Single source of truth for all CSS custom properties. Imported by Storybook and will be imported by the app. |
| `src/design/tokens.ts`  | TypeScript mirror of token values for use in JS (Storybook controls, dynamic styling).                       |
| `src/design/reset.css`  | Minimal global reset that uses token variables.                                                              |

### Spacing tokens

| Token     | Value |
| --------- | ----- |
| `--sp-1`  | 1px   |
| `--sp-2`  | 2px   |
| `--sp-4`  | 4px   |
| `--sp-8`  | 8px   |
| `--sp-16` | 16px  |
| `--sp-32` | 32px  |
| `--sp-64` | 64px  |

### Typography tokens

| Token         | Value | Typical use                 |
| ------------- | ----- | --------------------------- |
| `--text-xs`   | 10px  | Labels, metadata            |
| `--text-sm`   | 11px  | Secondary text, buttons     |
| `--text-base` | 13px  | Body text (root font-size)  |
| `--text-md`   | 15px  | Emphasized body             |
| `--text-lg`   | 18px  | Inverted headings (default) |
| `--text-xl`   | 22px  | Large headings              |
| `--text-2xl`  | 26px  | Section headings            |
| `--text-3xl`  | 32px  | Display headings            |

### Font stacks

| Token         | Stack                                                   |
| ------------- | ------------------------------------------------------- |
| `--font-sans` | Inter, -apple-system, BlinkMacSystemFont, sans-serif    |
| `--font-mono` | JetBrains Mono, ui-monospace, SFMono-Regular, monospace |

### Color tokens

All colors are semantic and theme-aware. They are defined per `[data-theme]` attribute on the root element.

**Surface & text:** `--c-bg`, `--c-surface`, `--c-elevated`, `--c-fg`, `--c-fg-2`, `--c-fg-3`, `--c-fg-4`

**Borders:** `--c-border`, `--c-border-2`

**Interactive states:** `--c-hover`, `--c-active`

**Inverted:** `--c-invert-bg`, `--c-invert-fg`

**Accent:** `--c-accent`, `--c-accent-2`, `--c-accent-3` (translucent), `--c-accent-border`

### Adding new tokens

1. Add the CSS custom property to `src/design/tokens.css` (in `:root` for universal tokens, or in each `[data-theme]` block for color tokens).
2. If JS access is needed, add the corresponding entry to `src/design/tokens.ts`.

## Theme system

Visual theme, polarity, component variant, and rendering fidelity are separate axes.

- **Polarity** is `dark` or `light`. The current `data-theme` attribute controls this axis.
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

Null and Wipeout preserve Ghost's structure, content behavior, state meaning, and target sizes. A
theme switch changes semantic values and optional decorative primitives only. The approved values
remain local to the ThemeCard preview until the next token session promotes them into the canonical
contract.

In Storybook, a toolbar toggle switches between themes via a decorator that sets the attribute.

The toolbar currently switches polarity. `Design/Theme previewer` has a separate `theme` control for
Ghost, Null, and Wipeout. Session 4m will add a separate navigation-outline control to the forward
navigation specimen.

## Component inventory

All components live in `src/design/` as flat files (no subdirectories).

### Structural primitives

| Component         | File                  | Description                                                                                 |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------- |
| `CornerNotchBox`  | `CornerNotchBox.tsx`  | Container with L-bracket corner decorations. Props: `children`, `maxWidth?`.                |
| `InvertedHeading` | `InvertedHeading.tsx` | Inline-block heading with inverted bg/fg. Props: `children`, `size?: 'sm' \| 'md' \| 'lg'`. |
| `SectionHeading`  | `SectionHeading.tsx`  | Large, light-weight organizational heading. Props: `children`.                              |
| `Divider`         | `Divider.tsx`         | Horizontal rule (32px short or full-width). Props: `full?: boolean`.                        |

### Interactive components

| Component        | File              | Description                                                                                                                                   |
| ---------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`         | `Button.tsx`      | Multi-variant button. Props: `variant?: 'primary' \| 'secondary' \| 'ghost' \| 'destructive' \| 'icon'`, `disabled?`, `children`, `onClick?`. |
| `TextInput`      | `TextInput.tsx`   | Bottom-border input with corner notch decoration. Props: `placeholder?`, `value?`, `onInput?`, `fullWidth?`.                                  |
| `TabBar` / `Tab` | `TabBar.tsx`      | Underline tab navigation. `TabBar` wraps `Tab` children. `Tab` props: `active?`, `children`, `onClick?`.                                      |
| `Badge`          | `Badge.tsx`       | Inline label with surface background. Props: `children`.                                                                                      |
| `ContextMenu`    | `ContextMenu.tsx` | Floating menu container. `ContextMenuItem` props: `children`, `shortcut?`, `muted?`, `onClick?`. `ContextMenuSeparator` has no props.         |

### Grid system

| Component       | File       | Description                                                           |
| --------------- | ---------- | --------------------------------------------------------------------- |
| `GridContainer` | `Grid.tsx` | Max-width 1024px centered container with horizontal padding.          |
| `GridRow`       | `Grid.tsx` | CSS Grid row with 16 columns and `--sp-16` gap.                       |
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
- **CSS tokens**: kebab-case with prefix (`--sp-`, `--text-`, `--c-`, `--font-`).

## Storybook

Run with `pnpm storybook`. Configuration:

- `.storybook/main.ts` — framework config, CSS Modules plugin.
- `.storybook/preview.ts` — imports tokens + reset, theme toggle decorator.

Token documentation stories (color palette, spacing, typography) are in `src/design/tokens.stories.tsx`.

## Migration notes

The existing `src/global.css` contains hardcoded colors and styles for the app shell, sidebar, outline face, note face, and matrix browser. These have not been migrated to the token system yet. Migration will happen incrementally as face components are rebuilt using the design system. See [Design-Faces.md](Design-Faces.md) for the plan.
