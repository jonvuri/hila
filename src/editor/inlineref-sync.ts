import type { Node } from 'prosemirror-model'

import type { JoinKind } from '../core/matrix'
import {
  getTargets,
  insertJoin,
  deleteJoin,
  deleteOwnedTarget,
} from '../core/client/matrix-client'
import { execQuery } from '../core/client/sql-client'

export type InlineRef = {
  targetMatrixId: number
  targetRowId: number
  kind: JoinKind
}

const refKey = (ref: InlineRef) => `${ref.targetMatrixId}:${ref.targetRowId}`

export const extractInlineRefs = (doc: Node): InlineRef[] => {
  const refs: InlineRef[] = []
  doc.descendants((node) => {
    if (node.type.name === 'inlineref') {
      const targetMatrixId = node.attrs.targetMatrixId as number | null
      const targetRowId = node.attrs.targetRowId as number | null
      const kind = (node.attrs.kind as JoinKind) ?? 'ref'
      if (targetMatrixId != null && targetRowId != null) {
        refs.push({ targetMatrixId, targetRowId, kind })
      }
    }
  })
  return refs
}

/**
 * Sync inlineref nodes in a ProseMirror doc to the join table.
 * The PM doc is the source of truth: new refs are inserted, stale refs are
 * deleted. Removed `own`-kind joins cascade-delete their target rows.
 */
export const syncInlineRefs = async (
  doc: Node,
  sourceMatrixId: number,
  sourceRowId: number,
): Promise<void> => {
  const docRefs = extractInlineRefs(doc)
  const docMap = new Map<string, InlineRef>()
  for (const ref of docRefs) {
    docMap.set(refKey(ref), ref)
  }

  // Exclude same-matrix `own`-edges: those are the outline tree structure
  // (parent -> child), not inlineref-derived joins. Inlinerefs are `ref`-edges
  // (mentions) or cross-matrix `own`-edges (tag aspect rows). Reconciling the
  // tree edges here would cascade-delete the row's own children.
  const currentTargets = (await getTargets(sourceMatrixId, sourceRowId)).filter(
    (t) => !(t.kind === 'own' && t.targetMatrixId === sourceMatrixId),
  )
  const dbSet = new Set(
    currentTargets.map((t) =>
      refKey({ targetMatrixId: t.targetMatrixId, targetRowId: t.targetRowId, kind: t.kind }),
    ),
  )

  const toInsert = [...docMap.entries()].filter(([key]) => !dbSet.has(key))
  const toDelete = currentTargets.filter(
    (t) =>
      !docMap.has(
        refKey({ targetMatrixId: t.targetMatrixId, targetRowId: t.targetRowId, kind: t.kind }),
      ),
  )

  await Promise.all([
    ...toInsert.map(([, ref]) =>
      insertJoin(sourceMatrixId, sourceRowId, ref.targetMatrixId, ref.targetRowId, ref.kind),
    ),
    ...toDelete.map(async (t) => {
      await deleteJoin(sourceMatrixId, sourceRowId, t.targetMatrixId, t.targetRowId)
      if (t.kind === 'own') {
        await deleteOwnedTarget(t.targetMatrixId, t.targetRowId)
      }
    }),
  ])
}

/**
 * Refresh `cachedTitle` attrs in a PM doc JSON object before persisting.
 * Walks all `inlineref` nodes with non-null targets and queries each target's
 * current title, updating the `cachedTitle` attr in-place on the JSON. Returns
 * the (possibly mutated) doc JSON ready for storage.
 */
export const refreshCachedTitles = async (
  docJson: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const targets = collectTargets(docJson)
  if (targets.length === 0) return docJson

  const titleMap = new Map<string, string | null>()
  await Promise.all(
    targets.map(async ({ targetMatrixId, targetRowId }) => {
      const key = `${targetMatrixId}:${targetRowId}`
      if (titleMap.has(key)) return
      try {
        const rows = await execQuery(
          `SELECT title FROM "mx_${targetMatrixId}_data" WHERE id = ${targetRowId}`,
        )
        titleMap.set(key, rows.length > 0 ? String((rows[0] as { title: string }).title) : null)
      } catch {
        titleMap.set(key, null)
      }
    }),
  )

  updateCachedTitlesInPlace(docJson, titleMap)
  return docJson
}

type TargetPair = { targetMatrixId: number; targetRowId: number }

const collectTargets = (obj: unknown): TargetPair[] => {
  const result: TargetPair[] = []
  walkJson(obj, (node) => {
    if (
      node &&
      typeof node === 'object' &&
      (node as Record<string, unknown>).type === 'inlineref'
    ) {
      const attrs = (node as Record<string, unknown>).attrs as
        | Record<string, unknown>
        | undefined
      if (attrs && attrs.targetMatrixId != null && attrs.targetRowId != null) {
        result.push({
          targetMatrixId: attrs.targetMatrixId as number,
          targetRowId: attrs.targetRowId as number,
        })
      }
    }
  })
  return result
}

export const updateCachedTitlesInPlace = (
  obj: unknown,
  titleMap: Map<string, string | null>,
): void => {
  walkJson(obj, (node) => {
    if (
      node &&
      typeof node === 'object' &&
      (node as Record<string, unknown>).type === 'inlineref'
    ) {
      const attrs = (node as Record<string, unknown>).attrs as
        | Record<string, unknown>
        | undefined
      if (attrs && attrs.targetMatrixId != null && attrs.targetRowId != null) {
        const key = `${attrs.targetMatrixId}:${attrs.targetRowId}`
        const title = titleMap.get(key)
        if (title !== undefined) {
          attrs.cachedTitle = title
        }
      }
    }
  })
}

const walkJson = (obj: unknown, visitor: (node: unknown) => void): void => {
  if (obj == null || typeof obj !== 'object') return
  visitor(obj)
  if (Array.isArray(obj)) {
    for (const item of obj) walkJson(item, visitor)
  } else {
    for (const val of Object.values(obj as Record<string, unknown>)) {
      walkJson(val, visitor)
    }
  }
}
