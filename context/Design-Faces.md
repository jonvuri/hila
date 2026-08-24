# Design System — Component Variants

This document plans configurable outline and table treatments. These components build on the
shared semantic token system. An outline treatment can serve the shell navigation panel and an
outline face without changing either host's behavior.

## Theme axes

Ghost, Null, and Wipeout are the approved global visual themes. They share one structure and
semantic state contract. The outline and table treatments in this document are component variants
beneath that global theme layer. They can change local rendering, but not app-level theme identity,
interaction meaning, or data contracts. An explicit component variant stays unchanged when the
visual theme changes.

Dark and light polarity is independent of both layers. Composed or substrate fidelity and the
x-ray inspection state are also orthogonal. Do not multiply face renderers across the Cartesian
product of these axes. Face styles must consume semantic tokens supplied by the active visual theme
and polarity.

## Navigation outline variants

The old `Design/Outline` stories define five treatments for the same tree. Session 4m will adapt
their decoration to the forward navigation row. It will also add two new candidates. See the
[Sessions 4j–4m plan](Phase-10-Sessions-4j-4m-plan.md#session-4m--integrate-configurable-navigation-outlines).

### Variant inventory

| Theme                       | Visual metaphor      | Key elements                                                                                                                                                                                   |
| --------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Workflowy clone**     | Traditional outliner | Filled circle bullets, triangle carets, SVG guide lines connecting parent to children                                                                                                          |
| **B — Workflowy geometric** | Geometric outliner   | Dash bullets for leaves, plus-sign for collapsed parents, dashed SVG guide lines                                                                                                               |
| **C — Vector field**        | Directional lines    | Left gutter with angled vector lines pointing from parent to last child; angle determined by row distance (0→0°, 1→35°, 2→50°, 3→58°, 4→63°); own-depth strokes prominent, parent strokes fade |
| **D — Corner notches**      | Structural brackets  | Top-left L-bracket on every row, bottom-right L-bracket on the visually-last row at each depth level; notch color fades with depth                                                             |
| **E — Whitespace only**     | Minimalist           | No bullets or lines; hierarchy conveyed by indentation only; faint carets appear on expandable items                                                                                           |
| **F — Hover guides**        | Context on demand    | Quiet rest state; ancestry rails appear on row hover or keyboard focus; the selected branch remains visible                                                                                    |
| **G — Toggle gutter**       | Disclosure-led       | One stable disclosure column, quiet leaf spacing, and no resting guide line                                                                                                                    |

Themes A–E are reference inputs, not approved shipping names or defaults. Session 4m ends with a
user review that selects the default and the variants that remain available.

### Decoration contract

The host row owns interaction and accessible semantics. It supplies stable row facts to the
decoration adapter:

- Stable global row identity and depth.
- Expanded and collapsed state.
- Ancestry before the virtual window.
- Continuation state and one-row look-ahead after the window.
- Up to 100 forward rows for the vector-field ceiling.

The decoration adapter returns paint data only. It must not add disclosure, editing, selection,
disabled, drill, drag, or focus behavior. Decorative marks are hidden from assistive technology.

### Rendering architecture

The navigation row owns one fixed geometry and exposes decoration slots. A registry maps the
`navigationOutline` key to calculation and paint adapters. Each adapter consumes canonical semantic
tokens from the active visual theme and polarity.

The forward Storybook specimen has separate `visualTheme` and `navigationOutline` controls. Do not
build a Cartesian renderer matrix. Production selection and persistence land with the later live
workspace migration.

The old renderer currently mixes row behavior with decoration. Do not reuse it as the host row.
Adapt its calculations and paint, then preserve its standalone stories as references until the
forward adapters pass.

### Windowing considerations

Guide and corner variants need context outside a rendered window. Vector field can need 100 forward
rows. The production navigation panel currently computes decorations from its loaded row list. Do
not treat the last loaded row as the visual end of a branch. The adapter input must carry explicit
boundary context and support deterministic tests across window seams.

### Implementation phases

Session 4m performs one bounded integration pass: establish the registry and host seam; adapt the
five old variants; add hover guides and toggle gutter; then review the seven candidates. The live
workspace migration later adds production configuration and persistence.

## Table face themes

The design exploration (`design-demo.html` section 6) defines three visual treatments for tabular data.

### Theme inventory

| Theme                          | Visual metaphor       | Key elements                                                                                                           |
| ------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **A — Thin header line**       | Clean minimal         | Uppercase xs-size headers, bold bottom border on header, light borders on rows                                         |
| **B — Corner notch container** | Structural            | CornerNotchBox wrapper around the table, weighted header text, subtle row borders                                      |
| **C — Cell dots**              | Cell-level decoration | Small dots in the top-left corner of each cell; dot color differentiates header (fg) from body (fg-3/fg-4 alternating) |

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

### Variant registry

A component-variant registry maps stable keys to local adapters:

```typescript
type NavigationOutlineVariant =
  | 'workflowy'
  | 'geometric'
  | 'vector'
  | 'notches'
  | 'whitespace'
  | 'hover-guides'
  | 'toggle-gutter'
type TableThemeKey = 'thin-line' | 'corner-notch' | 'cell-dots'
```

Session 4m will settle the final navigation keys after user review. The registry must not contain
Ghost, Null, or Wipeout keys.

### Face config panel integration

The navigation panel and outline face can select an outline variant independently. Integration
requires:

1. Add a `navigationOutline` value to the applicable component configuration.
2. Populate its control with registered variant keys.
3. Pass the selected key to the decoration adapter.
4. Keep this value stable when the visual theme or polarity changes.

### Slot system composition

Each component variant renders the same bound data. The outline face binds a matrix column to its
title slot. The table face binds multiple columns to column slots. Variant rendering is visual and
does not affect slot bindings.

## Migration plan

The existing `src/global.css` contains face-specific styles for the outline, note list, note face,
and matrix browser. The migration order is:

1. Define and implement canonical tokens in Sessions 4j–4k.
2. Close the sticky and navigation-outline design gates in Sessions 4l–4m.
3. Migrate the live shell and stream without behavior changes.
4. Remove the executable overlaid-card implementation after the live cutover passes review.
5. Migrate the launcher and shared overlays before top-level tabs are removed.
6. Switch faces and browsers one at a time. Remove old global styles after each replacement passes.

The detailed order is in the [Sessions 4j–4m plan](Phase-10-Sessions-4j-4m-plan.md#follow-on-migration-order)
and the [Sessions 4n–4o plan](Phase-10-Sessions-4n-4o-plan.md).
