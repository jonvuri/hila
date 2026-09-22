import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  createMatrix,
  createOwnedMatrix,
  initMatrixSchema,
  insertDataRow,
  insertRow,
} from './matrix'
import { addPortal, homeKeyOf } from './portal'
import {
  hydratePlaceNavigation,
  resolvePlaceNavigation,
  resolvePlaceNavigationAnchor,
} from './place-navigation'
import { positionsOf } from './scroll-index'

describe('place navigation resolution', () => {
  let db: Database
  let workspaceId: number

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    workspaceId = createMatrix(db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
  })

  test('uses valid provenance and otherwise falls back to the ownership home', () => {
    const homeParent = insertRow(db, workspaceId).rowId
    const portalParent = insertRow(db, workspaceId).rowId
    const node = {
      matrixId: workspaceId,
      rowId: insertRow(db, workspaceId, {
        parent: { matrixId: workspaceId, rowId: homeParent },
      }).rowId,
    }
    addPortal(db, { matrixId: workspaceId, rowId: portalParent }, node)
    const homeKey = homeKeyOf(db, node)!
    const portalKey = positionsOf(db, node).find(
      ({ key }) => !key.every((b, i) => b === homeKey[i]),
    )!

    expect(resolvePlaceNavigation(db, workspaceId, node, { key: portalKey.key })).toMatchObject(
      {
        type: 'position',
        source: 'provenance',
        appearance: { key: portalKey.key },
      },
    )
    const anchor = resolvePlaceNavigationAnchor(db, workspaceId, node, { key: portalKey.key })
    expect(anchor).toMatchObject({
      type: 'position',
      source: 'provenance',
      appearance: { key: portalKey.key },
    })
    expect(hydratePlaceNavigation(db, anchor!)).toEqual(
      resolvePlaceNavigation(db, workspaceId, node, { key: portalKey.key }),
    )
    expect(
      resolvePlaceNavigation(db, workspaceId, node, { key: Uint8Array.of(255, 0) }),
    ).toMatchObject({
      type: 'position',
      source: 'home',
      appearance: { key: homeKey },
    })
  })

  test('reports portal-only rows as membership without selecting a portal', () => {
    const node = { matrixId: workspaceId, rowId: insertDataRow(db, workspaceId) }
    const hostA = { matrixId: workspaceId, rowId: insertRow(db, workspaceId).rowId }
    const hostB = { matrixId: workspaceId, rowId: insertRow(db, workspaceId).rowId }
    addPortal(db, hostA, node)
    addPortal(db, hostB, node)

    const resolution = resolvePlaceNavigation(db, workspaceId, node)
    expect(resolution).toMatchObject({
      type: 'membership',
      node,
      containers: [],
    })
    expect(resolution?.alternativeAppearances).toHaveLength(2)
  })

  test('uses an owned matrix subject as a deterministic membership fallback', () => {
    const owner = { matrixId: workspaceId, rowId: insertRow(db, workspaceId).rowId }
    const ownedMatrixId = createOwnedMatrix(db, owner, 'Tasks', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    const member = { matrixId: ownedMatrixId, rowId: insertDataRow(db, ownedMatrixId) }

    expect(resolvePlaceNavigation(db, workspaceId, member)).toMatchObject({
      type: 'membership',
      matrixId: ownedMatrixId,
      containers: [{ node: owner, key: homeKeyOf(db, owner) }],
      alternativeAppearances: [],
    })
  })

  test('does not invent a product root for an unowned non-workspace matrix', () => {
    const matrixId = createMatrix(db, 'System data')
    const node = { matrixId, rowId: insertDataRow(db, matrixId) }
    expect(resolvePlaceNavigation(db, workspaceId, node)).toBeNull()
  })
})
