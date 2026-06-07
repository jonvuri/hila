import type { Database } from '@sqlite.org/sqlite-wasm'

import { ROOT_MATRIX_ID, ROOT_ROW_ID } from './ids'

// -- Global pre-order scroll index --------------------------------------------
//
// A materialized pre-order index where `global_lexkey` is the path of sibling
// edge_keys from the root sentinel down to the node (root→node concatenation).
// Pre-order: a parent immediately precedes its first child; a subtree is a
// contiguous range.
//
// The windowed outline scroll is a single keyset range scan:
//   `WHERE global_lexkey > $cursor ORDER BY global_lexkey LIMIT ~500`
//
// Collapse/expand is handled at query time by excluding contiguous key ranges
// (the collapsed subtree). The index carries no visibility state.

/**
 * Fully rebuild the scroll index from own-edges. Used after remote sync
 * applies, after structural edits, and as a repair tool.
 */
export const rebuildScrollIndex = (db: Database): void => {
  db.exec('DELETE FROM scroll_index')
  db.exec(`
    INSERT INTO scroll_index (global_lexkey, matrix_id, row_id, depth)
    WITH RECURSIVE preorder(mx, row, gkey, depth) AS (
      -- Root-level: direct children of the sentinel
      SELECT j.target_matrix_id, j.target_row_id, j.edge_key, 0
      FROM joins j
      WHERE j.kind = 'own'
        AND j.source_matrix_id = ${ROOT_MATRIX_ID}
        AND j.source_row_id = ${ROOT_ROW_ID}
      UNION ALL
      -- Recursive: for each node, extend with its own-children
      SELECT j.target_matrix_id, j.target_row_id,
             unhex(hex(p.gkey) || hex(j.edge_key)),
             p.depth + 1
      FROM joins j
      JOIN preorder p ON j.source_matrix_id = p.mx AND j.source_row_id = p.row
      WHERE j.kind = 'own'
    )
    SELECT gkey, mx, row, depth FROM preorder
  `)
}

/**
 * Rebuild the scroll index for a specific subtree rooted at `node`. Removes
 * all scroll_index entries for the subtree and re-derives them.
 *
 * The subtree's global_lexkey prefix is the parent prefix + node's edge_key.
 * All entries with that prefix are removed and re-inserted.
 */
export const rebuildSubtreeScrollIndex = (
  db: Database,
  subtreeRootMatrixId: number,
  subtreeRootRowId: number,
): void => {
  // Look up the current global_lexkey of the subtree root
  const rootKeyStmt = db.prepare(
    'SELECT global_lexkey FROM scroll_index WHERE matrix_id = ? AND row_id = ?',
  )
  rootKeyStmt.bind([subtreeRootMatrixId, subtreeRootRowId])
  let rootKey: Uint8Array | null = null
  if (rootKeyStmt.step()) {
    rootKey = new Uint8Array(
      (rootKeyStmt.get({}) as { global_lexkey: Uint8Array }).global_lexkey,
    )
  }
  rootKeyStmt.finalize()

  if (!rootKey) return

  // Delete the subtree root and all entries with that prefix
  const nextPrefix = incrementPrefix(rootKey)
  if (nextPrefix) {
    db.exec('DELETE FROM scroll_index WHERE global_lexkey >= ? AND global_lexkey < ?', {
      bind: [rootKey, nextPrefix],
    })
  } else {
    db.exec('DELETE FROM scroll_index WHERE global_lexkey >= ?', { bind: [rootKey] })
  }

  // Look up the root's depth from its parent's scroll index entry (or 0 if at root)
  const parentStmt = db.prepare(
    `SELECT s.depth FROM scroll_index s
     JOIN joins j ON j.source_matrix_id = s.matrix_id AND j.source_row_id = s.row_id
     WHERE j.target_matrix_id = ? AND j.target_row_id = ? AND j.kind = 'own'`,
  )
  parentStmt.bind([subtreeRootMatrixId, subtreeRootRowId])
  let parentDepth = -1
  if (parentStmt.step()) {
    parentDepth = (parentStmt.get({}) as { depth: number }).depth
  }
  parentStmt.finalize()

  const rootDepth = parentDepth + 1

  // Re-insert the subtree via recursive CTE from this node
  db.exec(
    `INSERT OR REPLACE INTO scroll_index (global_lexkey, matrix_id, row_id, depth)
     WITH RECURSIVE sub(mx, row, gkey, depth) AS (
       SELECT ?, ?, ?, ?
       UNION ALL
       SELECT j.target_matrix_id, j.target_row_id,
              unhex(hex(sub.gkey) || hex(j.edge_key)),
              sub.depth + 1
       FROM joins j
       JOIN sub ON j.source_matrix_id = sub.mx AND j.source_row_id = sub.row
       WHERE j.kind = 'own'
     )
     SELECT gkey, mx, row, depth FROM sub`,
    { bind: [subtreeRootMatrixId, subtreeRootRowId, rootKey, rootDepth] },
  )
}

/**
 * After inserting a single node, add it to the scroll index.
 * The node's global_lexkey = parent's global_lexkey + node's edge_key.
 */
export const addToScrollIndex = (
  db: Database,
  node: { matrixId: number; rowId: number },
  parentGlobalKey: Uint8Array | null,
  edgeKey: Uint8Array,
  depth: number,
): void => {
  const globalKey = parentGlobalKey ? concatBytes(parentGlobalKey, edgeKey) : edgeKey
  db.exec(
    'INSERT OR REPLACE INTO scroll_index (global_lexkey, matrix_id, row_id, depth) VALUES (?, ?, ?, ?)',
    { bind: [globalKey, node.matrixId, node.rowId, depth] },
  )
}

/**
 * Remove a single node from the scroll index.
 */
export const removeFromScrollIndex = (db: Database, matrixId: number, rowId: number): void => {
  db.exec('DELETE FROM scroll_index WHERE matrix_id = ? AND row_id = ?', {
    bind: [matrixId, rowId],
  })
}

/**
 * Get the global_lexkey for a node from the scroll index.
 */
export const getGlobalKey = (
  db: Database,
  matrixId: number,
  rowId: number,
): Uint8Array | null => {
  const stmt = db.prepare(
    'SELECT global_lexkey FROM scroll_index WHERE matrix_id = ? AND row_id = ?',
  )
  stmt.bind([matrixId, rowId])
  let key: Uint8Array | null = null
  if (stmt.step()) {
    key = new Uint8Array((stmt.get({}) as { global_lexkey: Uint8Array }).global_lexkey)
  }
  stmt.finalize()
  return key
}

/**
 * Get the parent's global key (the key of the node's own-parent in the
 * scroll index). Returns null for root-level nodes.
 */
export const getParentGlobalKey = (
  db: Database,
  matrixId: number,
  rowId: number,
): Uint8Array | null => {
  const stmt = db.prepare(
    `SELECT s.global_lexkey FROM scroll_index s
     JOIN joins j ON s.matrix_id = j.source_matrix_id AND s.row_id = j.source_row_id
     WHERE j.target_matrix_id = ? AND j.target_row_id = ? AND j.kind = 'own'
       AND NOT (j.source_matrix_id = ${ROOT_MATRIX_ID} AND j.source_row_id = ${ROOT_ROW_ID})`,
  )
  stmt.bind([matrixId, rowId])
  let key: Uint8Array | null = null
  if (stmt.step()) {
    key = new Uint8Array((stmt.get({}) as { global_lexkey: Uint8Array }).global_lexkey)
  }
  stmt.finalize()
  return key
}

// -- Helpers ------------------------------------------------------------------

const concatBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/**
 * Compute the "next prefix" for range queries: the smallest key that is
 * NOT a prefix-descendant of the input. Used for subtree range deletes
 * (`global_lexkey >= root AND global_lexkey < nextPrefix`).
 *
 * Returns null if there is no next prefix (key is all 0xFF).
 */
const incrementPrefix = (key: Uint8Array): Uint8Array | null => {
  const buf = new Uint8Array(key)
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i]! < 0xff) {
      buf[i]!++
      return buf.slice(0, i + 1)
    }
  }
  return null
}
