import { createMemo, createSignal, For, JSX, Match, Show, Switch } from 'solid-js'

import { computeDecorations, flattenTree } from './data'
import styles from './Outline.module.css'
import type {
  FlatRow,
  OutlineProps,
  OutlineRowProps,
  OutlineTheme,
  RowDecoration,
} from './types'

export type { OutlineProps, OutlineRowProps }
export type { OutlineNode, OutlineTheme, FlatRow, RowDecoration, VectorSlotData } from './types'
export { computeDecorations } from './data'

/**
 * Returns the combined CSS class string for an outline container.
 * Apply this to the element that wraps `OutlineRow` instances so that
 * theme-scoped CSS rules take effect.
 */
export const outlineThemeClass = (theme: OutlineTheme): string => {
  const map: Record<string, string> = {
    'workflowy-clone': styles.themeWorkflowyClone,
    'workflowy-geometric': styles.themeWorkflowyGeometric,
    'vector-field': styles.themeVectorField,
    'corner-notches': styles.themeCornerNotches,
    'whitespace-only': styles.themeWhitespace,
  }
  return `${styles.outline} ${map[theme] ?? ''}`
}

/* ============================================================
   OutlineRow — primary row component
   ============================================================ */

export const OutlineRow = (props: OutlineRowProps) => {
  const renderContent = (row: FlatRow): JSX.Element =>
    props.renderContent ?
      props.renderContent(row)
    : <span class={styles.text}>{row.content}</span>

  return (
    <Switch>
      <Match when={props.theme === 'workflowy-clone'}>
        <WorkflowyCloneRowInner
          row={props.row}
          decoration={props.decoration}
          onToggle={props.onToggle}
          renderContent={renderContent}
        />
      </Match>
      <Match when={props.theme === 'workflowy-geometric'}>
        <WorkflowyGeometricRowInner
          row={props.row}
          decoration={props.decoration}
          onToggle={props.onToggle}
          renderContent={renderContent}
        />
      </Match>
      <Match when={props.theme === 'vector-field'}>
        <VectorFieldRowInner
          row={props.row}
          decoration={props.decoration}
          onToggle={props.onToggle}
          renderContent={renderContent}
        />
      </Match>
      <Match when={props.theme === 'corner-notches'}>
        <CornerNotchesRowInner
          row={props.row}
          decoration={props.decoration}
          onToggle={props.onToggle}
          renderContent={renderContent}
        />
      </Match>
      <Match when={props.theme === 'whitespace-only'}>
        <WhitespaceRowInner
          row={props.row}
          decoration={props.decoration}
          onToggle={props.onToggle}
          renderContent={renderContent}
        />
      </Match>
    </Switch>
  )
}

/* ============================================================
   Outline — convenience wrapper for non-virtualized use
   ============================================================ */

export const Outline = (props: OutlineProps) => {
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
  const decorations = createMemo(() => computeDecorations(props.theme, rows()))

  return (
    <div class={outlineThemeClass(props.theme)}>
      <For each={rows()}>
        {(row, i) => (
          <OutlineRow
            theme={props.theme}
            row={row}
            decoration={decorations()[i()]!}
            onToggle={toggle}
            renderContent={props.renderContent}
          />
        )}
      </For>
    </div>
  )
}

/* ============================================================
   Internal row renderers
   ============================================================ */

type InternalRowProps = {
  row: FlatRow
  decoration: RowDecoration
  onToggle?: (id: string) => void
  renderContent: (row: FlatRow) => JSX.Element
}

// Derive the CSS guide class from the `continues` boolean + column position.
// The 4 segment types are an internal rendering detail, not part of the public API.

type GuideSegment = 'pass-through' | 'pass-through-end' | 'connector' | 'connector-last'

const guideSegment = (continues: boolean, isConnector: boolean): GuideSegment => {
  if (isConnector) return continues ? 'connector' : 'connector-last'
  return continues ? 'pass-through' : 'pass-through-end'
}

const GUIDE_CLASS: Record<string, string> = {
  'pass-through': styles.guidePassThrough,
  'pass-through-end': styles.guidePassThroughEnd,
  connector: styles.guideConnector,
  'connector-last': styles.guideConnectorLast,
}

const Guides = (props: { continues: boolean[]; depth: number }) => (
  <For each={props.continues}>
    {(cont, d) => <div class={GUIDE_CLASS[guideSegment(cont, d() === props.depth - 1)]} />}
  </For>
)

/* ---- Workflowy Clone ---- */

const WorkflowyCloneRowInner = (props: InternalRowProps) => (
  <div class={styles.row}>
    <Guides continues={props.decoration.continues} depth={props.row.depth} />
    <Show when={props.row.hasChildren} fallback={<div class={styles.caretSpacer} />}>
      <button class={styles.caret} onClick={() => props.onToggle?.(props.row.id)}>
        {props.row.expanded ? '▾' : '▸'}
      </button>
    </Show>
    <div class={styles.bulletDot} />
    <div class={styles.content}>{props.renderContent(props.row)}</div>
  </div>
)

/* ---- Workflowy Geometric ---- */

const WorkflowyGeometricRowInner = (props: InternalRowProps) => (
  <div class={styles.row}>
    <Guides continues={props.decoration.continues} depth={props.row.depth} />
    <Show
      when={props.row.hasChildren && !props.row.expanded}
      fallback={
        <button
          class={`${styles.bulletDash} ${props.row.hasChildren ? styles.bulletDashParent : ''}`}
          onClick={props.row.hasChildren ? () => props.onToggle?.(props.row.id) : undefined}
        />
      }
    >
      <button class={styles.plusMark} onClick={() => props.onToggle?.(props.row.id)} />
    </Show>
    <div class={styles.content}>{props.renderContent(props.row)}</div>
  </div>
)

/* ---- Vector Field ---- */

const VectorFieldRowInner = (props: InternalRowProps) => (
  <div class={styles.row}>
    <div
      class={`${styles.vectorGutter} ${props.row.hasChildren ? styles.vectorGutterClickable : ''}`}
      onClick={() => {
        if (props.row.hasChildren) props.onToggle?.(props.row.id)
      }}
    >
      <For each={props.decoration.vectorSlots ?? []}>
        {(slot) => (
          <div class={styles.vectorSlot}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <line
                x1={slot.short ? 4 : 2}
                y1="7"
                x2={slot.short ? 10 : 12}
                y2="7"
                transform={slot.short ? undefined : `rotate(${slot.angle}, 7, 7)`}
                style={{
                  stroke: 'var(--c-fg-2)',
                  'stroke-width': `${slot.strokeWidth}`,
                  'stroke-linecap': 'round',
                  opacity: `${slot.opacity}`,
                }}
              />
            </svg>
          </div>
        )}
      </For>
    </div>
    <div class={styles.content}>{props.renderContent(props.row)}</div>
  </div>
)

/* ---- Corner Notches ---- */

const NOTCH_COLORS = ['var(--c-fg-2)', 'var(--c-fg-3)', 'var(--c-fg-4)'] as const
const notchColor = (depth: number): string => NOTCH_COLORS[Math.min(depth, 2)]!

const CornerNotchesRowInner = (props: InternalRowProps) => {
  const color = () => notchColor(props.row.depth)
  return (
    <div class={styles.row}>
      <svg
        class={styles.notchTL}
        width="7"
        height="7"
        style={{ left: `${props.row.depth * 20}px` }}
      >
        <line x1="0" y1="7" x2="0" y2="0" style={{ stroke: color(), 'stroke-width': '1' }} />
        <line x1="0" y1="0" x2="7" y2="0" style={{ stroke: color(), 'stroke-width': '1' }} />
      </svg>
      <Show when={props.decoration.isVisualLast}>
        <svg class={styles.notchBR} width="7" height="7">
          <line x1="7" y1="0" x2="7" y2="7" style={{ stroke: color(), 'stroke-width': '1' }} />
          <line x1="7" y1="7" x2="0" y2="7" style={{ stroke: color(), 'stroke-width': '1' }} />
        </svg>
      </Show>
      <div class={styles.indent} style={{ width: `${props.row.depth * 20}px` }} />
      <Show when={props.row.hasChildren} fallback={<div class={styles.caretSpacer} />}>
        <button class={styles.caret} onClick={() => props.onToggle?.(props.row.id)}>
          {props.row.expanded ? '▾' : '▸'}
        </button>
      </Show>
      <div class={styles.content}>{props.renderContent(props.row)}</div>
    </div>
  )
}

/* ---- Whitespace Only ---- */

const WhitespaceRowInner = (props: InternalRowProps) => (
  <div class={styles.row}>
    <div class={styles.indent} style={{ width: `${props.row.depth * 20}px` }} />
    <Show when={props.row.hasChildren} fallback={<div class={styles.caretFaintSpacer} />}>
      <button class={styles.caretFaint} onClick={() => props.onToggle?.(props.row.id)}>
        {props.row.expanded ? '▾' : '▸'}
      </button>
    </Show>
    <div class={styles.content}>{props.renderContent(props.row)}</div>
  </div>
)
