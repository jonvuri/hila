import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, test } from 'vitest'

import { ghostTheme, ghostTreatments } from './ghost'
import { nullTheme, nullTreatments } from './null'
import ThemeCard from './ThemeCard'
import ThemePreview from './ThemePreview'
import { themeCardSectionIds, themeCardStateIds, themeCardTreatmentKindIds } from './types'
import { wipeoutTheme, wipeoutTreatments } from './wipeout'

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
    dispose = render(() => <ThemeCard theme={ghostTheme} />, container)
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

  test('renders the Ghost card with every treatment category', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(() => <ThemeCard theme={ghostTheme} />, container)

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

  test('builds Null as a canonical theme with an ambiguity ledger', () => {
    expect(nullTheme.id).toBe('null')
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

  test('builds Wipeout as a canonical theme with a bounded quirk budget', () => {
    expect(wipeoutTheme.id).toBe('wipeout')
    expect(wipeoutTreatments.map((treatment) => treatment.kind)).not.toContain('structural')
    expect(
      wipeoutTreatments.some((treatment) =>
        treatment.label.includes('aligned low-poly chrome'),
      ),
    ).toBe(true)
  })

  test('keeps all comparison specimen structures identical', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <>
          <ThemeCard theme={ghostTheme} />
          <ThemeCard theme={nullTheme} />
          <ThemeCard theme={wipeoutTheme} />
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
      dials: card.querySelectorAll('.tc-dial').length,
    })

    expect(cards).toHaveLength(3)
    expect(specimenShape(cards[1]!)).toEqual(specimenShape(cards[0]!))
    expect(specimenShape(cards[2]!)).toEqual(specimenShape(cards[0]!))
  })

  test('previews one approved theme at a time', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const [theme, setTheme] = createSignal<'ghost' | 'null' | 'wipeout'>('ghost')
    dispose = render(() => <ThemePreview visualTheme={theme()} />, container)

    expect(container.querySelectorAll('[data-testid="theme-card"]')).toHaveLength(1)
    expect(container.querySelector('[data-theme-card="ghost"]')).not.toBeNull()

    setTheme('wipeout')

    expect(container.querySelectorAll('[data-testid="theme-card"]')).toHaveLength(1)
    expect(container.querySelector('[data-theme-card="wipeout"]')).not.toBeNull()
  })

  test('exposes both resolved theme axes on the isolated preview scope', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const [polarity, setPolarity] = createSignal<'dark' | 'light'>('dark')
    dispose = render(() => <ThemeCard polarity={polarity()} theme={wipeoutTheme} />, container)

    const card = container.querySelector<HTMLElement>('[data-testid="theme-card"]')
    expect(card?.dataset.theme).toBe('dark')
    expect(card?.dataset.visualTheme).toBe('wipeout')

    setPolarity('light')

    expect(card?.dataset.theme).toBe('light')
    expect(card?.dataset.visualTheme).toBe('wipeout')
  })

  test('gives form controls stable identifiers and associated labels', () => {
    mount()

    for (const input of container.querySelectorAll<HTMLInputElement>('input')) {
      expect(input.id).not.toBe('')
      expect(input.name).not.toBe('')
      expect(container.querySelector(`label[for="${input.id}"]`)).not.toBeNull()
    }
  })

  test('hides decorative foundation specimens from assistive technology', () => {
    mount()

    expect(container.querySelectorAll('.tc-foundation-grid [aria-label]')).toHaveLength(0)
    expect(container.querySelectorAll('.tc-foundation-grid [aria-hidden="true"]')).toHaveLength(
      4,
    )
  })

  test('gives embedded workspace landmarks unique names', () => {
    mount()

    const workspaces = [
      ...container.querySelectorAll<HTMLElement>('[data-testid="workspace-skeleton"]'),
    ]
    expect(workspaces.map((workspace) => workspace.tagName)).toEqual(['SECTION', 'SECTION'])
    expect(workspaces.map((workspace) => workspace.getAttribute('aria-label'))).toEqual([
      'Root-visible workspace',
      'Root-shifted workspace',
    ])

    const landmarkNames = [
      ...container.querySelectorAll<HTMLElement>(
        '.ws-focus-section[aria-label], .ws-navigation[aria-label], .ws-breadcrumb[aria-label]',
      ),
    ].map((landmark) => landmark.getAttribute('aria-label'))
    expect(new Set(landmarkNames).size).toBe(landmarkNames.length)
  })
})
