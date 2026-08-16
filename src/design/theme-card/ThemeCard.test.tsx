import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'solid-js/web'

import ThemeCard from './ThemeCard'
import { themeCardSectionIds, themeCardSemanticRoleIds, themeCardStateIds } from './types'

describe('ThemeCard grammar', () => {
  let dispose: (() => void) | undefined
  let container: HTMLDivElement

  afterEach(() => {
    dispose?.()
    container?.remove()
  })

  const mount = () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <ThemeCard
          theme={{
            id: 'test',
            name: 'Test grammar',
            intent: 'Keep the comparison fixed.',
            delta: 'No theme delta.',
          }}
        />
      ),
      container,
    )
  }

  test('keeps the fixed section order', () => {
    mount()

    const sections = [...container.querySelectorAll('[data-theme-card-section]')].map(
      (section) => section.getAttribute('data-theme-card-section'),
    )
    expect(sections).toEqual(themeCardSectionIds)
  })

  test('renders every required semantic state without interaction', () => {
    mount()

    const states = [...container.querySelectorAll('.tc-state-specimen')].map((specimen) =>
      specimen.getAttribute('data-state'),
    )
    expect(states).toEqual(themeCardStateIds)
  })

  test('accepts each temporary semantic role', () => {
    const roles = Object.fromEntries(
      themeCardSemanticRoleIds.map((role, index) => [role, `${index + 1}px`]),
    )
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <ThemeCard
          theme={{
            id: 'roles',
            name: 'Role contract',
            intent: 'Test the local role input.',
            delta: 'No theme delta.',
            roles,
          }}
        />
      ),
      container,
    )

    const card = container.querySelector<HTMLElement>('[data-testid="theme-card"]')
    expect(card).not.toBeNull()
    for (const [role, value] of Object.entries(roles)) {
      expect(card?.style.getPropertyValue(`--tc-${role}`)).toBe(value)
    }
  })
})
