import { describe, expect, test } from 'vitest'

import type { DiscoveryNodeResult } from '../discovery/types'

import {
  buildLauncherItems,
  familyFilterForResult,
  familyMarkForResult,
  navigationTargetForLauncherItem,
  splitLauncherInput,
} from './model'

const result = (
  id: string,
  family: DiscoveryNodeResult['family'] = 'row',
): DiscoveryNodeResult => ({
  id,
  family,
  node: { matrixId: 2, rowId: Number(id) },
  provenance: { key: Uint8Array.of(1, Number(id)) },
  label: `Result ${id}`,
  detail: '',
  breadcrumb: [{ label: 'Workspace' }, { label: 'Planning' }],
  navigation: null,
  ownedMatrixIds: [],
  matchTarget: 'label',
  matchQuality: 'exact',
  score: 440,
  structuralDepth: 1,
  structuralOrder: id,
})

describe('launcher model', () => {
  test('splits only a leading family sigil from query text', () => {
    expect(splitLauncherInput('#tasks')).toEqual({ filter: 'types', query: 'tasks' })
    expect(splitLauncherInput('[planning')).toEqual({ filter: 'containers', query: 'planning' })
    expect(splitLauncherInput('tasks#today')).toEqual({ filter: null, query: 'tasks#today' })
  })

  test('generates family suggestions without exceeding the shared result cap', () => {
    const items = buildLauncherItems({
      results: Array.from({ length: 12 }, (_, index) => result(String(index + 1))),
      query: 'types',
      filter: null,
    })

    expect(items).toHaveLength(12)
    expect(items[0]).toMatchObject({ kind: 'family', filter: 'types', mark: '#' })
  })

  test('keeps filter tokens out of discovery identities and preserves navigation provenance', () => {
    const [item] = buildLauncherItems({
      results: [result('3', 'view')],
      query: 'result',
      filter: 'named',
    })

    expect(item).toMatchObject({ id: '3', kind: 'result', mark: '≔' })
    expect(navigationTargetForLauncherItem(item!)).toEqual({
      type: 'node',
      node: { matrixId: 2, rowId: 3 },
      provenance: { key: Uint8Array.of(1, 3) },
    })
  })

  test('maps every result family to its identity mark and filter', () => {
    expect(familyMarkForResult('row')).toBe('›')
    expect(familyMarkForResult('view')).toBe('≔')
    expect(familyMarkForResult('type')).toBe('#')
    expect(familyMarkForResult('container')).toBe('[]')
    expect(familyMarkForResult('command')).toBe('>')
    expect(familyFilterForResult('view')).toBe('named')
  })
})
