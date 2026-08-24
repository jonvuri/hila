import { describe, expect, test } from 'vitest'

import { flattenTree } from '../outline/data'
import type { OutlineNode } from '../outline/types'

import { calculateStickyLayout, getParentIndices, STICKY_ROW_HEIGHT } from './sticky-layout'

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
const layoutAt = (scrollTop: number, drillId?: string) =>
  calculateStickyLayout({
    rows,
    scrollTop,
    viewHeight: 128,
    hasTitle: true,
    drillId,
  })

describe('sticky layout model', () => {
  test('returns parent indices for a pre-order tree', () => {
    expect(getParentIndices(rows)).toEqual([-1, 0, 1, 0, -1, 4])
  })

  test('keeps entering slots stable across a threshold', () => {
    const before = layoutAt(3)
    const at = layoutAt(4)
    const after = layoutAt(5)

    expect(before.nextBoundary).toBe(4)
    expect(before.activeAncestorChain).toEqual([])
    expect(
      before.slots.filter((slot) => slot.state === 'candidate').map((slot) => slot.id),
    ).toEqual(['a', 'a-1'])
    expect(at.activeAncestorChain).toEqual([0, 1])
    expect(after.activeAncestorChain).toEqual([0, 1])
    expect(before.slots.map((slot) => slot.id)).toEqual(at.slots.map((slot) => slot.id))
    expect(at.slots.map((slot) => slot.id)).toEqual(after.slots.map((slot) => slot.id))
    expect(before.slots.find((slot) => slot.id === 'a')?.y).toBe(33)
    expect(at.slots.find((slot) => slot.id === 'a')?.y).toBe(32)
    expect(after.slots.find((slot) => slot.id === 'a')?.y).toBe(32)
  })

  test('pushes each outgoing level without a row-height jump', () => {
    const boundary = STICKY_ROW_HEIGHT * 4 + 4
    const before = layoutAt(boundary - 1)
    const at = layoutAt(boundary)
    const after = layoutAt(boundary + 1)
    const beforeA = before.slots.find((slot) => slot.id === 'a')!
    const atA = at.slots.find((slot) => slot.id === 'a')!

    expect(before.activeAncestorChain).toEqual([0, 1])
    expect(at.activeAncestorChain).toEqual([4])
    expect(beforeA.y - atA.y).toBe(1)
    expect(atA.state).toBe('inactive')
    expect(after.slots.map((slot) => slot.id)).toEqual(before.slots.map((slot) => slot.id))
  })

  test('lets leaf tails pass under headers until the next header arrives', () => {
    const beforeTail = layoutAt(67)
    const tailAtStack = layoutAt(68)
    const afterTail = layoutAt(69)
    const groupY = (layout: ReturnType<typeof layoutAt>) =>
      layout.slots.find((slot) => slot.id === 'a-1')!.y

    expect(beforeTail.nextBoundary).toBe(132)
    expect(tailAtStack.activeAncestorChain).toEqual([0, 1])
    expect(tailAtStack.slots.find((slot) => slot.id === 'a-1')?.state).toBe('active')
    expect([groupY(beforeTail), groupY(tailAtStack), groupY(afterTail)]).toEqual([64, 64, 63])
  })

  test('bounds transition progress in both scroll directions', () => {
    const samples = [0, 3, 4, 5, 35, 36, 37, 131, 132, 133]
    const down = samples.map((scrollTop) => layoutAt(scrollTop).transitionProgress)
    const up = [...samples].reverse().map((scrollTop) => layoutAt(scrollTop).transitionProgress)

    expect([...down, ...up].every((value) => value >= 0 && value <= 1)).toBe(true)
    expect(layoutAt(3).transitionProgress).toBeCloseTo(63 / 64)
    expect(layoutAt(4).transitionProgress).toBe(0)
    expect(up).toEqual([...down].reverse())
  })

  test('docks a drill row at both edges and reuses its chain slot', () => {
    expect(layoutAt(0, 'b').drill?.location).toBe('bottom')
    expect(layoutAt(150, 'a-2').drill?.location).toBe('top')
    expect(layoutAt(4, 'a').drill?.location).toBe('chain')
  })
})
