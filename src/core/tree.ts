import type { Database } from '@sqlite.org/sqlite-wasm'

import { between, compareKeys, makeKey, nextPrefix, parseKey } from './lexorank'
import { hasTrait, requireTraits } from './traits'
import { withTransaction } from './transaction'

// -- Low-level building blocks ------------------------------------------------
// Called by the unified insertRow/deleteRow in matrix.ts.

/**
 * Create a rank entry and closure entries for an existing data row.
 *
 * Computes the rank key based on positioning params (parentKey, prevKey,
 * nextKey). If none are given, appends at root level. Creates closure entries
 * if the closure trait is provisioned.
 *
 * Requires the rank trait. Does NOT create the data row itself.
 *
 * @returns The new rank key.
 */
export const createTreePosition = (
  db: Database,
  matrixId: number,
  rowId: number,
  positioning?: {
    parentKey?: Uint8Array
    prevKey?: Uint8Array
    nextKey?: Uint8Array
  },
): Uint8Array => {
  const parentKey = positioning?.parentKey
  const prevKey = positioning?.prevKey
  const nextKey = positioning?.nextKey

  requireTraits(db, matrixId, ['rank'])
  const closureProvisioned = hasTrait(db, matrixId, 'closure')

  let rankKey: Uint8Array

  if (prevKey && nextKey) {
    rankKey = between(prevKey, nextKey)
  } else if (prevKey) {
    let upperBound = new Uint8Array(0)

    if (parentKey) {
      const parentUpperBound = nextPrefix(parentKey)
      const nextSiblingStmt = db.prepare(`
        SELECT key FROM rank
        WHERE matrix_id = ? AND key > ? AND key < ?
        ORDER BY key ASC
        LIMIT 1
      `)
      nextSiblingStmt.bind([matrixId, prevKey, parentUpperBound])

      if (nextSiblingStmt.step()) {
        const result = nextSiblingStmt.get({}) as { key: Uint8Array }
        const candidateKey = new Uint8Array(result.key)

        const candidateSegments = parseKey(candidateKey)
        const parentSegments = parseKey(parentKey)
        if (candidateSegments.length === parentSegments.length + 1) {
          upperBound = candidateKey
        }
      }
      nextSiblingStmt.finalize()
    } else {
      let globalLowerBound = prevKey
      const nextSiblingStmt = db.prepare(`
        SELECT key FROM rank
        WHERE matrix_id = ? AND key > ?
        ORDER BY key ASC
        LIMIT 1
      `)
      nextSiblingStmt.bind([matrixId, prevKey])

      if (nextSiblingStmt.step()) {
        const result = nextSiblingStmt.get({}) as { key: Uint8Array }
        const candidateKey = new Uint8Array(result.key)

        const prevSegments = parseKey(prevKey)
        const candidateSegments = parseKey(candidateKey)

        if (candidateSegments.length > prevSegments.length) {
          globalLowerBound = nextPrefix(prevKey)
        } else {
          upperBound = candidateKey
        }
      }
      nextSiblingStmt.finalize()

      if (upperBound.length === 0) {
        const globalNextStmt = db.prepare(`
          SELECT key FROM rank
          WHERE key > ?
          ORDER BY key ASC
          LIMIT 1
        `)
        globalNextStmt.bind([globalLowerBound])
        if (globalNextStmt.step()) {
          const gResult = globalNextStmt.get({}) as { key: Uint8Array }
          upperBound = new Uint8Array(gResult.key)
        }
        globalNextStmt.finalize()
      }
    }

    rankKey = between(prevKey, upperBound)
  } else if (nextKey) {
    let lowerBound = new Uint8Array(0)

    if (parentKey) {
      const prevSiblingStmt = db.prepare(`
        SELECT key FROM rank
        WHERE matrix_id = ? AND key < ? AND key > ?
        ORDER BY key DESC
        LIMIT 1
      `)
      prevSiblingStmt.bind([matrixId, nextKey, parentKey])

      if (prevSiblingStmt.step()) {
        const result = prevSiblingStmt.get({}) as { key: Uint8Array }
        const candidateKey = new Uint8Array(result.key)

        const candidateSegments = parseKey(candidateKey)
        const parentSegments = parseKey(parentKey)
        if (candidateSegments.length === parentSegments.length + 1) {
          lowerBound = candidateKey
        } else {
          lowerBound = new Uint8Array(parentKey)
        }
      } else {
        lowerBound = new Uint8Array(parentKey)
      }
      prevSiblingStmt.finalize()
    } else {
      const prevSiblingStmt = db.prepare(`
        SELECT key FROM rank
        WHERE matrix_id = ? AND key < ?
        ORDER BY key DESC
        LIMIT 1
      `)
      prevSiblingStmt.bind([matrixId, nextKey])

      if (prevSiblingStmt.step()) {
        const result = prevSiblingStmt.get({}) as { key: Uint8Array }
        lowerBound = new Uint8Array(result.key)

        const lowerBoundSegments = parseKey(lowerBound)
        const nextKeySegments = parseKey(nextKey)

        if (lowerBoundSegments.length !== nextKeySegments.length) {
          lowerBound = new Uint8Array(0)
        }
      }
      prevSiblingStmt.finalize()

      const globalPrevStmt = db.prepare(`
        SELECT key FROM rank
        WHERE key < ?
        ORDER BY key DESC
        LIMIT 1
      `)
      globalPrevStmt.bind([nextKey])
      if (globalPrevStmt.step()) {
        const gResult = globalPrevStmt.get({}) as { key: Uint8Array }
        const globalPrevKey = new Uint8Array(gResult.key)
        if (compareKeys(globalPrevKey, lowerBound) > 0) {
          lowerBound = globalPrevKey
        }
      }
      globalPrevStmt.finalize()
    }

    rankKey = between(lowerBound, nextKey)
  } else if (parentKey) {
    const firstChildStmt = db.prepare(`
      SELECT key FROM rank
      WHERE matrix_id = ? AND key > ? AND key < ?
      ORDER BY key ASC
      LIMIT 1
    `)
    const upperBound = nextPrefix(parentKey)
    firstChildStmt.bind([matrixId, parentKey, upperBound])

    if (firstChildStmt.step()) {
      const result = firstChildStmt.get({}) as { key: Uint8Array }
      const nextChild = new Uint8Array(result.key)
      firstChildStmt.finalize()
      rankKey = between(parentKey, nextChild)
    } else {
      firstChildStmt.finalize()
      const parentSegments = parseKey(parentKey)
      const newSegment = new Uint8Array([0x80])
      rankKey = makeKey([...parentSegments, newSegment])
    }
  } else {
    const lastRootStmt = db.prepare(`
      SELECT key FROM rank
      WHERE matrix_id = ?
      ORDER BY key DESC
      LIMIT 1
    `)
    lastRootStmt.bind([matrixId])

    let lastKey = new Uint8Array(0)
    if (lastRootStmt.step()) {
      const result = lastRootStmt.get({}) as { key: Uint8Array }
      lastKey = new Uint8Array(result.key)
    }
    lastRootStmt.finalize()

    const globalLastStmt = db.prepare(`
      SELECT key FROM rank
      WHERE instr(substr(key, 1, length(key) - 1), X'00') = 0
      ORDER BY key DESC
      LIMIT 1
    `)
    if (globalLastStmt.step()) {
      const result = globalLastStmt.get({}) as { key: Uint8Array }
      const globalLast = new Uint8Array(result.key)
      if (compareKeys(globalLast, lastKey) > 0) {
        lastKey = globalLast
      }
    }
    globalLastStmt.finalize()

    rankKey = between(lastKey, new Uint8Array(0))
  }

  // Insert into rank table
  db.exec(
    `
    INSERT INTO rank (key, matrix_id, row_kind, row_id)
    VALUES (?, ?, ?, ?)
  `,
    {
      bind: [rankKey, matrixId, 0, rowId],
    },
  )

  if (closureProvisioned) {
    db.exec(
      `
      INSERT INTO "mx_${matrixId}_closure" (ancestor_key, descendant_key, depth)
      VALUES (?, ?, 0)
    `,
      {
        bind: [rankKey, rankKey],
      },
    )

    if (parentKey) {
      const ancestorsStmt = db.prepare(`
        SELECT ancestor_key, depth FROM "mx_${matrixId}_closure"
        WHERE descendant_key = ?
      `)

      const ancestors: { ancestor_key: Uint8Array; depth: number }[] = []
      ancestorsStmt.bind([parentKey])
      while (ancestorsStmt.step()) {
        ancestors.push(ancestorsStmt.get({}) as { ancestor_key: Uint8Array; depth: number })
      }
      ancestorsStmt.finalize()

      for (const ancestor of ancestors) {
        db.exec(
          `
          INSERT INTO "mx_${matrixId}_closure" (ancestor_key, descendant_key, depth)
          VALUES (?, ?, ?)
        `,
          {
            bind: [ancestor.ancestor_key, rankKey, ancestor.depth + 1],
          },
        )
      }
    }
  }

  return rankKey
}

/**
 * Remove rank and closure entries for a row, identified by rowId.
 *
 * If the matrix has the closure trait, children of the deleted row are
 * reparented to the deleted row's parent (or promoted to root if no parent).
 *
 * Does NOT delete the data row itself or clean up joins -- the unified
 * deleteRow in matrix.ts handles those.
 */
export const removeTreePosition = (db: Database, matrixId: number, rowId: number): void => {
  const keyStmt = db.prepare('SELECT key FROM rank WHERE matrix_id = ? AND row_id = ?')
  keyStmt.bind([matrixId, rowId])
  if (!keyStmt.step()) {
    keyStmt.finalize()
    throw new Error(`Row ${rowId} not found in rank table for matrix ${matrixId}`)
  }
  const key = new Uint8Array((keyStmt.get({}) as { key: Uint8Array }).key)
  keyStmt.finalize()

  if (hasTrait(db, matrixId, 'closure')) {
    const parentKey = getParent(db, matrixId, key)
    const children = getChildren(db, matrixId, key)

    let prevSiblingKey: Uint8Array | undefined = undefined
    for (const childKey of children) {
      const newKey = reparentRow(db, {
        matrixId,
        nodeKey: childKey,
        newParentKey: parentKey ?? undefined,
        prevSiblingKey,
      })
      prevSiblingKey = newKey
    }

    db.exec(
      `DELETE FROM "mx_${matrixId}_closure"
       WHERE ancestor_key = ? OR descendant_key = ?`,
      { bind: [key, key] },
    )
  }

  db.exec('DELETE FROM rank WHERE matrix_id = ? AND key = ?', {
    bind: [matrixId, key],
  })
}

// -- Tree-specific compound operations ----------------------------------------
// Called directly by callers that know they're working with tree structure.

/**
 * Move a row (and its subtree) to a new parent/position. Rewrites rank keys
 * for the entire subtree and updates the closure table.
 */
export const reparentRow = (
  db: Database,
  params: {
    matrixId: number
    nodeKey: Uint8Array
    newParentKey?: Uint8Array
    prevSiblingKey?: Uint8Array
    nextSiblingKey?: Uint8Array
  },
): Uint8Array => {
  const { matrixId, nodeKey, newParentKey, prevSiblingKey, nextSiblingKey } = params

  return withTransaction(db, () => {
    const oldKey = nodeKey
    const oldUpperBound = nextPrefix(oldKey)

    if (newParentKey) {
      const cycleStmt = db.prepare(`
        SELECT 1 FROM "mx_${matrixId}_closure"
        WHERE ancestor_key = ? AND descendant_key = ? AND depth > 0
      `)
      cycleStmt.bind([oldKey, newParentKey])
      if (cycleStmt.step()) {
        cycleStmt.finalize()
        throw new Error('Cannot reparent a node under one of its own descendants')
      }
      cycleStmt.finalize()
    }

    let newKey: Uint8Array

    if (prevSiblingKey && nextSiblingKey) {
      newKey = between(prevSiblingKey, nextSiblingKey)
    } else if (prevSiblingKey) {
      let upperBound = new Uint8Array(0)

      if (newParentKey) {
        const parentUpper = nextPrefix(newParentKey)
        const stmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key > ? AND key < ?
            AND NOT (key >= ? AND key < ?)
          ORDER BY key ASC
          LIMIT 1
        `)
        stmt.bind([matrixId, prevSiblingKey, parentUpper, oldKey, oldUpperBound])

        if (stmt.step()) {
          const result = stmt.get({}) as { key: Uint8Array }
          const candidateKey = new Uint8Array(result.key)
          const candidateSegments = parseKey(candidateKey)
          const parentSegments = parseKey(newParentKey)
          if (candidateSegments.length === parentSegments.length + 1) {
            upperBound = candidateKey
          }
        }
        stmt.finalize()
      } else {
        let globalLowerBound = prevSiblingKey
        const stmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key > ?
            AND NOT (key >= ? AND key < ?)
          ORDER BY key ASC
          LIMIT 1
        `)
        stmt.bind([matrixId, prevSiblingKey, oldKey, oldUpperBound])

        if (stmt.step()) {
          const result = stmt.get({}) as { key: Uint8Array }
          const candidateKey = new Uint8Array(result.key)
          const prevSegments = parseKey(prevSiblingKey)
          const candidateSegments = parseKey(candidateKey)
          if (candidateSegments.length > prevSegments.length) {
            globalLowerBound = nextPrefix(prevSiblingKey)
          } else {
            upperBound = candidateKey
          }
        }
        stmt.finalize()

        if (upperBound.length === 0) {
          const globalStmt = db.prepare(`
            SELECT key FROM rank
            WHERE key > ?
              AND NOT (key >= ? AND key < ?)
            ORDER BY key ASC
            LIMIT 1
          `)
          globalStmt.bind([globalLowerBound, oldKey, oldUpperBound])
          if (globalStmt.step()) {
            const gResult = globalStmt.get({}) as { key: Uint8Array }
            upperBound = new Uint8Array(gResult.key)
          }
          globalStmt.finalize()
        }
      }

      newKey = between(prevSiblingKey, upperBound)
    } else if (nextSiblingKey) {
      let lowerBound = new Uint8Array(0)

      if (newParentKey) {
        const stmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key < ? AND key > ?
            AND NOT (key >= ? AND key < ?)
          ORDER BY key DESC
          LIMIT 1
        `)
        stmt.bind([matrixId, nextSiblingKey, newParentKey, oldKey, oldUpperBound])

        if (stmt.step()) {
          const result = stmt.get({}) as { key: Uint8Array }
          const candidateKey = new Uint8Array(result.key)
          const candidateSegments = parseKey(candidateKey)
          const parentSegments = parseKey(newParentKey)
          if (candidateSegments.length === parentSegments.length + 1) {
            lowerBound = candidateKey
          } else {
            lowerBound = new Uint8Array(newParentKey)
          }
        } else {
          lowerBound = new Uint8Array(newParentKey)
        }
        stmt.finalize()
      } else {
        const stmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key < ?
            AND NOT (key >= ? AND key < ?)
          ORDER BY key DESC
          LIMIT 1
        `)
        stmt.bind([matrixId, nextSiblingKey, oldKey, oldUpperBound])

        if (stmt.step()) {
          const result = stmt.get({}) as { key: Uint8Array }
          lowerBound = new Uint8Array(result.key)
        }
        stmt.finalize()
      }

      newKey = between(lowerBound, nextSiblingKey)
    } else if (newParentKey) {
      const parentUpper = nextPrefix(newParentKey)
      const stmt = db.prepare(`
        SELECT key FROM rank
        WHERE matrix_id = ? AND key > ? AND key < ?
          AND NOT (key >= ? AND key < ?)
        ORDER BY key ASC
        LIMIT 1
      `)
      stmt.bind([matrixId, newParentKey, parentUpper, oldKey, oldUpperBound])

      if (stmt.step()) {
        const result = stmt.get({}) as { key: Uint8Array }
        const nextChild = new Uint8Array(result.key)
        stmt.finalize()
        newKey = between(newParentKey, nextChild)
      } else {
        stmt.finalize()
        const parentSegments = parseKey(newParentKey)
        const newSegment = new Uint8Array([0x80])
        newKey = makeKey([...parentSegments, newSegment])
      }
    } else {
      const stmt = db.prepare(`
        SELECT key FROM rank
        WHERE matrix_id = ?
          AND NOT (key >= ? AND key < ?)
        ORDER BY key DESC
        LIMIT 1
      `)
      stmt.bind([matrixId, oldKey, oldUpperBound])

      let lastKey = new Uint8Array(0)
      if (stmt.step()) {
        const result = stmt.get({}) as { key: Uint8Array }
        lastKey = new Uint8Array(result.key)
      }
      stmt.finalize()

      newKey = between(lastKey, new Uint8Array(0))
    }

    db.exec(
      `
      DELETE FROM "mx_${matrixId}_closure"
      WHERE descendant_key IN (
          SELECT descendant_key FROM "mx_${matrixId}_closure" WHERE ancestor_key = ?
        )
        AND ancestor_key NOT IN (
          SELECT descendant_key FROM "mx_${matrixId}_closure" WHERE ancestor_key = ?
        )
    `,
      { bind: [oldKey, oldKey] },
    )

    if (newParentKey) {
      db.exec(
        `
        INSERT INTO "mx_${matrixId}_closure" (ancestor_key, descendant_key, depth)
        SELECT a.ancestor_key, d.descendant_key, a.depth + d.depth + 1
        FROM "mx_${matrixId}_closure" a
        CROSS JOIN "mx_${matrixId}_closure" d
        WHERE a.descendant_key = ?
          AND d.ancestor_key = ?
      `,
        { bind: [newParentKey, oldKey] },
      )
    }

    const substrStart = oldKey.length + 1
    db.exec(
      `
      UPDATE rank
      SET key = UNHEX(HEX(?) || HEX(substr(key, ?)))
      WHERE matrix_id = ? AND key >= ? AND key < ?
    `,
      { bind: [newKey, substrStart, matrixId, oldKey, oldUpperBound] },
    )

    db.exec(
      `
      UPDATE "mx_${matrixId}_closure"
      SET ancestor_key = UNHEX(HEX(?) || HEX(substr(ancestor_key, ?))),
          descendant_key = UNHEX(HEX(?) || HEX(substr(descendant_key, ?)))
      WHERE (ancestor_key >= ? AND ancestor_key < ?)
        AND (descendant_key >= ? AND descendant_key < ?)
    `,
      {
        bind: [
          newKey,
          substrStart,
          newKey,
          substrStart,
          oldKey,
          oldUpperBound,
          oldKey,
          oldUpperBound,
        ],
      },
    )
    db.exec(
      `
      UPDATE "mx_${matrixId}_closure"
      SET descendant_key = UNHEX(HEX(?) || HEX(substr(descendant_key, ?)))
      WHERE (descendant_key >= ? AND descendant_key < ?)
        AND NOT (ancestor_key >= ? AND ancestor_key < ?)
    `,
      {
        bind: [newKey, substrStart, oldKey, oldUpperBound, oldKey, oldUpperBound],
      },
    )

    return newKey
  })
}

/**
 * Delete a row and all its descendants. Removes rank entries, all closure
 * relationships involving any subtree key, and data table rows.
 */
export const deleteSubtree = (
  db: Database,
  params: {
    matrixId: number
    key: Uint8Array
  },
): void => {
  const { matrixId, key } = params
  const upperBound = nextPrefix(key)

  withTransaction(db, () => {
    const subtreeStmt = db.prepare(`
      SELECT row_id, row_kind FROM rank
      WHERE matrix_id = ? AND key >= ? AND key < ?
    `)
    subtreeStmt.bind([matrixId, key, upperBound])

    const dataRowIds: number[] = []
    while (subtreeStmt.step()) {
      const row = subtreeStmt.get({}) as { row_id: number; row_kind: number }
      if (row.row_kind === 0) {
        dataRowIds.push(row.row_id)
      }
    }
    subtreeStmt.finalize()

    if (dataRowIds.length === 0) {
      const existsStmt = db.prepare('SELECT 1 FROM rank WHERE matrix_id = ? AND key = ?')
      existsStmt.bind([matrixId, key])
      if (!existsStmt.step()) {
        existsStmt.finalize()
        throw new Error('Row not found in rank table')
      }
      existsStmt.finalize()
    }

    db.exec(
      `DELETE FROM "mx_${matrixId}_closure"
       WHERE ancestor_key >= ? AND ancestor_key < ?`,
      { bind: [key, upperBound] },
    )
    db.exec(
      `DELETE FROM "mx_${matrixId}_closure"
       WHERE descendant_key >= ? AND descendant_key < ?`,
      { bind: [key, upperBound] },
    )

    db.exec('DELETE FROM rank WHERE matrix_id = ? AND key >= ? AND key < ?', {
      bind: [matrixId, key, upperBound],
    })

    for (const rowId of dataRowIds) {
      db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, {
        bind: [rowId],
      })
    }
  })
}

// -- Tree queries -------------------------------------------------------------

/**
 * Get direct children of a node in rank order.
 * @returns Array of child keys in rank (display) order, empty if no children
 */
export const getChildren = (
  db: Database,
  matrixId: number,
  parentKey: Uint8Array,
): Uint8Array[] => {
  const stmt = db.prepare(`
    SELECT c.descendant_key
    FROM "mx_${matrixId}_closure" c
    JOIN rank r ON r.key = c.descendant_key AND r.matrix_id = ?
    WHERE c.ancestor_key = ? AND c.depth = 1
    ORDER BY r.key
  `)
  stmt.bind([matrixId, parentKey])

  const children: Uint8Array[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as { descendant_key: Uint8Array }
    children.push(new Uint8Array(row.descendant_key))
  }
  stmt.finalize()
  return children
}

/**
 * Get the parent key of a node, or null if the node is at root level.
 */
export const getParent = (
  db: Database,
  matrixId: number,
  childKey: Uint8Array,
): Uint8Array | null => {
  const stmt = db.prepare(`
    SELECT ancestor_key
    FROM "mx_${matrixId}_closure"
    WHERE descendant_key = ? AND depth = 1
  `)
  stmt.bind([childKey])

  if (stmt.step()) {
    const row = stmt.get({}) as { ancestor_key: Uint8Array }
    const result = new Uint8Array(row.ancestor_key)
    stmt.finalize()
    return result
  }

  stmt.finalize()
  return null
}

/**
 * Get the depth of a node in the hierarchy.
 * Returns null if the key has no closure entries.
 */
export const getDepth = (db: Database, matrixId: number, key: Uint8Array): number | null => {
  const stmt = db.prepare(`
    SELECT MAX(depth) as max_depth
    FROM "mx_${matrixId}_closure"
    WHERE descendant_key = ?
  `)
  stmt.bind([key])

  if (stmt.step()) {
    const row = stmt.get({}) as { max_depth: number | null }
    stmt.finalize()
    return row.max_depth
  }

  stmt.finalize()
  return null
}

// -- Closure maintenance ------------------------------------------------------

/**
 * Rebuild the closure table for a matrix from rank keys.
 *
 * Drops all rows in the closure table and reconstructs it by walking the rank
 * key hierarchy. Since rank keys encode parent-child relationships via prefix
 * structure, the parent of any key with N segments is the key with N-1 segments.
 */
export const rebuildClosure = (db: Database, matrixId: number): void => {
  withTransaction(db, () => {
    db.exec(`DELETE FROM "mx_${matrixId}_closure"`)

    const rankStmt = db.prepare('SELECT key FROM rank WHERE matrix_id = ? ORDER BY key')
    rankStmt.bind([matrixId])

    const keys: Uint8Array[] = []
    while (rankStmt.step()) {
      keys.push(new Uint8Array((rankStmt.get({}) as { key: Uint8Array }).key))
    }
    rankStmt.finalize()

    for (const key of keys) {
      db.exec(
        `INSERT INTO "mx_${matrixId}_closure" (ancestor_key, descendant_key, depth)
         VALUES (?, ?, 0)`,
        { bind: [key, key] },
      )

      const segments = parseKey(key)
      if (segments.length > 1) {
        const parentKey = makeKey(segments.slice(0, -1))

        const ancestorsStmt = db.prepare(
          `SELECT ancestor_key, depth FROM "mx_${matrixId}_closure"
           WHERE descendant_key = ?`,
        )
        ancestorsStmt.bind([parentKey])

        const ancestors: { ancestor_key: Uint8Array; depth: number }[] = []
        while (ancestorsStmt.step()) {
          ancestors.push(ancestorsStmt.get({}) as { ancestor_key: Uint8Array; depth: number })
        }
        ancestorsStmt.finalize()

        for (const ancestor of ancestors) {
          db.exec(
            `INSERT INTO "mx_${matrixId}_closure" (ancestor_key, descendant_key, depth)
             VALUES (?, ?, ?)`,
            { bind: [ancestor.ancestor_key, key, ancestor.depth + 1] },
          )
        }
      }
    }
  })
}
