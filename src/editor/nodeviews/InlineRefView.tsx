import { useNodeViewContext } from '@prosemirror-adapter/solid'
import { createEffect, createMemo, createSignal, For, Show, type Component } from 'solid-js'

import { useQuery } from '../../sql/useQuery'
import { getColumns } from '../../core/client/matrix-client'
import type { ColumnDefinition } from '../../core/matrix'
import { buildAspectPreviewFields } from '../../shared/property-surface'
import { tagColorFromName, tagBadgeBackground } from '../../tags/tag-color'
import { setHoveredAspect, clearHoveredAspect, isAspectHovered } from '../aspect-tether'
import { extractTextFromPmDoc } from '../pm-text'

import styles from './InlineRefView.module.css'

export type InlineReferenceState = 'live' | 'ghost' | 'empty' | 'loading'

export const InlineReferenceBadge: Component<{
  kind: 'ref' | 'own'
  state: InlineReferenceState
  title: string
  keyProps?: readonly { label: string; value: string }[]
  tethered?: boolean
  color?: string
  backgroundColor?: string
  targetMatrixId?: number
  targetRowId?: number
  onActivate?: (element: HTMLElement) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}> = (props) => {
  const interactive = () => props.state === 'live' || props.state === 'empty'
  const className = () =>
    [
      'inlineref',
      styles.root,
      props.kind === 'own' ? styles.own : styles.ref,
      props.state === 'ghost' ? styles.ghost : '',
      props.state === 'empty' ? styles.empty : '',
      props.tethered ? styles.tethered : '',
    ]
      .filter(Boolean)
      .join(' ')
  const accessibleName = () => {
    if (props.state === 'ghost') return `Deleted reference: ${props.title}`
    if (props.state === 'empty') return `Create reference: ${props.title}`
    if (props.state === 'loading') return `Loading reference: ${props.title}`
    return props.kind === 'own' ? `Open properties for ${props.title}` : `Open ${props.title}`
  }

  const activate = (element: HTMLElement) => {
    if (interactive()) props.onActivate?.(element)
  }

  return (
    <span
      class={className()}
      data-testid="inline-reference"
      data-kind={props.kind}
      data-state={props.state}
      data-tethered={props.tethered ? 'true' : undefined}
      data-target-matrix-id={props.targetMatrixId}
      data-target-row-id={props.targetRowId}
      role="button"
      tabindex={interactive() ? 0 : undefined}
      aria-label={accessibleName()}
      aria-disabled={!interactive() ? 'true' : undefined}
      aria-busy={props.state === 'loading' ? 'true' : undefined}
      style={{ color: props.color, 'background-color': props.backgroundColor }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        activate(event.currentTarget)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        activate(event.currentTarget)
      }}
      onMouseEnter={() => props.onMouseEnter?.()}
      onMouseLeave={() => props.onMouseLeave?.()}
    >
      {props.title}
      <Show when={props.kind === 'own' && props.state === 'live' && props.keyProps?.length}>
        <span class={styles.keyProps}>
          <For each={props.keyProps}>
            {(property) => (
              <span class={styles.keyProp} title={property.label}>
                {property.value}
              </span>
            )}
          </For>
        </span>
      </Show>
    </span>
  )
}

export const InlineRefView: Component = () => {
  const context = useNodeViewContext()
  const targetMatrixId = createMemo(() => context().node.attrs.targetMatrixId as number | null)
  const targetRowId = createMemo(() => context().node.attrs.targetRowId as number | null)
  const kind = createMemo(() => (context().node.attrs.kind as string) ?? 'ref')
  const cachedTitle = createMemo(() => context().node.attrs.cachedTitle as string | null)

  const isEmpty = createMemo(() => targetMatrixId() == null || targetRowId() == null)
  const isOwn = createMemo(() => kind() === 'own')

  const [refLabelColumn, setRefLabelColumn] = createSignal<string | null>(null)
  createEffect(() => {
    const matrixId = targetMatrixId()
    if (matrixId == null || isOwn()) {
      setRefLabelColumn(null)
      return
    }
    void getColumns(matrixId).then((columns) => {
      const label =
        columns.find((column) => column.role === 'label') ??
        columns.find((column) => ['label', 'title', 'name'].includes(column.name.toLowerCase()))
      setRefLabelColumn(label?.name ?? null)
    })
  })

  // Resolve target row existence and title (live vs ghost detection).
  // Uses `SELECT id` as a universal existence check since tag matrixes
  // may not have a `title` column. The title for ref-kind refs is
  // resolved separately below.
  const rowExistsQueryStr = createMemo(() => {
    if (isEmpty()) return ''
    return `SELECT id FROM "mx_${targetMatrixId()}_data" WHERE id = ${targetRowId()}`
  })
  const { result: rowExistsResult } = useQuery(() => rowExistsQueryStr())

  // Resolve title for ref-kind refs (own-kind uses tag type name instead)
  const refTitleQueryStr = createMemo(() => {
    const labelColumn = refLabelColumn()
    if (isEmpty() || isOwn() || !labelColumn) return ''
    const quotedLabel = `"${labelColumn.replaceAll('"', '""')}"`
    return `SELECT ${quotedLabel} AS stored_name FROM "mx_${targetMatrixId()}_data" WHERE id = ${targetRowId()}`
  })
  const { result: refTitleResult } = useQuery(() => refTitleQueryStr())

  // Resolve tag type metadata for own-kind refs. The matrix title is kept in
  // sync with the type-node's label, so we can use it directly.
  const tagTypeQueryStr = createMemo(() => {
    const mid = targetMatrixId()
    if (!isOwn() || mid == null) return ''
    return `SELECT m.title AS name
            FROM matrix m
            JOIN promoted_nodes p ON p.matrix_id = m.owner_matrix_id AND p.row_id = m.owner_row_id
            WHERE m.id = ${mid}
            LIMIT 1`
  })
  const { result: tagTypeResult } = useQuery(() => tagTypeQueryStr())

  // Query all aspect row data for key property display
  const aspectRowQueryStr = createMemo(() => {
    const mid = targetMatrixId()
    const rid = targetRowId()
    if (!isOwn() || mid == null || rid == null) return ''
    return `SELECT * FROM "mx_${mid}_data" WHERE id = ${rid}`
  })
  const { result: aspectRowResult } = useQuery(() => aspectRowQueryStr())

  const [aspectColumns, setAspectColumns] = createSignal<ColumnDefinition[]>([])

  createEffect(() => {
    const mid = targetMatrixId()
    if (!isOwn() || mid == null) {
      setAspectColumns([])
      return
    }
    void getColumns(mid).then(setAspectColumns)
  })

  const keyProps = createMemo((): { label: string; value: string }[] => {
    const data = aspectRowResult()
    if (!data || data.length === 0) return []
    const row = data[0] as Record<string, unknown>
    return buildAspectPreviewFields(aspectColumns(), row).map((field) => ({
      label: field.name,
      value: field.value,
    }))
  })

  const tagTypeMeta = createMemo(() => {
    const data = tagTypeResult()
    if (!data || data.length === 0) return null
    const row = data[0] as { name: string }
    return { name: row.name }
  })

  const resolvedTitle = createMemo(() => {
    const data = refTitleResult()
    if (!data || data.length === 0) return null
    const stored = (data[0] as { stored_name: string | null }).stored_name ?? ''
    return extractTextFromPmDoc(stored) || stored
  })

  const isLive = createMemo(
    () => !isEmpty() && rowExistsResult() !== null && rowExistsResult()!.length > 0,
  )
  const isGhost = createMemo(
    () => !isEmpty() && rowExistsResult() !== null && rowExistsResult()!.length === 0,
  )

  const displayTitle = createMemo(() => {
    if (isOwn()) {
      const meta = tagTypeMeta()
      const name = meta?.name ?? cachedTitle()
      if (isLive()) return `#${name ?? 'Untitled'}`
      if (isGhost()) return `#${name ?? cachedTitle() ?? '(deleted)'}`
      if (isEmpty()) return `#${cachedTitle() ?? '(empty)'}`
      return '#…'
    }
    if (isLive()) return resolvedTitle() || 'Untitled'
    if (isGhost()) return cachedTitle() ?? '(deleted)'
    if (isEmpty()) return cachedTitle() ?? '(empty)'
    return '…'
  })

  const state = createMemo<InlineReferenceState>(() => {
    if (isEmpty()) return 'empty'
    if (isGhost()) return 'ghost'
    if (isLive()) return 'live'
    return 'loading'
  })

  // Aspect tether: own-kind badges bridge to their row in the focus-panel aspect
  // band (Phase 9.2). Hovering either side highlights the other.
  const tetherTarget = createMemo(() => {
    const mid = targetMatrixId()
    const rid = targetRowId()
    return isOwn() && mid != null && rid != null ? { matrixId: mid, rowId: rid } : null
  })
  const isTethered = createMemo(() => {
    const t = tetherTarget()
    return t != null && isAspectHovered(t.matrixId, t.rowId)
  })
  const badgeStyle = createMemo(() => {
    if (!isOwn() || !isLive()) return undefined
    // Color from the live tag name (falling back to the cached title) so a
    // renamed tag recolors consistently with the tag browser.
    const textColor = tagColorFromName(tagTypeMeta()?.name ?? cachedTitle() ?? 'tag')
    const bgColor = tagBadgeBackground(textColor)
    return { color: textColor, 'background-color': bgColor }
  })

  const handleActivation = (element: HTMLElement) => {
    if (isEmpty()) {
      const pos = context().getPos()
      const event = new CustomEvent('inlineref-create', {
        detail: { cachedTitle: cachedTitle(), pos },
        bubbles: true,
      })
      element.dispatchEvent(event)
      return
    }

    if (isGhost()) return
    if (!isLive()) return

    if (isOwn()) {
      const rect = element.getBoundingClientRect()
      const meta = tagTypeMeta()
      const event = new CustomEvent('inlineref-open-tag-panel', {
        detail: {
          matrixId: targetMatrixId(),
          rowId: targetRowId(),
          tagTypeName: meta?.name ?? cachedTitle() ?? 'tag',
          anchorRect: {
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          },
        },
        bubbles: true,
      })
      element.dispatchEvent(event)
      return
    }

    const event = new CustomEvent('inlineref-navigate', {
      detail: { matrixId: targetMatrixId(), rowId: targetRowId() },
      bubbles: true,
    })
    element.dispatchEvent(event)
  }

  return (
    <InlineReferenceBadge
      kind={isOwn() ? 'own' : 'ref'}
      state={state()}
      title={displayTitle()}
      keyProps={keyProps()}
      tethered={isTethered()}
      color={badgeStyle()?.color}
      backgroundColor={badgeStyle()?.['background-color']}
      targetMatrixId={targetMatrixId() ?? undefined}
      targetRowId={targetRowId() ?? undefined}
      onActivate={handleActivation}
      onMouseEnter={() => {
        const target = tetherTarget()
        if (target) setHoveredAspect(target)
      }}
      onMouseLeave={() => {
        const target = tetherTarget()
        if (target) clearHoveredAspect(target)
      }}
    />
  )
}
