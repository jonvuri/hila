import type { CommandEntry } from '../command-registry'

import type {
  DiscoveryCatalogEntry,
  DiscoveryCommandResult,
  DiscoveryFilter,
  DiscoveryMatchQuality,
  DiscoveryNodeMatch,
  DiscoveryNodeResult,
  DiscoveryResult,
} from './types'

const QUALITY_WEIGHT: Readonly<Record<DiscoveryMatchQuality, number>> = {
  browse: 0,
  exact: 400,
  prefix: 300,
  'word-prefix': 200,
  substring: 100,
}

const TARGET_WEIGHT = {
  label: 40,
  content: 0,
  'command-label': 40,
  'command-keyword': 20,
} as const

const normalize = (value: string): string => value.trim().toLocaleLowerCase()

const startsAWord = (value: string, query: string): boolean => {
  const words = value.split(/[\s\p{P}\p{S}]+/u)
  return words.some((word) => word.startsWith(query))
}

export const matchQuality = (
  candidate: string,
  query: string,
): DiscoveryMatchQuality | null => {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return 'browse'

  const normalizedCandidate = normalize(candidate)
  if (!normalizedCandidate.includes(normalizedQuery)) return null
  if (normalizedCandidate === normalizedQuery) return 'exact'
  if (normalizedCandidate.startsWith(normalizedQuery)) return 'prefix'
  if (startsAWord(normalizedCandidate, normalizedQuery)) return 'word-prefix'
  return 'substring'
}

const familyAllowed = (family: DiscoveryResult['family'], filter: DiscoveryFilter): boolean => {
  if (filter === 'types') return family === 'type'
  if (filter === 'commands') return family === 'command'
  if (filter === 'containers') return family === 'container' || family === 'type'
  return true
}

const labelOnly = (filter: DiscoveryFilter): boolean => filter !== 'all'

const score = (quality: DiscoveryMatchQuality, target: keyof typeof TARGET_WEIGHT): number =>
  QUALITY_WEIGHT[quality] + TARGET_WEIGHT[target]

export const matchDiscoveryNode = (
  label: string,
  content: string,
  query: string,
  filter: DiscoveryFilter,
): DiscoveryNodeMatch | null => {
  const labelQuality = matchQuality(label, query)
  const contentQuality = labelOnly(filter) ? null : matchQuality(content, query)
  if (!labelQuality && !contentQuality) return null

  const labelScore = labelQuality ? score(labelQuality, 'label') : -1
  const contentScore = contentQuality ? score(contentQuality, 'content') : -1
  return labelScore >= contentScore ?
      { matchQuality: labelQuality!, matchTarget: 'label', score: labelScore }
    : { matchQuality: contentQuality!, matchTarget: 'content', score: contentScore }
}

const nodeResult = (
  entry: DiscoveryCatalogEntry,
  filter: DiscoveryFilter,
): DiscoveryNodeResult | null => {
  if (!familyAllowed(entry.family, filter)) return null
  if (labelOnly(filter) && entry.matchTarget === 'content') return null
  const node = entry.target.type === 'node' ? entry.target.node : undefined

  return {
    id: entry.id,
    family: entry.family,
    node,
    rootMatrixId: entry.target.type === 'root' ? entry.target.matrixId : undefined,
    subjectMatrixId: entry.subjectMatrixId,
    provenance: entry.target.type === 'node' ? entry.target.provenance : undefined,
    label: entry.label || 'Untitled',
    detail: entry.matchTarget === 'content' ? entry.content : '',
    breadcrumb: entry.breadcrumb,
    navigation: entry.navigation,
    ownedMatrixIds: entry.ownedMatrixIds,
    matchTarget: entry.matchTarget,
    matchQuality: entry.matchQuality,
    score: entry.score,
    structuralDepth: entry.structuralDepth,
    structuralOrder: entry.structuralOrder,
  }
}

const bestCommandMatch = (
  entry: CommandEntry,
  query: string,
  matchVisibleLabelOnly: boolean,
): Pick<DiscoveryCommandResult, 'matchQuality' | 'matchTarget' | 'score'> | null => {
  const labelQuality = matchQuality(entry.command.label, query)
  if (matchVisibleLabelOnly) {
    return labelQuality ?
        {
          matchQuality: labelQuality,
          matchTarget: 'command-label',
          score: score(labelQuality, 'command-label'),
        }
      : null
  }
  const keywordQualities = [entry.command.id, ...entry.command.keywords]
    .map((keyword) => matchQuality(keyword, query))
    .filter((quality): quality is DiscoveryMatchQuality => quality !== null)
  const keywordQuality = keywordQualities.toSorted(
    (left, right) => QUALITY_WEIGHT[right] - QUALITY_WEIGHT[left],
  )[0]
  const labelScore = labelQuality ? score(labelQuality, 'command-label') : -1
  const keywordScore = keywordQuality ? score(keywordQuality, 'command-keyword') : -1
  if (labelScore < 0 && keywordScore < 0) return null
  return labelScore >= keywordScore ?
      { matchQuality: labelQuality!, matchTarget: 'command-label', score: labelScore }
    : { matchQuality: keywordQuality!, matchTarget: 'command-keyword', score: keywordScore }
}

const commandResult = (
  entry: CommandEntry,
  query: string,
  filter: DiscoveryFilter,
  registrationIndex: number,
): DiscoveryCommandResult | null => {
  if (!familyAllowed('command', filter)) return null
  const match = bestCommandMatch(entry, query, filter === 'named')
  if (!match) return null
  return {
    id: `command:${entry.command.id}`,
    family: 'command',
    commandId: entry.command.id,
    label: entry.command.label,
    detail: entry.unavailableReason ?? '',
    breadcrumb: [],
    commandEntry: entry,
    ...match,
    structuralDepth: 0,
    structuralOrder: registrationIndex.toString().padStart(12, '0'),
  }
}

export const compareDiscoveryResults = (
  left: DiscoveryResult,
  right: DiscoveryResult,
): number =>
  right.score - left.score ||
  left.structuralDepth - right.structuralDepth ||
  left.label.length - right.label.length ||
  left.structuralOrder.localeCompare(right.structuralOrder) ||
  left.id.localeCompare(right.id)

export const rankDiscoveryResults = (
  catalog: readonly DiscoveryCatalogEntry[],
  commands: readonly CommandEntry[],
  query: string,
  filter: DiscoveryFilter,
  limit: number,
): readonly DiscoveryResult[] => {
  const nodes = catalog
    .map((entry) => nodeResult(entry, filter))
    .filter((entry): entry is DiscoveryNodeResult => entry !== null)
  const commandResults = commands
    .map((entry, index) => commandResult(entry, query, filter, index))
    .filter((entry): entry is DiscoveryCommandResult => entry !== null)
  return [...nodes, ...commandResults].sort(compareDiscoveryResults).slice(0, limit)
}
