import { describe, expect, test } from 'vitest'

import { createLauncherQueryState, reduceLauncherQuery } from '../launcher/query-authoring'

import {
  MAX_REPORTED_VISIBLE_IDENTITIES,
  SESSION_MEMORY_LIMIT,
  createSessionMemoryStore,
  visibleSessionIdentities,
} from './session-memory'

const focus = (rowId: number, label?: string) => ({
  matrixId: 1,
  rowId,
  label: label ?? `Focused row ${rowId}`,
  labelResolved: label !== undefined,
  target: { type: 'node' as const, node: { matrixId: 1, rowId } },
})

const deepState = (matrixId: number, text: string) => {
  const withKind = reduceLauncherQuery(createLauncherQueryState(), {
    type: 'commit-kind',
    matrixId,
    label: `Matrix ${matrixId}`,
    mark: '#',
  })
  return reduceLauncherQuery(withKind, { type: 'set-text', text })
}

describe('session memory', () => {
  test('caps and deduplicates focus history while excluding the current chain', () => {
    const store = createSessionMemoryStore()
    for (let rowId = 1; rowId <= SESSION_MEMORY_LIMIT + 2; rowId += 1) {
      store.recordFocus(focus(rowId))
    }
    store.recordFocus(focus(5, 'Updated five'))
    store.setCurrentFocusChain([focus(5)])

    expect(store.focusHistory().map(({ rowId }) => rowId)).toEqual([5, 8, 7, 6, 4, 3])
    expect(store.jumpBackEntries().map(({ rowId }) => rowId)).toEqual([8, 7, 6, 4, 3])
    expect(store.focusHistory()[0]?.label).toBe('Updated five')
  })

  test('heals labels from explicit resolution state instead of placeholder text', () => {
    const store = createSessionMemoryStore()
    store.recordFocus(focus(5, 'Known label'))

    store.setCurrentFocusChain([focus(5)])
    expect(store.focusHistory()[0]?.label).toBe('Known label')

    store.setCurrentFocusChain([focus(5, 'Focused row 5')])
    expect(store.focusHistory()[0]).toMatchObject({
      label: 'Focused row 5',
      labelResolved: true,
    })
  })

  test('normalizes, deduplicates, caps, and clones recent deep searches', () => {
    const store = createSessionMemoryStore()
    const first = deepState(1, 'alpha')
    store.recordRecentDeepSearch(first)
    store.recordRecentDeepSearch(deepState(1, 'alpha'))
    for (let matrixId = 2; matrixId <= SESSION_MEMORY_LIMIT + 2; matrixId += 1) {
      store.recordRecentDeepSearch(deepState(matrixId, `query ${matrixId}`))
    }

    expect(store.recentDeepSearches()).toHaveLength(SESSION_MEMORY_LIMIT)
    expect(store.recentDeepSearches()[0]?.state.spec.kind).toEqual({
      type: 'matrix',
      matrixId: SESSION_MEMORY_LIMIT + 2,
    })
    expect(store.recentDeepSearches().filter(({ key }) => key.includes('alpha'))).toHaveLength(
      0,
    )

    const latest = store.recentDeepSearches()[0]!.state
    expect(latest).not.toBe(first)
    expect(latest.invalid).toBeNull()
  })

  test('merges bounded on-screen sources and resets every signal', () => {
    const store = createSessionMemoryStore()
    store.recordFocus(focus(1))
    store.recordRecentDeepSearch(deepState(1, 'alpha'))
    store.setCurrentFocusChain([focus(1)])
    store.replaceOnScreen('outline', [
      { matrixId: 1, rowId: 1 },
      { matrixId: 1, rowId: 2 },
    ])
    store.replaceOnScreen('focus', [{ matrixId: 1, rowId: 1 }])
    expect([...store.onScreenIdentities()]).toEqual(['1:1', '1:2'])

    store.clearOnScreen('outline')
    expect([...store.onScreenIdentities()]).toEqual(['1:1'])

    store.reset()
    expect(store.focusHistory()).toEqual([])
    expect(store.jumpBackEntries()).toEqual([])
    expect(store.recentDeepSearches()).toEqual([])
    expect([...store.onScreenIdentities()]).toEqual([])
  })

  test('reports only viewport intersections from retained row geometry', () => {
    const rows = Array.from({ length: MAX_REPORTED_VISIBLE_IDENTITIES + 20 }, (_, index) => ({
      position: `row-${index}`,
      start: index * 10,
      end: index * 10 + 10,
    }))
    const visible = visibleSessionIdentities({
      rows,
      scrollTop: 20,
      viewportHeight: 80,
      topInset: 10,
      identityForPosition: (position) => ({
        matrixId: 1,
        rowId: Number(String(position).slice(4)) + 1,
      }),
    })

    expect(visible.map(({ rowId }) => rowId)).toEqual([4, 5, 6, 7, 8, 9, 10])
    expect(visible).toHaveLength(7)
  })
})
