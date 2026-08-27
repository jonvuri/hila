import type { ResolvedPosition } from '../core/portal'

export const PRODUCTION_STICKY_MAX_ANCESTORS = 7

export type ProductionAppearanceIdentity = {
  /** Ordered appearance identity. */
  pk: string
  /** Logical row identity, `(matrix_id, row_id)`. */
  ck: string
  /** Mounted source renderer identity. Null means that no source row is retained. */
  rk: string | null
}

export type ProductionStickyBoundary = {
  /** First visible appearance after the subtree. Null means the scope ends. */
  pk: string | null
}

export type ProductionStickyContinuation =
  | 'unknown'
  | 'within-window'
  | 'post-window'
  | 'beyond-window'
  | 'scope-end'

export type ProductionStickyRow = {
  identity: ProductionAppearanceIdentity
  matrixId: number
  rowId: number
  depth: number
  visibleIndex: number
  label: string | null
  contentKey: string
  hasChildren: boolean
  expanded: boolean
  subtreeEnd: ProductionStickyBoundary
  /** How the visible subtree relates to the retained window. */
  continuation: ProductionStickyContinuation
}

export type ProductionStickyDrill =
  | {
      state: 'resolved'
      ck: string
      label: string | null
      pk: string
      isHome: boolean
    }
  | {
      state: 'unresolved'
      ck: string
      label: string | null
      pk: null
    }

export type ProductionStickyContext = {
  firstVisiblePk: string | null
  /** Expanded appearance ancestors, ordered from shallow to deep. */
  ancestry: readonly ProductionStickyRow[]
  /** Metadata for the normal retained window. This does not hydrate row data. */
  retained: readonly ProductionStickyRow[]
  /** One look-ahead row. Null means the retained window reaches the scope end. */
  postWindow: ProductionStickyRow | null
  drill: ProductionStickyDrill | null
}

export type ProductionStickyQueryRow = {
  pk: string
  matrix_id: number
  row_id: number
  depth: number
  visible_index: number
  label: string | null
  has_children: number
  expanded: number
  subtree_end_pk: string | null
}

const compositeKey = (matrixId: number, rowId: number): string => `${matrixId}:${rowId}`

/**
 * Assign source renderer keys without changing appearance or logical identity.
 * A single loaded appearance stays move-stable. Duplicate loaded appearances
 * use their position only to disambiguate renderer ownership.
 */
export const assignProductionRenderKeys = <TRow extends { pk: string; ck: string; rk: string }>(
  rows: TRow[],
): void => {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.ck, (counts.get(row.ck) ?? 0) + 1)
  for (const row of rows) {
    row.rk = counts.get(row.ck)! > 1 ? `${row.ck}:${row.pk}` : row.ck
  }
}

export const productionStickyRowFromQuery = (
  row: ProductionStickyQueryRow,
  rendererKey: string | null = null,
): ProductionStickyRow => {
  const ck = compositeKey(row.matrix_id, row.row_id)
  const pk = row.pk.toLowerCase()
  const expanded = row.expanded === 1
  return {
    identity: { pk, ck, rk: rendererKey },
    matrixId: row.matrix_id,
    rowId: row.row_id,
    depth: row.depth,
    visibleIndex: row.visible_index,
    label: row.label,
    contentKey: `${ck}:${row.label ?? ''}:${expanded ? 'open' : 'closed'}`,
    hasChildren: row.has_children === 1,
    expanded,
    subtreeEnd: {
      pk: row.subtree_end_pk?.toLowerCase() ?? null,
    },
    continuation: 'unknown',
  }
}

export const createProductionStickyDrill = (
  matrixId: number,
  rowId: number,
  label: string | null,
  resolved: ResolvedPosition | null,
): ProductionStickyDrill => {
  const ck = compositeKey(matrixId, rowId)
  if (!resolved) return { state: 'unresolved', ck, label, pk: null }
  const pk = Array.from(resolved.key)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return { state: 'resolved', ck, label, pk, isHome: resolved.isHome }
}

export const createProductionStickyContext = (input: {
  firstVisiblePk: string | null
  ancestry: readonly ProductionStickyRow[]
  retained: readonly ProductionStickyRow[]
  postWindow?: ProductionStickyRow | null
  drill?: ProductionStickyDrill | null
}): ProductionStickyContext => {
  const rendererKeys = new Map(
    input.retained.map((row) => [row.identity.pk, row.identity.rk] as const),
  )
  const retainedPks = new Set(input.retained.map((row) => row.identity.pk))
  const postWindowPk = input.postWindow?.identity.pk ?? null
  const ancestry: ProductionStickyRow[] = input.ancestry
    .filter((row) => row.expanded && row.hasChildren)
    .slice(-PRODUCTION_STICKY_MAX_ANCESTORS)
    .map((row) => ({
      ...row,
      identity: {
        ...row.identity,
        rk: rendererKeys.get(row.identity.pk) ?? row.identity.rk,
      },
      continuation:
        row.subtreeEnd.pk == null ?
          postWindowPk?.startsWith(row.identity.pk) ?
            'post-window'
          : 'scope-end'
        : retainedPks.has(row.subtreeEnd.pk) ? 'within-window'
        : row.subtreeEnd.pk === postWindowPk ? 'post-window'
        : 'beyond-window',
    }))

  return {
    firstVisiblePk: input.firstVisiblePk?.toLowerCase() ?? null,
    ancestry,
    retained: input.retained,
    postWindow: input.postWindow ?? null,
    drill: input.drill ?? null,
  }
}

export type ProductionStickyContextChange = 'none' | 'content' | 'structure'

export type ProductionStickyDrillRepresentation = 'none' | 'primary' | 'dock' | 'unresolved'

/** Tell the widget whether the primary chain already represents the drill target. */
export const getProductionStickyDrillRepresentation = (
  context: ProductionStickyContext,
): ProductionStickyDrillRepresentation => {
  if (!context.drill) return 'none'
  if (context.drill.state === 'unresolved') return 'unresolved'
  return context.ancestry.some((row) => row.identity.pk === context.drill!.pk) ?
      'primary'
    : 'dock'
}

/** Compare the stable data plane before geometry and push-off are applied. */
export const classifyProductionStickyContextChange = (
  previous: ProductionStickyContext,
  next: ProductionStickyContext,
): ProductionStickyContextChange => {
  if (
    previous.ancestry.length !== next.ancestry.length ||
    previous.ancestry.some((row, index) => {
      const other = next.ancestry[index]!
      return (
        row.identity.pk !== other.identity.pk ||
        row.subtreeEnd.pk !== other.subtreeEnd.pk ||
        row.depth !== other.depth
      )
    }) ||
    previous.drill?.state !== next.drill?.state ||
    previous.drill?.ck !== next.drill?.ck ||
    previous.drill?.pk !== next.drill?.pk
  ) {
    return 'structure'
  }

  if (
    previous.ancestry.some(
      (row, index) => row.contentKey !== next.ancestry[index]!.contentKey,
    ) ||
    previous.drill?.label !== next.drill?.label
  ) {
    return 'content'
  }
  return 'none'
}

export const PRODUCTION_STICKY_ROW_HEIGHT = 32
export const PRODUCTION_STICKY_FLOW_GAP = 4
export const PRODUCTION_STICKY_MAX_VIEWPORT_RATIO = 0.4

export type ProductionStickyGeometryRow = {
  position: string | number
  start: number
  end: number
}

export type ProductionStickyWidgetNode = {
  row: ProductionStickyRow
  stackIndex: number
  position: number
  sourceRowVisible: boolean
  contentKey: string
}

export type ProductionStickyWidgetState = {
  nodes: readonly ProductionStickyWidgetNode[]
  widgetHeight: number
}

export const EMPTY_PRODUCTION_STICKY_WIDGET_STATE: ProductionStickyWidgetState = {
  nodes: [],
  widgetHeight: 0,
}

export type ProductionStickyWidgetInput = {
  context: ProductionStickyContext
  rows: readonly ProductionStickyGeometryRow[]
  scrollTop: number
  viewportHeight: number
  titleHeight: number
}

const getProductionStickyMaximumNodeCount = (viewportHeight: number): number =>
  Math.min(
    PRODUCTION_STICKY_MAX_ANCESTORS,
    Math.max(
      1,
      Math.floor(
        (viewportHeight * PRODUCTION_STICKY_MAX_VIEWPORT_RATIO) / PRODUCTION_STICKY_ROW_HEIGHT,
      ),
    ),
  )

/** Calculate the primary stack from bounded metadata and numeric geometry. */
export const calculateProductionStickyWidgetState = (
  input: ProductionStickyWidgetInput,
): ProductionStickyWidgetState => {
  const geometryByPk = new Map(input.rows.map((row) => [`${row.position}`, row] as const))
  const anchor = input.context.retained.find(
    (row) => row.identity.pk === input.context.firstVisiblePk,
  )
  const chain = [...input.context.ancestry]
  const anchorGeometry = anchor ? geometryByPk.get(anchor.identity.pk) : undefined
  const anchorAtSlot =
    anchorGeometry != null &&
    anchorGeometry.start - input.scrollTop <=
      input.titleHeight + chain.length * PRODUCTION_STICKY_ROW_HEIGHT
  if (anchor?.expanded && anchor.hasChildren && anchorAtSlot) chain.push(anchor)

  const uniqueChain = chain.filter(
    (row, index) =>
      chain.findIndex((candidate) => candidate.identity.pk === row.identity.pk) === index,
  )
  const boundedChain = uniqueChain.slice(
    0,
    getProductionStickyMaximumNodeCount(input.viewportHeight),
  )

  const nodes = boundedChain
    .map((row, stackIndex): ProductionStickyWidgetNode => {
      const source = geometryByPk.get(row.identity.pk)
      const boundary = row.subtreeEnd.pk ? geometryByPk.get(row.subtreeEnd.pk) : undefined
      const canonicalPosition = stackIndex * PRODUCTION_STICKY_ROW_HEIGHT
      const position =
        boundary ?
          Math.min(
            canonicalPosition,
            boundary.start - input.scrollTop - input.titleHeight - PRODUCTION_STICKY_ROW_HEIGHT,
          )
        : canonicalPosition
      const naturalStart = source ? source.start - input.scrollTop : Number.NEGATIVE_INFINITY
      const stickyStart = input.titleHeight + position
      const sourceRowVisible =
        source != null &&
        naturalStart + PRODUCTION_STICKY_ROW_HEIGHT > 0 &&
        naturalStart < input.viewportHeight &&
        (naturalStart + PRODUCTION_STICKY_ROW_HEIGHT <= stickyStart ||
          naturalStart >= stickyStart + PRODUCTION_STICKY_ROW_HEIGHT)
      return {
        row,
        stackIndex,
        position,
        sourceRowVisible,
        contentKey: [
          row.contentKey,
          row.continuation,
          input.context.drill?.ck === row.identity.ck,
        ].join(':'),
      }
    })
    .filter((node) => node.position > -PRODUCTION_STICKY_ROW_HEIGHT)

  return {
    nodes,
    widgetHeight: Math.max(
      0,
      ...nodes.map((node) => node.position + PRODUCTION_STICKY_ROW_HEIGHT),
    ),
  }
}

export type ProductionStickyWidgetStateChange =
  | 'none'
  | 'final-position'
  | 'content'
  | 'structure'

export const classifyProductionStickyWidgetStateChange = (
  previous: ProductionStickyWidgetState,
  next: ProductionStickyWidgetState,
): ProductionStickyWidgetStateChange => {
  if (
    previous.nodes.length !== next.nodes.length ||
    previous.nodes.some((node, index) => {
      const other = next.nodes[index]!
      return (
        node.row.identity.pk !== other.row.identity.pk ||
        node.stackIndex !== other.stackIndex ||
        node.row.subtreeEnd.pk !== other.row.subtreeEnd.pk
      )
    })
  ) {
    return 'structure'
  }
  if (previous.nodes.some((node, index) => node.contentKey !== next.nodes[index]!.contentKey)) {
    return 'content'
  }
  const changed = previous.nodes.flatMap((node, index) => {
    const other = next.nodes[index]!
    return (
        node.position !== other.position || node.sourceRowVisible !== other.sourceRowVisible
      ) ?
        [index]
      : []
  })
  if (changed.length === 0 && previous.widgetHeight === next.widgetHeight) return 'none'
  return changed.every((index) => index === next.nodes.length - 1) ? 'final-position' : (
      'structure'
    )
}

export type ProductionStickyDockState = {
  location: 'chain' | 'flow' | 'top' | 'bottom' | 'unresolved'
  position: number
  pk: string | null
  ck: string
  label: string | null
}

export const calculateProductionStickyDockState = (
  input: ProductionStickyWidgetInput,
  widget: ProductionStickyWidgetState,
): ProductionStickyDockState | null => {
  const drill = input.context.drill
  if (!drill) return null
  const primary =
    drill.state === 'resolved' ?
      widget.nodes.find((node) => node.row.identity.pk === drill.pk)
    : undefined
  if (primary && primary.position === primary.stackIndex * PRODUCTION_STICKY_ROW_HEIGHT) {
    return {
      location: 'chain',
      position: primary.position,
      pk: drill.state === 'resolved' ? drill.pk : null,
      ck: drill.ck,
      label: drill.label,
    }
  }

  const top =
    primary ?
      input.titleHeight + primary.stackIndex * PRODUCTION_STICKY_ROW_HEIGHT
    : input.titleHeight + widget.widgetHeight
  if (drill.state === 'unresolved') {
    return { location: 'unresolved', position: top, pk: null, ck: drill.ck, label: drill.label }
  }
  const source = input.rows.find((row) => `${row.position}` === drill.pk)
  if (!source) {
    const below =
      input.context.firstVisiblePk != null && drill.pk > input.context.firstVisiblePk
    return {
      location: below ? 'bottom' : 'top',
      position:
        below ? Math.max(top, input.viewportHeight - PRODUCTION_STICKY_ROW_HEIGHT) : top,
      pk: drill.pk,
      ck: drill.ck,
      label: drill.label,
    }
  }

  const naturalPosition = source.start - input.scrollTop
  const bottom = Math.max(top, input.viewportHeight - PRODUCTION_STICKY_ROW_HEIGHT)
  const location =
    naturalPosition < top ? 'top'
    : naturalPosition > bottom ? 'bottom'
    : 'flow'
  return {
    location,
    position:
      location === 'top' ? top
      : location === 'bottom' ? bottom
      : naturalPosition,
    pk: drill.pk,
    ck: drill.ck,
    label: drill.label,
  }
}
