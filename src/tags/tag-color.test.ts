import { describe, expect, test } from 'vitest'

import { tagColorFromName, tagBadgeBackground } from './tag-color'

describe('tagColorFromName', () => {
  test('returns an HSL color string', () => {
    const color = tagColorFromName('task')
    expect(color).toMatch(/^hsl\(\d+, 55%, 48%\)$/)
  })

  test('returns the same color for the same name', () => {
    expect(tagColorFromName('task')).toBe(tagColorFromName('task'))
  })

  test('returns different colors for different names', () => {
    const a = tagColorFromName('task')
    const b = tagColorFromName('movie-review')
    expect(a).not.toBe(b)
  })

  test('handles empty string', () => {
    const color = tagColorFromName('')
    expect(color).toMatch(/^hsl\(\d+, 55%, 48%\)$/)
  })

  test('handles single-character name', () => {
    const color = tagColorFromName('x')
    expect(color).toMatch(/^hsl\(\d+, 55%, 48%\)$/)
  })
})

describe('tagBadgeBackground', () => {
  test('returns a lighter HSL for HSL input', () => {
    const bg = tagBadgeBackground('hsl(200, 55%, 48%)')
    expect(bg).toBe('hsl(200, 55%, 93%)')
  })

  test('returns color-mix for hex input', () => {
    const bg = tagBadgeBackground('#ff0000')
    expect(bg).toBe('color-mix(in srgb, #ff0000 12%, white)')
  })

  test('returns color-mix for named color input', () => {
    const bg = tagBadgeBackground('purple')
    expect(bg).toBe('color-mix(in srgb, purple 12%, white)')
  })

  test('works with generated tag color', () => {
    const color = tagColorFromName('task')
    const bg = tagBadgeBackground(color)
    expect(bg).toMatch(/^hsl\(\d+, 55%, 93%\)$/)
  })
})
