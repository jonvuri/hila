# Design System — Component Variants

> **Implementation status.** The navigation-outline registry and Guides production treatment ship.
> Table treatments and the remaining face migrations are design inputs, not shipped runtime
> variants. Future sequencing belongs in [Plan.md](Plan.md).

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

## Navigation outline

Session 4m reviewed seven treatments and approved Guides as the only forward navigation outline.
The old `Design/Outline` stories preserve the five original renderers as historical references.
The rejected forward adapters are not part of the registry.

### Approved treatment

| Variant    | Visual metaphor      | Key elements                                                                                                                     |
| ---------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Guides** | Traditional outliner | Dim ancestry rails, optional leaf bullets, compact disclosure controls, and one text axis for each depth in flow and sticky rows |

Each guide aligns with the left edge of its parent heading text. A terminal guide ends at the
bottom edge of its last child's text. The disclosure control uses the space immediately left of
the row's text axis and does not change text position. A collapsed parent shows `+`. An expanded
parent shows a dim `−` only on row hover or keyboard focus.

Leaf bullets are optional and off by default. The row reserves the same bullet gutter when bullets
are visible or hidden. Toggling bullets must not move text, guides, or disclosure controls.

Sticky headings keep normal depth indentation and guides. They use the canvas background only to
cover moving flow content. They have no surface, border, selection bar, or hover-fill chrome.

### Decoration contract

The host row owns interaction and accessible semantics. It supplies stable row facts to the
decoration adapter:

- Stable global row identity and depth.
- Expanded and collapsed state.
- Ancestry before the virtual window.
- Continuation state and one-row look-ahead after the window.

The decoration adapter returns paint data only. It must not add disclosure, editing, selection,
disabled, drill, drag, or focus behavior. Decorative marks are hidden from assistive technology.

### Rendering architecture

The navigation row owns one fixed geometry and exposes decoration slots. A registry maps the
`navigationOutline` key to calculation and paint adapters. Each adapter consumes canonical semantic
tokens from the active visual theme and polarity.

The forward Storybook specimen has visual-theme and polarity controls. It does not expose a
single-option outline control. Production uses the approved Guides adapter through the independent
`navigationOutline` setting. The old renderer remains historical reference material.

### Windowing contract

Guides need explicit context outside a rendered window. Do not treat the last loaded row as the
visual end of a branch. The adapter input carries ancestry before the window, continuation after
the window, and one-row look-ahead. Deterministic tests compare full and windowed results.

### Implementation phases

Session 4m established the registry and host seam, reviewed seven candidates, and approved Guides.
Session 4n rebuilt sticky navigation as a bounded widget integrated with its scroll component.
Session 4o adapted that widget and Guides renderer to paged production data. Sessions 4p–4q moved
it into the live shell and removed the retired renderer.

## Table face treatments

The design exploration (`design-demo.html` section 6) defines three visual treatments for tabular
data.

### Variant inventory

| Variant                        | Visual metaphor       | Key elements                                                                                                           |
| ------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **A — Thin header line**       | Clean minimal         | Uppercase xs-size headers, bold bottom border on header, light borders on rows                                         |
| **B — Corner notch container** | Structural            | CornerNotchBox wrapper around the table, weighted header text, subtle row borders                                      |
| **C — Cell dots**              | Cell-level decoration | Small dots in the top-left corner of each cell; dot color differentiates header (fg) from body (fg-3/fg-4 alternating) |

### Data contract

Each table row is independently renderable given its props, enabling windowed rendering via the virtualizer. The data contract mirrors the outline's `FlatRow` / `RowDecoration` pattern:

- `columns: Column[]` where `Column = { key: string; label: string }` — column definitions, stable across windows
- `rows: FlatTableRow[]` where `FlatTableRow = { id: string; cells: Record<string, string> }` — row data keyed by column key, with `id` for stable keying across virtualizer window boundaries
- `computeTableDecorations(variant, columns, rows, startIndex?)` returns a `RowDecoration[]` with per-cell decoration data. The `startIndex` parameter supports windowed rendering — row index parity (for cell-dot color alternation) must reflect the row's global position, not its position within the window.
- `TableRowProps` bundles everything needed to render a single row in isolation: `variant`, `columns`, `row`, `decoration`, and an optional `renderCell` callback.

The variant renderer receives a flat array of these rows and renders them with the selected visual
treatment. The header row (`TableHeaderRow`) is separate and always visible. It is not virtualized.

### CSS architecture

All variants share one CSS module (`Table.module.css`) with a base `.table` class and
variant-scoped descendant rules. The current class names are `.themeThinLine`,
`.themeCornerNotch`, and `.themeCellDots`. Session 4k does not rename this component-local API.
Treatment B reuses the `CornerNotchBox` primitive as a wrapper.

### Implementation phases

**Phase 1: All three variants.** The table treatments have no SVG or cross-row dependencies, so
all three are implemented together. Treatment A establishes the base. Treatment B composes with
`CornerNotchBox`. Treatment C adds per-cell dot decorations.

## Shared infrastructure

### Variant registry

A component-variant registry maps stable configuration keys to local adapters:

```typescript
type NavigationOutlineVariant = 'guides'

type TableTreatmentVariant = 'thin-line' | 'corner-notch' | 'cell-dots'

type ComponentVariantValues = {
  navigationOutline: NavigationOutlineVariant
  tableTreatment: TableTreatmentVariant
}

type ComponentVariantConfig = Partial<ComponentVariantValues>

type ComponentVariantDefinition<Value extends string> = {
  values: readonly Value[]
  defaultValue: Value
}

type ComponentVariantRegistry = {
  [Key in keyof ComponentVariantValues]: ComponentVariantDefinition<ComponentVariantValues[Key]>
}
```

The registry owns validation and fallback. An explicit valid value wins. A missing or unknown value
uses that key's `defaultValue`. An unknown persisted value must not enter CSS or select another
axis. `guides` is the reviewed shipping default.

The registry must not contain Ghost, Null, Wipeout, dark, light, composed, substrate, or x-ray
values. A visual-theme, polarity, or fidelity change must not mutate an explicit component value.
The rendering host can expose a resolved value with a component-specific data attribute, such as
`data-navigation-outline`, after TypeScript validates it.

### Host integration

The navigation panel and outline face use the registered outline treatment independently of visual
theme and polarity. Integration requires:

1. Add a `navigationOutline` value to the applicable component configuration.
2. Resolve the registered value before it reaches CSS.
3. Pass the resolved key to the decoration adapter.
4. Do not show a configuration control while the registry has one value.

### Slot system composition

Each component variant renders the same bound data. The outline face binds a matrix column to its
title slot. The table face binds multiple columns to column slots. Variant rendering is visual and
does not affect slot bindings.

## Migration record

The existing `src/global.css` still contains face-specific and system-surface styles. Phase 10
completed steps 1–6. The remaining work is re-homed by the phase-boundary reconciliation.

1. Define and implement canonical tokens in Sessions 4j–4k.
2. Close the sticky and navigation-outline design gates in Sessions 4l–4m.
3. Rebuild sticky navigation as an integrated, VS Code-inspired widget in Session 4n.
4. Adapt the widget to paged production data and the production virtualizer in Session 4o.
5. Migrate the live shell and stream without behavior changes.
6. Session 4q removed the executable overlaid-card implementation after the live cutover passed
   review.
7. Migrate the launcher and shared overlays before top-level tabs are removed.
8. Switch faces and browsers one at a time. Remove old global styles after each replacement passes.

The detailed order is in the [Sessions 4j–4m plan](./archive/phases/Phase-10-Sessions-4j-4m-plan.md#follow-on-migration-order),
the [Session 4n plan](./archive/phases/Phase-10-Session-4n-plan.md), and the
[Session 4o plan](./archive/phases/Phase-10-Session-4o-plan.md). Live migration and removal are in the
[Sessions 4p–4q plan](./archive/phases/Phase-10-Sessions-4p-4q-plan.md).
