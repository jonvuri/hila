import type { Database } from '@sqlite.org/sqlite-wasm'

import { ROOT_MATRIX_ID, ROOT_ROW_ID } from './ids'
import type { NodeRef } from './tree'

// -- Global closure cache -----------------------------------------------------
//
// The closure table is a materialized transitive closure of own-edges. Every
// (ancestor, descendant) pair reachable via own-edges is stored with its depth.
// It is the sole source for ancestry lookups and subtree-scoping queries.
//
// Maintenance contract: every structural edit (insert, reparent, delete) must
// call the corresponding maintenance function so the cache stays in sync with
// the own-edge truth.

// -- Rebuild (full) -----------------------------------------------------------

/**
 * Fully rebuild the global closure table from own-edges. Used after a remote
 * sync applies and as a repair tool. Clears the table and re-derives it via a
 * BFS/recursive CTE over `joins WHERE kind='own'`.
 */
export const rebuildClosure = (db: Database): void => {
  db.exec('DELETE FROM closure')
  db.exec(`
    INSERT INTO closure (ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id, depth)
    WITH RECURSIVE walk(anc_mx, anc_row, desc_mx, desc_row, depth) AS (
      -- Depth-1: direct children of every node (excluding sentinel as ancestor)
      SELECT j.source_matrix_id, j.source_row_id,
             j.target_matrix_id, j.target_row_id, 1
      FROM joins j
      WHERE j.kind = 'own'
        AND NOT (j.source_matrix_id = ${ROOT_MATRIX_ID} AND j.source_row_id = ${ROOT_ROW_ID})
      UNION ALL
      -- Extend: if A is ancestor of B at depth d, and B is parent of C, then A
      -- is ancestor of C at depth d+1.
      SELECT w.anc_mx, w.anc_row, j.target_matrix_id, j.target_row_id, w.depth + 1
      FROM walk w
      JOIN joins j ON j.source_matrix_id = w.desc_mx AND j.source_row_id = w.desc_row
      WHERE j.kind = 'own'
    )
    SELECT anc_mx, anc_row, desc_mx, desc_row, depth FROM walk
  `)
}

// -- Incremental maintenance --------------------------------------------------

/**
 * After inserting a node as a child of `parent`, add closure entries linking
 * the new node to all of `parent`'s ancestors (plus the parent itself).
 *
 * Does NOT handle descendants of the inserted node (a freshly inserted node
 * has none). For batch inserts with nesting, call in parent-first order.
 */
export const maintainClosureOnInsert = (db: Database, node: NodeRef, parent: NodeRef): void => {
  if (parent.matrixId === ROOT_MATRIX_ID && parent.rowId === ROOT_ROW_ID) return

  // Direct link: parent → node at depth 1.
  db.exec(
    `INSERT OR IGNORE INTO closure
       (ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id, depth)
     VALUES (?, ?, ?, ?, 1)`,
    { bind: [parent.matrixId, parent.rowId, node.matrixId, node.rowId] },
  )

  // Transitive: every ancestor of parent at depth d becomes an ancestor of
  // node at depth d+1.
  db.exec(
    `INSERT OR IGNORE INTO closure
       (ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id, depth)
     SELECT c.ancestor_matrix_id, c.ancestor_row_id, ?, ?, c.depth + 1
     FROM closure c
     WHERE c.descendant_matrix_id = ? AND c.descendant_row_id = ?`,
    { bind: [node.matrixId, node.rowId, parent.matrixId, parent.rowId] },
  )
}

/**
 * After reparenting a subtree rooted at `node` from `oldParent` to `newParent`,
 * refresh the closure entries for the moved node and all its descendants.
 *
 * Algorithm: remove all closure rows where the descendant is in the moved
 * subtree AND the ancestor is NOT in the moved subtree (these are the stale
 * "reaches up" links). Then re-insert the correct upward links from the new
 * position.
 */
export const maintainClosureOnReparent = (
  db: Database,
  node: NodeRef,
  newParent: NodeRef,
): void => {
  // Collect the subtree (node + all its closure descendants).
  // Use a temp table for efficient joins.
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS _moved_subtree (mx INTEGER, row INTEGER, PRIMARY KEY (mx, row))
  `)
  db.exec('DELETE FROM _moved_subtree')
  db.exec('INSERT INTO _moved_subtree VALUES (?, ?)', {
    bind: [node.matrixId, node.rowId],
  })
  db.exec(
    `INSERT OR IGNORE INTO _moved_subtree (mx, row)
     SELECT descendant_matrix_id, descendant_row_id FROM closure
     WHERE ancestor_matrix_id = ? AND ancestor_row_id = ?`,
    { bind: [node.matrixId, node.rowId] },
  )

  // Remove all closure rows where a subtree node is the descendant and the
  // ancestor is NOT in the subtree (the stale "reaches outside" links).
  db.exec(`
    DELETE FROM closure
    WHERE (descendant_matrix_id, descendant_row_id) IN (SELECT mx, row FROM _moved_subtree)
      AND (ancestor_matrix_id, ancestor_row_id) NOT IN (SELECT mx, row FROM _moved_subtree)
  `)

  // Now re-insert the correct upward links from the new parent's ancestry.
  if (newParent.matrixId === ROOT_MATRIX_ID && newParent.rowId === ROOT_ROW_ID) {
    // Moved to root — no ancestors outside the subtree.
    db.exec('DROP TABLE IF EXISTS _moved_subtree')
    return
  }

  // Ancestors of the new parent (including the new parent itself at depth 0
  // conceptually): for each subtree node S at internal-depth d (within the
  // subtree), and each ancestor A of newParent at depth a, S is a descendant
  // of A at depth a + 1 + d.
  //
  // Internal depth of a subtree node = its closure depth from `node` (0 for
  // node itself).

  // First: node itself is a descendant of newParent at depth 1, and of
  // newParent's ancestors at depth a+1.
  db.exec(
    `INSERT OR IGNORE INTO closure
       (ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id, depth)
     VALUES (?, ?, ?, ?, 1)`,
    { bind: [newParent.matrixId, newParent.rowId, node.matrixId, node.rowId] },
  )
  db.exec(
    `INSERT OR IGNORE INTO closure
       (ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id, depth)
     SELECT c.ancestor_matrix_id, c.ancestor_row_id, ?, ?, c.depth + 1
     FROM closure c
     WHERE c.descendant_matrix_id = ? AND c.descendant_row_id = ?`,
    { bind: [node.matrixId, node.rowId, newParent.matrixId, newParent.rowId] },
  )

  // Then: for each descendant D of node at internal depth d, D is a descendant
  // of newParent at depth d+1, and of newParent's ancestors at depth a+d+1.
  db.exec(
    `INSERT OR IGNORE INTO closure
       (ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id, depth)
     SELECT ?, ?, s.descendant_matrix_id, s.descendant_row_id, s.depth + 1
     FROM closure s
     WHERE s.ancestor_matrix_id = ? AND s.ancestor_row_id = ?`,
    {
      bind: [newParent.matrixId, newParent.rowId, node.matrixId, node.rowId],
    },
  )
  db.exec(
    `INSERT OR IGNORE INTO closure
       (ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id, depth)
     SELECT pa.ancestor_matrix_id, pa.ancestor_row_id,
            nd.descendant_matrix_id, nd.descendant_row_id,
            pa.depth + nd.depth + 1
     FROM closure pa
     CROSS JOIN closure nd
     WHERE pa.descendant_matrix_id = ? AND pa.descendant_row_id = ?
       AND nd.ancestor_matrix_id = ? AND nd.ancestor_row_id = ?`,
    {
      bind: [newParent.matrixId, newParent.rowId, node.matrixId, node.rowId],
    },
  )

  db.exec('DROP TABLE IF EXISTS _moved_subtree')
}

/**
 * Before deleting a node (and its subtree), remove all closure entries where
 * any subtree node appears as ancestor or descendant.
 */
export const maintainClosureOnDelete = (db: Database, node: NodeRef): void => {
  // Collect all descendants first (before any deletions modify the table).
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS _del_subtree (mx INTEGER, row INTEGER, PRIMARY KEY (mx, row))
  `)
  db.exec('DELETE FROM _del_subtree')
  db.exec('INSERT INTO _del_subtree VALUES (?, ?)', {
    bind: [node.matrixId, node.rowId],
  })
  db.exec(
    `INSERT OR IGNORE INTO _del_subtree (mx, row)
     SELECT descendant_matrix_id, descendant_row_id FROM closure
     WHERE ancestor_matrix_id = ? AND ancestor_row_id = ?`,
    { bind: [node.matrixId, node.rowId] },
  )

  // Remove all closure rows where any subtree member is ancestor or descendant.
  db.exec(`
    DELETE FROM closure
    WHERE (ancestor_matrix_id, ancestor_row_id) IN (SELECT mx, row FROM _del_subtree)
       OR (descendant_matrix_id, descendant_row_id) IN (SELECT mx, row FROM _del_subtree)
  `)

  db.exec('DROP TABLE IF EXISTS _del_subtree')
}

/**
 * Remove all closure rows involving a specific node (both as ancestor and
 * descendant). Used when removing a single node whose children are promoted.
 */
export const removeNodeFromClosure = (db: Database, node: NodeRef): void => {
  db.exec(
    `DELETE FROM closure
     WHERE (descendant_matrix_id = ? AND descendant_row_id = ?)
        OR (ancestor_matrix_id = ? AND ancestor_row_id = ?)`,
    { bind: [node.matrixId, node.rowId, node.matrixId, node.rowId] },
  )
}

// -- Queries ------------------------------------------------------------------

/** Get the depth of a node (max depth in closure = distance from its highest ancestor). */
export const getDepth = (db: Database, node: NodeRef): number => {
  const stmt = db.prepare(
    `SELECT MAX(depth) AS max_depth FROM closure
     WHERE descendant_matrix_id = ? AND descendant_row_id = ?`,
  )
  stmt.bind([node.matrixId, node.rowId])
  let depth = 0
  if (stmt.step()) {
    const row = stmt.get({}) as { max_depth: number | null }
    depth = row.max_depth ?? 0
  }
  stmt.finalize()
  return depth
}

/** Get all ancestors of a node, ordered from closest (depth 1) to farthest. */
export const getAncestors = (db: Database, node: NodeRef): (NodeRef & { depth: number })[] => {
  const stmt = db.prepare(
    `SELECT ancestor_matrix_id, ancestor_row_id, depth FROM closure
     WHERE descendant_matrix_id = ? AND descendant_row_id = ?
     ORDER BY depth`,
  )
  stmt.bind([node.matrixId, node.rowId])
  const result: (NodeRef & { depth: number })[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as {
      ancestor_matrix_id: number
      ancestor_row_id: number
      depth: number
    }
    result.push({
      matrixId: row.ancestor_matrix_id,
      rowId: row.ancestor_row_id,
      depth: row.depth,
    })
  }
  stmt.finalize()
  return result
}

/** Get all descendants of a node. */
export const getDescendants = (db: Database, node: NodeRef): NodeRef[] => {
  const stmt = db.prepare(
    `SELECT descendant_matrix_id, descendant_row_id FROM closure
     WHERE ancestor_matrix_id = ? AND ancestor_row_id = ?`,
  )
  stmt.bind([node.matrixId, node.rowId])
  const result: NodeRef[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as {
      descendant_matrix_id: number
      descendant_row_id: number
    }
    result.push({ matrixId: row.descendant_matrix_id, rowId: row.descendant_row_id })
  }
  stmt.finalize()
  return result
}

/** Check if `ancestor` is an ancestor of `descendant` in the closure. */
export const isAncestor = (db: Database, ancestor: NodeRef, descendant: NodeRef): boolean => {
  const stmt = db.prepare(
    `SELECT 1 FROM closure
     WHERE ancestor_matrix_id = ? AND ancestor_row_id = ?
       AND descendant_matrix_id = ? AND descendant_row_id = ?
     LIMIT 1`,
  )
  stmt.bind([ancestor.matrixId, ancestor.rowId, descendant.matrixId, descendant.rowId])
  const found = stmt.step()
  stmt.finalize()
  return found
}
