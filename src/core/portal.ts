import type { Database } from '@sqlite.org/sqlite-wasm'

import { maintainClosureOnDelete } from './closure'
import { ROOT_MATRIX_ID, ROOT_ROW_ID } from './ids'
import { makeKey, nextPrefix, parseKey } from './lexorank'
import {
  DEFAULT_PORTAL_CAP,
  MAX_POSITION_DEPTH,
  deleteScrollSubtreeRange,
  insertGhostMarker,
  materializeSubtreeAtPrefix,
  positionsOf,
} from './scroll-index'
import {
  collectOwnSubtree,
  computeSiblingKey,
  getOwnEdge,
  reparentRow,
  type NodeRef,
} from './tree'
import { withTransaction } from './transaction'

// -- Portals (Phase 9.7a): position without ownership -------------------------
//
// A portal is an opt-in extra *position* of a single-owned row -- a `joins` row
// with `kind='portal'` and a sibling `edge_key`. Ownership stays single (the one
// `own`-edge in `joins`); the `joins_single_owner` unique index is partial on
// kind='own', so a portal-edge into an already-owned row never collides. Portals
// are **deep** by default (a portal transcludes the node AND its owned subtree),
// materialized as ordinary `scroll_index` rows so the windowed read path is
// unchanged (one keyset range). v1 ships deep with cycle detection only, no cap
// (Phase 9.7a §3.1); the lazy/cap lever lives in `scroll-index.ts`, off.
//
// The firewall: a portal is position-only, never a second owner. Single-owner
// lifecycle/cascade reads only `kind='own'` and never sees a portal edge.

const EMPTY = new Uint8Array(0)

const isSentinel = (n: NodeRef): boolean =>
  n.matrixId === ROOT_MATRIX_ID && n.rowId === ROOT_ROW_ID

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!
  }
  return a.length - b.length
}

/**
 * True if `host` is `target` itself or a *position*-descendant of `target`
 * (appears anywhere inside one of target's appearances). This is the portal
 * cycle guard: portaling `target` under `host` would make `target` contain
 * `host`, forming a position cycle. Read purely from the scroll-index prefixes.
 */
export const isPositionDescendantOrSelf = (
  db: Database,
  target: NodeRef,
  host: NodeRef,
): boolean => {
  if (target.matrixId === host.matrixId && target.rowId === host.rowId) return true
  const targetKeys = positionsOf(db, target)
  const hostKeys = positionsOf(db, host)
  for (const t of targetKeys) {
    const upper = nextPrefix(t.key)
    for (const h of hostKeys) {
      // host appears strictly inside target's subtree range [t.key, nextPrefix)
      if (compareBytes(h.key, t.key) > 0 && compareBytes(h.key, upper) < 0) return true
    }
  }
  return false
}

/** Look up a portal edge's sibling key under a host, or null. */
const portalEdgeKey = (db: Database, host: NodeRef, target: NodeRef): Uint8Array | null => {
  const stmt = db.prepare(
    `SELECT edge_key FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ?
       AND target_matrix_id = ? AND target_row_id = ? AND kind = 'portal'`,
  )
  stmt.bind([host.matrixId, host.rowId, target.matrixId, target.rowId])
  let key: Uint8Array | null = null
  if (stmt.step()) key = new Uint8Array((stmt.get({}) as { edge_key: Uint8Array }).edge_key)
  stmt.finalize()
  return key
}

/**
 * The home key of a node: the appearance whose prefix path is entirely
 * own-edges (no portal segment). Resolved by walking the own-edge chain up to
 * the sentinel, collecting edge_keys, then concatenating them root→node.
 */
const homeKeyOf = (db: Database, node: NodeRef): Uint8Array | null => {
  const segs: Uint8Array[] = []
  let cur = node
  for (let guard = 0; guard < MAX_POSITION_DEPTH; guard++) {
    const edge = getOwnEdge(db, cur.matrixId, cur.rowId)
    if (!edge) return null
    segs.push(edge.edgeKey)
    if (isSentinel(edge.parent)) break
    cur = edge.parent
  }
  segs.reverse()
  let key: Uint8Array = EMPTY
  for (const s of segs) key = concat(key, s)
  return key
}

// -- Structural ops -----------------------------------------------------------

/**
 * Add a portal of `target` under `host`: a position-only, non-owning tie.
 * Inserts the `kind='portal'` edge, then materializes target's owned subtree
 * under every appearance of `host`. Cost = appearances(host) × |subtree(target)|.
 * Rejects a portal that would form a position cycle.
 *
 * Returns the portal edge's sibling key.
 */
export const addPortal = (
  db: Database,
  host: NodeRef,
  target: NodeRef,
  cap: number = DEFAULT_PORTAL_CAP,
): Uint8Array => {
  return withTransaction(db, () => {
    if (isPositionDescendantOrSelf(db, target, host)) {
      throw new Error('Portal would create a position cycle (target contains host)')
    }
    // Own- and portal-children share one sibling-order space under the host, so
    // the portal edge appends after the last position-child (own OR portal).
    const edgeKey = computeSiblingKey(db, host)
    db.exec(
      `INSERT INTO joins
         (source_matrix_id, source_row_id, target_matrix_id, target_row_id, kind, edge_key)
       VALUES (?, ?, ?, ?, 'portal', ?)`,
      { bind: [host.matrixId, host.rowId, target.matrixId, target.rowId, edgeKey] },
    )

    if (isSentinel(host)) {
      materializeSubtreeAtPrefix(db, target, edgeKey, 0, cap)
    } else {
      for (const pos of positionsOf(db, host)) {
        materializeSubtreeAtPrefix(db, target, concat(pos.key, edgeKey), pos.depth + 1, cap)
      }
    }
    return edgeKey
  })
}

/**
 * Detach a portal (non-destructive): delete its materialized range at every host
 * appearance, then sever the portal edge. The home and any other portals survive.
 * This is the "detach" tier of the two-tier delete (remove *this* appearance).
 */
export const removePortal = (db: Database, host: NodeRef, target: NodeRef): void => {
  withTransaction(db, () => {
    const edgeKey = portalEdgeKey(db, host, target)
    if (!edgeKey) return
    if (isSentinel(host)) {
      deleteScrollSubtreeRange(db, edgeKey)
    } else {
      for (const pos of positionsOf(db, host)) {
        deleteScrollSubtreeRange(db, concat(pos.key, edgeKey))
      }
    }
    db.exec(
      `DELETE FROM joins
       WHERE source_matrix_id = ? AND source_row_id = ?
         AND target_matrix_id = ? AND target_row_id = ? AND kind = 'portal'`,
      { bind: [host.matrixId, host.rowId, target.matrixId, target.rowId] },
    )
  })
}

/**
 * Move a node's owner (promotion): relocate its home to `newParent`, leaving a
 * portal behind at the old parent (Tana's "Move original node"). The `own`-edge
 * follows the home; a non-owning portal preserves the old appearance.
 */
export const moveOwner = (
  db: Database,
  node: NodeRef,
  newParent: NodeRef,
  positioning?: { prevSiblingKey?: Uint8Array; nextSiblingKey?: Uint8Array },
): void => {
  withTransaction(db, () => {
    const oldEdge = getOwnEdge(db, node.matrixId, node.rowId)
    const oldParent =
      oldEdge ? oldEdge.parent : { matrixId: ROOT_MATRIX_ID, rowId: ROOT_ROW_ID }

    reparentRow(db, {
      matrixId: node.matrixId,
      rowId: node.rowId,
      newParent,
      prevSiblingKey: positioning?.prevSiblingKey,
      nextSiblingKey: positioning?.nextSiblingKey,
    })

    // Leave a portal at the old home (unless the old home was the sentinel/root:
    // a root appearance need not be mirrored).
    if (!isSentinel(oldParent)) {
      addPortal(db, oldParent, node)
    }
  })
}

// -- Home deletion (ghost vs. hard) -------------------------------------------

/** Collapse each portal appearance of `node` to a single is_ghost tombstone. */
const ghostPortals = (db: Database, node: NodeRef): number => {
  const hostStmt = db.prepare(
    `SELECT source_matrix_id, source_row_id FROM joins
     WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'portal'`,
  )
  hostStmt.bind([node.matrixId, node.rowId])
  const hosts: NodeRef[] = []
  while (hostStmt.step()) {
    const r = hostStmt.get({}) as { source_matrix_id: number; source_row_id: number }
    hosts.push({ matrixId: r.source_matrix_id, rowId: r.source_row_id })
  }
  hostStmt.finalize()

  let ghosts = 0
  for (const host of hosts) {
    const edgeKey = portalEdgeKey(db, host, node)!
    const hostPositions = isSentinel(host) ? [{ key: EMPTY, depth: -1 }] : positionsOf(db, host)
    for (const pos of hostPositions) {
      const prefix = concat(pos.key, edgeKey)
      deleteScrollSubtreeRange(db, prefix)
      insertGhostMarker(db, node, prefix, pos.depth + 1)
      ghosts++
    }
  }
  return ghosts
}

/**
 * Remove `node`'s home: its own-subtree's data rows, own-edges, closure entries,
 * and home-range scroll entries. Preserves inbound portal edges (target=node) so
 * callers decide whether they ghost or cascade. Does NOT touch scroll entries by
 * identity (which would clobber portal/ghost appearances) — it deletes the home
 * key range only.
 */
const deleteHomeSubtree = (db: Database, node: NodeRef): void => {
  const subtree = collectOwnSubtree(db, node.matrixId, node.rowId)

  // Closure ancestry (own-edges) for the whole subtree goes first.
  maintainClosureOnDelete(db, node)

  // Home appearance range (covers the subtree's home entries in one shot).
  const home = homeKeyOf(db, node)
  if (home) deleteScrollSubtreeRange(db, home)

  for (const n of subtree) {
    db.exec(`DELETE FROM "mx_${n.matrixId}_data" WHERE id = ?`, { bind: [n.rowId] })
    // Sever own-edges touching this subtree node; portal edges (into node,
    // carrying the surviving appearances) are left untouched.
    db.exec(
      `DELETE FROM joins
       WHERE kind = 'own'
         AND ((source_matrix_id = ? AND source_row_id = ?)
           OR (target_matrix_id = ? AND target_row_id = ?))`,
      { bind: [n.matrixId, n.rowId, n.matrixId, n.rowId] },
    )
  }
}

/**
 * Delete a node's home and **ghost** its portals: each portal appearance is
 * collapsed to a surviving is_ghost tombstone (Workflowy's "original was
 * deleted"), the portal edge kept. This is the default home-delete — non-
 * escalating. Returns the number of ghost markers written.
 */
export const deleteHomeGhostingPortals = (db: Database, node: NodeRef): number => {
  return withTransaction(db, () => {
    const ghosts = ghostPortals(db, node)
    deleteHomeSubtree(db, node)
    return ghosts
  })
}

/**
 * Hard delete including references: cascade everywhere — remove the home AND
 * every portal appearance (no ghosts), severing the portal edges. This is the
 * escalation tier of the two-tier delete, never the silent default.
 */
export const hardDeleteIncludingRefs = (db: Database, node: NodeRef): void => {
  withTransaction(db, () => {
    // Remove all portal appearances and sever the portal edges into node.
    const hostStmt = db.prepare(
      `SELECT source_matrix_id, source_row_id FROM joins
       WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'portal'`,
    )
    hostStmt.bind([node.matrixId, node.rowId])
    const hosts: NodeRef[] = []
    while (hostStmt.step()) {
      const r = hostStmt.get({}) as { source_matrix_id: number; source_row_id: number }
      hosts.push({ matrixId: r.source_matrix_id, rowId: r.source_row_id })
    }
    hostStmt.finalize()

    for (const host of hosts) {
      const edgeKey = portalEdgeKey(db, host, node)!
      const hostPositions =
        isSentinel(host) ? [{ key: EMPTY, depth: -1 }] : positionsOf(db, host)
      for (const pos of hostPositions) {
        deleteScrollSubtreeRange(db, concat(pos.key, edgeKey))
      }
    }
    db.exec(
      `DELETE FROM joins WHERE kind = 'portal' AND target_matrix_id = ? AND target_row_id = ?`,
      {
        bind: [node.matrixId, node.rowId],
      },
    )

    deleteHomeSubtree(db, node)
  })
}

// -- Closure-per-location (free, from the lexkey prefix) ----------------------

/**
 * Display ancestry of a specific appearance, read off its `global_lexkey`
 * prefix — the ownership `closure` table cannot represent it (a portaled row's
 * descendant has two legitimately different ancestries, one per appearance).
 * Each ancestor's key is a prefix boundary of `appearanceKey`; a point lookup on
 * the scroll-index PK resolves its identity. Returned nearest-first.
 */
export const ancestryOfAppearance = (
  db: Database,
  appearanceKey: Uint8Array,
): { matrixId: number; rowId: number; depth: number }[] => {
  const segments = parseKey(appearanceKey)
  const prefixes: Uint8Array[] = []
  for (let i = 1; i < segments.length; i++) {
    prefixes.push(makeKey(segments.slice(0, i)))
  }
  const stmt = db.prepare(
    'SELECT matrix_id, row_id, depth FROM scroll_index WHERE global_lexkey = ?',
  )
  const out: { matrixId: number; rowId: number; depth: number }[] = []
  for (const p of prefixes) {
    stmt.reset()
    stmt.bind([p])
    if (stmt.step()) {
      const r = stmt.get({}) as { matrix_id: number; row_id: number; depth: number }
      out.push({ matrixId: r.matrix_id, rowId: r.row_id, depth: r.depth })
    }
  }
  stmt.finalize()
  return out.reverse()
}
