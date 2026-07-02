// Phase 9.7a — deep-portal materialization spike (prototype maintenance path).
//
// Prototype of the multi-location `scroll_index` the Phase 9.7 convergence needs:
// portals as extra *positions* of a single-owned row, **deep** by default (a
// portal transcludes the node *and its owned subtree*). This module is a spike:
// it stands up a self-contained schema (production's, plus the two deltas the
// real build must make) and implements the incremental maintenance primitives,
// so the Stage-P0 guards in `deep-portal-spike.test.ts` can measure the write-
// amplification / index-growth bounds and prove the windowed scan stays a single
// keyset range. It is NOT wired into the production ops — that is the 9.7 build.
//
// Settled model (see context/Phase-9.7a-deep-portals.md):
//   - Position graph = own-edges ∪ portal-edges. `scroll_index` is the pre-order
//     flattening of that DAG rooted at the sentinel. A row appears once per
//     distinct root→row path; `global_lexkey` concatenates the edge_keys (own OR
//     portal) along its path.
//   - Portal storage = a `joins` row with `kind='portal'` + an `edge_key` (the
//     chosen fork). The partial `joins_single_owner` index (WHERE kind='own')
//     already permits a second, non-owning edge into a row, so single ownership
//     is provably unaffected.
//   - Deep materialization = one primitive: "materialize subtree X at prefix P",
//     whose recursive walk follows kind IN ('own','portal') so a portal nested
//     inside a portaled subtree also expands. A wall-clock scaling pass put the
//     ~10ms crossovers (~2.5k-node subtree / ~100 appearances) well above
//     realistic usage, so **v1 ships with cycle detection only, no cap**. The
//     per-portal `cap` + single `lazy` marker below stays as a documented lever
//     (the count+slice hand-off to 9.7b) if a thousand-appearance workload ever
//     appears. See context/Phase-9.7a.md §3.1.
//   - Closure-per-location is free: display ancestry of an appearance is read off
//     its `global_lexkey` prefix. This schema has NO closure table — the spike
//     proves per-location ancestry needs none.

import type { Database } from '@sqlite.org/sqlite-wasm'

import { ROOT_MATRIX_ID, ROOT_ROW_ID } from '../core/ids'
import { between, makeKey, nextPrefix, parseKey } from '../core/lexorank'

export type Node = { mx: number; row: number }

export const SENTINEL: Node = { mx: ROOT_MATRIX_ID, row: ROOT_ROW_ID }

const EMPTY = new Uint8Array(0)

/** Recursion backstop for the position-graph walk (mirrors MAX_CASCADE_DEPTH). */
export const MAX_POSITION_DEPTH = 100

/**
 * Per-portal materialization cap before falling back to a lazy marker. This is a
 * documented safety-valve lever, NOT a v1 policy — v1 ships uncapped (cycle
 * detection only), see the header note and context/Phase-9.7a.md §3.1.
 */
export const DEFAULT_PORTAL_CAP = 2000

// -- Schema (production's scroll_index/joins + the two 9.7 deltas) -------------

export const initPortalSpikeSchema = (db: Database): void => {
  db.exec(`
    -- joins: production schema, but the CHECK is widened so a 'portal' edge may
    -- carry a sibling edge_key (production forbids edge_key on non-'own' kinds).
    CREATE TABLE joins (
      source_matrix_id  INTEGER NOT NULL,
      source_row_id     INTEGER NOT NULL,
      target_matrix_id  INTEGER NOT NULL,
      target_row_id     INTEGER NOT NULL,
      kind              TEXT NOT NULL DEFAULT 'ref',
      edge_key          BLOB,
      PRIMARY KEY (source_matrix_id, source_row_id, target_matrix_id, target_row_id),
      CHECK (
        (kind IN ('own','portal')
           AND edge_key IS NOT NULL
           AND length(edge_key) > 0
           AND substr(edge_key, length(edge_key), 1) = x'00')
        OR
        (kind = 'ref' AND edge_key IS NULL)
      )
    ) STRICT;

    -- Single ownership is preserved: the unique index stays partial on kind='own',
    -- so a 'portal' edge into an already-owned row does not collide.
    CREATE UNIQUE INDEX joins_single_owner
      ON joins (target_matrix_id, target_row_id) WHERE kind = 'own';

    -- Ordered position-children of a host: own- AND portal-edges share the
    -- sibling-order space under a host (both are positions under it).
    CREATE INDEX joins_position_children
      ON joins (source_matrix_id, source_row_id, edge_key)
      WHERE kind IN ('own','portal');

    CREATE INDEX joins_by_target ON joins (target_matrix_id, target_row_id);

    -- scroll_index: production schema MINUS the unique (matrix_id,row_id) identity
    -- index (multi-location: a row may have N entries), plus two render flags.
    -- The BLOB PK on global_lexkey is unchanged — it is the single keyset range
    -- the windowed scan rides.
    CREATE TABLE scroll_index (
      global_lexkey  BLOB NOT NULL PRIMARY KEY,
      matrix_id      INTEGER NOT NULL,
      row_id         INTEGER NOT NULL,
      depth          INTEGER NOT NULL DEFAULT 0,
      is_ghost       INTEGER NOT NULL DEFAULT 0,
      lazy           INTEGER NOT NULL DEFAULT 0
    ) STRICT;

    -- Non-unique identity lookup ("all appearances of a row") — the multi-location
    -- replacement for production's UNIQUE scroll_index_identity.
    CREATE INDEX scroll_index_by_identity ON scroll_index (matrix_id, row_id);
  `)
}

// -- Small helpers -------------------------------------------------------------

const isSentinel = (n: Node): boolean => n.mx === ROOT_MATRIX_ID && n.row === ROOT_ROW_ID

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/** Every appearance of a node: its (key, depth) rows in the scroll index. */
export const positionsOf = (db: Database, node: Node): { key: Uint8Array; depth: number }[] => {
  const stmt = db.prepare(
    'SELECT global_lexkey, depth FROM scroll_index WHERE matrix_id = ? AND row_id = ?',
  )
  stmt.bind([node.mx, node.row])
  const out: { key: Uint8Array; depth: number }[] = []
  while (stmt.step()) {
    const r = stmt.get({}) as { global_lexkey: Uint8Array; depth: number }
    out.push({ key: new Uint8Array(r.global_lexkey), depth: r.depth })
  }
  stmt.finalize()
  return out
}

/** Highest sibling edge_key among a host's position-children (own or portal). */
const lastChildEdgeKey = (db: Database, host: Node): Uint8Array | null => {
  const stmt = db.prepare(
    `SELECT edge_key FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ? AND kind IN ('own','portal')
     ORDER BY edge_key DESC LIMIT 1`,
  )
  stmt.bind([host.mx, host.row])
  let key: Uint8Array | null = null
  if (stmt.step()) key = new Uint8Array((stmt.get({}) as { edge_key: Uint8Array }).edge_key)
  stmt.finalize()
  return key
}

/** Append-at-end sibling key under a host (ordering is orthogonal to the spike). */
const computeEdgeKey = (db: Database, host: Node): Uint8Array =>
  between(lastChildEdgeKey(db, host) ?? EMPTY, EMPTY)

/**
 * True if `host` is `target` itself or a *position*-descendant of `target`
 * (appears anywhere inside one of target's appearances). This is the portal
 * cycle guard: portaling `target` under `host` would make `target` contain
 * `host`, forming a position cycle. Read purely from the scroll index prefixes.
 */
export const isPositionDescendantOrSelf = (db: Database, target: Node, host: Node): boolean => {
  if (target.mx === host.mx && target.row === host.row) return true
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

const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!
  }
  return a.length - b.length
}

// -- The core primitive: materialize a subtree at a prefix ---------------------

/**
 * Count the position-subtree of `node` (paths, = entries a full materialization
 * would emit), short-circuited at `limit`. Bounded by the depth guard.
 */
const positionSubtreeSize = (db: Database, node: Node, limit: number): number => {
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
  stmt.bind([node.mx, node.row, MAX_POSITION_DEPTH, limit])
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
 * Cap + lazy fallback: if the subtree would emit more than `cap` entries, a
 * single `lazy=1` marker is written for `node` instead — the count+slice
 * hand-off to the windowing flattener (Phase 9.7b).
 *
 * Returns the number of scroll_index rows written.
 */
export const materializeSubtreeAtPrefix = (
  db: Database,
  node: Node,
  prefix: Uint8Array,
  baseDepth: number,
  cap: number = DEFAULT_PORTAL_CAP,
): number => {
  if (positionSubtreeSize(db, node, cap + 1) > cap) {
    db.exec(
      `INSERT INTO scroll_index (global_lexkey, matrix_id, row_id, depth, is_ghost, lazy)
       VALUES (?, ?, ?, ?, 0, 1)`,
      { bind: [prefix, node.mx, node.row, baseDepth] },
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
    { bind: [node.mx, node.row, prefix, baseDepth, MAX_POSITION_DEPTH] },
  )
  return positionSubtreeSize(db, node, cap + 1)
}

// -- Structural ops (the maintenance cases) ------------------------------------

/**
 * Attach `node` as an own-child of `host` (the home / loose-child path), and add
 * it to the scroll index at **every** appearance of `host`. For a plain
 * own-forest host (single appearance) this writes one row; under a portaled host
 * it fans out to `appearances(host)` rows — the write-amplification demonstrator.
 *
 * `node` is assumed freshly created (no existing subtree), so each appearance
 * contributes exactly one entry.
 */
export const attachOwnChild = (
  db: Database,
  host: Node,
  node: Node,
  cap: number = DEFAULT_PORTAL_CAP,
): Uint8Array => {
  const edgeKey = computeEdgeKey(db, host)
  db.exec(
    `INSERT INTO joins
       (source_matrix_id, source_row_id, target_matrix_id, target_row_id, kind, edge_key)
     VALUES (?, ?, ?, ?, 'own', ?)`,
    { bind: [host.mx, host.row, node.mx, node.row, edgeKey] },
  )

  if (isSentinel(host)) {
    db.exec(
      `INSERT INTO scroll_index (global_lexkey, matrix_id, row_id, depth) VALUES (?, ?, ?, 0)`,
      { bind: [edgeKey, node.mx, node.row] },
    )
    return edgeKey
  }

  for (const pos of positionsOf(db, host)) {
    materializeSubtreeAtPrefix(db, node, concat(pos.key, edgeKey), pos.depth + 1, cap)
  }
  return edgeKey
}

/**
 * Add a portal of `target` under `host`: a position-only, non-owning tie. Inserts
 * the `kind='portal'` edge, then materializes target's subtree under every
 * appearance of `host`. Cost = appearances(host) × |subtree(target)| (capped).
 */
export const addPortal = (
  db: Database,
  host: Node,
  target: Node,
  cap: number = DEFAULT_PORTAL_CAP,
): Uint8Array => {
  if (isPositionDescendantOrSelf(db, target, host)) {
    throw new Error('Portal would create a position cycle (target contains host)')
  }
  const edgeKey = computeEdgeKey(db, host)
  db.exec(
    `INSERT INTO joins
       (source_matrix_id, source_row_id, target_matrix_id, target_row_id, kind, edge_key)
     VALUES (?, ?, ?, ?, 'portal', ?)`,
    { bind: [host.mx, host.row, target.mx, target.row, edgeKey] },
  )

  for (const pos of positionsOf(db, host)) {
    materializeSubtreeAtPrefix(db, target, concat(pos.key, edgeKey), pos.depth + 1, cap)
  }
  return edgeKey
}

/** Look up a portal edge's sibling key, or null. */
const portalEdgeKey = (db: Database, host: Node, target: Node): Uint8Array | null => {
  const stmt = db.prepare(
    `SELECT edge_key FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ?
       AND target_matrix_id = ? AND target_row_id = ? AND kind = 'portal'`,
  )
  stmt.bind([host.mx, host.row, target.mx, target.row])
  let key: Uint8Array | null = null
  if (stmt.step()) key = new Uint8Array((stmt.get({}) as { edge_key: Uint8Array }).edge_key)
  stmt.finalize()
  return key
}

/**
 * Detach a portal (non-destructive): delete its materialized range at every host
 * appearance, then sever the portal edge. The home and other portals survive.
 */
export const removePortal = (db: Database, host: Node, target: Node): void => {
  const edgeKey = portalEdgeKey(db, host, target)
  if (!edgeKey) return
  for (const pos of positionsOf(db, host)) {
    const prefix = concat(pos.key, edgeKey)
    db.exec('DELETE FROM scroll_index WHERE global_lexkey >= ? AND global_lexkey < ?', {
      bind: [prefix, nextPrefix(prefix)],
    })
  }
  db.exec(
    `DELETE FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ?
       AND target_matrix_id = ? AND target_row_id = ? AND kind = 'portal'`,
    { bind: [host.mx, host.row, target.mx, target.row] },
  )
}

/**
 * Delete `node`'s home (its own-edge position + subtree) and **ghost** every
 * portal of it: each portal's materialized subtree is collapsed to one
 * `is_ghost=1` tombstone at the portal prefix, reusing the ref ghost state. The
 * portal edges survive (they carry the surviving position); the home own-edge
 * and home entries are removed.
 *
 * Returns the ghost markers written (one per portal appearance).
 */
export const ghostHomeDelete = (db: Database, node: Node): number => {
  // Ghost the portals first (before removing node's own edges/positions).
  const portalHosts = db.prepare(
    `SELECT source_matrix_id, source_row_id FROM joins
     WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'portal'`,
  )
  portalHosts.bind([node.mx, node.row])
  const hosts: Node[] = []
  while (portalHosts.step()) {
    const r = portalHosts.get({}) as { source_matrix_id: number; source_row_id: number }
    hosts.push({ mx: r.source_matrix_id, row: r.source_row_id })
  }
  portalHosts.finalize()

  let ghosts = 0
  for (const host of hosts) {
    const edgeKey = portalEdgeKey(db, host, node)!
    for (const pos of positionsOf(db, host)) {
      const prefix = concat(pos.key, edgeKey)
      db.exec('DELETE FROM scroll_index WHERE global_lexkey >= ? AND global_lexkey < ?', {
        bind: [prefix, nextPrefix(prefix)],
      })
      db.exec(
        `INSERT INTO scroll_index (global_lexkey, matrix_id, row_id, depth, is_ghost, lazy)
         VALUES (?, ?, ?, ?, 1, 0)`,
        { bind: [prefix, node.mx, node.row, pos.depth + 1] },
      )
      ghosts++
    }
  }

  // Remove the home: node's home appearance range + its own edges. (The home key
  // is the one appearance derivable purely from own-edges; simplest for the
  // spike is to remove every non-portal appearance, i.e. the own-rooted subtree.)
  const home = homeKeyOf(db, node)
  if (home) {
    db.exec('DELETE FROM scroll_index WHERE global_lexkey >= ? AND global_lexkey < ?', {
      bind: [home, nextPrefix(home)],
    })
  }
  db.exec(
    `DELETE FROM joins
     WHERE kind = 'own'
       AND ((source_matrix_id = ? AND source_row_id = ?)
         OR (target_matrix_id = ? AND target_row_id = ?))`,
    { bind: [node.mx, node.row, node.mx, node.row] },
  )
  return ghosts
}

/**
 * The home key of a node = the appearance whose prefix path is entirely
 * own-edges (no portal segment). Resolved by walking the own-edge chain from the
 * sentinel and concatenating edge_keys — the same derivation production's
 * scroll-index maintenance uses.
 */
export const homeKeyOf = (db: Database, node: Node): Uint8Array | null => {
  // Walk up via own-edges to the sentinel, collecting edge_keys, then reverse.
  const segs: Uint8Array[] = []
  let cur = node
  const parentStmt = db.prepare(
    `SELECT source_matrix_id, source_row_id, edge_key FROM joins
     WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'own' LIMIT 1`,
  )
  for (let guard = 0; guard < MAX_POSITION_DEPTH; guard++) {
    parentStmt.reset()
    parentStmt.bind([cur.mx, cur.row])
    if (!parentStmt.step()) {
      parentStmt.finalize()
      return null
    }
    const r = parentStmt.get({}) as {
      source_matrix_id: number
      source_row_id: number
      edge_key: Uint8Array
    }
    segs.push(new Uint8Array(r.edge_key))
    if (r.source_matrix_id === ROOT_MATRIX_ID && r.source_row_id === ROOT_ROW_ID) break
    cur = { mx: r.source_matrix_id, row: r.source_row_id }
  }
  parentStmt.finalize()
  segs.reverse()
  let key: Uint8Array = EMPTY
  for (const s of segs) key = concat(key, s)
  return key
}

// -- Closure-per-location (free, from the lexkey prefix) -----------------------

/**
 * Display ancestry of a specific appearance, read off its `global_lexkey`
 * prefix — NOT from any closure table (this schema has none). Each ancestor's
 * key is a prefix boundary of `appearanceKey`; a point lookup on the scroll
 * index PK resolves its identity. Returned nearest-first.
 */
export const ancestryOfAppearance = (
  db: Database,
  appearanceKey: Uint8Array,
): { mx: number; row: number; depth: number }[] => {
  const segments = parseKey(appearanceKey)
  const prefixes: Uint8Array[] = []
  for (let i = 1; i < segments.length; i++) {
    prefixes.push(makeKey(segments.slice(0, i)))
  }
  const stmt = db.prepare(
    'SELECT matrix_id, row_id, depth FROM scroll_index WHERE global_lexkey = ?',
  )
  const out: { mx: number; row: number; depth: number }[] = []
  for (const p of prefixes) {
    stmt.reset()
    stmt.bind([p])
    if (stmt.step()) {
      const r = stmt.get({}) as { matrix_id: number; row_id: number; depth: number }
      out.push({ mx: r.matrix_id, row: r.row_id, depth: r.depth })
    }
  }
  stmt.finalize()
  return out.reverse()
}

// -- Read shape: the windowed scan (unchanged from production) -----------------

/** The hot windowed keyset scan — a single range on the global_lexkey PK. */
export const windowScanSql = (): string =>
  `SELECT global_lexkey, matrix_id, row_id, depth, is_ghost, lazy
   FROM scroll_index
   WHERE global_lexkey > ?
   ORDER BY global_lexkey
   LIMIT 500`

/** Total materialized entries (the index-growth metric). */
export const scrollIndexSize = (db: Database): number => {
  const stmt = db.prepare('SELECT COUNT(*) AS n FROM scroll_index')
  stmt.step()
  const n = (stmt.get({}) as { n: number }).n
  stmt.finalize()
  return n
}
