import type { Database } from '@sqlite.org/sqlite-wasm'

import { matchDiscoveryNode, rankDiscoveryResults } from '../discovery/ranking'
import type {
  DiscoveryBreadcrumb,
  DiscoveryCatalogEntry,
  DiscoveryFilter,
  DiscoveryRankingSignals,
} from '../discovery/types'

import { extractTextFromPmDoc } from './pm-text'
import {
  hydratePlaceNavigation,
  resolveExistingPlaceAnchor,
  type PlaceNavigationAnchor,
  type ResolvedPlaceNavigation,
} from './place-navigation'
import type { NodeRef } from './tree'

export type QueryDiscoveryCatalogInput = {
  readonly rootMatrixId: number
  readonly query: string
  readonly filter: DiscoveryFilter
  readonly limit: number
  readonly rankingSignals?: DiscoveryRankingSignals
}

type MatrixCatalogRow = {
  id: number
  title: string
  owner_matrix_id: number | null
  owner_row_id: number | null
  label_column: string | null
  content_column: string | null
}

type RankableCatalogCandidate = Omit<DiscoveryCatalogEntry, 'breadcrumb' | 'navigation'> & {
  readonly anchor: PlaceNavigationAnchor | null
}

const MAX_LIMIT = 100
const CANDIDATE_MULTIPLIER = 8
const MAX_CANDIDATES = 256
const MAX_TEXT_LENGTH = 240
const MAX_BREADCRUMB_ITEMS = 8
const MAX_BREADCRUMB_LABEL_LENGTH = 1_024

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`
const shouldScanContent = (filter: DiscoveryFilter): boolean => filter === 'all'

export const buildDiscoveryRowProjection = (
  labelColumn: string | null,
  contentColumn: string | null,
  filter: DiscoveryFilter,
): string | null => {
  if (labelColumn === null && contentColumn === null) return null
  const columns = [labelColumn, shouldScanContent(filter) ? contentColumn : null].filter(
    (column, index, selected): column is string =>
      column !== null && selected.indexOf(column) === index,
  )
  return ['id', ...columns.map(quoteIdentifier)].join(', ')
}

const compositeKey = (node: NodeRef): string => `${node.matrixId}:${node.rowId}`
const nodeEntryId = (family: RankableCatalogCandidate['family'], node: NodeRef): string =>
  `${family}:${node.matrixId}:${node.rowId}`

const bytesKey = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const excerpt = (value: string, query: string): string => {
  if (value.length <= MAX_TEXT_LENGTH) return value
  const normalizedValue = value.toLocaleLowerCase()
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchIndex = normalizedQuery ? normalizedValue.indexOf(normalizedQuery) : 0
  const start = Math.max(0, matchIndex - Math.floor(MAX_TEXT_LENGTH / 3))
  const prefix = start > 0 ? '…' : ''
  let end = Math.min(value.length, start + MAX_TEXT_LENGTH - prefix.length)
  const suffix = end < value.length ? '…' : ''
  if (suffix) end -= suffix.length
  return `${prefix}${value.slice(start, end)}${suffix}`
}

const breadcrumbLabel = (value: string, fallback: string): string => {
  const characters = Array.from(value || fallback)
  if (characters.length <= MAX_BREADCRUMB_LABEL_LENGTH) return characters.join('')

  const retainedLength = MAX_BREADCRUMB_LABEL_LENGTH - 1
  const prefixLength = Math.ceil(retainedLength / 2)
  const suffixLength = retainedLength - prefixLength
  return `${characters.slice(0, prefixLength).join('')}…${characters.slice(-suffixLength).join('')}`
}

const readMatrixCatalog = (db: Database): MatrixCatalogRow[] => {
  const statement = db.prepare(`
    SELECT m.id, m.title, m.owner_matrix_id, m.owner_row_id,
           label.name AS label_column, content.name AS content_column
    FROM matrix m
    LEFT JOIN matrix_columns label
      ON label.matrix_id = m.id AND label.role = 'label'
    LEFT JOIN matrix_columns content
      ON content.matrix_id = m.id AND content.role = 'content'
    ORDER BY m.id
  `)
  const catalog: MatrixCatalogRow[] = []
  while (statement.step()) catalog.push(statement.get({}) as MatrixCatalogRow)
  statement.finalize()
  return catalog
}

const readIdentitySet = (
  db: Database,
  table: 'block_sources' | 'promoted_nodes',
  matrixColumn: string,
  rowColumn: string,
): Set<string> => {
  const statement = db.prepare(
    `SELECT ${matrixColumn} AS matrix_id, ${rowColumn} AS row_id FROM ${table}`,
  )
  const identities = new Set<string>()
  while (statement.step()) {
    const row = statement.get({}) as { matrix_id: number; row_id: number }
    identities.add(compositeKey({ matrixId: row.matrix_id, rowId: row.row_id }))
  }
  statement.finalize()
  return identities
}

const rankingEntry = (candidate: RankableCatalogCandidate): DiscoveryCatalogEntry => {
  const { anchor: _anchor, ...entry } = candidate
  return { ...entry, breadcrumb: [], navigation: null }
}

const retainBestCandidates = (
  candidates: RankableCatalogCandidate[],
  input: QueryDiscoveryCatalogInput,
  candidateLimit: number,
): RankableCatalogCandidate[] => {
  if (candidates.length <= candidateLimit) return candidates
  const rankedIds = new Set(
    rankDiscoveryResults(
      candidates.map(rankingEntry),
      [],
      input.query,
      input.filter,
      candidateLimit,
      input.rankingSignals,
    ).map(({ id }) => id),
  )
  return candidates.filter(({ id }) => rankedIds.has(id))
}

const readNodeText = (
  db: Database,
  node: NodeRef,
  matrixById: ReadonlyMap<number, MatrixCatalogRow>,
): { label: string; content: string } | null => {
  const matrix = matrixById.get(node.matrixId)
  if (!matrix) return null
  const fields = [matrix.label_column, matrix.content_column].filter(
    (column): column is string => column !== null,
  )
  if (fields.length === 0) return { label: '', content: '' }
  const statement = db.prepare(
    `SELECT ${fields.map(quoteIdentifier).join(', ')} FROM "mx_${node.matrixId}_data" WHERE id = ?`,
  )
  statement.bind([node.rowId])
  if (!statement.step()) {
    statement.finalize()
    return null
  }
  const row = statement.get({}) as Record<string, unknown>
  statement.finalize()
  return {
    label: matrix.label_column ? extractTextFromPmDoc(row[matrix.label_column]) : '',
    content: matrix.content_column ? extractTextFromPmDoc(row[matrix.content_column]) : '',
  }
}

const readPositionBreadcrumb = (
  db: Database,
  rootTitle: string,
  key: Uint8Array,
  matrixById: ReadonlyMap<number, MatrixCatalogRow>,
): DiscoveryBreadcrumb[] => {
  const statement = db.prepare(
    `SELECT matrix_id, row_id
     FROM scroll_index
     WHERE is_ghost = 0
       AND length(global_lexkey) < length(?)
       AND substr(?, 1, length(global_lexkey)) = global_lexkey
     ORDER BY depth DESC
     LIMIT ?`,
  )
  statement.bind([key, key, MAX_BREADCRUMB_ITEMS - 1])
  const nearestFirst: NodeRef[] = []
  while (statement.step()) {
    const row = statement.get({}) as { matrix_id: number; row_id: number }
    nearestFirst.push({ matrixId: row.matrix_id, rowId: row.row_id })
  }
  statement.finalize()

  return [
    { label: breadcrumbLabel(rootTitle, 'Workspace') },
    ...nearestFirst.reverse().map((node) => ({
      node,
      label: breadcrumbLabel(readNodeText(db, node, matrixById)?.label ?? '', 'Untitled'),
    })),
  ]
}

const readBreadcrumb = (
  db: Database,
  rootTitle: string,
  navigation: ResolvedPlaceNavigation,
  matrixById: ReadonlyMap<number, MatrixCatalogRow>,
): DiscoveryBreadcrumb[] => {
  if (navigation.type === 'position') {
    return readPositionBreadcrumb(db, rootTitle, navigation.appearance.key, matrixById)
  }
  return [
    { label: breadcrumbLabel(rootTitle, 'Workspace') },
    ...navigation.containers.map(({ node }) => ({
      node,
      label: breadcrumbLabel(readNodeText(db, node, matrixById)?.label ?? '', 'Untitled'),
    })),
  ].slice(-MAX_BREADCRUMB_ITEMS)
}

const structuralFacts = (
  navigation: PlaceNavigationAnchor,
): { depth: number; order: string } => {
  if (navigation.type === 'position') {
    return {
      depth: navigation.appearance.depth,
      order: bytesKey(navigation.appearance.key),
    }
  }
  const lastContainer = navigation.containers.at(-1)
  return {
    depth: navigation.containers.length,
    order:
      lastContainer?.key ?
        bytesKey(lastContainer.key)
      : `${navigation.matrixId.toString().padStart(16, '0')}:${navigation.node.rowId
          .toString()
          .padStart(16, '0')}`,
  }
}

/**
 * Scan semantic label/content roles in one worker call. The scan is necessarily linear until FTS,
 * but retained text, navigation hydration, breadcrumbs, and the returned catalog are all capped.
 */
export const queryDiscoveryCatalog = (
  db: Database,
  requested: QueryDiscoveryCatalogInput,
): DiscoveryCatalogEntry[] => {
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(requested.limit)))
  const input = { ...requested, limit }
  const candidateLimit = Math.min(MAX_CANDIDATES, limit * CANDIDATE_MULTIPLIER)
  const matrices = readMatrixCatalog(db)
  const matrixById = new Map(matrices.map((matrix) => [matrix.id, matrix]))
  const rootMatrix = matrixById.get(input.rootMatrixId)
  if (!rootMatrix) return []

  const ownedByNode = new Map<string, MatrixCatalogRow[]>()
  for (const matrix of matrices) {
    if (matrix.owner_matrix_id == null || matrix.owner_row_id == null) continue
    const key = compositeKey({ matrixId: matrix.owner_matrix_id, rowId: matrix.owner_row_id })
    const owned = ownedByNode.get(key) ?? []
    owned.push(matrix)
    ownedByNode.set(key, owned)
  }
  const views = readIdentitySet(db, 'block_sources', 'marker_matrix_id', 'marker_row_id')
  const types = readIdentitySet(db, 'promoted_nodes', 'matrix_id', 'row_id')
  let candidates: RankableCatalogCandidate[] = []

  const rootLabel = extractTextFromPmDoc(rootMatrix.title) || rootMatrix.title || 'Workspace'
  const rootMatch = matchDiscoveryNode(rootLabel, '', input.query, input.filter)
  if (rootMatch) {
    candidates.push({
      id: `root:${rootMatrix.id}`,
      family: 'container',
      target: { type: 'root', matrixId: rootMatrix.id },
      subjectMatrixId: rootMatrix.id,
      label: excerpt(rootLabel, input.query),
      content: '',
      ownedMatrixIds: [rootMatrix.id],
      ...rootMatch,
      anchor: null,
      structuralDepth: 0,
      structuralOrder: '',
    })
  }

  for (const matrix of matrices) {
    const projection = buildDiscoveryRowProjection(
      matrix.label_column,
      matrix.content_column,
      input.filter,
    )
    if (!projection) continue
    const statement = db.prepare(
      `SELECT ${projection}
       FROM "mx_${matrix.id}_data" ORDER BY id`,
    )
    while (statement.step()) {
      const row = statement.get({}) as Record<string, unknown>
      const node = { matrixId: matrix.id, rowId: row.id as number }
      const identity = compositeKey(node)
      const label = matrix.label_column ? extractTextFromPmDoc(row[matrix.label_column]) : ''
      const content =
        matrix.content_column && shouldScanContent(input.filter) ?
          extractTextFromPmDoc(row[matrix.content_column])
        : ''
      const browsing = input.query.trim() === ''
      const rowMatch = matchDiscoveryNode(label, content, input.query, input.filter)
      const rowMatches = browsing ? label.trim() !== '' : rowMatch !== null
      const ownedMatrices = ownedByNode.get(identity) ?? []
      const isView = views.has(identity)
      const isType = types.has(identity)

      if (isView || isType || ownedMatrices.length === 0) {
        if (!rowMatches || !rowMatch) continue
        const anchor = resolveExistingPlaceAnchor(db, input.rootMatrixId, node)
        if (!anchor) continue
        const structural = structuralFacts(anchor)
        const family =
          isView ? 'view'
          : isType ? 'type'
          : 'row'
        candidates.push({
          id: nodeEntryId(family, node),
          family,
          target: { type: 'node', node },
          subjectMatrixId: isType ? ownedMatrices[0]?.id : undefined,
          label: excerpt(label, input.query),
          content: excerpt(content, input.query),
          ownedMatrixIds: ownedMatrices.map(({ id }) => id),
          ...rowMatch,
          anchor,
          structuralDepth: structural.depth,
          structuralOrder: structural.order,
        })
      } else {
        const matchingOwnedMatrices = ownedMatrices.flatMap((ownedMatrix) => {
          const containerLabel = ownedMatrix.title || label
          const containerContent = `${label} ${content}`.trim()
          const match = matchDiscoveryNode(
            containerLabel,
            containerContent,
            input.query,
            input.filter,
          )
          return match ?
              [{ matrix: ownedMatrix, label: containerLabel, content: containerContent, match }]
            : []
        })
        if (matchingOwnedMatrices.length === 0) continue
        const anchor = resolveExistingPlaceAnchor(db, input.rootMatrixId, node)
        if (!anchor) continue
        const structural = structuralFacts(anchor)
        for (const candidate of matchingOwnedMatrices) {
          candidates.push({
            id: `container:${candidate.matrix.id}`,
            family: 'container',
            target: { type: 'node', node },
            subjectMatrixId: candidate.matrix.id,
            label: excerpt(candidate.label, input.query),
            content: excerpt(candidate.content, input.query),
            ownedMatrixIds: [candidate.matrix.id],
            ...candidate.match,
            anchor,
            structuralDepth: structural.depth,
            structuralOrder: structural.order,
          })
        }
      }

      if (candidates.length >= candidateLimit * 2) {
        candidates = retainBestCandidates(candidates, input, candidateLimit)
      }
    }
    statement.finalize()
  }

  candidates = retainBestCandidates(candidates, input, candidateLimit)
  const hydrated: DiscoveryCatalogEntry[] = []
  for (const candidate of candidates) {
    const { anchor, ...entry } = candidate
    if (candidate.target.type === 'root') {
      hydrated.push({
        ...entry,
        breadcrumb: [],
        navigation: null,
      })
      continue
    }
    if (!anchor) continue
    const navigation = hydratePlaceNavigation(db, anchor)
    hydrated.push({
      ...entry,
      breadcrumb: readBreadcrumb(db, rootLabel, navigation, matrixById),
      navigation,
    })
  }

  return rankDiscoveryResults(
    hydrated,
    [],
    input.query,
    input.filter,
    candidateLimit,
    input.rankingSignals,
  ).map((result) => hydrated.find(({ id }) => id === result.id)!)
}
