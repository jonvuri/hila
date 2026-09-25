import { describe, expect, test } from 'vitest'

import { injectStartupVisualTheme, resolveStartupVisualTheme } from './startup-theme'

describe('startup visual theme', () => {
  test.each([
    ['ghost', 'ghost'],
    ['null', 'null'],
    ['wipeout', 'wipeout'],
    [undefined, 'ghost'],
    ['', 'ghost'],
    ['dark', 'ghost'],
  ])('resolves and injects %s as %s', (input, expected) => {
    const environment = { VITE_HILA_VISUAL_THEME: input }

    expect(resolveStartupVisualTheme(environment)).toBe(expected)
    expect(injectStartupVisualTheme('<html lang="en">', environment)).toContain(
      `<html data-visual-theme="${expected}" lang="en">`,
    )
  })

  test('writes only the validated visual-theme axis into the initial document', () => {
    const html = injectStartupVisualTheme(
      '<html lang="en" data-theme="light" data-density="narrow" data-navigation-outline="guides" data-shell-presentation="single-panel" data-fidelity="substrate">',
      { VITE_HILA_VISUAL_THEME: 'wipeout' },
    )
    const document = new DOMParser().parseFromString(html, 'text/html')

    expect(document.documentElement.dataset).toMatchObject({
      theme: 'light',
      visualTheme: 'wipeout',
      density: 'narrow',
      navigationOutline: 'guides',
      shellPresentation: 'single-panel',
      fidelity: 'substrate',
    })
  })
})
