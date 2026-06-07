/**
 * Tests for the global closure cache (Phase 8b §1).
 *
 * Verifies that the closure table stays consistent with own-edges after
 * inserts, reparents, and deletes, including cross-matrix boundaries.
 */

import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { createMatrix, insertRow, deleteRow, initMatrixSchema } from './matrix'
import { getAncestors, getDepth, isAncestor, rebuildClosure } from './closure'
import { reparentRow, deleteSubtree } from './tree'

describe('Global closure cache', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('insertRow maintains closure for a simple chain A -> B -> C', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: a.rowId },
    })
    const c = insertRow(db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: b.rowId },
    })

    // B's ancestors: A at depth 1
    const bAncestors = getAncestors(db, { matrixId, rowId: b.rowId })
    expect(bAncestors).toHaveLength(1)
    expect(bAncestors[0]).toEqual({ matrixId, rowId: a.rowId, depth: 1 })

    // C's ancestors: B at depth 1, A at depth 2
    const cAncestors = getAncestors(db, { matrixId, rowId: c.rowId })
    expect(cAncestors).toHaveLength(2)
    expect(cAncestors[0]).toEqual({ matrixId, rowId: b.rowId, depth: 1 })
    expect(cAncestors[1]).toEqual({ matrixId, rowId: a.rowId, depth: 2 })

    // Depth checks
    expect(getDepth(db, { matrixId, rowId: a.rowId })).toBe(0) // root, no ancestors
    expect(getDepth(db, { matrixId, rowId: b.rowId })).toBe(1)
    expect(getDepth(db, { matrixId, rowId: c.rowId })).toBe(2)

    // isAncestor checks
    expect(isAncestor(db, { matrixId, rowId: a.rowId }, { matrixId, rowId: c.rowId })).toBe(
      true,
    )
    expect(isAncestor(db, { matrixId, rowId: b.rowId }, { matrixId, rowId: c.rowId })).toBe(
      true,
    )
    expect(isAncestor(db, { matrixId, rowId: c.rowId }, { matrixId, rowId: a.rowId })).toBe(
      false,
    )
  })

  test('reparent updates closure correctly', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, { values: { label: 'B' } })
    const c = insertRow(db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: a.rowId },
    })

    // Before: C is child of A
    expect(isAncestor(db, { matrixId, rowId: a.rowId }, { matrixId, rowId: c.rowId })).toBe(
      true,
    )
    expect(isAncestor(db, { matrixId, rowId: b.rowId }, { matrixId, rowId: c.rowId })).toBe(
      false,
    )

    // Reparent C under B
    reparentRow(db, { matrixId, rowId: c.rowId, newParent: { matrixId, rowId: b.rowId } })

    // After: C is child of B, not A
    expect(isAncestor(db, { matrixId, rowId: b.rowId }, { matrixId, rowId: c.rowId })).toBe(
      true,
    )
    expect(isAncestor(db, { matrixId, rowId: a.rowId }, { matrixId, rowId: c.rowId })).toBe(
      false,
    )
  })

  test('reparent a subtree updates all descendant ancestry', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, { values: { label: 'B' } })
    const c = insertRow(db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: a.rowId },
    })
    const d = insertRow(db, matrixId, {
      values: { label: 'D' },
      parent: { matrixId, rowId: c.rowId },
    })

    // Before: D's ancestors are C (depth 1) and A (depth 2)
    expect(getDepth(db, { matrixId, rowId: d.rowId })).toBe(2)

    // Reparent C (with D) under B
    reparentRow(db, { matrixId, rowId: c.rowId, newParent: { matrixId, rowId: b.rowId } })

    // After: D's ancestors are C (depth 1) and B (depth 2)
    const dAncestors = getAncestors(db, { matrixId, rowId: d.rowId })
    expect(dAncestors).toHaveLength(2)
    expect(dAncestors[0]).toEqual({ matrixId, rowId: c.rowId, depth: 1 })
    expect(dAncestors[1]).toEqual({ matrixId, rowId: b.rowId, depth: 2 })
    expect(isAncestor(db, { matrixId, rowId: a.rowId }, { matrixId, rowId: d.rowId })).toBe(
      false,
    )
  })

  test('single-node delete removes the node from closure', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: a.rowId },
    })
    const c = insertRow(db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: b.rowId },
    })

    // Delete B (promotes C to A)
    deleteRow(db, matrixId, b.rowId)

    // C is now a child of A (promoted)
    expect(isAncestor(db, { matrixId, rowId: a.rowId }, { matrixId, rowId: c.rowId })).toBe(
      true,
    )
    // B no longer exists in closure
    expect(getAncestors(db, { matrixId, rowId: b.rowId })).toHaveLength(0)
  })

  test('subtree delete removes all descendants from closure', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: a.rowId },
    })
    const c = insertRow(db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: b.rowId },
    })

    deleteSubtree(db, { matrixId, rowId: b.rowId })

    // Neither B nor C has closure entries
    expect(getAncestors(db, { matrixId, rowId: b.rowId })).toHaveLength(0)
    expect(getAncestors(db, { matrixId, rowId: c.rowId })).toHaveLength(0)
    // A is unaffected (still exists, just has no descendants)
    expect(getDepth(db, { matrixId, rowId: a.rowId })).toBe(0)
  })

  test('cross-matrix ancestry: hosted aspect row climbs through host', () => {
    const outlineMatrix = createMatrix(db, 'Outline', [{ name: 'label', type: 'TEXT' }])
    const taskMatrix = createMatrix(db, 'Tasks', [{ name: 'label', type: 'TEXT' }])

    const host = insertRow(db, outlineMatrix, { values: { label: 'Host' } })
    const aspect = insertRow(db, taskMatrix, {
      values: { label: 'Task' },
      parent: { matrixId: outlineMatrix, rowId: host.rowId },
    })

    // The aspect row's ancestor is the host in the outline matrix
    const ancestors = getAncestors(db, { matrixId: taskMatrix, rowId: aspect.rowId })
    expect(ancestors).toHaveLength(1)
    expect(ancestors[0]).toEqual({
      matrixId: outlineMatrix,
      rowId: host.rowId,
      depth: 1,
    })
  })

  test('rebuildClosure reproduces the incrementally-maintained table exactly', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: a.rowId },
    })
    const c = insertRow(db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: b.rowId },
    })
    const d = insertRow(db, matrixId, { values: { label: 'D' } })
    const e = insertRow(db, matrixId, {
      values: { label: 'E' },
      parent: { matrixId, rowId: d.rowId },
    })

    // Suppress unused-var lint (we need these rows in the forest, but don't
    // reference them in assertions -- we compare the full closure snapshot).
    void c
    void e

    // Capture the incrementally-maintained state
    const stmt = db.prepare(
      'SELECT ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id, depth FROM closure ORDER BY ancestor_row_id, descendant_row_id',
    )
    const before: unknown[] = []
    while (stmt.step()) before.push(stmt.get({}))
    stmt.finalize()

    // Rebuild from scratch
    rebuildClosure(db)

    // Verify they match
    const stmt2 = db.prepare(
      'SELECT ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id, depth FROM closure ORDER BY ancestor_row_id, descendant_row_id',
    )
    const after: unknown[] = []
    while (stmt2.step()) after.push(stmt2.get({}))
    stmt2.finalize()

    expect(after).toEqual(before)
  })

  test('root-level nodes have no closure entries (sentinel is excluded)', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })

    expect(getAncestors(db, { matrixId, rowId: a.rowId })).toHaveLength(0)
    expect(getDepth(db, { matrixId, rowId: a.rowId })).toBe(0)
  })
})
