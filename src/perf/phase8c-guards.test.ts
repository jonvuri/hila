/**
 * Phase 8c Part C performance guards (§7).
 *
 * Key risk: `joins` is now O(total rows) (every row has an own-edge), so it is
 * one of the largest tables. No join access path can be index-blind.
 *
 * Guards:
 * - Backlinks and forward lookups are index-covered (no SCAN of joins)
 * - Matrix drop is O(1) table drops (not per-row cascade)
 * - # autocomplete is bounded (scans only promoted_nodes)
 * - Shared-vs-dedicated detection is a bounded lookup
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  createOwnedMatrix,
  dropOwnedMatrix,
  insertRow,
  deleteRow,
  createDependentRow,
  createHostlessAspectRow,
  promoteNode,
  isSharedMatrix,
} from '../core/matrix'

import {
  assertQueryPlan,
  createForestMatrix,
  createPerfDb,
  generateForest,
  type PerfHarness,
} from './index'

describe('Part C guards: join lookups are index-covered', () => {
  let harness: PerfHarness
  let matrixId: number

  beforeEach(async () => {
    harness = await createPerfDb()
    matrixId = createForestMatrix(harness.rawDb, 'Forest')
    generateForest(harness.rawDb, { matrixId, count: 600, seed: 99 })
    harness.analyze()
  })
  afterEach(() => harness.close())

  test('getSources (backlinks) uses joins_by_target index, no full scan', () => {
    const sql = `
      SELECT source_matrix_id, source_row_id, kind FROM joins
      WHERE target_matrix_id = ? AND target_row_id = ?
    `
    assertQueryPlan(harness.rawDb, sql, [matrixId, 1], {
      usesIndex: 'joins_by_target',
      noScanOf: ['joins'],
      noAutoIndex: true,
    })
  })

  test('getTargets (forward lookup) uses joins PK, no full scan', () => {
    const sql = `
      SELECT target_matrix_id, target_row_id, kind FROM joins
      WHERE source_matrix_id = ? AND source_row_id = ?
    `
    assertQueryPlan(harness.rawDb, sql, [matrixId, 1], {
      noScanOf: ['joins'],
      noAutoIndex: true,
    })
  })

  test('ref-only backlinks query stays index-covered', () => {
    const sql = `
      SELECT source_matrix_id, source_row_id FROM joins
      WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'ref'
    `
    assertQueryPlan(harness.rawDb, sql, [matrixId, 1], {
      noScanOf: ['joins'],
      noAutoIndex: true,
    })
  })
})

describe('Part C guards: matrix drop is O(1) table drops', () => {
  let harness: PerfHarness

  beforeEach(async () => {
    harness = await createPerfDb()
  })
  afterEach(() => harness.close())

  const seedOwnedMatrix = (count: number) => {
    const db = harness.rawDb
    const wsMatrixId = createForestMatrix(db, `Workspace-${count}`)
    const { rowId: ownerRowId } = insertRow(db, wsMatrixId)
    const tagMatrixId = createOwnedMatrix(
      db,
      { matrixId: wsMatrixId, rowId: ownerRowId },
      `BigTag-${count}`,
      [{ name: 'label', type: 'TEXT' }],
    )
    for (let i = 0; i < count; i++) {
      createDependentRow(db, wsMatrixId, ownerRowId, tagMatrixId, { label: `row-${i}` })
    }
    return { wsMatrixId, ownerRowId, tagMatrixId }
  }

  test('dropping an owned matrix executes a statement count independent of row count (work-count)', () => {
    // Statement count must be structural: bulk deletes keyed by matrix_id plus
    // one table drop, not per-row deletes. Host-doc inlineref cleanup is
    // intentionally O(distinct hosts with badges) -- here both seeds use a
    // single host, so that term is constant and included in the comparison;
    // the row-count axis is what this guard pins.
    const small = seedOwnedMatrix(50)
    const large = seedOwnedMatrix(400)
    harness.analyze()

    harness.reset()
    dropOwnedMatrix(harness.db, small.tagMatrixId)
    const smallStatements = harness.counters.statements

    harness.reset()
    dropOwnedMatrix(harness.db, large.tagMatrixId)
    const largeStatements = harness.counters.statements

    expect(largeStatements).toBe(smallStatements)

    // End-state: the matrix and all its global-infrastructure rows are gone
    const db = harness.rawDb
    const stmt = db.prepare('SELECT 1 FROM matrix WHERE id = ?')
    stmt.bind([large.tagMatrixId])
    expect(stmt.step()).toBe(false)
    stmt.finalize()

    const joinCheck = db.prepare(
      'SELECT COUNT(*) AS cnt FROM joins WHERE source_matrix_id = ? OR target_matrix_id = ?',
    )
    joinCheck.bind([large.tagMatrixId, large.tagMatrixId])
    joinCheck.step()
    expect((joinCheck.get({}) as { cnt: number }).cnt).toBe(0)
    joinCheck.finalize()
  })
})

describe('Part C guards: # autocomplete is bounded', () => {
  let harness: PerfHarness
  let wsMatrixId: number

  beforeEach(async () => {
    harness = await createPerfDb()
    wsMatrixId = createForestMatrix(harness.rawDb, 'Workspace')
    // Create many non-promoted rows and a few promoted ones
    for (let i = 0; i < 500; i++) {
      insertRow(harness.rawDb, wsMatrixId)
    }
    // Promote a few
    for (let i = 0; i < 5; i++) {
      const { rowId } = insertRow(harness.rawDb, wsMatrixId)
      promoteNode(harness.rawDb, { matrixId: wsMatrixId, rowId })
    }
    harness.analyze()
  })
  afterEach(() => harness.close())

  test('listing promoted nodes scans only promoted_nodes, not the workspace data table', () => {
    const sql = `
      SELECT p.row_id FROM promoted_nodes p
      WHERE p.matrix_id = ?
    `
    assertQueryPlan(harness.rawDb, sql, [wsMatrixId], {
      noScanOf: [`mx_${wsMatrixId}_data`],
      noAutoIndex: true,
    })
  })
})

describe('Part C guards: shared-vs-dedicated detection is bounded', () => {
  let harness: PerfHarness

  beforeEach(async () => {
    harness = await createPerfDb()
  })
  afterEach(() => harness.close())

  test('isSharedMatrix is a bounded lookup (no scan of all rows)', () => {
    const db = harness.rawDb
    const wsMatrixId = createForestMatrix(db, 'Workspace')
    const { rowId: ownerRowId } = insertRow(db, wsMatrixId)
    const tagMatrixId = createOwnedMatrix(
      db,
      { matrixId: wsMatrixId, rowId: ownerRowId },
      'Tasks',
      [{ name: 'label', type: 'TEXT' }],
    )

    // Seed many rows from different hosts
    for (let i = 0; i < 100; i++) {
      const { rowId: hostId } = insertRow(db, wsMatrixId)
      createDependentRow(db, wsMatrixId, hostId, tagMatrixId, { label: `task-${i}` })
    }

    harness.analyze()

    // isSharedMatrix should return true (multiple different hosts own rows)
    const result = isSharedMatrix(db, tagMatrixId)
    expect(result).toBe(true)

    // The query uses LIMIT 1 so it stops after finding one non-owner edge
    const sql = `
      SELECT 1 FROM joins
      WHERE target_matrix_id = ? AND kind = 'own'
        AND NOT (source_matrix_id = ? AND source_row_id = ?)
      LIMIT 1
    `
    assertQueryPlan(db, sql, [tagMatrixId, wsMatrixId, ownerRowId], {
      noScanOf: ['joins'],
      noAutoIndex: true,
    })
  })
})

describe('Part C guards: type-node delete is bounded (drop-before-cascade, §8.2)', () => {
  let harness: PerfHarness

  beforeEach(async () => {
    harness = await createPerfDb()
  })
  afterEach(() => harness.close())

  const seedTypeNodeWithHostlessRows = (count: number) => {
    const db = harness.rawDb
    const wsMatrixId = createForestMatrix(db, `Workspace-${count}`)
    const { rowId: typeNodeId } = insertRow(db, wsMatrixId)
    const typeNode = { matrixId: wsMatrixId, rowId: typeNodeId }
    const tagMatrixId = createOwnedMatrix(db, typeNode, `Tag-${count}`, [
      { name: 'label', type: 'TEXT' },
    ])
    for (let i = 0; i < count; i++) {
      createHostlessAspectRow(db, typeNode, tagMatrixId, { label: `row-${i}` })
    }
    return { wsMatrixId, typeNodeId }
  }

  test('deleting a type-node executes a statement count independent of hostless row count', () => {
    // Hostless aspect rows are own-children of the type-node living in its
    // owned matrix. Because owned matrixes drop before the cross-matrix child
    // walk, they ride the bulk table drop -- a per-row cascade would show up
    // here as a statement count scaling with N.
    const small = seedTypeNodeWithHostlessRows(20)
    const large = seedTypeNodeWithHostlessRows(400)
    harness.analyze()

    harness.reset()
    deleteRow(harness.db, small.wsMatrixId, small.typeNodeId)
    const smallStatements = harness.counters.statements

    harness.reset()
    deleteRow(harness.db, large.wsMatrixId, large.typeNodeId)
    const largeStatements = harness.counters.statements

    expect(largeStatements).toBe(smallStatements)
  })
})
