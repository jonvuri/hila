import { describe, expect, test } from 'vitest'

import type { FaceTypeDefinition } from './face-types'
import { resolveSlotBindings } from './slot-binding'

const makeFaceType = (overrides: Partial<FaceTypeDefinition> = {}): FaceTypeDefinition => ({
  id: 'test-face',
  name: 'Test Face',
  slots: [],
  traitRequirements: [],
  overflowBehavior: 'none',
  ...overrides,
})

describe('resolveSlotBindings', () => {
  // -- Explicit binding ---------------------------------------------------------

  test('explicit binding wins over all other strategies', () => {
    const faceType = makeFaceType({
      slots: [{ name: 'title', preferredType: 'text', required: true }],
    })
    const columns = [
      { name: 'title', type: 'TEXT' },
      { name: 'description', type: 'TEXT' },
    ]

    const result = resolveSlotBindings(faceType, columns, { title: 'description' })

    expect(result.bindings).toHaveLength(1)
    expect(result.bindings[0]!.columnName).toBe('description')
    expect(result.bindings[0]!.resolution).toBe('explicit')
  })

  test('explicit binding to a non-existent column falls through to name match', () => {
    const faceType = makeFaceType({
      slots: [{ name: 'title', preferredType: 'text', required: true }],
    })
    const columns = [{ name: 'title', type: 'TEXT' }]

    const result = resolveSlotBindings(faceType, columns, { title: 'nonexistent' })

    expect(result.bindings).toHaveLength(1)
    expect(result.bindings[0]!.columnName).toBe('title')
    expect(result.bindings[0]!.resolution).toBe('name-match')
  })

  // -- Name match ---------------------------------------------------------------

  test('name match binds when column name matches slot name (case-insensitive)', () => {
    const faceType = makeFaceType({
      slots: [{ name: 'Title', preferredType: 'text', required: true }],
    })
    const columns = [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ]

    const result = resolveSlotBindings(faceType, columns)

    expect(result.bindings).toHaveLength(1)
    expect(result.bindings[0]!.columnName).toBe('title')
    expect(result.bindings[0]!.resolution).toBe('name-match')
  })

  // -- Type + position ----------------------------------------------------------

  test('type + position binds first column matching preferred type', () => {
    const faceType = makeFaceType({
      slots: [{ name: 'content', preferredType: 'number', required: true }],
    })
    const columns = [
      { name: 'label', type: 'TEXT' },
      { name: 'amount', type: 'INTEGER' },
      { name: 'price', type: 'REAL' },
    ]

    const result = resolveSlotBindings(faceType, columns)

    expect(result.bindings).toHaveLength(1)
    expect(result.bindings[0]!.columnName).toBe('amount')
    expect(result.bindings[0]!.resolution).toBe('type-position')
  })

  test('richtext preferred type matches TEXT columns', () => {
    const faceType = makeFaceType({
      slots: [{ name: 'editor', preferredType: 'richtext', required: true }],
    })
    const columns = [
      { name: 'count', type: 'INTEGER' },
      { name: 'body', type: 'TEXT' },
    ]

    const result = resolveSlotBindings(faceType, columns)

    expect(result.bindings).toHaveLength(1)
    expect(result.bindings[0]!.columnName).toBe('body')
    expect(result.bindings[0]!.resolution).toBe('type-position')
  })

  // -- Fallback -----------------------------------------------------------------

  test('fallback binds first unbound column when no type matches', () => {
    const faceType = makeFaceType({
      slots: [{ name: 'data', preferredType: 'boolean', required: true }],
    })
    const columns = [{ name: 'notes', type: 'TEXT' }]

    const result = resolveSlotBindings(faceType, columns)

    expect(result.bindings).toHaveLength(1)
    expect(result.bindings[0]!.columnName).toBe('notes')
    expect(result.bindings[0]!.resolution).toBe('fallback')
  })

  // -- Overflow columns ---------------------------------------------------------

  test('overflow columns are those not bound to any slot', () => {
    const faceType = makeFaceType({
      slots: [{ name: 'title', preferredType: 'text', required: true }],
    })
    const columns = [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
      { name: 'count', type: 'INTEGER' },
    ]

    const result = resolveSlotBindings(faceType, columns)

    expect(result.bindings).toHaveLength(1)
    expect(result.overflowColumns).toEqual([
      { name: 'body', type: 'TEXT' },
      { name: 'count', type: 'INTEGER' },
    ])
  })

  test('all columns overflow when face has no slots', () => {
    const faceType = makeFaceType({ slots: [] })
    const columns = [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'INTEGER' },
    ]

    const result = resolveSlotBindings(faceType, columns)

    expect(result.bindings).toHaveLength(0)
    expect(result.overflowColumns).toHaveLength(2)
  })

  // -- Multiple slots -----------------------------------------------------------

  test('multiple slots bind to different columns without overlap', () => {
    const faceType = makeFaceType({
      slots: [
        { name: 'title', preferredType: 'text', required: true },
        { name: 'body', preferredType: 'richtext', required: true },
      ],
    })
    const columns = [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
      { name: 'extra', type: 'TEXT' },
    ]

    const result = resolveSlotBindings(faceType, columns)

    expect(result.bindings).toHaveLength(2)
    expect(result.bindings[0]!.columnName).toBe('title')
    expect(result.bindings[0]!.resolution).toBe('name-match')
    expect(result.bindings[1]!.columnName).toBe('body')
    expect(result.bindings[1]!.resolution).toBe('name-match')
    expect(result.overflowColumns).toEqual([{ name: 'extra', type: 'TEXT' }])
  })

  test('earlier slot consumes column so later slot gets different one', () => {
    const faceType = makeFaceType({
      slots: [
        { name: 'front', preferredType: 'text', required: true },
        { name: 'back', preferredType: 'text', required: true },
      ],
    })
    const columns = [
      { name: 'question', type: 'TEXT' },
      { name: 'answer', type: 'TEXT' },
    ]

    const result = resolveSlotBindings(faceType, columns)

    expect(result.bindings).toHaveLength(2)
    expect(result.bindings[0]!.columnName).toBe('question')
    expect(result.bindings[0]!.resolution).toBe('type-position')
    expect(result.bindings[1]!.columnName).toBe('answer')
    expect(result.bindings[1]!.resolution).toBe('type-position')
    expect(result.overflowColumns).toHaveLength(0)
  })

  // -- No columns ---------------------------------------------------------------

  test('no bindings when there are more slots than columns', () => {
    const faceType = makeFaceType({
      slots: [
        { name: 'a', preferredType: 'text', required: true },
        { name: 'b', preferredType: 'text', required: true },
      ],
    })
    const columns = [{ name: 'only', type: 'TEXT' }]

    const result = resolveSlotBindings(faceType, columns)

    expect(result.bindings).toHaveLength(1)
    expect(result.bindings[0]!.slotName).toBe('a')
    expect(result.overflowColumns).toHaveLength(0)
  })

  test('empty columns produce no bindings and no overflow', () => {
    const faceType = makeFaceType({
      slots: [{ name: 'title', preferredType: 'text', required: true }],
    })

    const result = resolveSlotBindings(faceType, [])

    expect(result.bindings).toHaveLength(0)
    expect(result.overflowColumns).toHaveLength(0)
  })
})
