import type { Node } from 'prosemirror-model'

import { getTargets, insertJoin, deleteJoin } from '../core/client/matrix-client'

type LinkRef = { matrixId: number; rowId: number }

const linkKey = (ref: LinkRef) => `${ref.matrixId}:${ref.rowId}`

export const extractWikilinks = (doc: Node): LinkRef[] => {
  const links: LinkRef[] = []
  doc.descendants((node) => {
    if (node.type.name === 'wikilink') {
      const matrixId = node.attrs.matrixId as number
      const rowId = node.attrs.rowId as number
      if (matrixId != null && rowId != null) {
        links.push({ matrixId, rowId })
      }
    }
  })
  return links
}

/**
 * Sync wikilink nodes in a ProseMirror doc to the join table.
 * The PM doc is the source of truth: new links are inserted,
 * stale links are deleted.
 */
export const syncWikilinks = async (
  doc: Node,
  sourceMatrixId: number,
  sourceRowId: number,
): Promise<void> => {
  const docLinks = extractWikilinks(doc)
  const docSet = new Map<string, LinkRef>()
  for (const link of docLinks) {
    docSet.set(linkKey(link), link)
  }

  const currentTargets = await getTargets(sourceMatrixId, sourceRowId)
  const dbSet = new Set(
    currentTargets.map((t) => linkKey({ matrixId: t.targetMatrixId, rowId: t.targetRowId })),
  )

  const toInsert = [...docSet.entries()].filter(([key]) => !dbSet.has(key))
  const toDelete = currentTargets.filter(
    (t) => !docSet.has(linkKey({ matrixId: t.targetMatrixId, rowId: t.targetRowId })),
  )

  await Promise.all([
    ...toInsert.map(([, ref]) =>
      insertJoin(sourceMatrixId, sourceRowId, ref.matrixId, ref.rowId),
    ),
    ...toDelete.map((t) =>
      deleteJoin(sourceMatrixId, sourceRowId, t.targetMatrixId, t.targetRowId),
    ),
  ])
}
