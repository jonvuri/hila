// ---------------------------------------------------------------------------
// StickyNav -- sticky headers as the breadcrumb (session 4b).
//
// A navigation panel whose sticky headers ARE the breadcrumb. Every sticky
// header is unique in the whole view: drill columns render NO gap-ancestor
// rows (those rows are already visible -- in flow or stuck -- in a column to
// the left); the cross-column chain reads through accents instead. Row
// species, top of the scroll area downward:
//
//   1. The pinned workspace-title row (nav column only) -- permanently stuck.
//   2. Stuck ancestor rows -- VS Code sticky-header behavior: a container
//      row sticks below the stack while the viewport is inside its subtree,
//      and is replaced when the subtree scrolls past. No other special
//      behavior.
//   3. The focus-drill row -- exists only when a row was drilled into to
//      spawn the panel to the right. Persistent accent wherever it sits
//      (left bar + throughline off the column's right edge), and it pins to
//      both the top stack and the bottom of the panel so it is always
//      visible.
//
// Rows on the drill path (ancestors of the drill row) carry a lighter
// left-edge accent wherever they sit, so every level of the continuous
// ancestry -- across all columns -- shows some accent.
//
// Implementation: rows render in-flow at a fixed 28px rhythm; an overlay
// stack (VS Code's own approach) renders the pinned + stuck rows from the
// same flat-row data, so "which ancestors are stuck" is pure arithmetic on
// the scroll offset -- no nested sticky wrappers, no measurement.
// ---------------------------------------------------------------------------

import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js'

import { OutlineRow, outlineThemeClass } from '../../outline/Outline'
import { computeDecorations, flattenTree } from '../../outline/data'
import type { LegacyOutlineVariant, OutlineNode } from '../../outline/types'
import './wipeout.css'
import './workspace.css'

const ROW_H = 28
/** Breathing room between the pinned stack and row 0 at rest. */
const FLOW_GAP = 4

type StickyNavProps = {
  /** Pinned workspace-title row (the nav column only). */
  title?: string
  items: OutlineNode[]
  initialCollapsed?: ReadonlySet<string>
  /** The focus-drill row: the row in `items` drilled into for the next panel. */
  drillId?: string
  /** Next panel's title -- fallback text when the drill row is hidden by a
   *  collapsed ancestor (it must stay visible regardless). */
  drillLabel?: string
  outlineTheme: LegacyOutlineVariant
}

const StickyNav = (props: StickyNavProps): JSX.Element => {
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(
    props.initialCollapsed ?? new Set(),
  )
  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const rows = createMemo(() => flattenTree(props.items, collapsed()))
  const decorations = createMemo(() => computeDecorations(props.outlineTheme, rows()))

  // parent index per flat row (-1 = top level), via a depth-indexed walk.
  const parents = createMemo((): number[] => {
    const flat = rows()
    const out: number[] = []
    const byDepth: number[] = []
    for (let i = 0; i < flat.length; i++) {
      const depth = flat[i]!.depth
      out.push(depth > 0 ? (byDepth[depth - 1] ?? -1) : -1)
      byDepth[depth] = i
    }
    return out
  })

  const pinnedCount = () => (props.title != null ? 1 : 0)

  // Ancestors of the drill row (by id), walked from the source tree so the
  // accent survives collapse. These rows carry the lighter continuous-
  // ancestry accent wherever they sit (in flow or stuck).
  const drillAncestors = createMemo((): ReadonlySet<string> => {
    const set = new Set<string>()
    const id = props.drillId
    if (id == null) return set
    const walk = (nodes: readonly OutlineNode[], path: readonly string[]): boolean => {
      for (const node of nodes) {
        if (node.id === id) {
          for (const p of path) set.add(p)
          return true
        }
        if (node.children && walk(node.children, [...path, node.id])) return true
      }
      return false
    }
    walk(props.items, [])
    return set
  })

  const [scrollTop, setScrollTop] = createSignal(0)
  const [viewH, setViewH] = createSignal(Number.POSITIVE_INFINITY)
  let scrollEl: HTMLDivElement | undefined

  onMount(() => {
    if (!scrollEl) return
    setViewH(scrollEl.clientHeight)
    const observer = new ResizeObserver(() => setViewH(scrollEl!.clientHeight))
    observer.observe(scrollEl)
    onCleanup(() => observer.disconnect())
  })

  const layout = createMemo(() => {
    const flat = rows()
    const par = parents()
    const pin = pinnedCount()
    const pad = pin * ROW_H + FLOW_GAP
    const s = scrollTop()

    // The stuck ancestor chain: ancestors of the row on the first line below
    // the *permanent* stack (pinned rows + the drill slot). Anchoring on the
    // permanent stack only keeps the lookup stable -- including the chain's
    // own height in the anchor oscillates at subtree boundaries (a taller
    // stack uncovers a shallower row, which empties the chain, which lowers
    // the stack again).
    const permanent = pin + (props.drillId != null ? 1 : 0)
    const chain: number[] = []
    if (flat.length > 0 && s > 0) {
      const y = s + permanent * ROW_H
      const idx = Math.min(flat.length - 1, Math.max(0, Math.floor((y - pad) / ROW_H)))
      let p = par[idx] ?? -1
      while (p >= 0) {
        chain.unshift(p)
        p = par[p] ?? -1
      }
    }

    // The focus-drill row: pinned to the top stack whenever its natural spot
    // is covered or above it, docked to the bottom when below the viewport.
    const drillIdx = props.drillId != null ? flat.findIndex((r) => r.id === props.drillId) : -1
    const drillInChain = drillIdx >= 0 && chain.includes(drillIdx)
    const stackLen = pin + chain.length
    const drillY = pad + drillIdx * ROW_H
    const drillTop =
      props.drillId != null && !drillInChain && (drillIdx < 0 || drillY < s + stackLen * ROW_H)
    const drillBottom =
      !drillTop && !drillInChain && drillIdx >= 0 && drillY + ROW_H > s + viewH()

    return { chain, drillIdx, drillTop, drillBottom, pad, pin }
  })

  // Clicking a stuck ancestor scrolls it back to rest just below its slot.
  const scrollToRow = (idx: number, slot: number) => {
    scrollEl?.scrollTo({
      top: Math.max(0, layout().pad + idx * ROW_H - slot * ROW_H),
      behavior: 'smooth',
    })
  }

  const isDrill = (idx: number) => rows()[idx]?.id === props.drillId

  const isDrillAncestor = (idx: number) => {
    const row = rows()[idx]
    return row != null && drillAncestors().has(row.id)
  }

  const FlowRow = (p: { idx: number }): JSX.Element => (
    <OutlineRow
      theme={props.outlineTheme}
      row={rows()[p.idx]!}
      decoration={decorations()[p.idx]!}
      onToggle={toggle}
    />
  )

  const DrillCue = (): JSX.Element => <span class="wo-drill-cue" aria-hidden="true" />

  return (
    <div class="wo-sticky-nav" data-testid="stream-nav-column">
      <div
        class="wo-sticky-scroll"
        ref={scrollEl}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div class="wo-sticky-flow" style={{ 'padding-top': `${layout().pad}px` }}>
          <div class={`wo-srows ${outlineThemeClass(props.outlineTheme)}`}>
            <For each={rows()}>
              {(row, i) => (
                <div
                  class="wo-srow"
                  classList={{
                    'wo-srow-drill': row.id === props.drillId,
                    'wo-srow-anc': drillAncestors().has(row.id),
                  }}
                >
                  <FlowRow idx={i()} />
                  <Show when={row.id === props.drillId}>
                    <DrillCue />
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      {/* -- The overlay stack: title + stuck ancestors (+ drill row) -- */}
      <div
        class={`wo-sticky-stack ${outlineThemeClass(props.outlineTheme)} wo-srows wo-srows-bare`}
      >
        <Show when={props.title != null}>
          <div class="wo-srow wo-srow-pin wo-srow-title">
            <span class="wo-srow-title-chip">{props.title}</span>
          </div>
        </Show>
        <For each={layout().chain}>
          {(idx, slot) => (
            <div
              class="wo-srow wo-srow-stuck"
              classList={{ 'wo-srow-drill': isDrill(idx), 'wo-srow-anc': isDrillAncestor(idx) }}
              onClick={() => scrollToRow(idx, layout().pin + slot())}
            >
              <FlowRow idx={idx} />
              <Show when={isDrill(idx)}>
                <DrillCue />
              </Show>
            </div>
          )}
        </For>
        <Show when={layout().drillTop}>
          <div
            class="wo-srow wo-srow-stuck wo-srow-drill"
            onClick={() => {
              const idx = layout().drillIdx
              if (idx >= 0) scrollToRow(idx, layout().pin + layout().chain.length)
            }}
          >
            <Show
              when={layout().drillIdx >= 0}
              fallback={<span class="wo-drill-fallback">{props.drillLabel ?? 'Untitled'}</span>}
            >
              <FlowRow idx={layout().drillIdx} />
            </Show>
            <DrillCue />
          </div>
        </Show>
      </div>

      {/* -- Bottom dock: the drill row when it is below the viewport -- */}
      <Show when={layout().drillBottom}>
        <div
          class={`wo-sticky-dock ${outlineThemeClass(props.outlineTheme)} wo-srows wo-srows-bare`}
        >
          <div
            class="wo-srow wo-srow-stuck wo-srow-drill"
            onClick={() => scrollToRow(layout().drillIdx, layout().pin + layout().chain.length)}
          >
            <FlowRow idx={layout().drillIdx} />
            <DrillCue />
          </div>
        </div>
      </Show>
    </div>
  )
}

export default StickyNav
