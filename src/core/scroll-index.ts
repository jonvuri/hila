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
//
// MULTI-LOCATION (Phase 9.7a): position is plural. The index is the pre-order
// flattening of the *position graph* = own-edges ∪ portal-edges. A row appears
// once per distinct root→row path; each appearance carries its own
// global_lexkey (the concatenation of the own- OR portal- edge_keys along that
// path). Ownership stays single (the one `own`-edge in `joins`); the recursive
// walks below therefore follow `kind IN ('own','portal')` so a portal -- and a
// portal nested inside a portaled subtree -- expands. Maintenance under a node
// fans out over every appearance of it (`positionsOf`).

/** Recursion backstop for the position-graph walk (mirrors MAX_CASCADE_DEPTH). */
export const MAX_POSITION_DEPTH = 100

/**
 * Per-portal materialization cap before falling back to a single `lazy` marker.
 * A documented safety-valve lever, NOT a v1 policy -- v1 ships uncapped (cycle
 * detection only); the crossovers sit well above realistic usage (Phase 9.7a
 * §3.1). Portal ops pass this default; it effectively never bites.
 */
export const DEFAULT_PORTAL_CAP = 2000

/**
 * Fully rebuild the scroll index from own-edges. Used after remote sync
 * applies, after structural edits, and as a repair tool.
 */
export const rebuildScrollIndex = (db: Database): void => {
  db.exec('DELETE FROM scroll_index')
  db.exec(`
    INSERT INTO scroll_index (global_lexkey, matrix_id, row_id, depth)
    WITH RECURSIVE preorder(mx, row, gkey, depth) AS (
      -- Root-level: direct children of the sentinel (only own-edges: the
      -- sentinel is never a portal host)
      SELECT j.target_matrix_id, j.target_row_id, j.edge_key, 0
      FROM joins j
      WHERE j.kind = 'own'
        AND j.source_matrix_id = ${ROOT_MATRIX_ID}
        AND j.source_row_id = ${ROOT_ROW_ID}
      UNION ALL
      -- Recursive: extend each node with its position-children (own + portal),
      -- so portal appearances (and portals nested inside them) materialize too.
      SELECT j.target_matrix_id, j.target_row_id,
             unhex(hex(p.gkey) || hex(j.edge_key)),
             p.depth + 1
      FROM joins j
      JOIN preorder p ON j.source_matrix_id = p.mx AND j.source_row_id = p.row
      WHERE j.kind IN ('own','portal') AND p.depth < ${MAX_POSITION_DEPTH}
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

  // Re-insert the subtree via recursive CTE from this node. Walk the position
  // graph (own + portal) so nested portal appearances re-materialize too.
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
       WHERE j.kind IN ('own','portal') AND sub.depth < ${MAX_POSITION_DEPTH}
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

/**
 * Move a subtree's entries from their current position to a new position.
 * Used by reparent to avoid a full O(forest) rebuild.
 *
 * Returns the old and new key ranges for dirty-set computation.
 */
export const moveSubtreeInScrollIndex = (
  db: Database,
  node: { matrixId: number; rowId: number },
  newParentGlobalKey: Uint8Array | null,
  newEdgeKey: Uint8Array,
  newParentDepth: number,
): {
  oldRange: [Uint8Array, Uint8Array | null]
  newRange: [Uint8Array, Uint8Array | null]
} | null => {
  // 1. Look up old global_lexkey
  const oldKey = getGlobalKey(db, node.matrixId, node.rowId)
  if (!oldKey) return null

  // 2. Delete old subtree entries
  const oldNext = incrementPrefix(oldKey)
  if (oldNext) {
    db.exec('DELETE FROM scroll_index WHERE global_lexkey >= ? AND global_lexkey < ?', {
      bind: [oldKey, oldNext],
    })
  } else {
    db.exec('DELETE FROM scroll_index WHERE global_lexkey >= ?', { bind: [oldKey] })
  }

  // 3. Compute new root key
  const newRootKey =
    newParentGlobalKey ? concatBytes(newParentGlobalKey, newEdgeKey) : newEdgeKey
  const newDepth = newParentDepth + 1

  // 4. Re-insert the subtree via recursive CTE. Walk the position graph
  //    (own + portal) so a moved subtree containing nested portals re-expands.
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
       WHERE j.kind IN ('own','portal') AND sub.depth < ${MAX_POSITION_DEPTH}
     )
     SELECT gkey, mx, row, depth FROM sub`,
    { bind: [node.matrixId, node.rowId, newRootKey, newDepth] },
  )

  // Compute the new upper bound
  const newNext = incrementPrefix(newRootKey)

  return {
    oldRange: [oldKey, oldNext ?? null],
    newRange: [newRootKey, newNext ?? null],
  }
}

// -- Multi-location maintenance (Phase 9.7a) ----------------------------------

export type ScrollNode = { matrixId: number; rowId: number }

const isSentinelNode = (n: ScrollNode): boolean =>
  n.matrixId === ROOT_MATRIX_ID && n.rowId === ROOT_ROW_ID

/** Every appearance of a node: its (key, depth) rows in the scroll index. */
export const positionsOf = (
  db: Database,
  node: ScrollNode,
): { key: Uint8Array; depth: number }[] => {
  const stmt = db.prepare(
    'SELECT global_lexkey, depth FROM scroll_index WHERE matrix_id = ? AND row_id = ?',
  )
  stmt.bind([node.matrixId, node.rowId])
  const out: { key: Uint8Array; depth: number }[] = []
  while (stmt.step()) {
    const r = stmt.get({}) as { global_lexkey: Uint8Array; depth: number }
    out.push({ key: new Uint8Array(r.global_lexkey), depth: r.depth })
  }
  stmt.finalize()
  return out
}

/**
 * Count the position-subtree of `node` (root→row paths, = entries a full
 * materialization would emit), short-circuited at `limit`. Bounded by the depth
 * guard. Feeds the cap check in `materializeSubtreeAtPrefix`.
 */
const positionSubtreeSize = (db: Database, node: ScrollNode, limit: number): number => {
  const stmt = db.prepare(
    `SELECT COUNT(*) AS n FROM (
       WITH RECURSIVE sub(mx, row, plen) AS (
         SELECT ?, ?, 0
         UNION ALL
         SELECT j.target_matrix_id, j.target_row_id, sub.plen + 1
         FROM joins j JOIN sub ON j.source_matrix_id = sub.mx AND j.source_row_id = sub.row
         WHERE j.kind IN ('own','portal') AND sub.plen < ?
       )
       SELECT 1 FROM sub LIMIT ?
     )`,
  )
  stmt.bind([node.matrixId, node.rowId, MAX_POSITION_DEPTH, limit])
  stmt.step()
  const n = (stmt.get({}) as { n: number }).n
  stmt.finalize()
  return n
}

/**
 * Materialize `node`'s position-subtree into the scroll index rooted at
 * `prefix` (with `baseDepth` for `node` itself). The recursive walk follows
 * own- AND portal-edges, so a portal nested inside the subtree expands too.
 *
 * v1 ships uncapped -- cycle detection is enforced at edge creation
 * (`isPositionDescendantOrSelf` in `portal.ts`), and the DAG stays acyclic so
 * the walk always terminates under the depth guard. The `cap` + single `lazy`
 * marker is a documented lever, kept but off (Phase 9.7a §3.1). Returns the
 * number of scroll_index rows written.
 */
export const materializeSubtreeAtPrefix = (
  db: Database,
  node: ScrollNode,
  prefix: Uint8Array,
  baseDepth: number,
  cap: number = DEFAULT_PORTAL_CAP,
): number => {
  if (positionSubtreeSize(db, node, cap + 1) > cap) {
    db.exec(
      `INSERT INTO scroll_index (global_lexkey, matrix_id, row_id, depth, is_ghost, lazy)
       VALUES (?, ?, ?, ?, 0, 1)`,
      { bind: [prefix, node.matrixId, node.rowId, baseDepth] },
    )
    return 1
  }

  db.exec(
    `INSERT INTO scroll_index (global_lexkey, matrix_id, row_id, depth, is_ghost, lazy)
     WITH RECURSIVE sub(mx, row, gkey, depth, plen) AS (
       SELECT ?, ?, ?, ?, 0
       UNION ALL
       SELECT j.target_matrix_id, j.target_row_id,
              unhex(hex(sub.gkey) || hex(j.edge_key)),
              sub.depth + 1, sub.plen + 1
       FROM joins j JOIN sub ON j.source_matrix_id = sub.mx AND j.source_row_id = sub.row
       WHERE j.kind IN ('own','portal') AND sub.plen < ?
     )
     SELECT gkey, mx, row, depth, 0, 0 FROM sub`,
    { bind: [node.matrixId, node.rowId, prefix, baseDepth, MAX_POSITION_DEPTH] },
  )
  return positionSubtreeSize(db, node, cap + 1)
}

/**
 * Add a freshly-attached own-child `node` (its own-edge `edgeKey` under
 * `parent` already inserted) to the scroll index at EVERY appearance of
 * `parent`. For a plain own-forest parent (single appearance) this writes one
 * entry; under a portaled parent it fans out to `appearances(parent)` entries
 * -- the write-amplification path.
 *
 * The node is freshly attached and therefore childless, so each appearance is a
 * single row -- inserted directly, NOT via the recursive `materializeSubtree`
 * walk (which would make forest-building O(n²) by re-counting the growing
 * subtree on every insert). Portal ops materialize existing subtrees; this hot
 * insert path does not.
 */
export const addOwnChildToScrollIndexAtAllPositions = (
  db: Database,
  parent: ScrollNode,
  node: ScrollNode,
  edgeKey: Uint8Array,
): void => {
  const insertAt = (key: Uint8Array, depth: number): void => {
    db.exec(
      `INSERT OR REPLACE INTO scroll_index (global_lexkey, matrix_id, row_id, depth, is_ghost, lazy)
       VALUES (?, ?, ?, ?, 0, 0)`,
      { bind: [key, node.matrixId, node.rowId, depth] },
    )
  }

  if (isSentinelNode(parent)) {
    insertAt(edgeKey, 0)
    return
  }
  for (const pos of positionsOf(db, parent)) {
    insertAt(concatBytes(pos.key, edgeKey), pos.depth + 1)
  }
}

/**
 * Delete every scroll_index entry in the subtree range [prefix, nextPrefix) --
 * i.e. an appearance and everything materialized under it.
 */
export const deleteScrollSubtreeRange = (db: Database, prefix: Uint8Array): void => {
  const next = incrementPrefix(prefix)
  if (next) {
    db.exec('DELETE FROM scroll_index WHERE global_lexkey >= ? AND global_lexkey < ?', {
      bind: [prefix, next],
    })
  } else {
    db.exec('DELETE FROM scroll_index WHERE global_lexkey >= ?', { bind: [prefix] })
  }
}

/**
 * Insert a single `is_ghost` tombstone at `prefix`: the surviving position of a
 * portal appearance whose home was deleted (the structural-portal ghost).
 */
export const insertGhostMarker = (
  db: Database,
  node: ScrollNode,
  prefix: Uint8Array,
  depth: number,
): void => {
  db.exec(
    `INSERT INTO scroll_index (global_lexkey, matrix_id, row_id, depth, is_ghost, lazy)
     VALUES (?, ?, ?, ?, 1, 0)`,
    { bind: [prefix, node.matrixId, node.rowId, depth] },
  )
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
