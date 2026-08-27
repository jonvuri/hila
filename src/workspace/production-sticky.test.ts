import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createMatrix, insertDataRow } from '../core/matrix'
import { addPortal, resolveDrillInPosition } from '../core/portal'
import { getGlobalKey, positionsOf } from '../core/scroll-index'
import { createTreePosition, reparentRow, type NodeRef } from '../core/tree'
import { createPerfDb, type PerfHarness } from '../perf/index'

import { foldedKey } from './gather-flatten'
import {
  buildPaginatedOutlineQuery,
  buildProductionStickyAncestryQuery,
  buildProductionStickyContinuationQuery,
} from './outline-queries'
import {
  assignProductionRenderKeys,
  calculateProductionStickyDockState,
  calculateProductionStickyWidgetState,
  classifyProductionStickyContextChange,
  classifyProductionStickyWidgetStateChange,
  createProductionStickyContext,
  createProductionStickyDrill,
  getProductionStickyDrillRepresentation,
  productionStickyRowFromQuery,
  type ProductionStickyQueryRow,
  type ProductionStickyRow,
} from './production-sticky'

const bytesToHex = (key: Uint8Array): string =>
  Array.from(key)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

describe('production sticky data contract', () => {
  let h: PerfHarness
  let matrixId: number

  beforeEach(async () => {
    h = await createPerfDb()
    matrixId = createMatrix(h.db, 'Workspace', [{ name: 'label', type: 'TEXT', role: 'label' }])
  })

  afterEach(() => h.close())

  const addRow = (label: string, parent?: NodeRef): NodeRef => {
    const rowId = insertDataRow(h.db, matrixId, { label })
    createTreePosition(h.db, matrixId, rowId, parent ? { parent } : undefined)
    return { matrixId, rowId }
  }

  const pk = (row: NodeRef): string => bytesToHex(getGlobalKey(h.db, row.matrixId, row.rowId)!)

  const query = <TRow>(sql: string): TRow[] => h.rawDb.selectObjects(sql) as unknown as TRow[]

  const stickyAncestry = (
    anchor: NodeRef,
    options: { focusRootHex?: string; collapsedKeyHexes?: string[] } = {},
  ): ProductionStickyRow[] =>
    query<ProductionStickyQueryRow>(
      buildProductionStickyAncestryQuery({
        anchorKeyHex: pk(anchor),
        labelMatrixId: matrixId,
        ...options,
      }),
    ).map((row) => productionStickyRowFromQuery(row))

  test('keeps pk, ck, and rk separate across portals and moves', () => {
    const home = addRow('Home')
    const portalHost = addRow('Portal host')
    addPortal(h.db, portalHost, home)

    const appearances = positionsOf(h.db, home)
    expect(appearances).toHaveLength(2)
    const ck = `${matrixId}:${home.rowId}`
    const rendered = appearances.map((position) => ({
      pk: bytesToHex(position.key),
      ck,
      rk: ck,
    }))
    assignProductionRenderKeys(rendered)

    expect(new Set(rendered.map((row) => row.pk)).size).toBe(2)
    expect(new Set(rendered.map((row) => row.ck))).toEqual(new Set([ck]))
    expect(new Set(rendered.map((row) => row.rk)).size).toBe(2)
    expect(rendered.every((row) => row.rk === `${ck}:${row.pk}`)).toBe(true)

    const moving = addRow('Moving')
    const destination = addRow('Destination')
    const beforePk = pk(moving)
    const before = [{ pk: beforePk, ck: `${matrixId}:${moving.rowId}`, rk: '' }]
    assignProductionRenderKeys(before)
    reparentRow(h.db, {
      matrixId: moving.matrixId,
      rowId: moving.rowId,
      newParent: destination,
    })
    const after = [{ pk: pk(moving), ck: `${matrixId}:${moving.rowId}`, rk: '' }]
    assignProductionRenderKeys(after)

    expect(after[0]!.pk).not.toBe(beforePk)
    expect(after[0]!.ck).toBe(before[0]!.ck)
    expect(after[0]!.rk).toBe(before[0]!.rk)
  })

  test('derives ancestry from the selected portal appearance', () => {
    const home = addRow('Home')
    const child = addRow('Child', home)
    const portalHost = addRow('Portal host')
    addPortal(h.db, portalHost, home)

    const childAppearances = positionsOf(h.db, child).sort(
      (left, right) => left.depth - right.depth,
    )
    expect(childAppearances).toHaveLength(2)
    const ancestryFor = (key: Uint8Array) =>
      query<ProductionStickyQueryRow>(
        buildProductionStickyAncestryQuery({
          anchorKeyHex: bytesToHex(key),
          labelMatrixId: matrixId,
        }),
      )
        .map((row) => productionStickyRowFromQuery(row))
        .map((row) => row.label)

    expect(ancestryFor(childAppearances[0]!.key)).toEqual(['Home'])
    expect(ancestryFor(childAppearances[1]!.key)).toEqual(['Portal host', 'Home'])
  })

  test('reads expanded appearance ancestry and visible subtree boundaries', () => {
    const a = addRow('A')
    const b = addRow('B', a)
    const c = addRow('C', b)
    const e = addRow('E', a)
    const f = addRow('F')

    const rows = stickyAncestry(c)
    expect(rows.map((row) => row.label)).toEqual(['A', 'B'])
    expect(rows.map((row) => row.identity.pk)).toEqual([pk(a), pk(b)])
    expect(rows.map((row) => row.subtreeEnd.pk)).toEqual([pk(f), pk(e)])
    expect(rows.every((row) => row.expanded)).toBe(true)
  })

  test('handles root, collapse, focus scope, and final-subtree ancestry', () => {
    const a = addRow('A')
    const b = addRow('B', a)
    const c = addRow('C', b)
    const e = addRow('E', a)
    const finalRoot = addRow('Final')
    const finalLeaf = addRow('Final leaf', finalRoot)

    expect(stickyAncestry(a)).toEqual([])
    expect(stickyAncestry(e, { collapsedKeyHexes: [pk(b)] }).map((row) => row.label)).toEqual([
      'A',
    ])
    expect(stickyAncestry(c, { focusRootHex: pk(a) }).map((row) => row.label)).toEqual(['B'])

    const final = stickyAncestry(finalLeaf)
    expect(final.map((row) => row.label)).toEqual(['Final'])
    expect(final[0]!.subtreeEnd).toEqual({ pk: null })
    expect(
      createProductionStickyContext({
        firstVisiblePk: pk(finalLeaf),
        ancestry: final,
        retained: [],
      }).ancestry[0]!.continuation,
    ).toBe('scope-end')
  })

  test('uses one look-ahead row and does not treat a page edge as a tree edge', () => {
    const root = addRow('Page root')
    const children = Array.from({ length: 102 }, (_, index) => addRow(`Child ${index}`, root))
    const page = query<{ key: Uint8Array }>(
      buildPaginatedOutlineQuery({ afterKeyHex: pk(root), limit: 100 }),
    )
    expect(page).toHaveLength(100)
    expect(bytesToHex(page[0]!.key)).toBe(pk(children[0]!))
    expect(bytesToHex(page[99]!.key)).toBe(pk(children[99]!))

    const atFirst = stickyAncestry(children[0]!)[0]!
    const atLast = stickyAncestry(children[99]!)[0]!
    expect(atFirst.identity.pk).toBe(pk(root))
    expect(atLast.identity.pk).toBe(pk(root))
    expect(atLast.subtreeEnd).toEqual({ pk: null })

    const continuation = query<ProductionStickyQueryRow>(
      buildProductionStickyContinuationQuery({
        afterKeyHex: pk(children[99]!),
        labelMatrixId: matrixId,
      }),
    ).map((row) => productionStickyRowFromQuery(row))
    expect(continuation).toHaveLength(1)
    expect(continuation[0]!.identity.pk).toBe(pk(children[100]!))
    const context = createProductionStickyContext({
      firstVisiblePk: pk(children[99]!),
      ancestry: [atLast],
      retained: [],
      postWindow: continuation[0],
    })
    expect(context.ancestry[0]!.continuation).toBe('post-window')
  })

  test('keeps folded synthetic positions out of ancestry and resolves drill state', () => {
    const marker = addRow('Marker')
    const targetId = insertDataRow(h.db, matrixId, { label: 'Folded target' })
    const syntheticPk = bytesToHex(foldedKey(getGlobalKey(h.db, matrixId, marker.rowId)!, 3))

    const syntheticRows = query<ProductionStickyQueryRow>(
      buildProductionStickyAncestryQuery({
        anchorKeyHex: syntheticPk,
        labelMatrixId: matrixId,
      }),
    )
    expect(syntheticRows).toEqual([])

    const unresolved = createProductionStickyDrill(
      matrixId,
      targetId,
      'Folded target',
      resolveDrillInPosition(h.db, { matrixId, rowId: targetId }),
    )
    expect(unresolved).toEqual({
      state: 'unresolved',
      ck: `${matrixId}:${targetId}`,
      label: 'Folded target',
      pk: null,
    })

    createTreePosition(h.db, matrixId, targetId)
    const resolvedPosition = resolveDrillInPosition(h.db, { matrixId, rowId: targetId })
    const resolved = createProductionStickyDrill(
      matrixId,
      targetId,
      'Folded target',
      resolvedPosition,
    )
    expect(resolved.state).toBe('resolved')
    expect(resolved.pk).toBe(bytesToHex(resolvedPosition!.key))
    expect(resolved.pk).not.toBe(syntheticPk)
  })

  test('classifies threshold, reverse, collapse, mutation, and drill changes', () => {
    const makeRow = (
      appearancePk: string,
      depth: number,
      options: Partial<ProductionStickyRow> = {},
    ): ProductionStickyRow => ({
      identity: { pk: appearancePk, ck: `1:${appearancePk}`, rk: null },
      matrixId: 1,
      rowId: depth + 1,
      depth,
      visibleIndex: depth,
      label: appearancePk,
      contentKey: appearancePk,
      hasChildren: true,
      expanded: true,
      subtreeEnd: { pk: `${appearancePk}-end` },
      continuation: 'unknown',
      ...options,
    })
    const a = makeRow('a', 0)
    const nested = makeRow('nested', 1)
    const b = makeRow('b', 0)
    const atA = createProductionStickyContext({
      firstVisiblePk: 'leaf-a',
      ancestry: [a, nested],
      retained: [],
    })
    const atB = createProductionStickyContext({
      firstVisiblePk: 'leaf-b',
      ancestry: [b],
      retained: [],
    })

    expect(classifyProductionStickyContextChange(atA, atA)).toBe('none')
    expect(classifyProductionStickyContextChange(atA, atB)).toBe('structure')
    expect(classifyProductionStickyContextChange(atB, atA)).toBe('structure')

    const nextVisibleRow = createProductionStickyContext({
      ...atA,
      firstVisiblePk: 'next-leaf-in-same-window',
    })
    expect(classifyProductionStickyContextChange(atA, nextVisibleRow)).toBe('none')

    const collapsed = createProductionStickyContext({
      firstVisiblePk: 'a',
      ancestry: [{ ...a, expanded: false }],
      retained: [],
    })
    expect(collapsed.ancestry).toEqual([])
    expect(classifyProductionStickyContextChange(atA, collapsed)).toBe('structure')

    const renamed = createProductionStickyContext({
      firstVisiblePk: atA.firstVisiblePk,
      ancestry: [{ ...a, contentKey: 'a:renamed' }, nested],
      retained: [],
    })
    expect(classifyProductionStickyContextChange(atA, renamed)).toBe('content')

    const drillInPrimary = createProductionStickyContext({
      ...atA,
      drill: { state: 'resolved', ck: a.identity.ck, label: 'A', pk: 'a', isHome: true },
    })
    const drillDock = createProductionStickyContext({
      ...atA,
      drill: { state: 'resolved', ck: '1:b', label: 'B', pk: 'b', isHome: true },
    })
    const unresolvedDrill = createProductionStickyContext({
      ...atA,
      drill: { state: 'unresolved', ck: '1:missing', label: 'Missing', pk: null },
    })
    expect(getProductionStickyDrillRepresentation(drillInPrimary)).toBe('primary')
    expect(getProductionStickyDrillRepresentation(drillDock)).toBe('dock')
    expect(getProductionStickyDrillRepresentation(unresolvedDrill)).toBe('unresolved')
  })

  test('keeps unmounted ancestry while attaching rk only to retained sources', () => {
    const ancestorRaw: ProductionStickyQueryRow = {
      pk: 'aa',
      matrix_id: matrixId,
      row_id: 1,
      depth: 0,
      visible_index: 0,
      label: 'Ancestor',
      has_children: 1,
      expanded: 1,
      subtree_end_pk: 'ff',
    }
    const ancestor = productionStickyRowFromQuery(ancestorRaw)
    const unmounted = createProductionStickyContext({
      firstVisiblePk: 'cc',
      ancestry: [ancestor],
      retained: [],
    })
    expect(unmounted.ancestry[0]!.identity.rk).toBeNull()

    const retainedAncestor = {
      ...ancestor,
      identity: { ...ancestor.identity, rk: ancestor.identity.ck },
    }
    const mounted = createProductionStickyContext({
      firstVisiblePk: 'cc',
      ancestry: [ancestor],
      retained: [retainedAncestor],
    })
    expect(mounted.ancestry[0]!.identity.rk).toBe(ancestor.identity.ck)
  })

  test('keeps threshold, resize, reverse-scroll, and drill handoff continuous', () => {
    const stickyRow = (
      appearancePk: string,
      visibleIndex: number,
      subtreeEndPk: string | null,
    ): ProductionStickyRow => ({
      identity: { pk: appearancePk, ck: `1:${appearancePk}`, rk: null },
      matrixId: 1,
      rowId: visibleIndex + 1,
      depth: 0,
      visibleIndex,
      label: appearancePk.toUpperCase(),
      contentKey: appearancePk,
      hasChildren: true,
      expanded: true,
      subtreeEnd: { pk: subtreeEndPk },
      continuation: subtreeEndPk ? 'within-window' : 'scope-end',
    })
    const a = stickyRow('a', 0, 'b')
    const b = stickyRow('b', 4, null)
    const context = createProductionStickyContext({
      firstVisiblePk: 'leaf-a',
      ancestry: [a],
      retained: [a, b],
      drill: { state: 'resolved', ck: a.identity.ck, label: 'A', pk: 'a', isHome: true },
    })
    const geometry = [
      { position: 'a', start: 0, end: 32 },
      { position: 'b', start: 128, end: 160 },
    ]
    const stateAt = (scrollTop: number, rows = geometry) =>
      calculateProductionStickyWidgetState({
        context,
        rows,
        scrollTop,
        viewportHeight: 240,
        titleHeight: 32,
      })

    expect(stateAt(63).nodes[0]!.position).toBe(0)
    expect(stateAt(64).nodes[0]!.position).toBe(0)
    expect(stateAt(65).nodes[0]!.position).toBe(-1)
    expect(stateAt(64).nodes[0]!.position).toBe(0)
    expect(classifyProductionStickyWidgetStateChange(stateAt(64), stateAt(65))).toBe(
      'final-position',
    )

    const resized = geometry.map((row) =>
      row.position === 'b' ? { ...row, start: 144, end: 176 } : row,
    )
    expect(stateAt(81, resized).nodes[0]!.position).toBe(stateAt(65).nodes[0]!.position)

    expect(
      calculateProductionStickyDockState(
        { context, rows: geometry, scrollTop: 64, viewportHeight: 240, titleHeight: 32 },
        stateAt(64),
      )?.location,
    ).toBe('chain')
    expect(
      calculateProductionStickyDockState(
        { context, rows: geometry, scrollTop: 65, viewportHeight: 240, titleHeight: 32 },
        stateAt(65),
      ),
    ).toMatchObject({ location: 'top', position: 32, pk: 'a' })
  })

  test('places resolved and unresolved drill targets without fabricating a position', () => {
    const base = createProductionStickyContext({
      firstVisiblePk: '80',
      ancestry: [],
      retained: [],
      drill: { state: 'resolved', ck: '1:2', label: 'Below', pk: '90', isHome: true },
    })
    const widget = calculateProductionStickyWidgetState({
      context: base,
      rows: [],
      scrollTop: 100,
      viewportHeight: 200,
      titleHeight: 32,
    })
    const retainedTarget = [{ position: '90', start: 140, end: 172 }]
    expect(
      calculateProductionStickyDockState(
        {
          context: base,
          rows: retainedTarget,
          scrollTop: 100,
          viewportHeight: 200,
          titleHeight: 32,
        },
        widget,
      )?.location,
    ).toBe('flow')
    expect(
      calculateProductionStickyDockState(
        {
          context: base,
          rows: retainedTarget,
          scrollTop: 200,
          viewportHeight: 200,
          titleHeight: 32,
        },
        widget,
      )?.location,
    ).toBe('top')
    expect(
      calculateProductionStickyDockState(
        {
          context: base,
          rows: [],
          scrollTop: 100,
          viewportHeight: 200,
          titleHeight: 32,
        },
        widget,
      ),
    ).toMatchObject({ location: 'bottom', position: 168, pk: '90' })

    const unresolved = createProductionStickyContext({
      ...base,
      drill: { state: 'unresolved', ck: '1:2', label: 'Missing', pk: null },
    })
    expect(
      calculateProductionStickyDockState(
        {
          context: unresolved,
          rows: [],
          scrollTop: 100,
          viewportHeight: 200,
          titleHeight: 32,
        },
        widget,
      ),
    ).toMatchObject({ location: 'unresolved', pk: null, ck: '1:2' })
  })
})
