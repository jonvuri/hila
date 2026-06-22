import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  createOwnedMatrix,
  dropOwnedMatrix,
  insertDataRow,
  insertRow,
  updateRow,
  deleteRow,
  createDependentRow,
  promoteNode,
  isPromotedNode,
} from './matrix'

describe('Owned matrix drop cascade (Phase 8c §8.1)', () => {
  let db: Database
  let wsMatrixId: number

  const makePmDoc = (...inlineContent: unknown[]) =>
    JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: inlineContent }],
    })

  const makeTextNode = (text: string) => ({ type: 'text', text })

  const makeInlineRef = (
    targetMatrixId: number,
    targetRowId: number,
    kind: 'ref' | 'own' = 'own',
    cachedTitle = 'tag',
  ) => ({
    type: 'inlineref',
    attrs: { targetMatrixId, targetRowId, kind, cachedTitle },
  })

  const rowExists = (matrixId: number, rowId: number): boolean => {
    const s = db.prepare(`SELECT 1 FROM "mx_${matrixId}_data" WHERE id = ?`)
    s.bind([rowId])
    const exists = s.step()
    s.finalize()
    return exists
  }

  const tableExists = (name: string): boolean => {
    const s = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    s.bind([name])
    const exists = s.step()
    s.finalize()
    return exists
  }

  const matrixRegistered = (matrixId: number): boolean => {
    const s = db.prepare('SELECT 1 FROM matrix WHERE id = ?')
    s.bind([matrixId])
    const exists = s.step()
    s.finalize()
    return exists
  }

  const countRows = (sql: string, bind: number[]): number => {
    const s = db.prepare(sql)
    if (bind.length > 0) s.bind(bind)
    s.step()
    const count = (s.get({}) as { cnt: number }).cnt
    s.finalize()
    return count
  }

  const closureRowsReferencing = (matrixId: number, rowId: number): number =>
    countRows(
      `SELECT COUNT(*) AS cnt FROM closure
       WHERE (ancestor_matrix_id = ? AND ancestor_row_id = ?)
          OR (descendant_matrix_id = ? AND descendant_row_id = ?)`,
      [matrixId, rowId, matrixId, rowId],
    )

  const joinsReferencing = (matrixId: number, rowId: number): number =>
    countRows(
      `SELECT COUNT(*) AS cnt FROM joins
       WHERE (source_matrix_id = ? AND source_row_id = ?)
          OR (target_matrix_id = ? AND target_row_id = ?)`,
      [matrixId, rowId, matrixId, rowId],
    )

  const getContent = (matrixId: number, rowId: number): string => {
    const s = db.prepare(`SELECT content FROM "mx_${matrixId}_data" WHERE id = ?`)
    s.bind([rowId])
    s.step()
    const row = s.get({}) as { content: string }
    s.finalize()
    return row.content
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    wsMatrixId = createMatrix(db, 'Workspace', [{ name: 'content', type: 'TEXT' }])
  })

  test('cross-matrix own-children of dropped rows are cascaded, leaving no closure or join rows', () => {
    const { rowId: typeNodeId } = insertRow(db, wsMatrixId)
    const { rowId: hostId } = insertRow(db, wsMatrixId)
    const taskMatrixId = createOwnedMatrix(
      db,
      { matrixId: wsMatrixId, rowId: typeNodeId },
      'Tasks',
      [{ name: 'label', type: 'TEXT' }],
    )
    const reviewMatrixId = createMatrix(db, 'Reviews', [{ name: 'label', type: 'TEXT' }])

    // host (ws) → aspect (tasks) → grandchild (reviews)
    const aspectId = createDependentRow(db, wsMatrixId, hostId, taskMatrixId, {
      label: 'task aspect',
    })
    const grandchildId = createDependentRow(db, taskMatrixId, aspectId, reviewMatrixId, {
      label: 'review of the task',
    })

    // Precondition: the spanning closure pair (host → grandchild) exists —
    // neither endpoint is in the task matrix, so a matrix-keyed bulk delete
    // alone would miss it.
    expect(
      countRows(
        `SELECT COUNT(*) AS cnt FROM closure
         WHERE ancestor_matrix_id = ? AND ancestor_row_id = ?
           AND descendant_matrix_id = ? AND descendant_row_id = ?`,
        [wsMatrixId, hostId, reviewMatrixId, grandchildId],
      ),
    ).toBe(1)

    dropOwnedMatrix(db, taskMatrixId)

    // The grandchild is cascade-deleted, not orphaned
    expect(rowExists(reviewMatrixId, grandchildId)).toBe(false)
    expect(joinsReferencing(reviewMatrixId, grandchildId)).toBe(0)
    expect(closureRowsReferencing(reviewMatrixId, grandchildId)).toBe(0)
    expect(
      countRows('SELECT COUNT(*) AS cnt FROM scroll_index WHERE matrix_id = ? AND row_id = ?', [
        reviewMatrixId,
        grandchildId,
      ]),
    ).toBe(0)

    // The dropped matrix is fully gone; the host survives
    expect(tableExists(`mx_${taskMatrixId}_data`)).toBe(false)
    expect(matrixRegistered(taskMatrixId)).toBe(false)
    expect(rowExists(wsMatrixId, hostId)).toBe(true)
  })

  test('nested owned matrixes are dropped recursively', () => {
    const { rowId: typeNodeId } = insertRow(db, wsMatrixId)
    const { rowId: hostId } = insertRow(db, wsMatrixId)
    const taskMatrixId = createOwnedMatrix(
      db,
      { matrixId: wsMatrixId, rowId: typeNodeId },
      'Tasks',
      [{ name: 'label', type: 'TEXT' }],
    )
    const aspectId = createDependentRow(db, wsMatrixId, hostId, taskMatrixId, {
      label: 'task with a sub-table',
    })

    // A row of the task matrix owns its own dedicated sub-table
    const nestedMatrixId = createOwnedMatrix(
      db,
      { matrixId: taskMatrixId, rowId: aspectId },
      'Subtasks',
      [{ name: 'label', type: 'TEXT' }],
    )
    insertDataRow(db, nestedMatrixId, { label: 'subtask' })

    dropOwnedMatrix(db, taskMatrixId)

    expect(matrixRegistered(nestedMatrixId)).toBe(false)
    expect(tableExists(`mx_${nestedMatrixId}_data`)).toBe(false)
    // No dangling owner pointer survives anywhere
    expect(
      countRows('SELECT COUNT(*) AS cnt FROM matrix WHERE owner_matrix_id = ?', [taskMatrixId]),
    ).toBe(0)
  })

  test('host docs lose all badges into the dropped matrix in one rewrite, keeping unrelated refs', () => {
    const { rowId: typeNodeId } = insertRow(db, wsMatrixId)
    const { rowId: hostId } = insertRow(db, wsMatrixId)
    const taskMatrixId = createOwnedMatrix(
      db,
      { matrixId: wsMatrixId, rowId: typeNodeId },
      'Tasks',
      [{ name: 'label', type: 'TEXT' }],
    )
    const otherMatrixId = createMatrix(db, 'Other', [{ name: 'label', type: 'TEXT' }])
    const otherRowId = insertDataRow(db, otherMatrixId, { label: 'unrelated' })

    const aspect1 = createDependentRow(db, wsMatrixId, hostId, taskMatrixId, { label: 'a1' })
    const aspect2 = createDependentRow(db, wsMatrixId, hostId, taskMatrixId, { label: 'a2' })

    updateRow(db, {
      matrixId: wsMatrixId,
      rowId: hostId,
      values: {
        content: makePmDoc(
          makeTextNode('hello '),
          makeInlineRef(taskMatrixId, aspect1),
          makeInlineRef(taskMatrixId, aspect2),
          makeInlineRef(otherMatrixId, otherRowId, 'ref'),
        ),
      },
    })

    dropOwnedMatrix(db, taskMatrixId)

    const doc = getContent(wsMatrixId, hostId)
    expect(doc).not.toContain(`"targetMatrixId":${taskMatrixId}`)
    expect(doc).toContain(`"targetMatrixId":${otherMatrixId}`)
    expect(doc).toContain('hello ')
  })

  test('host docs lose badges in the label column too, not just content (matrix drop)', () => {
    // The common case: a `#`-badge sits in a workspace row's *label* (the bullet
    // text), not its content. A label-role and a content-role column coexist.
    const labeledWsId = createMatrix(db, 'Labeled WS', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
    const { rowId: typeNodeId } = insertRow(db, labeledWsId)
    const { rowId: hostId } = insertRow(db, labeledWsId)
    const taskMatrixId = createOwnedMatrix(
      db,
      { matrixId: labeledWsId, rowId: typeNodeId },
      'Tasks',
      [{ name: 'label', type: 'TEXT' }],
    )
    const aspectId = createDependentRow(db, labeledWsId, hostId, taskMatrixId, { label: 'a1' })

    updateRow(db, {
      matrixId: labeledWsId,
      rowId: hostId,
      values: {
        label: makePmDoc(makeTextNode('do it '), makeInlineRef(taskMatrixId, aspectId)),
      },
    })

    const getLabel = (rowId: number): string => {
      const s = db.prepare(`SELECT label FROM "mx_${labeledWsId}_data" WHERE id = ?`)
      s.bind([rowId])
      s.step()
      const r = s.get({}) as { label: string }
      s.finalize()
      return r.label
    }
    expect(getLabel(hostId)).toContain(`"targetMatrixId":${taskMatrixId}`)

    dropOwnedMatrix(db, taskMatrixId)

    expect(getLabel(hostId)).not.toContain(`"targetMatrixId":${taskMatrixId}`)
    expect(getLabel(hostId)).toContain('do it ')
  })

  test('plain deleteRow of a promoted type-node clears its promotion and drops the owned matrix', () => {
    const { rowId: typeNodeId } = insertRow(db, wsMatrixId)
    promoteNode(db, { matrixId: wsMatrixId, rowId: typeNodeId })
    const taskMatrixId = createOwnedMatrix(
      db,
      { matrixId: wsMatrixId, rowId: typeNodeId },
      'Tasks',
      [{ name: 'label', type: 'TEXT' }],
    )

    deleteRow(db, wsMatrixId, typeNodeId)

    expect(isPromotedNode(db, { matrixId: wsMatrixId, rowId: typeNodeId })).toBe(false)
    expect(countRows('SELECT COUNT(*) AS cnt FROM promoted_nodes', [])).toBe(0)
    expect(matrixRegistered(taskMatrixId)).toBe(false)
    expect(tableExists(`mx_${taskMatrixId}_data`)).toBe(false)
  })

  test('updating the label-role column syncs owned matrix titles (label is canonical)', () => {
    const labeledWsId = createMatrix(db, 'Labeled WS', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
    const { rowId: typeNodeId } = insertRow(db, labeledWsId, {
      values: { label: makePmDoc(makeTextNode('task')) },
    })
    const ownedId = createOwnedMatrix(
      db,
      { matrixId: labeledWsId, rowId: typeNodeId },
      'task',
      [{ name: 'label', type: 'TEXT' }],
    )

    // Renaming via the generic row-edit path (what the outline editor does)
    updateRow(db, {
      matrixId: labeledWsId,
      rowId: typeNodeId,
      values: { label: makePmDoc(makeTextNode('todo')) },
    })

    const titleStmt = db.prepare('SELECT title FROM matrix WHERE id = ?')
    titleStmt.bind([ownedId])
    titleStmt.step()
    expect((titleStmt.get({}) as { title: string }).title).toBe('todo')
    titleStmt.finalize()

    // A non-label write leaves the title alone
    updateRow(db, {
      matrixId: labeledWsId,
      rowId: typeNodeId,
      values: { content: makePmDoc(makeTextNode('some notes')) },
    })
    const titleStmt2 = db.prepare('SELECT title FROM matrix WHERE id = ?')
    titleStmt2.bind([ownedId])
    titleStmt2.step()
    expect((titleStmt2.get({}) as { title: string }).title).toBe('todo')
    titleStmt2.finalize()
  })

  test('label writes on rows that own nothing are unaffected by the sync rule', () => {
    const labeledWsId = createMatrix(db, 'Labeled WS', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    const { rowId } = insertRow(db, labeledWsId, {
      values: { label: makePmDoc(makeTextNode('plain row')) },
    })

    expect(() =>
      updateRow(db, {
        matrixId: labeledWsId,
        rowId,
        values: { label: makePmDoc(makeTextNode('renamed')) },
      }),
    ).not.toThrow()
  })

  test('the depth guard trips on ownership cycles instead of recursing forever', () => {
    const m1 = createMatrix(db, 'M1', [{ name: 'label', type: 'TEXT' }])
    const r1 = insertDataRow(db, m1, { label: 'r1' })
    const m2 = createOwnedMatrix(db, { matrixId: m1, rowId: r1 }, 'M2', [
      { name: 'label', type: 'TEXT' },
    ])
    const r2 = insertDataRow(db, m2, { label: 'r2' })

    // Forge the cycle: M1 is owned by a row of M2, which is owned by a row of M1
    db.exec('UPDATE matrix SET owner_matrix_id = ?, owner_row_id = ? WHERE id = ?', {
      bind: [m2, r2, m1],
    })

    expect(() => dropOwnedMatrix(db, m1)).toThrow(/possible cycle/)

    // The transaction rolled back: both matrixes are intact
    expect(matrixRegistered(m1)).toBe(true)
    expect(matrixRegistered(m2)).toBe(true)
    expect(tableExists(`mx_${m1}_data`)).toBe(true)
  })
})
