import type { Database } from '@sqlite.org/sqlite-wasm'

import { withTransaction } from './transaction'

export type TraitType = 'rank' | 'closure'

export type TraitHandle = {
  type: TraitType
  matrixId: number
}

export type TraitRow = {
  matrix_id: number
  trait_type: TraitType
}

/**
 * Provision a trait for a matrix. Idempotent: if the trait already exists,
 * returns immediately with the existing handle.
 *
 * - **rank**: the global `rank` table already exists. The `matrix_traits` row
 *   is bookkeeping that records the matrix uses rank.
 * - **closure**: creates `mx_{matrixId}_closure` if it doesn't exist, plus
 *   the `matrix_traits` row.
 */
export const ensureTrait = (db: Database, type: TraitType, matrixId: number): TraitHandle => {
  return withTransaction(db, () => {
    const checkStmt = db.prepare(
      'SELECT 1 FROM matrix_traits WHERE matrix_id = ? AND trait_type = ?',
    )
    checkStmt.bind([matrixId, type])
    const exists = checkStmt.step()
    checkStmt.finalize()

    if (exists) {
      return { type, matrixId }
    }

    if (type === 'closure') {
      db.exec(`
        CREATE TABLE IF NOT EXISTS "mx_${matrixId}_closure" (
          ancestor_key    BLOB NOT NULL,
          descendant_key  BLOB NOT NULL,
          depth           INTEGER NOT NULL CHECK (depth >= 0),
          PRIMARY KEY (ancestor_key, descendant_key)
        ) STRICT;

        CREATE INDEX IF NOT EXISTS "mx_${matrixId}_closure_by_descendant"
          ON "mx_${matrixId}_closure"(descendant_key);
      `)
    }

    db.exec('INSERT INTO matrix_traits (matrix_id, trait_type) VALUES (?, ?)', {
      bind: [matrixId, type],
    })

    return { type, matrixId }
  })
}

/**
 * List all provisioned traits for a matrix.
 */
export const getTraits = (db: Database, matrixId: number): TraitRow[] => {
  const stmt = db.prepare(
    'SELECT matrix_id, trait_type FROM matrix_traits WHERE matrix_id = ? ORDER BY trait_type',
  )
  stmt.bind([matrixId])

  const traits: TraitRow[] = []
  while (stmt.step()) {
    traits.push(stmt.get({}) as TraitRow)
  }
  stmt.finalize()
  return traits
}

/**
 * Assert that a matrix has all of the given trait types provisioned.
 * Throws with a clear message if any are missing.
 */
export const requireTraits = (db: Database, matrixId: number, types: TraitType[]): void => {
  for (const type of types) {
    const stmt = db.prepare(
      'SELECT 1 FROM matrix_traits WHERE matrix_id = ? AND trait_type = ? LIMIT 1',
    )
    stmt.bind([matrixId, type])
    const exists = stmt.step()
    stmt.finalize()
    if (!exists) {
      throw new Error(
        `Matrix ${matrixId} does not have the '${type}' trait provisioned. Call ensureTrait first.`,
      )
    }
  }
}
