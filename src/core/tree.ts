import type { Database } from '@sqlite.org/sqlite-wasm'

import { ROOT_MATRIX_ID, ROOT_ROW_ID } from './ids'
import { between, makeKey, parseKey } from './lexorank'
import { withTransaction } from './transaction'

// -- The own-forest -----------------------------------------------------------
//
// Hierarchy lives entirely in `own`-edges of the global `joins` table: an
// own-edge points parent (source) -> child (target) and carries the child's
// sibling-local lexorank `edge_key` (its order among the rows sharing that
// own-parent). There is NO prefix encoding of hierarchy in the key anymore --
// the edge is the hierarchy; the key only orders siblings. Moving a subtree is
// therefore a single edge re-point and leaves every descendant's edge_key
// untouched.
//
// Every row has exactly one inbound own-edge; the forest roots attach to the
// reserved sentinel (ROOT_MATRIX_ID, ROOT_ROW_ID).

export type NodeRef = { matrixId: number; rowId: number }

const EMPTY = new Uint8Array(0)

const sentinel = (parent?: NodeRef): NodeRef =>
  parent ?? { matrixId: ROOT_MATRIX_ID, rowId: ROOT_ROW_ID }

// -- Sibling-key computation --------------------------------------------------

/** Last (highest) child edge_key under a parent, or null if it has no children. */
const lastChildKey = (db: Database, parent: NodeRef): Uint8Array | null => {
  const stmt = db.prepare(
    `SELECT edge_key FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ? AND kind = 'own'
     ORDER BY edge_key DESC LIMIT 1`,
  )
  stmt.bind([parent.matrixId, parent.rowId])
  let key: Uint8Array | null = null
  if (stmt.step()) key = new Uint8Array((stmt.get({}) as { edge_key: Uint8Array }).edge_key)
  stmt.finalize()
  return key
}

/** Sibling edge_key immediately after `prev` under a parent, or null. */
const childKeyAfter = (
  db: Database,
  parent: NodeRef,
  prev: Uint8Array,
  exclude?: NodeRef,
): Uint8Array | null => {
  const stmt = db.prepare(
    `SELECT edge_key FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ? AND kind = 'own'
       AND edge_key > ?
       AND NOT (target_matrix_id = ? AND target_row_id = ?)
     ORDER BY edge_key ASC LIMIT 1`,
  )
  stmt.bind([
    parent.matrixId,
    parent.rowId,
    prev,
    exclude?.matrixId ?? -1,
    exclude?.rowId ?? -1,
  ])
  let key: Uint8Array | null = null
  if (stmt.step()) key = new Uint8Array((stmt.get({}) as { edge_key: Uint8Array }).edge_key)
  stmt.finalize()
  return key
}

/** Sibling edge_key immediately before `next` under a parent, or null. */
const childKeyBefore = (
  db: Database,
  parent: NodeRef,
  next: Uint8Array,
  exclude?: NodeRef,
): Uint8Array | null => {
  const stmt = db.prepare(
    `SELECT edge_key FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ? AND kind = 'own'
       AND edge_key < ?
       AND NOT (target_matrix_id = ? AND target_row_id = ?)
     ORDER BY edge_key DESC LIMIT 1`,
  )
  stmt.bind([
    parent.matrixId,
    parent.rowId,
    next,
    exclude?.matrixId ?? -1,
    exclude?.rowId ?? -1,
  ])
  let key: Uint8Array | null = null
  if (stmt.step()) key = new Uint8Array((stmt.get({}) as { edge_key: Uint8Array }).edge_key)
  stmt.finalize()
  return key
}

/**
 * Compute a child's sibling-local key under `parent`. This is a plain
 * `between` scoped to that parent's children -- no cross-partition global
 * bounds. Resolves the missing neighbor from the surrounding siblings when only
 * one of prev/next is supplied (and appends at the end when neither is).
 */
export const computeSiblingKey = (
  db: Database,
  parent: NodeRef,
  positioning?: {
    prevSiblingKey?: Uint8Array
    nextSiblingKey?: Uint8Array
    exclude?: NodeRef
  },
): Uint8Array => {
  let prev = positioning?.prevSiblingKey
  let next = positioning?.nextSiblingKey
  const exclude = positioning?.exclude

  if (prev && !next) {
    next = childKeyAfter(db, parent, prev, exclude) ?? undefined
  } else if (!prev && next) {
    prev = childKeyBefore(db, parent, next, exclude) ?? undefined
  } else if (!prev && !next) {
    prev = lastChildKey(db, parent) ?? undefined
  }

  return between(prev ?? EMPTY, next ?? EMPTY)
}

// -- Edge accessors -----------------------------------------------------------

/** The inbound own-edge of a node: its parent + its sibling key, or null. */
export const getOwnEdge = (
  db: Database,
  matrixId: number,
  rowId: number,
): { parent: NodeRef; edgeKey: Uint8Array } | null => {
  const stmt = db.prepare(
    `SELECT source_matrix_id, source_row_id, edge_key FROM joins
     WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'own' LIMIT 1`,
  )
  stmt.bind([matrixId, rowId])
  let result: { parent: NodeRef; edgeKey: Uint8Array } | null = null
  if (stmt.step()) {
    const row = stmt.get({}) as {
      source_matrix_id: number
      source_row_id: number
      edge_key: Uint8Array
    }
    result = {
      parent: { matrixId: row.source_matrix_id, rowId: row.source_row_id },
      edgeKey: new Uint8Array(row.edge_key),
    }
  }
  stmt.finalize()
  return result
}

/** Direct own-children of a node, in sibling order. */
export const getOwnChildren = (db: Database, parent: NodeRef): NodeRef[] => {
  const stmt = db.prepare(
    `SELECT target_matrix_id, target_row_id FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ? AND kind = 'own'
     ORDER BY edge_key`,
  )
  stmt.bind([parent.matrixId, parent.rowId])
  const children: NodeRef[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as { target_matrix_id: number; target_row_id: number }
    children.push({ matrixId: row.target_matrix_id, rowId: row.target_row_id })
  }
  stmt.finalize()
  return children
}

/**
 * True if `candidate` is `node` itself or one of its own-descendants. Used as
 * the reparent cycle guard: re-pointing a node under its own descendant would
 * create a cycle. Walks the own-edge graph with a recursive CTE.
 */
export const isOwnDescendantOrSelf = (
  db: Database,
  node: NodeRef,
  candidate: NodeRef,
): boolean => {
  const stmt = db.prepare(
    `WITH RECURSIVE subtree(mx, row) AS (
       SELECT ?, ?
       UNION
       SELECT j.target_matrix_id, j.target_row_id FROM joins j
       JOIN subtree s ON j.source_matrix_id = s.mx AND j.source_row_id = s.row
       WHERE j.kind = 'own'
     )
     SELECT 1 FROM subtree WHERE mx = ? AND row = ? LIMIT 1`,
  )
  stmt.bind([node.matrixId, node.rowId, candidate.matrixId, candidate.rowId])
  const found = stmt.step()
  stmt.finalize()
  return found
}

// -- Structural ops -----------------------------------------------------------

/**
 * Attach an existing data row to the own-forest by creating its inbound
 * own-edge under `parent` (defaulting to the root sentinel), with a
 * sibling-local key derived from the surrounding siblings.
 *
 * Does NOT create the data row itself. Returns the new edge_key.
 */
export const createTreePosition = (
  db: Database,
  matrixId: number,
  rowId: number,
  positioning?: {
    parent?: NodeRef
    prevSiblingKey?: Uint8Array
    nextSiblingKey?: Uint8Array
  },
): Uint8Array => {
  const parent = sentinel(positioning?.parent)
  const edgeKey = computeSiblingKey(db, parent, {
    prevSiblingKey: positioning?.prevSiblingKey,
    nextSiblingKey: positioning?.nextSiblingKey,
  })

  db.exec(
    `INSERT INTO joins
       (source_matrix_id, source_row_id, target_matrix_id, target_row_id, kind, edge_key)
     VALUES (?, ?, ?, ?, 'own', ?)`,
    { bind: [parent.matrixId, parent.rowId, matrixId, rowId, edgeKey] },
  )

  return edgeKey
}

/**
 * Move a node to a new parent/position. A single edge re-point: the node's
 * inbound own-edge is updated to the new parent and assigned a fresh sibling
 * key. Descendants are untouched (their own-edges and keys are unchanged --
 * hierarchy is not encoded in the key). Intra- and cross-matrix moves are
 * identical.
 *
 * Returns the node's new edge_key.
 */
export const reparentRow = (
  db: Database,
  params: {
    matrixId: number
    rowId: number
    newParent?: NodeRef
    prevSiblingKey?: Uint8Array
    nextSiblingKey?: Uint8Array
  },
): Uint8Array => {
  const { matrixId, rowId, newParent, prevSiblingKey, nextSiblingKey } = params

  return withTransaction(db, () => {
    const parent = sentinel(newParent)
    const node: NodeRef = { matrixId, rowId }

    // Cycle guard: never re-point a node under itself or its own-descendant.
    // (The sentinel can never be a descendant, so root moves are always fine.)
    if (
      (parent.matrixId !== ROOT_MATRIX_ID || parent.rowId !== ROOT_ROW_ID) &&
      isOwnDescendantOrSelf(db, node, parent)
    ) {
      throw new Error('Cannot reparent a node under one of its own descendants')
    }

    const edgeKey = computeSiblingKey(db, parent, {
      prevSiblingKey,
      nextSiblingKey,
      exclude: node,
    })

    db.exec(
      `UPDATE joins
         SET source_matrix_id = ?, source_row_id = ?, edge_key = ?
       WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'own'`,
      { bind: [parent.matrixId, parent.rowId, edgeKey, matrixId, rowId] },
    )

    return edgeKey
  })
}

/**
 * Remove a single node from the own-forest, promoting its same-matrix
 * own-children to the node's own-parent (preserving their relative order). The
 * node's inbound and outbound own-edges are severed.
 *
 * Cross-matrix owned children (e.g. tag aspect rows) are NOT promoted here --
 * the caller (`deleteRow`) cascade-deletes those. Does NOT delete the data row.
 */
export const removeTreePosition = (db: Database, matrixId: number, rowId: number): void => {
  const node: NodeRef = { matrixId, rowId }
  const edge = getOwnEdge(db, matrixId, rowId)
  const grandparent = edge ? edge.parent : sentinel()

  // Promote same-matrix own-children into the deleted node's slot among the
  // grandparent's children (preserving outline order even when the node has
  // following siblings). Seeding `prevSiblingKey` with the node's own edge key
  // places the first promoted child immediately after the node's position; the
  // node's own-edge is still present here, so `between` lands the children
  // before the node's next sibling. Subsequent children chain after.
  const children = getOwnChildren(db, node).filter((c) => c.matrixId === matrixId)
  let prevSiblingKey: Uint8Array | undefined = edge?.edgeKey
  for (const child of children) {
    prevSiblingKey = reparentRow(db, {
      matrixId: child.matrixId,
      rowId: child.rowId,
      newParent: grandparent,
      prevSiblingKey,
    })
  }

  // Sever the node's own-edges (inbound + any remaining outbound).
  db.exec(
    `DELETE FROM joins
     WHERE kind = 'own'
       AND ((source_matrix_id = ? AND source_row_id = ?)
         OR (target_matrix_id = ? AND target_row_id = ?))`,
    { bind: [matrixId, rowId, matrixId, rowId] },
  )
}

/** Collect a node and all of its own-descendants (any matrix). */
export const collectOwnSubtree = (db: Database, matrixId: number, rowId: number): NodeRef[] => {
  const stmt = db.prepare(
    `WITH RECURSIVE subtree(mx, row) AS (
       SELECT ?, ?
       UNION
       SELECT j.target_matrix_id, j.target_row_id FROM joins j
       JOIN subtree s ON j.source_matrix_id = s.mx AND j.source_row_id = s.row
       WHERE j.kind = 'own'
     )
     SELECT mx, row FROM subtree`,
  )
  stmt.bind([matrixId, rowId])
  const nodes: NodeRef[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as { mx: number; row: number }
    nodes.push({ matrixId: row.mx, rowId: row.row })
  }
  stmt.finalize()
  return nodes
}

/**
 * Delete a node and all of its own-descendants: removes their data rows and all
 * joins (own + ref) touching any subtree node. Converges with cascade deletion
 * (the unified own-descendant walk lands in Phase 8b).
 */
export const deleteSubtree = (
  db: Database,
  params: { matrixId: number; rowId: number },
): void => {
  const { matrixId, rowId } = params

  withTransaction(db, () => {
    const nodes = collectOwnSubtree(db, matrixId, rowId)

    for (const node of nodes) {
      db.exec(`DELETE FROM "mx_${node.matrixId}_data" WHERE id = ?`, { bind: [node.rowId] })
      db.exec(
        `DELETE FROM joins
         WHERE (source_matrix_id = ? AND source_row_id = ?)
            OR (target_matrix_id = ? AND target_row_id = ?)`,
        { bind: [node.matrixId, node.rowId, node.matrixId, node.rowId] },
      )
    }
  })
}

// -- Derived global key <-> identity bridge -----------------------------------
//
// The "global key" (gkey) is the pre-order key a row would have if hierarchy
// were prefix-encoded: the concatenation of the edge keys along the own-edge
// path from the sentinel down to the node. It is NOT stored -- the read layer
// derives it via a recursive CTE (Phase 8b materializes it as a scroll index).
// These helpers let the worker keep its existing key-based message protocol by
// translating gkeys to/from the edge identities the structural ops operate on.

/** Concatenate two key byte-strings (parent gkey + child edge key -> child gkey). */
export const concatKeys = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/** The node's own sibling edge key = the last segment of its global key. */
export const edgeKeyOfGlobalKey = (gkey: Uint8Array): Uint8Array | undefined => {
  const segments = parseKey(gkey)
  if (segments.length === 0) return undefined
  return makeKey([segments[segments.length - 1]!])
}

/**
 * Resolve a derived global key to a node identity by walking the own-edge path
 * from the sentinel, matching each segment against the sibling edge keys.
 * Returns null if the path does not resolve (e.g. a stale key after a move).
 */
export const resolveNodeByGlobalKey = (db: Database, gkey: Uint8Array): NodeRef | null => {
  let cur: NodeRef = { matrixId: ROOT_MATRIX_ID, rowId: ROOT_ROW_ID }
  const stmt = db.prepare(
    `SELECT target_matrix_id, target_row_id FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ? AND kind = 'own' AND edge_key = ? LIMIT 1`,
  )
  try {
    for (const segment of parseKey(gkey)) {
      const edgeKey = makeKey([segment])
      stmt.bind([cur.matrixId, cur.rowId, edgeKey])
      if (!stmt.step()) return null
      const row = stmt.get({}) as { target_matrix_id: number; target_row_id: number }
      cur = { matrixId: row.target_matrix_id, rowId: row.target_row_id }
      stmt.reset()
    }
  } finally {
    stmt.finalize()
  }
  return cur
}
