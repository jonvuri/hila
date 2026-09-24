import { afterEach, describe, expect, test } from 'vitest'

import {
  consumeGeneratedViewNameFocus,
  requestGeneratedViewNameFocus,
  resetGeneratedViewNameFocusForTest,
} from './pending-view-name-focus'

describe('generated view name focus handoff', () => {
  afterEach(() => resetGeneratedViewNameFocusForTest())

  test('ignores the wrong editor and lets the matching marker consume once', () => {
    requestGeneratedViewNameFocus({ matrixId: 3, rowId: 9 })

    expect(consumeGeneratedViewNameFocus({ matrixId: 3, rowId: 8 })).toBe(false)
    expect(consumeGeneratedViewNameFocus({ matrixId: 4, rowId: 9 })).toBe(false)
    expect(consumeGeneratedViewNameFocus({ matrixId: 3, rowId: 9 })).toBe(true)
    expect(consumeGeneratedViewNameFocus({ matrixId: 3, rowId: 9 })).toBe(false)
  })

  test('a newer request replaces a stale unconsumed request', () => {
    requestGeneratedViewNameFocus({ matrixId: 3, rowId: 9 })
    requestGeneratedViewNameFocus({ matrixId: 3, rowId: 10 })

    expect(consumeGeneratedViewNameFocus({ matrixId: 3, rowId: 9 })).toBe(false)
    expect(consumeGeneratedViewNameFocus({ matrixId: 3, rowId: 10 })).toBe(true)
  })
})
