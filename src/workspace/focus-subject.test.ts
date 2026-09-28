import { describe, expect, test } from 'vitest'

import type { FaceRecipe, FaceSubject } from '../core/face-types'

import {
  getFocusCollectionRecipeMatrixId,
  resolveFocusCollectionAffinity,
} from './focus-subject'

const tableRecipe: FaceRecipe = {
  faceTypeId: 'hila.table',
  slotBindings: {},
  settings: {},
}

describe('focus collection subject dispatch', () => {
  test.each<FaceSubject>([
    { mode: 'loose', matrixId: 10, rowId: 20 },
    { mode: 'view', matrixId: 10, rowId: 20, sql: 'SELECT 1' },
  ])('keeps $mode subjects on their substrate path', (subject) => {
    expect(getFocusCollectionRecipeMatrixId(subject)).toBeNull()
    expect(resolveFocusCollectionAffinity(subject, tableRecipe)).toEqual({
      source: 'substrate',
      recipe: null,
    })
  })

  test('dispatches container subjects through their extent recipe', () => {
    const subject: FaceSubject = {
      mode: 'container',
      matrixId: 10,
      rowId: 20,
      extentMatrixId: 30,
    }

    expect(getFocusCollectionRecipeMatrixId(subject)).toBe(30)
    expect(resolveFocusCollectionAffinity(subject, tableRecipe)).toEqual({
      source: 'intentional',
      recipe: tableRecipe,
    })
  })
})
