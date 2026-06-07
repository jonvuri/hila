// Seeded, deterministic forest generator for perf fixtures.
//
// Produces a reproducible tree (same seed -> byte-identical keys/ids) at a
// controlled scale: total node count, max depth, and sibling breadth. The
// shape is chosen by a small seeded PRNG so a guard can pick "a deep leaf" or
// "a node at depth d" without hard-coding ids, and a scaling test can request
// N and kN nodes from the same generator.
//
// It builds against the current rank+closure schema using the real structural
// ops (`insertDataRow` + `createTreePosition`), so it doubles as an exercise of
// those paths. When Phase 8 lands the edge model, only the insertion call here
// changes; the shape/seed contract stays.

import type { Database } from '@sqlite.org/sqlite-wasm'

import { createMatrix, insertDataRow } from '../core/matrix'
import { createTreePosition } from '../core/tree'
import { withTransaction } from '../core/transaction'

export type ForestNode = {
  matrixId: number
  rowId: number
  /** The node's sibling-local own-edge key (its order among its siblings). */
  edgeKey: Uint8Array
  depth: number
  parentRowId: number | null
}

export type Forest = {
  matrixId: number
  /** All nodes in insertion order. */
  nodes: ForestNode[]
  /** Root-level nodes (depth 0). */
  roots: () => ForestNode[]
  /** Leaf nodes (no children). */
  leaves: () => ForestNode[]
  /** Nodes at a given depth. */
  atDepth: (depth: number) => ForestNode[]
  /** A deterministic deep leaf (deepest, lowest rowId tie-break). */
  deepestLeaf: () => ForestNode
}

export type GenerateForestOptions = {
  matrixId: number
  count: number
  maxDepth?: number
  breadth?: number
  seed?: number
  /** Column to populate with a small richtext doc (default `label`). */
  labelColumn?: string
  /** Probability of starting a new root rather than nesting (default 0.05). */
  rootProbability?: number
}

// Deterministic PRNG (mulberry32). Same seed -> same sequence across runs.
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const richtextDoc = (text: string): string =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

/**
 * Create a matrix suitable for forest fixtures: `label`/`content` richtext
 * columns. Rows live in the own-forest unconditionally (no per-matrix trait
 * provisioning needed -- the own-edge is universal infrastructure).
 */
export const createForestMatrix = (db: Database, title = 'Forest'): number => {
  return createMatrix(db, title, [
    { name: 'label', type: 'TEXT', role: 'label' },
    { name: 'content', type: 'TEXT', role: 'content' },
  ])
}

const makeForestView = (matrixId: number, nodes: ForestNode[]): Forest => {
  const childCounts = new Map<number, number>()
  for (const node of nodes) {
    if (node.parentRowId !== null) {
      childCounts.set(node.parentRowId, (childCounts.get(node.parentRowId) ?? 0) + 1)
    }
  }

  return {
    matrixId,
    nodes,
    roots: () => nodes.filter((n) => n.depth === 0),
    leaves: () => nodes.filter((n) => (childCounts.get(n.rowId) ?? 0) === 0),
    atDepth: (depth) => nodes.filter((n) => n.depth === depth),
    deepestLeaf: () => {
      let best = nodes[0]!
      for (const node of nodes) {
        const isLeaf = (childCounts.get(node.rowId) ?? 0) === 0
        if (!isLeaf) continue
        if (node.depth > best.depth || (node.depth === best.depth && node.rowId < best.rowId)) {
          best = node
        }
      }
      return best
    },
  }
}

/**
 * Generate `count` nodes into `matrixId`, returning a queryable forest view.
 * Idempotent only with respect to its own seed; call against a freshly created
 * matrix.
 */
export const generateForest = (db: Database, options: GenerateForestOptions): Forest => {
  const {
    matrixId,
    count,
    maxDepth = 5,
    breadth = 8,
    seed = 1,
    labelColumn = 'label',
    rootProbability = 0.05,
  } = options

  const rand = mulberry32(seed)
  const nodes: ForestNode[] = []
  const childCount = new Map<number, number>()
  // Nodes that can still accept children (depth < maxDepth and not yet full).
  const open: ForestNode[] = []

  withTransaction(db, () => {
    for (let i = 0; i < count; i++) {
      let parent: ForestNode | null = null
      let parentOpenIndex = -1

      if (open.length > 0 && rand() >= rootProbability) {
        parentOpenIndex = Math.floor(rand() * open.length)
        parent = open[parentOpenIndex]!
      }

      const rowId = insertDataRow(db, matrixId, { [labelColumn]: richtextDoc(`Node ${i}`) })
      const edgeKey = createTreePosition(
        db,
        matrixId,
        rowId,
        parent ? { parent: { matrixId, rowId: parent.rowId } } : undefined,
      )
      const depth = parent ? parent.depth + 1 : 0
      const node: ForestNode = {
        matrixId,
        rowId,
        edgeKey,
        depth,
        parentRowId: parent ? parent.rowId : null,
      }

      nodes.push(node)
      childCount.set(rowId, 0)
      if (depth < maxDepth) open.push(node)

      if (parent) {
        const updated = (childCount.get(parent.rowId) ?? 0) + 1
        childCount.set(parent.rowId, updated)
        if (updated >= breadth && parentOpenIndex >= 0) {
          open[parentOpenIndex] = open[open.length - 1]!
          open.pop()
        }
      }
    }
  })

  return makeForestView(matrixId, nodes)
}
