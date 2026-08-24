import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import {
  componentVariantRegistry,
  fundamentalTokenNames,
  resolveComponentVariant,
  resolveFidelity,
  resolvePolarity,
  resolveThemeScope,
  resolveVisualTheme,
  semanticTokenNames,
} from './tokens'

describe('canonical token contract', () => {
  test('defines explicit selectors for every inheritable theme-axis value', () => {
    const tokenStyles = readFileSync('src/design/tokens.css', 'utf8')

    for (const selector of [
      "[data-theme='dark']",
      "[data-theme='light']",
      "[data-visual-theme='ghost']",
      "[data-visual-theme='null']",
      "[data-visual-theme='wipeout']",
    ]) {
      expect(tokenStyles).toContain(selector)
    }
  })

  test('resolves missing and unknown theme axes to their independent fallbacks', () => {
    expect(resolvePolarity(undefined)).toBe('dark')
    expect(resolvePolarity('sepia')).toBe('dark')
    expect(resolveVisualTheme(undefined)).toBe('ghost')
    expect(resolveVisualTheme('dark')).toBe('ghost')
  })

  test('inherits an unchanged axis in a nested theme scope', () => {
    expect(
      resolveThemeScope({ visualTheme: 'wipeout' }, { polarity: 'light', visualTheme: 'null' }),
    ).toEqual({ polarity: 'light', visualTheme: 'wipeout' })

    expect(
      resolveThemeScope({ polarity: 'dark' }, { polarity: 'light', visualTheme: 'null' }),
    ).toEqual({ polarity: 'dark', visualTheme: 'null' })
  })

  test('keeps component variant values independent from visual theme values', () => {
    expect(componentVariantRegistry.navigationOutline.values).not.toContain('ghost')
    expect(componentVariantRegistry.navigationOutline.values).not.toContain('null')
    expect(componentVariantRegistry.navigationOutline.values).not.toContain('wipeout')
    expect(resolveComponentVariant('navigationOutline', 'vector')).toBe('vector')
  })

  test('falls back for missing and unknown component variant values', () => {
    expect(resolveComponentVariant('navigationOutline', undefined)).toBe('workflowy')
    expect(resolveComponentVariant('navigationOutline', 'ghost')).toBe('workflowy')
    expect(resolveComponentVariant('tableTreatment', 'unknown')).toBe('thin-line')
  })

  test('gives x-ray priority over local and inherited fidelity', () => {
    expect(resolveFidelity({ fidelity: 'composed', xray: true })).toBe('substrate')
    expect(resolveFidelity({ inheritedFidelity: 'substrate' })).toBe('substrate')
    expect(resolveFidelity({ fidelity: 'composed', inheritedFidelity: 'substrate' })).toBe(
      'composed',
    )
  })

  test('publishes every required semantic group', () => {
    expect(fundamentalTokenNames).toEqual(
      expect.arrayContaining([
        'palette-neutral-950',
        'font-family-sans',
        'space-8',
        'radius-6',
        'line-width-1',
        'duration-160',
        'shadow-soft',
        'decoration-size-6',
      ]),
    )
    expect(semanticTokenNames).toEqual(
      expect.arrayContaining([
        'color-canvas',
        'type-body-family',
        'space-control-gap',
        'size-control',
        'color-line-subtle',
        'duration-feedback',
        'elevation-overlay',
        'color-state-focus',
        'color-decoration',
      ]),
    )
  })
})
