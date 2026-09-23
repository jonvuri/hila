import type { ShortcutDescriptor } from '../shortcuts'
import type { PlaceNavigationTarget } from '../core/place-navigation'
import type { DiscoveryFamily, DiscoveryFilter, DiscoveryResult } from '../discovery/types'
import { matchQuality } from '../discovery/ranking'
import type { SelectableListItem } from '../design/overlay/SelectableList'

export type LauncherFamilyFilter = Exclude<DiscoveryFilter, 'all'>

export type LauncherFamilyDefinition = {
  readonly filter: LauncherFamilyFilter
  readonly token: '@' | '#' | '>' | '['
  readonly label: string
  readonly searchTerms: readonly string[]
}

export const launcherFamilies: readonly LauncherFamilyDefinition[] = [
  {
    filter: 'named',
    token: '@',
    label: 'Named things',
    searchTerms: ['named', 'named things', 'things'],
  },
  { filter: 'types', token: '#', label: 'Types', searchTerms: ['type', 'types'] },
  {
    filter: 'commands',
    token: '>',
    label: 'Commands',
    searchTerms: ['command', 'commands', 'actions'],
  },
  {
    filter: 'containers',
    token: '[',
    label: 'Containers & matrixes',
    searchTerms: ['container', 'containers', 'matrix', 'matrixes', 'matrices'],
  },
] as const

export const launcherInteractionShortcutDescriptors = [
  { id: 'launcher.next-result', title: 'Next result', key: 'ArrowDown', context: 'launcher' },
  {
    id: 'launcher.previous-result',
    title: 'Previous result',
    key: 'ArrowUp',
    context: 'launcher',
  },
  { id: 'launcher.open-result', title: 'Open or run', key: 'Enter', context: 'launcher' },
  {
    id: 'launcher.remove-filter',
    title: 'Remove family filter',
    key: 'Backspace',
    context: 'launcher',
  },
  { id: 'launcher.help', title: 'Show launcher guide', key: '?', context: 'launcher' },
] as const satisfies readonly ShortcutDescriptor[]

export const launcherFamilyForToken = (token: string): LauncherFamilyDefinition | undefined =>
  launcherFamilies.find((family) => family.token === token)

export const splitLauncherInput = (
  value: string,
): { readonly filter: LauncherFamilyFilter | null; readonly query: string } => {
  const family = launcherFamilyForToken(value[0] ?? '')
  return family ?
      { filter: family.filter, query: value.slice(1) }
    : { filter: null, query: value }
}

export const familyFilterForResult = (family: DiscoveryFamily): LauncherFamilyFilter => {
  if (family === 'type') return 'types'
  if (family === 'command') return 'commands'
  if (family === 'container') return 'containers'
  return 'named'
}

export const familyMarkForResult = (family: DiscoveryFamily): string => {
  if (family === 'type') return '#'
  if (family === 'command') return '>'
  if (family === 'container') return '[]'
  if (family === 'view') return '≔'
  return '›'
}

const familySuggestionScore = (family: LauncherFamilyDefinition, query: string): number => {
  const weights = { exact: 4, prefix: 3, 'word-prefix': 2, substring: 1, browse: 0 }
  return Math.max(
    ...family.searchTerms.map((term) => {
      const quality = matchQuality(term, query)
      return quality ? weights[quality] : -1
    }),
  )
}

export type LauncherFamilyItem = SelectableListItem & {
  readonly kind: 'family'
  readonly filter: LauncherFamilyFilter
}

export type LauncherResultItem = SelectableListItem & {
  readonly kind: 'result'
  readonly result: DiscoveryResult
  readonly filter: LauncherFamilyFilter
}

export type LauncherListItem = LauncherFamilyItem | LauncherResultItem

export type LauncherObjectCommit =
  | {
      readonly type: 'kind'
      readonly matrixId: number
      readonly label: string
      readonly mark: '#' | '[]'
    }
  | {
      readonly type: 'scope'
      readonly node: { readonly matrixId: number; readonly rowId: number }
      readonly label: string
    }

export const authoringCommitForLauncherItem = (
  item: LauncherListItem,
): LauncherObjectCommit | null => {
  if (item.kind !== 'result' || item.result.family === 'command') return null
  if (
    (item.result.family === 'type' || item.result.family === 'container') &&
    item.result.subjectMatrixId != null
  ) {
    return {
      type: 'kind',
      matrixId: item.result.subjectMatrixId,
      label: item.result.label,
      mark: item.result.family === 'type' ? '#' : '[]',
    }
  }
  return item.result.node ?
      { type: 'scope', node: item.result.node, label: item.result.label }
    : null
}

const familySuggestions = (query: string): readonly LauncherFamilyItem[] => {
  if (!query.trim()) return []
  return launcherFamilies
    .map((family, index) => ({ family, index, score: familySuggestionScore(family, query) }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ family }) => ({
      id: `family:${family.filter}`,
      kind: 'family' as const,
      filter: family.filter,
      label: family.label,
      description: `Filter with ${family.token}`,
      mark: family.token,
      markLabel: `Show ${family.label.toLowerCase()}`,
    }))
}

const breadcrumbText = (result: DiscoveryResult): string =>
  result.breadcrumb
    .map(({ label }) => label)
    .filter(Boolean)
    .join(' › ')

const resultItem = (result: DiscoveryResult, subjectLabel?: string): LauncherResultItem => {
  const filter = familyFilterForResult(result.family)
  if (result.family === 'command') {
    const subjectDescription =
      result.commandEntry.command.subject === 'required' && subjectLabel ?
        `Under ${subjectLabel}`
      : 'Command'
    return {
      id: result.id,
      kind: 'result',
      result,
      filter,
      label: result.label,
      description: subjectDescription,
      unavailableReason: result.commandEntry.unavailableReason ?? undefined,
      mark: familyMarkForResult(result.family),
      markLabel: 'Show commands',
    }
  }

  return {
    id: result.id,
    kind: 'result',
    result,
    filter,
    label: result.label,
    description: result.matchTarget === 'content' ? result.detail : undefined,
    meta: breadcrumbText(result),
    mark: familyMarkForResult(result.family),
    markLabel: `Show ${filter === 'named' ? 'named things' : filter}`,
  }
}

export const buildLauncherItems = (input: {
  readonly results: readonly DiscoveryResult[]
  readonly query: string
  readonly filter: LauncherFamilyFilter | null
  readonly subjectLabel?: string
  readonly limit?: number
}): readonly LauncherListItem[] => {
  const limit = Math.max(1, Math.min(12, Math.trunc(input.limit ?? 12)))
  const suggestions = input.filter ? [] : familySuggestions(input.query)
  return [
    ...suggestions,
    ...input.results.map((result) => resultItem(result, input.subjectLabel)),
  ].slice(0, limit)
}

export const navigationTargetForLauncherItem = (
  item: LauncherListItem,
): PlaceNavigationTarget | null => {
  if (item.kind !== 'result' || item.result.family === 'command') return null
  if (item.result.node) {
    return {
      type: 'node',
      node: item.result.node,
      provenance: item.result.provenance,
    }
  }
  return item.result.rootMatrixId == null ?
      null
    : { type: 'root', matrixId: item.result.rootMatrixId }
}
