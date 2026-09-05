import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, describe, expect, test } from 'vitest'

import {
  createViewBlock,
  getViewBlocksForNode,
  updateViewBlockSql,
} from '../../core/block-marker'
import {
  createMatrix,
  getColumns,
  initMatrixSchema,
  insertRow,
  renameColumn,
} from '../../core/matrix'

import { createQueryCatalog } from './catalog'
import { materializeQuerySpec } from './materialize'
import { setQueryText } from './operations'
import { recognizeQuerySpec } from './recognize'
import type { QuerySpec } from './types'

describe('durable query-spec round trip and rename healing', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('compile, create, reload, edit, update, and reload retain structured state', () => {
    const hostMatrixId = createMatrix(db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    const focal = { matrixId: hostMatrixId, rowId: insertRow(db, hostMatrixId).rowId }
    const resultMatrixId = createMatrix(db, 'Tasks', [
      { name: 'title', type: 'TEXT', role: 'label' },
      { name: 'body', type: 'TEXT', role: 'content' },
    ])
    const columns = getColumns(db, resultMatrixId)
    const catalog = createQueryCatalog({
      matrices: [{ id: resultMatrixId, columns }],
      nodes: [focal],
    })
    const spec: QuerySpec = {
      kind: { type: 'matrix', matrixId: resultMatrixId },
      scope: { type: 'node', ...focal },
      text: 'first',
      where: [
        {
          type: 'predicate',
          columnId: columns.find((column) => column.name === 'title')!.id,
          op: 'contains',
          value: 'open',
        },
      ],
      order: { type: 'natural' },
      limit: 120,
    }

    const marker = createViewBlock(db, focal, materializeQuerySpec(spec, catalog), 'Open tasks')
    const reloaded = recognizeQuerySpec(getViewBlocksForNode(db, focal)[0]!.sql, catalog)
    expect(reloaded).toMatchObject({ type: 'chips', spec })
    if (reloaded.type === 'custom-sql') return

    const edited = setQueryText(reloaded.spec, 'second')
    updateViewBlockSql(db, marker, materializeQuerySpec(edited, catalog))
    expect(recognizeQuerySpec(getViewBlocksForNode(db, focal)[0]!.sql, catalog)).toMatchObject({
      type: 'chips',
      spec: edited,
    })
  })

  test('rename heals structured terms and reports preserved opaque references', () => {
    const hostMatrixId = createMatrix(db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    const focal = { matrixId: hostMatrixId, rowId: insertRow(db, hostMatrixId).rowId }
    const resultMatrixId = createMatrix(db, 'Tasks', [
      { name: 'title', type: 'TEXT', role: 'label' },
      { name: 'score', type: 'INTEGER' },
    ])
    const beforeColumns = getColumns(db, resultMatrixId)
    const titleId = beforeColumns.find((column) => column.name === 'title')!.id
    const beforeCatalog = createQueryCatalog({
      matrices: [{ id: resultMatrixId, columns: beforeColumns }],
      nodes: [focal],
    })
    const structured: QuerySpec = {
      kind: { type: 'matrix', matrixId: resultMatrixId },
      scope: { type: 'node', ...focal },
      text: 'task',
      where: [{ type: 'predicate', columnId: titleId, op: 'eq', value: 'Open' }],
      order: { type: 'column', columnId: titleId, direction: 'asc' },
      limit: 120,
    }
    const opaque: QuerySpec = {
      ...structured,
      text: '',
      where: [{ type: 'opaque', sql: 'length(d."title") > 2 /* keep exactly */' }],
      order: { type: 'natural' },
    }
    const structuredMarker = createViewBlock(
      db,
      focal,
      materializeQuerySpec(structured, beforeCatalog),
      'Structured',
    )
    const opaqueMarker = createViewBlock(
      db,
      focal,
      materializeQuerySpec(opaque, beforeCatalog),
      'Opaque',
    )

    const report = renameColumn(db, resultMatrixId, 'title', 'heading')
    expect(report).toEqual({
      healedViewCount: 1,
      strandedOpaqueLeaves: [
        {
          markerMatrixId: opaqueMarker.matrixId,
          markerRowId: opaqueMarker.rowId,
          leafIndex: 0,
          columnName: 'title',
          sql: 'length(d."title") > 2 /* keep exactly */',
        },
      ],
    })

    const afterCatalog = createQueryCatalog({
      matrices: [{ id: resultMatrixId, columns: getColumns(db, resultMatrixId) }],
      nodes: [focal],
    })
    const blocks = getViewBlocksForNode(db, focal)
    const healedStructured = blocks.find(
      (block) => block.marker_row_id === structuredMarker.rowId,
    )!
    expect(healedStructured.sql).toContain('d."heading"')
    expect(healedStructured.sql).not.toContain('d."title"')
    expect(recognizeQuerySpec(healedStructured.sql, afterCatalog)).toMatchObject({
      type: 'chips',
      spec: {
        where: [{ type: 'predicate', columnId: titleId, op: 'eq', value: 'Open' }],
        order: { type: 'column', columnId: titleId, direction: 'asc' },
      },
    })

    const healedOpaque = blocks.find((block) => block.marker_row_id === opaqueMarker.rowId)!
    expect(healedOpaque.sql).toContain('(length(d."title") > 2 /* keep exactly */)')
    expect(recognizeQuerySpec(healedOpaque.sql, afterCatalog)).toMatchObject({
      type: 'chips-with-leaves',
      spec: { where: [{ type: 'opaque', sql: 'length(d."title") > 2 /* keep exactly */' }] },
    })
  })
})
