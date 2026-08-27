import { describe, expect, test } from 'vitest'

import {
  buildWindowGeometry,
  findVisibleWindowRange,
  getRenderedWindowRange,
  getResizeScrollCompensation,
  RetainedRowGeometryIndex,
} from './geometry'

describe('virtualizer geometry', () => {
  test('uses estimates until variable window heights are measured', () => {
    expect(buildWindowGeometry([80, undefined, 120], 4, 100)).toEqual([
      { windowIndex: 0, start: 0, height: 80, measured: true },
      { windowIndex: 1, start: 80, height: 100, measured: false },
      { windowIndex: 2, start: 180, height: 120, measured: true },
      { windowIndex: 3, start: 300, height: 100, measured: false },
    ])
  })

  test('preserves the two-window rendered buffer policy', () => {
    expect([...getRenderedWindowRange([4, 5], 12, 2)]).toEqual([2, 3, 4, 5, 6, 7])
    expect([...getRenderedWindowRange([0, 1], 3, 2)]).toEqual([0, 1, 2])
  })

  test('resolves visible windows in content coordinates after repositioning', () => {
    const windows = buildWindowGeometry([80, 100, 120, 90], 4, 100)
    expect(findVisibleWindowRange(windows, 175, 20)).toEqual({ start: 1, end: 2 })
    expect(findVisibleWindowRange(windows, 300, 90)).toEqual({ start: 3, end: 3 })
  })

  test('compensates only when a measured window is above the viewport', () => {
    const [first] = buildWindowGeometry([80, 100], 2, 100)
    expect(getResizeScrollCompensation(first, 96, 100)).toBe(16)
    expect(getResizeScrollCompensation(first, 96, 40)).toBe(0)
  })

  test('retains row positions and clears rows outside the loaded range', () => {
    const index = new RetainedRowGeometryIndex()
    const windows = buildWindowGeometry([64, 96], 2, 100)
    index.updateWindow(windows[0]!, [
      { position: 'a', offset: 0, height: 32 },
      { position: 'b', offset: 32, height: 32 },
    ])
    index.updateWindow(windows[1]!, [
      { position: 'c', offset: 0, height: 48 },
      { position: 'd', offset: 48, height: 48 },
    ])

    expect(index.firstVisible(63)?.position).toBe('b')
    expect(index.firstVisible(64)?.position).toBe('c')
    expect(index.sourceCoordinates('c', 70)?.viewportStart).toBe(-6)

    index.retainWindows(new Set([1]))
    expect(index.sourceCoordinates('a', 0)).toBeUndefined()
    expect(index.rows().map((row) => row.position)).toEqual(['c', 'd'])
  })

  test('updates retained row starts when an earlier window changes size', () => {
    const index = new RetainedRowGeometryIndex()
    const before = buildWindowGeometry([64, 64], 2, 64)
    index.updateWindow(before[1]!, [{ position: 'c', offset: 0, height: 32 }])
    expect(index.sourceCoordinates('c', 64)?.viewportStart).toBe(0)

    const after = buildWindowGeometry([80, 64], 2, 64)
    index.updateWindow(after[1]!, [{ position: 'c', offset: 0, height: 32 }])
    expect(index.sourceCoordinates('c', 80)?.viewportStart).toBe(0)
  })

  test('trims window geometry when the count decreases', () => {
    const windows = buildWindowGeometry([80, 90, 100], 2, 100)
    expect(windows).toHaveLength(2)
    expect(windows[1]).toEqual({ windowIndex: 1, start: 80, height: 90, measured: true })
  })
})
