import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'solid-js/web'

import { ghostTheme, ghostTreatments } from './ghost'
import { nullTheme, nullTreatments } from './null'
import ThemeCard from './ThemeCard'
import {
  themeCardSectionIds,
  themeCardSemanticRoleIds,
  themeCardStateIds,
  themeCardTreatmentKindIds,
} from './types'

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

  test('fills the Ghost card with every local role and treatment category', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(() => <ThemeCard theme={ghostTheme} />, container)

    expect(Object.keys(ghostTheme.roles ?? {})).toEqual(themeCardSemanticRoleIds)
    expect(
      new Set(
        [...container.querySelectorAll('[data-treatment-kind]')].map((treatment) =>
          treatment.getAttribute('data-treatment-kind'),
        ),
      ),
    ).toEqual(new Set(themeCardTreatmentKindIds))
    expect(container.querySelectorAll('[data-treatment-kind]')).toHaveLength(
      ghostTreatments.length,
    )
  })

  test('shows both conditional-breadcrumb workspace states', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(() => <ThemeCard theme={ghostTheme} />, container)

    const workspaces = container.querySelectorAll('.tc-workspace-specimen')
    expect(workspaces).toHaveLength(2)
    expect(
      workspaces[0]?.querySelectorAll('[data-testid="workspace-ancestry-breadcrumb"]'),
    ).toHaveLength(0)
    expect(
      workspaces[1]?.querySelectorAll('[data-testid="workspace-ancestry-breadcrumb"]'),
    ).toHaveLength(1)
    expect(container.querySelectorAll('.tc-long-form p')).toHaveLength(3)
  })

  test('builds Null as a complete Ghost role override with an ambiguity ledger', () => {
    expect(Object.keys(nullTheme.roles ?? {})).toEqual(themeCardSemanticRoleIds)
    expect(nullTheme.roles?.['geometry-control-radius']).not.toBe(
      ghostTheme.roles?.['geometry-control-radius'],
    )
    expect(nullTreatments.map((treatment) => treatment.kind)).not.toContain('structural')
    expect(
      nullTreatments.every((treatment) => treatment.label.startsWith('Ghost ambiguity:')),
    ).toBe(true)
  })

  test('keeps Ghost and Null specimen structure identical', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <>
          <ThemeCard theme={ghostTheme} />
          <ThemeCard theme={nullTheme} />
        </>
      ),
      container,
    )

    const cards = [...container.querySelectorAll<HTMLElement>('[data-testid="theme-card"]')]
    const specimenShape = (card: HTMLElement) => ({
      sections: card.querySelectorAll('[data-theme-card-section]').length,
      states: card.querySelectorAll('.tc-state-specimen').length,
      controls: card.querySelectorAll('button, input').length,
      workspaces: card.querySelectorAll('.tc-workspace-specimen').length,
      longFormParagraphs: card.querySelectorAll('.tc-long-form p').length,
    })

    expect(cards).toHaveLength(2)
    expect(specimenShape(cards[1]!)).toEqual(specimenShape(cards[0]!))
  })
})
