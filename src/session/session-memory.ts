import { createSignal, type Accessor } from 'solid-js'

import type { PlaceNavigationTarget } from '../core/place-navigation'
import type { DiscoveryRankingSignals } from '../discovery/types'
import type { LauncherQueryState } from '../launcher/query-authoring'

export const SESSION_MEMORY_LIMIT = 6
export const MAX_REPORTED_VISIBLE_IDENTITIES = 256

export type SessionIdentity = {
  readonly matrixId: number
  readonly rowId: number
}

export type SessionFocusEntry = SessionIdentity & {
  readonly label: string
  readonly labelResolved?: boolean
  readonly target: PlaceNavigationTarget
}

export type RecentDeepSearch = {
  readonly key: string
  readonly state: LauncherQueryState
}

export type SessionMemoryStore = {
  readonly focusHistory: Accessor<readonly SessionFocusEntry[]>
  readonly currentFocusChain: Accessor<readonly SessionFocusEntry[]>
  readonly jumpBackEntries: Accessor<readonly SessionFocusEntry[]>
  readonly recentDeepSearches: Accessor<readonly RecentDeepSearch[]>
  readonly onScreenIdentities: Accessor<ReadonlySet<string>>
  readonly revision: Accessor<number>
  readonly rankingSignals: Accessor<DiscoveryRankingSignals>
  recordFocus: (entry: SessionFocusEntry | null) => void
  setCurrentFocusChain: (entries: readonly SessionFocusEntry[]) => void
  recordRecentDeepSearch: (state: LauncherQueryState) => void
  replaceOnScreen: (sourceId: string, identities: readonly SessionIdentity[]) => void
  clearOnScreen: (sourceId: string) => void
  reset: () => void
}

type VisibleGeometryRow = {
  readonly position: string | number
  readonly start: number
  readonly end: number
}

export const sessionIdentityKey = (identity: SessionIdentity): string =>
  `${identity.matrixId}:${identity.rowId}`

const cloneTarget = (target: PlaceNavigationTarget): PlaceNavigationTarget =>
  target.type === 'root' ?
    { ...target }
  : {
      ...target,
      node: { ...target.node },
      ...(target.provenance ?
        { provenance: { key: new Uint8Array(target.provenance.key) } }
      : {}),
    }

const cloneFocusEntry = (entry: SessionFocusEntry): SessionFocusEntry => ({
  matrixId: entry.matrixId,
  rowId: entry.rowId,
  label: entry.label,
  labelResolved: entry.labelResolved,
  target: cloneTarget(entry.target),
})

const cloneQueryState = (state: LauncherQueryState): LauncherQueryState => {
  const cloned = structuredClone(state)
  return { ...cloned, invalid: null }
}

const stableValueKey = (value: unknown): string => {
  if (typeof value === 'bigint') return `bigint:${value}`
  if (value instanceof Uint8Array) {
    return `bytes:${Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  }
  if (Array.isArray(value)) return `[${value.map(stableValueKey).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableValueKey(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const recentSearchKey = (state: LauncherQueryState): string => stableValueKey(state.spec)

const sameIdentityList = (
  left: readonly SessionIdentity[],
  right: readonly SessionIdentity[],
): boolean =>
  left.length === right.length &&
  left.every(
    (identity, index) => sessionIdentityKey(identity) === sessionIdentityKey(right[index]!),
  )

const sameKeySet = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean =>
  left.size === right.size && [...left].every((key) => right.has(key))

export const visibleSessionIdentities = (input: {
  readonly rows: readonly VisibleGeometryRow[]
  readonly scrollTop: number
  readonly viewportHeight: number
  readonly topInset?: number
  readonly identityForPosition: (position: string | number) => SessionIdentity | undefined
  readonly limit?: number
}): readonly SessionIdentity[] => {
  const viewportStart = input.scrollTop + Math.max(0, input.topInset ?? 0)
  const viewportEnd = input.scrollTop + Math.max(0, input.viewportHeight)
  const limit = Math.max(
    1,
    Math.min(
      MAX_REPORTED_VISIBLE_IDENTITIES,
      Math.trunc(input.limit ?? MAX_REPORTED_VISIBLE_IDENTITIES),
    ),
  )
  const seen = new Set<string>()
  const visible: SessionIdentity[] = []

  for (const row of input.rows) {
    if (row.end <= viewportStart || row.start >= viewportEnd) continue
    const identity = input.identityForPosition(row.position)
    if (!identity) continue
    const key = sessionIdentityKey(identity)
    if (seen.has(key)) continue
    seen.add(key)
    visible.push({ ...identity })
    if (visible.length >= limit) break
  }

  return visible
}

export const createSessionMemoryStore = (): SessionMemoryStore => {
  const [focusHistory, setFocusHistory] = createSignal<readonly SessionFocusEntry[]>([])
  const [currentFocusChain, setCurrentFocusChainSignal] = createSignal<
    readonly SessionFocusEntry[]
  >([])
  const [recentDeepSearches, setRecentDeepSearches] = createSignal<readonly RecentDeepSearch[]>(
    [],
  )
  const [onScreenBySource, setOnScreenBySource] = createSignal<
    ReadonlyMap<string, ReadonlySet<string>>
  >(new Map())
  const [revision, setRevision] = createSignal(0)

  const markChanged = (): void => {
    setRevision((value) => value + 1)
  }

  const onScreenIdentities = () => {
    const identities = new Set<string>()
    for (const source of onScreenBySource().values()) {
      for (const identity of source) identities.add(identity)
    }
    return identities
  }

  const jumpBackEntries = () => {
    const current = new Set(currentFocusChain().map(sessionIdentityKey))
    return focusHistory().filter((entry) => !current.has(sessionIdentityKey(entry)))
  }

  const rankingSignals = (): DiscoveryRankingSignals => ({
    onScreenIdentities: onScreenIdentities(),
    sessionRecency: focusHistory().map(sessionIdentityKey),
  })

  const recordFocus = (entry: SessionFocusEntry | null): void => {
    if (!entry) return
    const key = sessionIdentityKey(entry)
    const next = [
      cloneFocusEntry(entry),
      ...focusHistory().filter((candidate) => sessionIdentityKey(candidate) !== key),
    ].slice(0, SESSION_MEMORY_LIMIT)
    setFocusHistory(next)
    markChanged()
  }

  const setCurrentFocusChain = (entries: readonly SessionFocusEntry[]): void => {
    const next = entries.map(cloneFocusEntry)
    const identitiesChanged = !sameIdentityList(currentFocusChain(), next)
    const historyByIdentity = new Map(next.map((entry) => [sessionIdentityKey(entry), entry]))
    let historyChanged = false
    const healedHistory = focusHistory().map((entry) => {
      const current = historyByIdentity.get(sessionIdentityKey(entry))
      if (!current) return entry
      const currentHasResolvedLabel = current.labelResolved !== false
      const nextLabel = currentHasResolvedLabel ? current.label : entry.label
      const nextLabelResolved =
        currentHasResolvedLabel ? current.labelResolved : entry.labelResolved
      const targetChanged = stableValueKey(current.target) !== stableValueKey(entry.target)
      const labelResolutionChanged = nextLabelResolved !== entry.labelResolved
      if (nextLabel === entry.label && !labelResolutionChanged && !targetChanged) return entry
      historyChanged = true
      return cloneFocusEntry({
        ...current,
        label: nextLabel,
        labelResolved: nextLabelResolved,
      })
    })
    if (!identitiesChanged && !historyChanged) return
    setCurrentFocusChainSignal(next)
    if (historyChanged) setFocusHistory(healedHistory)
    markChanged()
  }

  const recordRecentDeepSearch = (state: LauncherQueryState): void => {
    if (state.chips.length === 0) return
    const normalized = cloneQueryState(state)
    const key = recentSearchKey(normalized)
    setRecentDeepSearches((current) =>
      [{ key, state: normalized }, ...current.filter((entry) => entry.key !== key)].slice(
        0,
        SESSION_MEMORY_LIMIT,
      ),
    )
    markChanged()
  }

  const replaceOnScreen = (sourceId: string, identities: readonly SessionIdentity[]): void => {
    const nextSource = new Set(identities.map(sessionIdentityKey))
    const currentSource = onScreenBySource().get(sourceId) ?? new Set<string>()
    if (sameKeySet(currentSource, nextSource)) return
    const next = new Map(onScreenBySource())
    if (nextSource.size === 0) next.delete(sourceId)
    else next.set(sourceId, nextSource)
    setOnScreenBySource(next)
    markChanged()
  }

  const clearOnScreen = (sourceId: string): void => {
    if (!onScreenBySource().has(sourceId)) return
    const next = new Map(onScreenBySource())
    next.delete(sourceId)
    setOnScreenBySource(next)
    markChanged()
  }

  const reset = (): void => {
    const changed =
      focusHistory().length > 0 ||
      currentFocusChain().length > 0 ||
      recentDeepSearches().length > 0 ||
      onScreenBySource().size > 0
    setFocusHistory([])
    setCurrentFocusChainSignal([])
    setRecentDeepSearches([])
    setOnScreenBySource(new Map())
    if (changed) markChanged()
  }

  return {
    focusHistory,
    currentFocusChain,
    jumpBackEntries,
    recentDeepSearches,
    onScreenIdentities,
    revision,
    rankingSignals,
    recordFocus,
    setCurrentFocusChain,
    recordRecentDeepSearch,
    replaceOnScreen,
    clearOnScreen,
    reset,
  }
}
