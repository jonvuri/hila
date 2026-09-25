import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'solid-js/web'
import type { JSX } from 'solid-js'

import RetiredSurfaceReference from './RetiredSurfaceReference'
import { retiredTableColumns, retiredTagInstances, retiredTagTypes } from './fixtures'

describe('retired surface references', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined

  afterEach(() => {
    dispose?.()
    container?.remove()
  })

  const mount = (reference: () => JSX.Element) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(reference, container)
  }

  test('captures table schema and editing states from fixtures', () => {
    mount(() => <RetiredSurfaceReference surface="table" state="schema" />)
    expect(
      container.querySelectorAll('[data-testid="retired-table-schema"] > div'),
    ).toHaveLength(retiredTableColumns.length)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3)

    dispose?.()
    mount(() => <RetiredSurfaceReference surface="table" state="editing" />)
    expect(container.querySelector('input[aria-label="Edit Status"]')).not.toBeNull()
  })

  test('captures tag counts, instances, creation, and context actions', () => {
    mount(() => <RetiredSurfaceReference surface="tags" state="list" />)
    expect(
      container.querySelectorAll('[data-testid="retired-tags-list"] > button'),
    ).toHaveLength(retiredTagTypes.length)

    dispose?.()
    mount(() => <RetiredSurfaceReference surface="tags" state="instances" />)
    expect(
      container.querySelectorAll('[data-testid="retired-tag-instances"] > button'),
    ).toHaveLength(retiredTagInstances.length)

    dispose?.()
    mount(() => <RetiredSurfaceReference surface="tags" state="create" />)
    expect(container.querySelector('[data-testid="retired-tags-create"]')).not.toBeNull()

    dispose?.()
    mount(() => <RetiredSurfaceReference surface="tags" state="context" />)
    expect(container.querySelectorAll('[role="menuitem"]')).toHaveLength(3)
  })
})
