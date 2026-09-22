import type { Database } from '@sqlite.org/sqlite-wasm'

import { getMatrixOwner } from './matrix'
import { homeKeyOf } from './portal'
import type { NodeRef } from './tree'

export type AppearanceProvenance = {
  readonly key: Uint8Array
}

export type PlaceNavigationTarget =
  | { readonly type: 'root'; readonly matrixId: number }
  | {
      readonly type: 'node'
      readonly node: NodeRef
      readonly provenance?: AppearanceProvenance
    }

export type PlaceAppearance = {
  readonly key: Uint8Array
  readonly depth: number
}

export type MembershipContainer = {
  readonly node: NodeRef
  readonly key: Uint8Array | null
}

export type ResolvedPlaceNavigation =
  | {
      readonly type: 'position'
      readonly node: NodeRef
      readonly source: 'provenance' | 'home'
      readonly appearance: PlaceAppearance
      readonly alternativeAppearances: readonly PlaceAppearance[]
      readonly liveAppearanceCount: number
    }
  | {
      readonly type: 'membership'
      readonly node: NodeRef
      readonly matrixId: number
      readonly containers: readonly MembershipContainer[]
      readonly alternativeAppearances: readonly PlaceAppearance[]
      readonly liveAppearanceCount: number
    }

export type PlaceNavigationAnchor =
  | {
      readonly type: 'position'
      readonly node: NodeRef
      readonly source: 'provenance' | 'home'
      readonly appearance: PlaceAppearance
    }
  | {
      readonly type: 'membership'
      readonly node: NodeRef
      readonly matrixId: number
      readonly containers: readonly MembershipContainer[]
    }

const MAX_MEMBERSHIP_DEPTH = 16
const MAX_ALTERNATIVE_APPEARANCES = 16

const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!
  }
  return a.length - b.length
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => compareBytes(a, b) === 0

const readLiveAppearance = (
  db: Database,
  node: NodeRef,
  key: Uint8Array,
): PlaceAppearance | null => {
  const statement = db.prepare(
    `SELECT depth FROM scroll_index
     WHERE global_lexkey = ? AND matrix_id = ? AND row_id = ? AND is_ghost = 0`,
  )
  statement.bind([key, node.matrixId, node.rowId])
  const appearance =
    statement.step() ?
      {
        key: new Uint8Array(key),
        depth: (statement.get({}) as { depth: number }).depth,
      }
    : null
  statement.finalize()
  return appearance
}

const readLiveAppearances = (
  db: Database,
  node: NodeRef,
): { appearances: PlaceAppearance[]; total: number } => {
  const statement = db.prepare(
    `SELECT global_lexkey, depth, COUNT(*) OVER () AS total FROM scroll_index
     WHERE matrix_id = ? AND row_id = ? AND is_ghost = 0
     ORDER BY global_lexkey
     LIMIT ?`,
  )
  statement.bind([node.matrixId, node.rowId, MAX_ALTERNATIVE_APPEARANCES + 1])
  const appearances: PlaceAppearance[] = []
  let total = 0
  while (statement.step()) {
    const row = statement.get({}) as {
      global_lexkey: Uint8Array
      depth: number
      total: number
    }
    total = row.total
    appearances.push({ key: new Uint8Array(row.global_lexkey), depth: row.depth })
  }
  statement.finalize()
  return { appearances, total }
}

const matrixExists = (db: Database, matrixId: number): boolean => {
  const statement = db.prepare('SELECT 1 FROM matrix WHERE id = ?')
  statement.bind([matrixId])
  const exists = statement.step()
  statement.finalize()
  return exists
}

const rowExists = (db: Database, node: NodeRef): boolean => {
  if (
    !Number.isSafeInteger(node.matrixId) ||
    node.matrixId <= 0 ||
    !matrixExists(db, node.matrixId)
  ) {
    return false
  }
  if (!Number.isSafeInteger(node.rowId) || node.rowId <= 0) return false
  const statement = db.prepare(`SELECT 1 FROM "mx_${node.matrixId}_data" WHERE id = ?`)
  statement.bind([node.rowId])
  const exists = statement.step()
  statement.finalize()
  return exists
}

const liveHome = (db: Database, node: NodeRef): PlaceAppearance | null => {
  const key = homeKeyOf(db, node)
  return key ? readLiveAppearance(db, node, key) : null
}

const resolveMembershipContainers = (
  db: Database,
  matrixId: number,
  rootMatrixId: number,
): MembershipContainer[] | null => {
  const reversePath: MembershipContainer[] = []
  const visited = new Set<number>()
  let currentMatrixId = matrixId

  for (let depth = 0; depth < MAX_MEMBERSHIP_DEPTH; depth += 1) {
    if (currentMatrixId === rootMatrixId) return reversePath.reverse()
    if (visited.has(currentMatrixId)) return null
    visited.add(currentMatrixId)

    const owner = getMatrixOwner(db, currentMatrixId)
    if (!owner || !rowExists(db, owner)) return null
    const home = liveHome(db, owner)
    reversePath.push({ node: owner, key: home?.key ?? null })
    if (home) return reversePath.reverse()
    currentMatrixId = owner.matrixId
  }

  return null
}

const resolveExistingPlaceNavigationAnchor = (
  db: Database,
  rootMatrixId: number,
  node: NodeRef,
  provenance?: AppearanceProvenance,
): PlaceNavigationAnchor | null => {
  const provenanced = provenance ? readLiveAppearance(db, node, provenance.key) : null
  if (provenanced) {
    return {
      type: 'position',
      node,
      source: 'provenance',
      appearance: provenanced,
    }
  }

  const home = liveHome(db, node)
  if (home) {
    return {
      type: 'position',
      node,
      source: 'home',
      appearance: home,
    }
  }

  const containers = resolveMembershipContainers(db, node.matrixId, rootMatrixId)
  if (!containers) return null
  return {
    type: 'membership',
    node,
    matrixId: node.matrixId,
    containers,
  }
}

/**
 * Resolve the lightweight rooted anchor for a row and root already read from the database. This
 * avoids repeating existence queries while a catalog scan is visiting those same rows.
 */
export const resolveExistingPlaceAnchor = resolveExistingPlaceNavigationAnchor

/** Resolve only the rooted anchor needed for structural ranking and later navigation hydration. */
export const resolvePlaceNavigationAnchor = (
  db: Database,
  rootMatrixId: number,
  node: NodeRef,
  provenance?: AppearanceProvenance,
): PlaceNavigationAnchor | null => {
  if (!rowExists(db, node) || !matrixExists(db, rootMatrixId)) return null
  return resolveExistingPlaceNavigationAnchor(db, rootMatrixId, node, provenance)
}

/** Add bounded appearance facts to an already-resolved rooted anchor. */
export const hydratePlaceNavigation = (
  db: Database,
  anchor: PlaceNavigationAnchor,
): ResolvedPlaceNavigation => {
  const { appearances, total: liveAppearanceCount } = readLiveAppearances(db, anchor.node)
  if (anchor.type === 'position') {
    return {
      ...anchor,
      alternativeAppearances: appearances
        .filter(({ key }) => !sameBytes(key, anchor.appearance.key))
        .slice(0, MAX_ALTERNATIVE_APPEARANCES),
      liveAppearanceCount,
    }
  }
  return {
    ...anchor,
    alternativeAppearances: appearances.slice(0, MAX_ALTERNATIVE_APPEARANCES),
    liveAppearanceCount,
  }
}

/**
 * Resolve an identity into the one rooted place contract. Explicit provenance wins, then the
 * ownership home. A row without either uses its matrix-owner chain; live portals are returned as
 * chooser facts but are never selected silently.
 */
export const resolvePlaceNavigation = (
  db: Database,
  rootMatrixId: number,
  node: NodeRef,
  provenance?: AppearanceProvenance,
): ResolvedPlaceNavigation | null => {
  const anchor = resolvePlaceNavigationAnchor(db, rootMatrixId, node, provenance)
  return anchor ? hydratePlaceNavigation(db, anchor) : null
}
