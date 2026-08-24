import { describe, expect, test } from 'vitest'

import type { FlatRow } from '../outline/types'
import { navigationOutlineValues } from '../tokens'

import {
  calculateNavigationOutlineDecorations,
  createNavigationOutlineWindow,
  navigationOutlineRegistry,
} from './navigation-outline'

const row = (
  id: string,
  depth: number,
  options: Partial<Pick<FlatRow, 'hasChildren' | 'expanded'>> = {},
): FlatRow => ({
  id,
  content: id,
  depth,
  hasChildren: options.hasChildren ?? false,
  expanded: options.expanded ?? false,
})

const boundaryRows = (): readonly FlatRow[] => [
  row('root', 0, { hasChildren: true, expanded: true }),
  row('branch', 1, { hasChildren: true, expanded: true }),
  ...Array.from({ length: 112 }, (_, index) => row(`leaf-${index}`, 2)),
  row('branch-tail', 1),
  row('root-tail', 0),
]

describe('navigation outline registry', () => {
  test('registers one calculation and paint adapter for every canonical value', () => {
    expect(Object.keys(navigationOutlineRegistry)).toEqual(navigationOutlineValues)
    for (const value of navigationOutlineValues) {
      expect(navigationOutlineRegistry[value].calculate).toBeTypeOf('function')
      expect(navigationOutlineRegistry[value].Paint).toBeTypeOf('function')
    }
  })

  test('creates explicit virtual-window boundary context', () => {
    const rows = boundaryRows()
    const input = createNavigationOutlineWindow(rows, 4, 3)

    expect(input.renderedRows.map(({ id, globalIndex }) => ({ id, globalIndex }))).toEqual([
      { id: 'leaf-2', globalIndex: 4 },
      { id: 'leaf-3', globalIndex: 5 },
      { id: 'leaf-4', globalIndex: 6 },
    ])
    expect(input.ancestryBefore).toEqual([
      { id: 'root', depth: 0, globalIndex: 0 },
      { id: 'branch', depth: 1, globalIndex: 1 },
    ])
    expect(input.lookAhead).toMatchObject({ id: 'leaf-5', globalIndex: 7 })
    expect(input.continuationAfter[2]).toBe(true)
  })

  test('matches full-list decoration across a virtual-window boundary', () => {
    const rows = boundaryRows()
    const startIndex = 102
    const renderedCount = 6

    for (const variant of navigationOutlineValues) {
      const full = calculateNavigationOutlineDecorations(
        variant,
        createNavigationOutlineWindow(rows),
      )
      const windowed = calculateNavigationOutlineDecorations(
        variant,
        createNavigationOutlineWindow(rows, startIndex, renderedCount),
      )
      expect(windowed).toEqual(full.slice(startIndex, startIndex + renderedCount))
    }
  })

  test('continues each rail through the last descendant row only', () => {
    const rows = [
      row('root', 0, { hasChildren: true, expanded: true }),
      row('branch', 1, { hasChildren: true, expanded: true }),
      row('first-child', 2),
      row('last-child', 2),
      row('branch-tail', 1),
      row('root-tail', 0),
    ]
    const decorations = calculateNavigationOutlineDecorations(
      'guides',
      createNavigationOutlineWindow(rows),
    )

    expect(decorations[2]?.continues).toEqual([true, true])
    expect(decorations[3]?.continues).toEqual([true, false])
    expect(decorations[4]?.continues).toEqual([false])
  })
})
