# Design System — Face Themes

This document plans the integration of outline face themes and table face themes into the design system. These are complex, highly configurable components that build on the elemental primitives and token system established in the initial design system buildout.

## Outline face themes

The design exploration (`design-demo.html` section 5) defines five distinct visual treatments for the same tree data structure. All render the same data contract: a flat list of rows with depth, expand/collapse state, and text content.

### Theme inventory

| Theme | Visual metaphor | Key elements |
|---|---|---|
| **A — Workflowy clone** | Traditional outliner | Filled circle bullets, triangle carets, SVG guide lines connecting parent to children |
| **B — Workflowy geometric** | Geometric outliner | Dash bullets for leaves, plus-sign for collapsed parents, dashed SVG guide lines |
| **C — Vector field** | Directional lines | Left gutter with angled vector lines pointing from parent to last child; angle determined by row distance (0→0°, 1→35°, 2→50°, 3→58°, 4→63°); own-depth strokes prominent, parent strokes fade |
| **D — Corner notches** | Structural brackets | Top-left L-bracket on every row, bottom-right L-bracket on the visually-last row at each depth level; notch color fades with depth |
| **E — Whitespace only** | Minimalist | No bullets or lines; hierarchy conveyed by indentation only; faint carets appear on expandable items |

### Data contract

Each outline row provides:
- `depth: number` — nesting level (0 = root)
- `hasChildren: boolean` — whether the row has children
- `expanded: boolean` — whether children are visible
- `isVisualLast: boolean` — whether this row is the last visible row at its depth level (needed for themes A, D)
- `text: string` — row content

The theme renderer receives a flat array of these rows (already flattened from the tree by the outline face logic) and renders them with the appropriate visual treatment.

### CSS architecture

Each theme should be a separate CSS module:
- `OutlineThemeA.module.css`, `OutlineThemeB.module.css`, etc.
- All themes import and use the shared design tokens (`--c-fg`, `--c-border`, `--sp-*`, etc.)
- The active theme is selected by the face config panel (already has a "Theme" dropdown in the design demo)

A `ThemeRenderer` component maps the theme key to the concrete renderer:

```
OutlineFace → ThemeRenderer(themeKey) → OutlineThemeA | OutlineThemeB | ...
```

### SVG rendering considerations

Themes A, B, and C use inline SVGs for guide lines and vector strokes. These SVGs are positioned absolutely within each row and reference CSS color tokens via `style` attributes (e.g., `stroke: var(--c-border)`). This approach works today in the static demo and should translate directly to SolidJS JSX.

Theme C (vector field) is the most complex. The vector angle calculation depends on the distance from a parent row to its last visible child. This requires computing the relationship during the flattening step, not in the renderer. The renderer receives pre-computed angle values per gutter slot.

### Implementation phases

**Phase 1: Theme E (whitespace only).** Simplest — no SVGs, no bullets, just indentation and faint carets. Use this to establish the theme renderer pattern and the data contract interface.

**Phase 2: Theme A (Workflowy clone).** Standard outliner with bullets, carets, and guide lines. Introduces SVG gutter rendering.

**Phase 3: Themes B and D.** Geometric variant and corner notches. Both build on patterns from Theme A.

**Phase 4: Theme C (vector field).** Most complex; requires pre-computed angle data. Build last.

Each phase produces its theme component, CSS module, and Storybook stories with static demo data matching the design-demo.html reference.

## Table face themes

The design exploration (`design-demo.html` section 6) defines three visual treatments for tabular data.

### Theme inventory

| Theme | Visual metaphor | Key elements |
|---|---|---|
| **A — Thin header line** | Clean minimal | Uppercase xs-size headers, bold bottom border on header, light borders on rows |
| **B — Corner notch container** | Structural | CornerNotchBox wrapper around the table, weighted header text, subtle row borders |
| **C — Cell dots** | Cell-level decoration | Small dots in the top-left corner of each cell; dot color differentiates header (fg) from body (fg-3/fg-4 alternating) |

### Data contract

Each table row is independently renderable given its props, enabling windowed rendering via the virtualizer. The data contract mirrors the outline's `FlatRow` / `RowDecoration` pattern:

- `columns: Column[]` where `Column = { key: string; label: string }` — column definitions, stable across windows
- `rows: FlatTableRow[]` where `FlatTableRow = { id: string; cells: Record<string, string> }` — row data keyed by column key, with `id` for stable keying across virtualizer window boundaries
- `computeTableDecorations(theme, columns, rows, startIndex?)` returns a `RowDecoration[]` with per-cell decoration data. The `startIndex` parameter supports windowed rendering — row index parity (for cell-dot color alternation) must reflect the row's global position, not its position within the window.
- `TableRowProps` bundles everything needed to render a single row in isolation: `theme`, `columns`, `row`, `decoration`, and an optional `renderCell` callback.

The theme renderer receives a flat array of these rows and renders them with the appropriate visual treatment. The header row (`TableHeaderRow`) is separate and always visible (not virtualized).

### CSS architecture

All themes share a single CSS module (`Table.module.css`) with a base `.table` class and theme-scoped descendant rules (`.themeThinLine`, `.themeCornerNotch`, `.themeCellDots`). The active theme class is applied via `tableThemeClass(theme)`, which returns the combined class string for the `<table>` element. Theme B reuses the `CornerNotchBox` primitive from the design system as a wrapper component.

### Implementation phases

**Phase 1: All three themes.** The table themes are structurally simple (no SVGs, no cross-row dependencies), so all three are implemented together. Theme A establishes the base, Theme B composes with `CornerNotchBox`, Theme C adds per-cell dot decorations.

## Shared infrastructure

### Theme registry

A theme registry maps theme keys to renderer components:

```typescript
type OutlineThemeKey = 'workflowy' | 'geometric' | 'vector' | 'notches' | 'whitespace'
type TableThemeKey = 'thin-line' | 'corner-notch' | 'cell-dots'
```

The face config panel (which already exists in the codebase) will reference these keys. The registry enables lazy loading of theme modules if bundle size becomes a concern.

### Face config panel integration

The existing face config panel (`src/core/FaceConfigPanel.tsx`) already supports theme selection as a concept. The design demo (section 19) shows a "Theme" dropdown in the config panel. Integration requires:

1. Adding a `theme` field to the face config schema.
2. Populating the dropdown with registered theme keys.
3. Passing the selected theme key through to the face renderer.

### Slot system composition

Each theme renders the same data, but the data comes through the slot binding system. The outline face binds a matrix column to its "title" slot; the table face binds multiple columns to its column slots. Theme rendering is purely visual — it doesn't affect slot bindings.

## Migration plan

The existing `src/global.css` contains ~500 lines of face-specific styles (outline, note list, note face, matrix browser, etc.) using hardcoded colors. Migration strategy:

1. **Build new face components** using design tokens and CSS Modules. These initially live alongside the old code.
2. **Switch one face at a time.** Replace the old class-based styles with the new component. The face renderer in `FaceRenderer.tsx` already dispatches by face type, so switching is localized.
3. **Remove old global styles** for each face after the new component is live and tested.
4. **App shell migration last.** The sidebar, view switcher, and layout shell styles in `global.css` are the final migration target. These touch layout concerns that are orthogonal to face theming.

Expected effort per face: 2-3 sessions for the outline face (given 5 themes), 1-2 sessions for the table face, 1 session for the note face (it's mostly prose with wikilinks).
