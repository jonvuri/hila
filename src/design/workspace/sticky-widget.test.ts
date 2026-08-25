import { describe, expect, test } from 'vitest'

import { flattenTree } from '../outline/data'
import type { OutlineNode } from '../outline/types'

import {
  calculateStickyDockState,
  calculateStickyWidgetState,
  classifyStickyWidgetStateChange,
  getStickyParentIndices,
  getStickySubtreeEndIndices,
  STICKY_ROW_HEIGHT,
} from './sticky-widget'

const items: OutlineNode[] = [
  {
    id: 'a',
    content: 'A',
    children: [
      {
        id: 'a-1',
        content: 'A.1',
        children: [{ id: 'a-1-i', content: 'A.1.i' }],
      },
      { id: 'a-2', content: 'A.2' },
    ],
  },
  { id: 'b', content: 'B', children: [{ id: 'b-1', content: 'B.1' }] },
]

const rows = flattenTree(items, new Set())
const stateAt = (
  scrollTop: number,
  options: Partial<Parameters<typeof calculateStickyWidgetState>[0]> = {},
) =>
  calculateStickyWidgetState({
    rows,
    scrollTop,
    viewportHeight: 256,
    hasTitle: true,
    ...options,
  })

describe('sticky widget state', () => {
  test('returns parent and subtree source ranges for a pre-order tree', () => {
    expect(getStickyParentIndices(rows)).toEqual([-1, 0, 1, 0, -1, 4])
    expect(getStickySubtreeEndIndices(rows)).toEqual([3, 2, 2, 3, 5, 5])
  })

  test('derives a stable active chain at a shared threshold', () => {
    expect(stateAt(3).activeNodeIds).toEqual([])

    const at = stateAt(4)
    expect(at.activeNodeIds).toEqual(['a', 'a-1'])
    expect(at.nodes.map((node) => node.stackIndex)).toEqual([0, 1])
    expect(at.nodes.map((node) => node.position)).toEqual([0, STICKY_ROW_HEIGHT])
    expect(at.nodes[0]?.sourceRange).toEqual({
      startIndex: 0,
      endIndex: 3,
      start: 36,
      end: 164,
    })
    expect(at.widgetHeight).toBe(64)
  })

  test('changes only the final row position during subtree push-off', () => {
    const before = stateAt(36)
    const after = stateAt(37)

    expect(before.activeNodeIds).toEqual(['a', 'a-1'])
    expect(before.nodes.map((node) => node.position)).toEqual([0, 32])
    expect(after.nodes.map((node) => node.position)).toEqual([0, 31])
    expect(classifyStickyWidgetStateChange(before, after)).toBe('final-position')
    expect(after.widgetHeight).toBe(63)
  })

  test('pushes a top-level row out before its sibling replaces it', () => {
    expect(stateAt(100).nodes.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'a', position: 0 },
    ])
    expect(stateAt(101).nodes.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'a', position: -1 },
    ])
    expect(stateAt(131).nodes.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'a', position: -31 },
    ])
    expect(stateAt(132).nodes.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'b', position: 0 },
    ])
  })

  test('classifies no change, content change, and structural change', () => {
    const initial = stateAt(4)
    expect(classifyStickyWidgetStateChange(initial, stateAt(4))).toBe('none')
    expect(
      classifyStickyWidgetStateChange(
        initial,
        stateAt(4, { contentKey: (row) => `${row.id}:changed` }),
      ),
    ).toBe('content')
    expect(classifyStickyWidgetStateChange(initial, stateAt(132))).toBe('structure')
  })

  test('is deterministic in reverse scroll order', () => {
    const positions = [4, 36, 68, 69, 100, 131, 132]
    const down = positions.map((position) => stateAt(position))
    const up = [...positions].reverse().map((position) => stateAt(position))

    expect(up).toEqual([...down].reverse())
  })

  test('hands a pushed drill row to its top dock on the first pixel', () => {
    const before = stateAt(100)
    const after = stateAt(101)

    expect(
      calculateStickyDockState(
        { rows, scrollTop: 100, viewportHeight: 256, hasTitle: true, drillId: 'a' },
        before,
      ),
    ).toMatchObject({ location: 'chain', position: 0 })
    expect(
      calculateStickyDockState(
        { rows, scrollTop: 101, viewportHeight: 256, hasTitle: true, drillId: 'a' },
        after,
      ),
    ).toMatchObject({ location: 'top', position: 32 })
  })

  test('keeps active ancestry when source rows are outside a virtual window', () => {
    const state = stateAt(37, { renderedRange: { startIndex: 2, endIndex: 4 } })

    expect(state.activeNodeIds).toEqual(['a', 'a-1'])
    expect(state.nodes.map((node) => node.sourceRowVisible)).toEqual([false, false])
    expect(state.nodes.map((node) => node.sourceRange.endIndex)).toEqual([3, 2])
  })

  test('bounds the chain by row count and viewport share', () => {
    const deepItems = Array.from({ length: 10 }).reduceRight<OutlineNode[]>(
      (children, _, index) => [{ id: `level-${index}`, content: `Level ${index}`, children }],
      [{ id: 'leaf', content: 'Leaf' }],
    )
    const deepRows = flattenTree(deepItems, new Set())
    const state = calculateStickyWidgetState({
      rows: deepRows,
      scrollTop: 4,
      viewportHeight: 240,
      hasTitle: true,
    })

    expect(state.nodes).toHaveLength(3)
    expect(state.widgetHeight).toBeLessThanOrEqual(240 * 0.4)
  })

  test('updates collapse and drill states from the same row model', () => {
    const collapsedRows = flattenTree(items, new Set(['a']))
    const collapsed = calculateStickyWidgetState({
      rows: collapsedRows,
      scrollTop: 4,
      viewportHeight: 256,
      hasTitle: true,
    })
    expect(collapsed.activeNodeIds).toEqual([])

    const widget = stateAt(4)
    expect(
      calculateStickyDockState(
        {
          rows,
          scrollTop: 4,
          viewportHeight: 256,
          hasTitle: true,
          drillId: 'a',
        },
        widget,
      )?.location,
    ).toBe('chain')
    expect(
      calculateStickyDockState(
        {
          rows,
          scrollTop: 0,
          viewportHeight: 128,
          hasTitle: true,
          drillId: 'b',
        },
        stateAt(0),
      )?.location,
    ).toBe('bottom')
  })
})
