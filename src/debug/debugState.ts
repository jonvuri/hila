import { createSignal } from 'solid-js'

// --- localStorage-backed debug flags ---

type DebugFlagKey = 'pm-lifecycle' | 'page-boundary' | 'mutation-log'

const readFlag = (key: DebugFlagKey): boolean => {
  try {
    return localStorage.getItem(`hila-debug-${key}`) === 'true'
  } catch {
    return false
  }
}

const writeFlag = (key: DebugFlagKey, value: boolean) => {
  try {
    localStorage.setItem(`hila-debug-${key}`, String(value))
  } catch {
    // localStorage unavailable (SSR, private browsing, etc.)
  }
}

const [pmLifecycleEnabled, setPmLifecycleEnabled] = createSignal(readFlag('pm-lifecycle'))
const [pageBoundaryEnabled, setPageBoundaryEnabled] = createSignal(readFlag('page-boundary'))
const [mutationLogEnabled, setMutationLogEnabled] = createSignal(readFlag('mutation-log'))

const flagAccessors: Record<DebugFlagKey, [() => boolean, (v: boolean) => void]> = {
  'pm-lifecycle': [pmLifecycleEnabled, setPmLifecycleEnabled],
  'page-boundary': [pageBoundaryEnabled, setPageBoundaryEnabled],
  'mutation-log': [mutationLogEnabled, setMutationLogEnabled],
}

const toggleFlag = (key: DebugFlagKey): boolean => {
  const [getter, setter] = flagAccessors[key]
  const next = !getter()
  setter(next)
  writeFlag(key, next)
  return next
}

export const debugFlags = {
  pmLifecycle: pmLifecycleEnabled,
  pageBoundary: pageBoundaryEnabled,
  mutationLog: mutationLogEnabled,
  toggle: toggleFlag,
}

// --- PM lifecycle counters ---

const [pmMountCount, setPmMountCount] = createSignal(0)
const [pmUnmountCount, setPmUnmountCount] = createSignal(0)

export { pmMountCount, pmUnmountCount }

export const logPmMount = (rowId: number, pageIndex: number) => {
  setPmMountCount((c) => c + 1)
  if (pmLifecycleEnabled()) {
    console.log(`[PM] mount row=${rowId} page=${pageIndex}`)
  }
}

export const logPmUnmount = (rowId: number, pageIndex: number) => {
  setPmUnmountCount((c) => c + 1)
  if (pmLifecycleEnabled()) {
    console.log(`[PM] unmount row=${rowId} page=${pageIndex}`)
  }
}

export const logPmContentSync = (rowId: number, replaced: boolean) => {
  if (pmLifecycleEnabled()) {
    console.log(`[PM] content-sync row=${rowId} ${replaced ? 'replaced' : 'already-matched'}`)
  }
}

// --- Mutation log ---

export type MutationLogEntry = {
  operation: string
  timestamp: number
  pmMountsBefore: number
  pmUnmountsBefore: number
  pmMountsAfter: number | null
  pmUnmountsAfter: number | null
}

const MAX_LOG_ENTRIES = 10

// Delay before capturing "after" PM counters. Allows subscription re-queries
// to round-trip through the worker and trigger reconcile / mount / unmount.
const SETTLE_DELAY_MS = 150

const [mutationLog, setMutationLog] = createSignal<MutationLogEntry[]>([])

export { mutationLog }

export const recordMutation = (operation: string) => {
  const entry: MutationLogEntry = {
    operation,
    timestamp: Date.now(),
    pmMountsBefore: pmMountCount(),
    pmUnmountsBefore: pmUnmountCount(),
    pmMountsAfter: null,
    pmUnmountsAfter: null,
  }

  setMutationLog((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), entry])

  requestAnimationFrame(() => {
    setTimeout(() => {
      entry.pmMountsAfter = pmMountCount()
      entry.pmUnmountsAfter = pmUnmountCount()
      setMutationLog((prev) => [...prev])
    }, SETTLE_DELAY_MS)
  })
}

// --- Helpers ---

export const hexTruncate = (key: Uint8Array, maxBytes = 4): string => {
  const hex = Array.from(key.slice(0, maxBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return key.length > maxBytes ? `${hex}…` : hex
}

// --- Global debug API (accessible from browser console as __hilaDebug) ---

if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__hilaDebug', {
    value: {
      toggle: toggleFlag,
      flags: () => ({
        'pm-lifecycle': pmLifecycleEnabled(),
        'page-boundary': pageBoundaryEnabled(),
        'mutation-log': mutationLogEnabled(),
      }),
      pmCounts: () => ({
        mounts: pmMountCount(),
        unmounts: pmUnmountCount(),
      }),
      log: () => mutationLog(),
    },
    writable: false,
    configurable: false,
  })
}
