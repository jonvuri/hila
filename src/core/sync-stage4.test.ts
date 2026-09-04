import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  buildPaginatedOutlineQuery,
  buildProductionStickyAncestryQuery,
} from '../workspace/outline-queries'

import { rebuildClosure } from './closure'
import { getReplicatedTableDefinitions } from './durability-policy'
import { getFaceConfig, saveFaceConfig } from './face-config'
import {
  createDependentRow,
  createMatrix,
  createOwnedMatrix,
  createRefJoin,
  demoteNode,
  getOrCreateDeviceId,
  initMatrixSchema,
  insertRow,
  promoteNode,
  resetDeviceIdCache,
  updateRow,
} from './matrix'
import { addPortal, removePortal } from './portal'
import { rebuildScrollIndex, positionsOf } from './scroll-index'
import { applyRemoteChanges, getLocalChanges, installCoreTableTriggers } from './sync'
import type { Changeset } from './sync-types'

type Node = { matrixId: number; rowId: number }

type FixtureIds = {
  workspaceMatrixId: number
  project: Node
  child: Node
  reference: Node
  typeNode: Node
  ownedMatrixId: number
  marker: Node
  faceConfigId: string
}

type ReplicaFixture = {
  a: Database
  b: Database
  ids: FixtureIds
  initialChanges: Changeset
}

const DERIVED_TABLES = new Set(['closure', 'scroll_index', 'formula_column_deps'])

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const normalizeValue = (value: unknown): unknown => {
  if (value instanceof Uint8Array) return bytesToHex(value)
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        normalizeValue(child),
      ]),
    )
  }
  return value
}

const logicalSnapshot = (db: Database): Record<string, Record<string, unknown>> => {
  const definitions = getReplicatedTableDefinitions().map((definition) => ({
    tableName: definition.tableName,
    identity: definition.identity,
    columns: definition.columns.map((column) => column.name),
  }))
  const matrixIds = db.selectObjects('SELECT id FROM matrix') as unknown as { id: number }[]
  for (const { id } of matrixIds) {
    const tableName = `mx_${id}_data`
    const columns = db.selectObjects(
      `PRAGMA table_info(${quoteIdent(tableName)})`,
    ) as unknown as {
      name: string
    }[]
    definitions.push({ tableName, identity: ['id'], columns: columns.map(({ name }) => name) })
  }

  return Object.fromEntries(
    definitions
      .toSorted((left, right) => left.tableName.localeCompare(right.tableName))
      .map(({ tableName, identity, columns }) => {
        const rows = db.selectObjects(
          `SELECT ${columns.map(quoteIdent).join(', ')} FROM ${quoteIdent(tableName)}`,
        ) as unknown as Record<string, unknown>[]
        const byIdentity = Object.fromEntries(
          rows
            .map((row) => {
              const normalized = normalizeValue(row) as Record<string, unknown>
              const key = JSON.stringify(identity.map((column) => normalized[column]))
              return [key, normalized] as const
            })
            .toSorted(([left], [right]) => left.localeCompare(right)),
        )
        return [tableName, byIdentity]
      }),
  )
}

const derivedSnapshot = (db: Database): Record<string, unknown> => ({
  closure: db.selectObjects(
    `SELECT ancestor_matrix_id, ancestor_row_id, descendant_matrix_id,
            descendant_row_id, depth
     FROM closure
     ORDER BY ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id`,
  ),
  positions: db.selectObjects(
    `SELECT lower(hex(global_lexkey)) AS key, matrix_id, row_id, depth, is_ghost, lazy
     FROM scroll_index ORDER BY global_lexkey`,
  ),
})

const renderedSnapshot = (db: Database, ids: FixtureIds): Record<string, unknown> => {
  const projectAppearances = positionsOf(db, ids.child).toSorted(
    (left, right) => left.depth - right.depth,
  )
  const portalAppearance = projectAppearances.at(-1)!
  return {
    outline: normalizeValue(db.selectObjects(buildPaginatedOutlineQuery())),
    portalAncestry: db.selectObjects(
      buildProductionStickyAncestryQuery({
        anchorKeyHex: bytesToHex(portalAppearance.key),
        labelMatrixId: ids.workspaceMatrixId,
      }),
    ),
  }
}

const pmDoc = (...content: unknown[]): string =>
  JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content }] })

const inlineRef = (target: Node, kind: 'ref' | 'own', cachedTitle: string): unknown => ({
  type: 'inlineref',
  attrs: {
    targetMatrixId: target.matrixId,
    targetRowId: target.rowId,
    kind,
    cachedTitle,
  },
})

const createSourceFixture = (db: Database): FixtureIds => {
  db.exec(
    `INSERT INTO plugins (id, name, version, metadata)
     VALUES ('plugin.stage4', 'Stage 4 fixture', '1.0.0', '{}')`,
  )

  const workspaceMatrixId = createMatrix(db, 'Workspace', [
    { name: 'label', type: 'TEXT', role: 'label' },
    { name: 'content', type: 'TEXT', role: 'content' },
  ])
  const projectRow = insertRow(db, workspaceMatrixId, {
    values: { label: 'Project', content: pmDoc({ type: 'text', text: 'Workspace content' }) },
  })
  const project = { matrixId: workspaceMatrixId, rowId: projectRow.rowId }
  const childRow = insertRow(db, workspaceMatrixId, {
    values: { label: 'Child', content: pmDoc({ type: 'text', text: 'Child content' }) },
    parent: project,
  })
  const child = { matrixId: workspaceMatrixId, rowId: childRow.rowId }
  const referenceRow = insertRow(db, workspaceMatrixId, {
    values: { label: 'Reference', content: pmDoc({ type: 'text', text: 'Target' }) },
  })
  const reference = { matrixId: workspaceMatrixId, rowId: referenceRow.rowId }

  addPortal(db, reference, project)

  const typeRow = insertRow(db, workspaceMatrixId, {
    values: { label: 'Task', content: pmDoc({ type: 'text', text: 'Promoted type' }) },
  })
  const typeNode = { matrixId: workspaceMatrixId, rowId: typeRow.rowId }
  promoteNode(db, typeNode)
  const ownedMatrixId = createOwnedMatrix(db, typeNode, 'Task', [
    { name: 'label', type: 'TEXT', role: 'label' },
    { name: 'status', type: 'TEXT' },
  ])
  const taskRowId = createDependentRow(db, child.matrixId, child.rowId, ownedMatrixId, {
    label: 'Ship sync',
    status: 'open',
  })
  const task = { matrixId: ownedMatrixId, rowId: taskRowId }

  const relatedMatrixId = createMatrix(db, 'Related', [
    { name: 'label', type: 'TEXT', role: 'label' },
  ])
  insertRow(db, relatedMatrixId, {
    values: { label: 'Cross-matrix child' },
    parent: project,
  })
  createRefJoin(db, child.matrixId, child.rowId, reference.matrixId, reference.rowId)
  updateRow(db, {
    matrixId: child.matrixId,
    rowId: child.rowId,
    values: {
      content: pmDoc(
        { type: 'text', text: 'Tagged and linked ' },
        inlineRef(task, 'own', 'Ship sync'),
        inlineRef(reference, 'ref', 'Reference'),
      ),
    },
  })

  const columns = db.selectObjects('SELECT id, name FROM matrix_columns WHERE matrix_id = ?', [
    ownedMatrixId,
  ]) as unknown as { id: number; name: string }[]
  const labelColumnId = columns.find(({ name }) => name === 'label')!.id
  const statusColumnId = columns.find(({ name }) => name === 'status')!.id
  const faceConfigId = 'face-stage4'
  saveFaceConfig(db, {
    id: faceConfigId,
    faceTypeId: 'hila.table',
    matrixId: ownedMatrixId,
    slotBindings: { title: labelColumnId, status: statusColumnId },
    settings: { density: 'compact' },
    createdByPlugin: 'plugin.stage4',
    sort: { columnId: labelColumnId, direction: 'ASC' },
    filters: [
      {
        id: 'filter-stage4',
        columnId: statusColumnId,
        operator: '=',
        value: 'open',
        order: 0,
      },
    ],
  })

  const markerRow = insertRow(db, workspaceMatrixId, {
    values: { label: 'Open tasks', content: pmDoc() },
    parent: project,
  })
  const marker = { matrixId: workspaceMatrixId, rowId: markerRow.rowId }
  db.exec(
    `INSERT INTO block_sources (marker_matrix_id, marker_row_id, kind, sql)
     VALUES (?, ?, 'view', ?)`,
    {
      bind: [
        marker.matrixId,
        marker.rowId,
        `SELECT * FROM "mx_${ownedMatrixId}_data" WHERE status = 'open'`,
      ],
    },
  )
  db.exec("UPDATE plugins SET metadata = ? WHERE id = 'plugin.stage4'", {
    bind: [JSON.stringify({ workspaceMatrixId, ownedMatrixId, faceConfigId })],
  })

  return {
    workspaceMatrixId,
    project,
    child,
    reference,
    typeNode,
    ownedMatrixId,
    marker,
    faceConfigId,
  }
}

const createTwoReplicaFixture = async (): Promise<ReplicaFixture> => {
  const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })

  resetDeviceIdCache()
  const a = new sqlite3.oo1.DB(':memory:', 'c')
  initMatrixSchema(a)
  installCoreTableTriggers(a, getOrCreateDeviceId(a))
  const ids = createSourceFixture(a)
  const initialChanges = getLocalChanges(a, 0)

  resetDeviceIdCache()
  const b = new sqlite3.oo1.DB(':memory:', 'c')
  initMatrixSchema(b)
  installCoreTableTriggers(b, getOrCreateDeviceId(b))
  const result = applyRemoteChanges(b, initialChanges)
  expect(result.applied).toBe(initialChanges.entries.length)
  expect(result.conflicts).toEqual([])

  return { a, b, ids, initialChanges }
}

describe('Phase 11 Stage 4 two-replica current-schema round trip', () => {
  let fixture: ReplicaFixture

  beforeEach(async () => {
    fixture = await createTwoReplicaFixture()
  })

  afterEach(() => {
    fixture?.a.close()
    fixture?.b.close()
  })

  test('reconstructs source truth and rendered derived state by logical identity', () => {
    const { a, b, ids, initialChanges } = fixture

    expect(initialChanges.entries.some((entry) => DERIVED_TABLES.has(entry.table))).toBe(false)
    expect(
      initialChanges.entries.find((entry) => entry.table === 'face_configs')?.data,
    ).not.toHaveProperty('query')
    expect(getLocalChanges(b, 0).entries).toEqual([])
    expect(logicalSnapshot(b)).toEqual(logicalSnapshot(a))

    rebuildClosure(b)
    rebuildScrollIndex(b)
    expect(derivedSnapshot(b)).toEqual(derivedSnapshot(a))
    expect(renderedSnapshot(b, ids)).toEqual(renderedSnapshot(a, ids))
    expect(positionsOf(b, ids.child)).toHaveLength(2)
    expect(getFaceConfig(b, ids.faceConfigId)).toEqual(getFaceConfig(a, ids.faceConfigId))
  })

  test('detects and retains concurrent promoted, view, and owner mutations', () => {
    const { a, b, ids, initialChanges } = fixture

    demoteNode(a, ids.typeNode)
    demoteNode(b, ids.typeNode)
    dbUpdateViewSql(a, ids.marker, 'SELECT 1 AS source')
    dbUpdateViewSql(b, ids.marker, 'SELECT 2 AS local')
    dbUpdateOwner(a, ids.ownedMatrixId, ids.project)
    dbUpdateOwner(b, ids.ownedMatrixId, ids.reference)

    const delta = getLocalChanges(a, initialChanges.toSeq)
    for (const entry of delta.entries) {
      entry.timestamp = entry.table === 'matrix' ? '2099-01-01 00:00:00' : '2000-01-01 00:00:00'
    }
    const localEntryCount = getLocalChanges(b, 0).entries.length
    const result = applyRemoteChanges(b, delta)

    expect(result.conflicts).toHaveLength(3)
    expect(result.conflicts.map(({ tableName, winner }) => [tableName, winner])).toEqual([
      ['promoted_nodes', 'local'],
      ['block_sources', 'local'],
      ['matrix', 'remote'],
    ])
    expect(getLocalChanges(b, 0).entries).toHaveLength(localEntryCount)
    expect(
      b.selectValue('SELECT COUNT(*) FROM promoted_nodes WHERE matrix_id = ? AND row_id = ?', [
        ids.typeNode.matrixId,
        ids.typeNode.rowId,
      ]),
    ).toBe(0)
    expect(
      b.selectValue(
        'SELECT sql FROM block_sources WHERE marker_matrix_id = ? AND marker_row_id = ?',
        [ids.marker.matrixId, ids.marker.rowId],
      ),
    ).toBe('SELECT 2 AS local')
    expect(
      b.selectObjects('SELECT owner_matrix_id, owner_row_id FROM matrix WHERE id = ?', [
        ids.ownedMatrixId,
      ]),
    ).toEqual([{ owner_matrix_id: ids.project.matrixId, owner_row_id: ids.project.rowId }])
    expect(
      b.selectValue(
        `SELECT COUNT(*) FROM _sync_conflicts
         WHERE table_name IN ('promoted_nodes', 'block_sources', 'matrix')`,
      ),
    ).toBe(3)
  })

  test('applies the remote lifecycle for every composite fixture entity', () => {
    const { a, b, ids, initialChanges } = fixture

    demoteNode(a, ids.typeNode)
    dbDeleteView(a, ids.marker)
    a.exec(
      `DELETE FROM face_slot_bindings
       WHERE face_config_id = ? AND slot_name = 'title'`,
      { bind: [ids.faceConfigId] },
    )
    removePortal(a, ids.reference, ids.project)

    const delta = getLocalChanges(a, initialChanges.toSeq)
    const result = applyRemoteChanges(b, delta)

    expect(result.conflicts).toEqual([])
    expect(getLocalChanges(b, 0).entries).toEqual([])
    expect(
      delta.entries.filter(({ operation }) => operation === 'DELETE').map(({ table }) => table),
    ).toEqual(['promoted_nodes', 'block_sources', 'face_slot_bindings', 'joins'])
    expect(b.selectValue('SELECT COUNT(*) FROM promoted_nodes')).toBe(0)
    expect(b.selectValue('SELECT COUNT(*) FROM block_sources')).toBe(0)
    expect(getFaceConfig(b, ids.faceConfigId)?.slotBindings).toEqual({
      status: expect.any(Number),
    })
    expect(positionsOf(b, ids.project)).toHaveLength(1)
    expect(logicalSnapshot(b)).toEqual(logicalSnapshot(a))
    expect(derivedSnapshot(b)).toEqual(derivedSnapshot(a))
  })
})

const dbUpdateViewSql = (db: Database, marker: Node, sql: string): void => {
  db.exec('UPDATE block_sources SET sql = ? WHERE marker_matrix_id = ? AND marker_row_id = ?', {
    bind: [sql, marker.matrixId, marker.rowId],
  })
}

const dbDeleteView = (db: Database, marker: Node): void => {
  db.exec('DELETE FROM block_sources WHERE marker_matrix_id = ? AND marker_row_id = ?', {
    bind: [marker.matrixId, marker.rowId],
  })
}

const dbUpdateOwner = (db: Database, matrixId: number, owner: Node): void => {
  db.exec('UPDATE matrix SET owner_matrix_id = ?, owner_row_id = ? WHERE id = ?', {
    bind: [owner.matrixId, owner.rowId, matrixId],
  })
}
