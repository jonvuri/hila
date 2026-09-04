import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'solid-js/web'

import type { FaceRecipe, FaceSubject } from './face-types'
import {
  clearFaceRenderings,
  FaceHostSlot,
  getFaceRendering,
  registerFaceRenderings,
} from './face-runtime'

const recipe: FaceRecipe = {
  faceTypeId: 'test.face',
  slotBindings: {},
  settings: {},
}

const subject: FaceSubject = {
  mode: 'view',
  matrixId: 10,
  rowId: 20,
  sql: 'SELECT 1',
}

afterEach(() => {
  clearFaceRenderings()
  document.body.replaceChildren()
})

describe('forward face runtime', () => {
  test('registers line and collection interiors independently', () => {
    const Line = () => <span>line</span>
    const Collection = () => <span>collection</span>
    registerFaceRenderings(recipe.faceTypeId, { line: Line, collection: Collection })

    expect(getFaceRendering(recipe.faceTypeId, 'line')).toBe(Line)
    expect(getFaceRendering(recipe.faceTypeId, 'collection')).toBe(Collection)
  })

  test('lets the host choose rendering kind and own presentation policy', () => {
    registerFaceRenderings(recipe.faceTypeId, {
      collection: (props) => <span data-testid="face-interior">{props.subject.mode}</span>,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = render(
      () => (
        <FaceHostSlot
          host="focus-panel"
          kind="collection"
          subject={subject}
          recipe={recipe}
          fidelity="substrate"
        />
      ),
      container,
    )

    const slot = container.querySelector<HTMLElement>('[data-testid="face-host-slot"]')!
    expect(slot.dataset.host).toBe('focus-panel')
    expect(slot.dataset.faceRendering).toBe('collection')
    expect(slot.dataset.fidelity).toBe('substrate')
    expect(slot.dataset.subjectMode).toBe('view')
    expect(container.querySelector('[data-testid="face-interior"]')?.textContent).toBe('view')
    dispose()
  })

  test('uses the host fallback when a rendering is absent', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = render(
      () => (
        <FaceHostSlot
          host="row"
          kind="line"
          subject={subject}
          recipe={recipe}
          fidelity="composed"
          fallback={<span data-testid="fallback">substrate fallback</span>}
        />
      ),
      container,
    )

    expect(container.querySelector('[data-testid="fallback"]')?.textContent).toBe(
      'substrate fallback',
    )
    dispose()
  })
})
