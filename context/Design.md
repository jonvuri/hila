# Design System

The hila design system provides a set of design tokens, structural primitives, and interactive components that define the visual language of the application. Everything is built on SolidJS with CSS Modules and documented in Storybook.

## Design principles

- **Sharp geometry.** No border-radius anywhere. Rectangles, straight lines, right angles.
- **Monochrome + violet accent.** The palette is grayscale with a single violet accent color (`#8b5cf6` dark / `#7c3aed` light`). No other hues.
- **Inverted blocks.** Primary focus headings use inverted bg/fg (light-on-dark in dark mode, dark-on-light in light mode). This is the signature visual pattern.
- **Corner notches.** Structural containers use L-bracket corner decorations rather than full borders.
- **Minimal chrome.** Components have minimal visual weight. Hover states are subtle. Destructive actions are muted until hovered.
- **Powers-of-two spacing.** All spacing uses a strict `1, 2, 4, 8, 16, 32, 64` px scale.

## Token system

### Files

| File | Role |
|---|---|
| `src/design/tokens.css` | Single source of truth for all CSS custom properties. Imported by Storybook and will be imported by the app. |
| `src/design/tokens.ts` | TypeScript mirror of token values for use in JS (Storybook controls, dynamic styling). |
| `src/design/reset.css` | Minimal global reset that uses token variables. |

### Spacing tokens

| Token | Value |
|---|---|
| `--sp-1` | 1px |
| `--sp-2` | 2px |
| `--sp-4` | 4px |
| `--sp-8` | 8px |
| `--sp-16` | 16px |
| `--sp-32` | 32px |
| `--sp-64` | 64px |

### Typography tokens

| Token | Value | Typical use |
|---|---|---|
| `--text-xs` | 10px | Labels, metadata |
| `--text-sm` | 11px | Secondary text, buttons |
| `--text-base` | 13px | Body text (root font-size) |
| `--text-md` | 15px | Emphasized body |
| `--text-lg` | 18px | Inverted headings (default) |
| `--text-xl` | 22px | Large headings |
| `--text-2xl` | 26px | Section headings |
| `--text-3xl` | 32px | Display headings |

### Font stacks

| Token | Stack |
|---|---|
| `--font-sans` | Inter, -apple-system, BlinkMacSystemFont, sans-serif |
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

Themes are activated by setting `data-theme="dark"` or `data-theme="light"` on the `<html>` element. All color tokens resolve via CSS custom properties scoped to the theme attribute.

In Storybook, a toolbar toggle switches between themes via a decorator that sets the attribute.

To add a new theme: create a new `[data-theme="mytheme"]` block in `tokens.css` that provides all `--c-*` variables.

## Component inventory

All components live in `src/design/` as flat files (no subdirectories).

### Structural primitives

| Component | File | Description |
|---|---|---|
| `CornerNotchBox` | `CornerNotchBox.tsx` | Container with L-bracket corner decorations. Props: `children`, `maxWidth?`. |
| `InvertedHeading` | `InvertedHeading.tsx` | Inline-block heading with inverted bg/fg. Props: `children`, `size?: 'sm' \| 'md' \| 'lg'`. |
| `SectionHeading` | `SectionHeading.tsx` | Large, light-weight organizational heading. Props: `children`. |
| `Divider` | `Divider.tsx` | Horizontal rule (32px short or full-width). Props: `full?: boolean`. |

### Interactive components

| Component | File | Description |
|---|---|---|
| `Button` | `Button.tsx` | Multi-variant button. Props: `variant?: 'primary' \| 'secondary' \| 'ghost' \| 'destructive' \| 'icon'`, `disabled?`, `children`, `onClick?`. |
| `TextInput` | `TextInput.tsx` | Bottom-border input with corner notch decoration. Props: `placeholder?`, `value?`, `onInput?`, `fullWidth?`. |
| `TabBar` / `Tab` | `TabBar.tsx` | Underline tab navigation. `TabBar` wraps `Tab` children. `Tab` props: `active?`, `children`, `onClick?`. |
| `Badge` | `Badge.tsx` | Inline label with surface background. Props: `children`. |
| `ContextMenu` | `ContextMenu.tsx` | Floating menu container. `ContextMenuItem` props: `children`, `shortcut?`, `muted?`, `onClick?`. `ContextMenuSeparator` has no props. |

### Grid system

| Component | File | Description |
|---|---|---|
| `GridContainer` | `Grid.tsx` | Max-width 1024px centered container with horizontal padding. |
| `GridRow` | `Grid.tsx` | CSS Grid row with 16 columns and `--sp-16` gap. |
| `GridCol` | `Grid.tsx` | Column that spans 1-16 columns. Props: `span?`, `smSpan?`, `mdSpan?`. |

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
