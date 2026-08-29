# Phase 10 — Session 1: Inventory and Audit

Companion document for [Phase-10.md §1](Phase-10.md#1-inventory-and-audit). Raw survey of every view/surface and the current styling reality, gathered before any stage-2/3/4 decisions are made. Line numbers are approximate (the files churn); treat them as pointers, not guarantees.

> **Historical inventory.** Session 4q removed the executable `src/design/overlaid-cards/`
> implementation. References to that path below describe the pre-migration state. Git history and
> the archived Phase 10 HTML files preserve the implementation evidence.

---

## A. View/surface catalog

### Top-level (app shell)

| Surface                            | Files                                             | What it is                                                                                                                                                                    | Hosted by                                                          |
| ---------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **App shell**                      | [`src/App.tsx`](../../../src/App.tsx) (310 lines) | Root component. Renders the view-switcher tab bar, the active top-level view, the dev-tools sidebar, and overlay modals (Face Config Panel, Tag Property Panel via `Portal`). | Entry point (`src/index.tsx`).                                     |
| **View switcher / app shell tabs** | `App.tsx:~140-175`                                | Horizontal tab bar: Workspace / Table / Tags, plus a "View as…" button that opens Face Config. Backed by an `activeView` signal (`'workspace' \| 'table' \| 'tags'`).         | Always visible in the app shell once a workspace matrix is loaded. |
| **Dev tools sidebar**              | `App.tsx:~242-293`                                | Right-side drawer (Matrix Browser + SQL Runner in tabs), toggled by Cmd/Ctrl+\\.                                                                                              | App shell, conditionally rendered.                                 |
| **Loading/fallback states**        | `App.tsx`, `StreamView.tsx`, various              | Generic "Loading…" text in `Suspense`/`Show` fallbacks.                                                                                                                       | Wherever async data is awaited.                                    |

### Workspace (primary experience)

| Surface                          | Files                                                                                                                                                                       | What it is                                                                                                                                                                                                                                                                                                                   | Hosted by                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Stream view (overlaid cards)** | [`src/workspace/StreamView.tsx`](../../../src/workspace/StreamView.tsx) (406 lines), historical `src/design/overlaid-cards/OverlaidCards.tsx` (removed in Session 4q)       | State container + presentational layout for the left-to-right stack of navigation/focus "cards" (up to 4 visible, ancestor breadcrumbs as faded edge tabs). The workspace plugin's one face.                                                                                                                                 | "Workspace" tab in the view switcher.                                               |
| **Navigation panel**             | [`src/workspace/NavigationPanel.tsx`](../../../src/workspace/NavigationPanel.tsx) (1642 lines), [`src/design/outline/Outline.tsx`](../../../src/design/outline/Outline.tsx) | Leftmost card: the outline tree, rich-text label editing (ProseMirror), drag-to-reorder, row gestures, inline tag/reference badges.                                                                                                                                                                                          | Root card of `StreamView`.                                                          |
| **Focus panel**                  | [`src/workspace/FocusPanel.tsx`](../../../src/workspace/FocusPanel.tsx) (896 lines)                                                                                         | Right-hand card(s): editable title, content editor, property/aspect surface, children outline, backlinks, query/view blocks, sub-table embeds. Active panel header is an editable title; inactive ones collapse to a button.                                                                                                 | Opened from a navigation-panel row or an inline reference; stacked by `StreamView`. |
| **Substrate region**             | [`src/workspace/SubstrateRegion.tsx`](../../../src/workspace/SubstrateRegion.tsx) (285 lines)                                                                               | The unified schema-adaptive renderer (per [Phase-9.7 §9.5](Phase-9.7.md)) for aspect/tag/grid rows inline under a focus-panel row — the "substrate" rendering convention this phase's token model must eventually support (see the incoming deferral in Phase-10.md §4). Not experimental; landed through Phase 9.7 Stage C. | Embedded in `FocusPanel`.                                                           |
| **Row gestures menu**            | [`src/workspace/row-gestures.tsx`](../../../src/workspace/row-gestures.tsx)                                                                                                 | Hover chevron / context menu for row ops (open focus, reparent, duplicate, delete); also provides `OwnerAffix`/`CoalescedHeader` shared between the loose outline and the substrate renderer.                                                                                                                                | Inline in each outline row (`NavigationPanel`, `SubstrateRegion`).                  |
| **Query band**                   | [`src/workspace/QueryBand.tsx`](../../../src/workspace/QueryBand.tsx)                                                                                                       | Persisted live-SQL view block anchored to a row; renders result rows as property rows, editable when the query is a recognized single-base-table view.                                                                                                                                                                       | Embedded in `FocusPanel`.                                                           |
| **Sub-table band**               | [`src/workspace/SubTableBand.tsx`](../../../src/workspace/SubTableBand.tsx)                                                                                                 | Embedded matrix-as-table inside a focus panel (child-matrix reference), with boundary-hop drill-in into the card stack.                                                                                                                                                                                                      | Embedded in `FocusPanel`.                                                           |

### Other top-level views

| Surface                | Files                                                                                                                                           | What it is                                                                                                                                                                            | Hosted by                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Table face**         | [`src/table/TableFace.tsx`](../../../src/table/TableFace.tsx) (1431 lines), [`src/design/table/Table.tsx`](../../../src/design/table/Table.tsx) | Spreadsheet view of a matrix: filter/sort, column type config, editable cells, formula columns (`FormulaInput.tsx`). Also the registered `hila.table` identity face for every matrix. | "Table" tab (top-level) and as a face on any matrix (e.g. via Face Config, or embedded as `SubTableBand`). |
| **Tag browser**        | [`src/tags/TagBrowserFace.tsx`](../../../src/tags/TagBrowserFace.tsx) (506 lines)                                                               | Lists all tag types with instance counts; drills into a type's instances; create/rename/delete tag types.                                                                             | "Tags" tab.                                                                                                |
| **Tag property panel** | [`src/tags/TagPropertyPanel.tsx`](../../../src/tags/TagPropertyPanel.tsx) (153 lines)                                                           | Floating popover anchored to an inline `#tag` badge, showing the aspect row's editable fields. Position computed dynamically to avoid viewport edges.                                 | Opened from any inline tag badge (outline or note editor); rendered via `Portal` at the app-shell level.   |

### Dev/admin surfaces

| Surface               | Files                                                                               | What it is                                                                                                      | Hosted by                                                           |
| --------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Matrix Browser**    | [`src/admin/MatrixBrowser.tsx`](../../../src/admin/MatrixBrowser.tsx) (836 lines)   | Lists all matrixes; create test data; inspect schema/columns/joins/traits/rows/face configs; reset DB.          | Dev-tools sidebar tab.                                              |
| **SQL Runner**        | [`src/SqlRunner.tsx`](../../../src/SqlRunner.tsx) (35 lines)                        | Bare textarea + run button + result/error `pre`. No styling beyond browser defaults / inherited sidebar chrome. | Dev-tools sidebar tab.                                              |
| **Face Config Panel** | [`src/core/FaceConfigPanel.tsx`](../../../src/core/FaceConfigPanel.tsx) (253 lines) | Modal: choose a face type for a matrix, bind columns to slots, see overflow columns, Apply/Cancel.              | "View as…" button in the view switcher; renders as a fixed overlay. |

### Face/plugin composition infrastructure (not a surface itself, but governs how the above compose)

- `src/core/face-registry.ts` — face type registry (id, name, slots, overflow behavior).
- `src/core/FaceRenderer.tsx` — resolves a `FaceConfig` to a registered component and renders it.
- `src/core/slot-binding.ts` — column → slot resolution chain (explicit → name match → type+position → fallback).
- Known registered face types: `hila.table` (core infra, registered before any plugin), `hila.tag-browser` (tags plugin). The workspace's stream view is **not** wired through this registry — it's hardcoded into `App.tsx`/`StreamView.tsx` rather than composed as a face. This asymmetry is directly relevant to Phase-10 §2/§3 (view hierarchy, plugin composition model).

### Design-system component library (building blocks, not surfaces)

`src/design/*.tsx` + matching `.module.css`: `Button`, `TextInput`, `ContextMenu`, `Badge`, `Grid`, `Divider`, `SectionHeading`, `InvertedHeading`, `TabBar`, `CornerNotchBox`, plus the presentational `outline/Outline`, `table/Table`, and `overlaid-cards/OverlaidCards`. All import `src/design/tokens.css` values; these are the only fully token-compliant part of the codebase (see below).

### Gaps noted (relevant to Phase-10 §2)

No dedicated search, settings, home/landing, or agent/op-management surface exists yet. Workspace, Table, and Tags are peers switched by tab, not nested under a common root view.

---

## B. Styling reality catalog

### The token system (canonical, `src/design/`)

- `src/design/tokens.css` (~69 lines): universal spacing (`--sp-1`…`--sp-64`), typography (`--text-xs`…`--text-3xl`), font stacks (`--font-sans`, `--font-mono`); theme-scoped color tokens under `[data-theme='dark']` / `[data-theme='light']` (`--c-bg`, `--c-surface`, `--c-elevated`, `--c-fg` / `-2` / `-3` / `-4`, `--c-border` / `-2`, `--c-hover`, `--c-active`, `--c-invert-bg`/`-fg`, `--c-accent` / `-2` / `-3` / `-border`).
- All 12 `src/design/*.module.css` files (Button, TextInput, ContextMenu, Badge, Grid, Divider, SectionHeading, InvertedHeading, TabBar, CornerNotchBox, `outline/Outline`, `table/Table`) are effectively 100% token-based — no hardcoded colors found.

### The removed overlaid-cards exploration (historical `src/design/overlaid-cards/`)

Defines its own `--card-*` custom-property set: `--card-void`, `--card-focused-bg/border`, `--card-ancestor-bg`, `--card-ancestor-left-step` (4px), `--card-ancestor-top-step` (2px), `--card-focus-col-width` (320px), `--card-focus-top-step` (4px), `--card-border-width` (0.5px), `--card-tab-height` (18px), `--card-border-dark-l`/`-light-l` (HSL lightness for a border gradient), `--card-outer-pad` (6px). These are a **parallel, self-contained token system** for depth/layering (faded borders, staircase offsets) that doesn't reuse `tokens.css` and includes several non-powers-of-two values (18px, 320px, 0.5px, 6px, 12px). This is the intentional Phase-7b exploration Phase-10 §4 must reconcile with the canonical language.

Session 4q removed this executable renderer, its stories, its fixtures, and all `--card-*` styles.

### The legacy monolith (`src/global.css`, ~1860 lines)

Styles nearly everything outside `src/design/`: app shell, sidebar, view switcher, navigation/focus panel chrome, inline references, Face Config Panel, Matrix Browser, Tag Browser, Tag Property Panel. Zero use of `tokens.css` custom properties.

- Defines its own root-level custom properties that shadow/duplicate the token system rather than importing it: `--card-void: hsl(230, 20%, 7%)` (duplicated from overlaid-cards), `--text-primary: #d8d8e4`, `--text-dim: #8888a0`, `--text-muted: #5a5a70`, `--accent: #7c8cf8` (a _different_ blue-violet from the canonical `--c-accent`).
- Interactive/active states across the sidebar, view switcher, Matrix Browser, and Face Config Panel use hardcoded `#2563eb` (blue) instead of the canonical violet accent (`--c-accent: #8b5cf6` dark / `#7c3aed` light) — roughly 8+ distinct call sites.
- The Note list/face, Matrix Browser, and Tag Browser sections are styled as a **light-mode palette** (`#222`, `#888`, `#666`, `#e0e0e0`, `#f5f5f5`, `#fff`) hardcoded regardless of `[data-theme]`, while the app shell/workspace sections use a **dark-mode palette** (`hsl(230, *, *)` values) — i.e. the file mixes two unrelated color regimes with no theme-switching mechanism.
- Non-monochrome hues appear throughout: reds for destructive actions (`#dc2626`, `#fee`, `#fef2f2`), greens for sample-data actions (`#f0fdf4`, `#166534`), blues distinct from the accent (`#2563eb`, `#1d4ed8`), and inline-reference badges use blue/purple hues (`#93aeed`, `#a78bfa`) not tied to `--c-accent`.
- Border-radius appears repeatedly (sidebar close/toggle buttons, tag-type badges at `border-radius: 12px`, Face Config controls) — a direct violation of the canonical "no border-radius anywhere" rule.

### Table/formula surfaces (`src/table/`)

`TableFace.module.css` and `FormulaInput.module.css` implement a **third, independent palette** — indigo/blue tones (`#3730a3`, `#4338ca`, `#6366f1`, `#c7d2fe`, `#eef2ff`, `#dbeafe`, `#1d4ed8`) plus light grays — with no relation to `tokens.css`'s violet accent or dark theme, and their own border-radius usage (4px–10px). `TableFace.tsx` also has ~8 hardcoded-color inline `style={{}}` usages.

### Workspace panel components (`src/workspace/`)

`NavigationPanel.tsx`, `FocusPanel.tsx`, `QueryBand.tsx`, `SubTableBand.tsx`, `row-gestures.tsx` mix `global.css` classes with inline `style={{}}` literals: hardcoded blue drag indicators (`#2563eb`), error text (`#f87171`), and dark-toned dividers (`hsl(230, 15%, 18%)` / `22%`) repeated ad hoc rather than drawn from a shared elevation/border token. `shared/PropertyRow.tsx` at least falls back through `var(--c-fg-3, #888)`, i.e. it _attempts_ token use with a hardcoded fallback.

### Rough compliance picture

| Area                                                   | Token usage                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `src/design/*` component library                       | ~100%                                                          |
| Historical `src/design/overlaid-cards/`                | Removed in Session 4q; it was 0% against canonical tokens      |
| `src/global.css` (app shell, panels, browsers, tag UI) | ~0%                                                            |
| `src/table/` (TableFace, FormulaInput)                 | ~0%, third palette                                             |
| `src/workspace/*.tsx` inline styles                    | ~0-10%, scattered `var(--c-fg-3, …)` fallback is the exception |

---

## C. Conflicts with the stated design language

Per [Design.md](../../Design.md): sharp geometry (no border-radius), monochrome + single violet accent, inverted-block headings, corner-notch containers, powers-of-two spacing.

1. **Border-radius** appears in `global.css` (sidebar buttons, tag-type badge `12px`), `TableFace.module.css`/`FormulaInput.module.css` (4-10px), and assorted workspace inline styles (3px, 4px, 6px, 50%) — all violate "no border-radius anywhere."
2. **Accent color is not single/violet in practice.** Three unrelated "accent-ish" blues/violets coexist: canonical `--c-accent` (`#8b5cf6`/`#7c3aed`), `global.css`'s own `--accent: #7c8cf8`, and the ubiquitous `#2563eb` used for active/interactive states across the sidebar, view switcher, Matrix Browser, and Face Config Panel.
3. **Non-monochrome hues** (red for destructive, green for "sample data", indigo/blue in the table+formula surfaces) exist outside the accent, with no semantic token backing them (e.g. no `--c-danger`/`--c-success` in `tokens.css` today).
4. **Two irreconciled depth languages.** Canonical Design.md is flat/sharp; overlaid-cards is layered/faded (border gradients, staircase offsets, translucent tab layers). Neither references the other's tokens. This is the crux of the "incoming deferral" in Phase-10.md §4 (composed vs. substrate fidelity, x-ray toggle) — the elevation/surface model doesn't exist yet for either language to converge on.
5. **Spacing scale is not honored outside `src/design/`.** `overlaid-cards` uses 18px/320px/6px/0.5px; `global.css` and workspace inline styles use arbitrary px values (18px, 24px, 28px, etc.) instead of the `--sp-1/2/4/8/16/32/64` scale.
6. **Light-mode vs dark-mode split by file section, not by theme attribute.** `global.css` hardcodes a dark palette for the app shell/workspace and a light palette for Matrix Browser/Tag Browser/Note faces — there is no `[data-theme]` scoping in the legacy file at all, so switching themes today would not affect roughly two-thirds of the app's surfaces.

---

## D. Implications for later Phase-10 stages (not decisions — flagged for §2-4)

- The workspace stream view bypasses the face registry entirely; §2/§3 need to decide whether it should become a registered face (consistent with table/tag-browser) or remain a special-cased root view, and what that implies for "is the workspace the root of everything."
- The substrate renderer (`SubstrateRegion`) is the existing seed of the composed/substrate fidelity axis flagged in Phase-10.md's incoming deferral — §4's token model should be checked against it directly, not just in the abstract.
- Three independent color systems (`tokens.css`, `global.css`'s shadow tokens, `overlaid-cards`'s `--card-*`) and one un-tokenized palette (`table/`) need to converge into one; §4's "reconcile the two visual directions" is really at least three-to-four-way in practice.
- No danger/success semantic tokens exist yet despite red/green already appearing in the UI (Matrix Browser reset/sample actions, form errors) — likely a small but necessary addition to the token set in §4.
