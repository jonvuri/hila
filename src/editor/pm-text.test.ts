import { describe, expect, test } from 'vitest'

import { extractTextFromPmDoc } from './pm-text'

describe('extractTextFromPmDoc', () => {
  test('extracts text from a parsed PM doc object', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello ' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'world' },
            { type: 'text', text: '!' },
          ],
        },
      ],
    }
    expect(extractTextFromPmDoc(doc)).toBe('Hello world!')
  })

  test('extracts text from a JSON string', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'from string' }] }],
    })
    expect(extractTextFromPmDoc(json)).toBe('from string')
  })

  test('returns empty string for doc with no content', () => {
    expect(extractTextFromPmDoc({ type: 'doc' })).toBe('')
  })

  test('returns empty string for empty blocks', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] }
    expect(extractTextFromPmDoc(doc)).toBe('')
  })

  test('returns the string itself for invalid JSON', () => {
    expect(extractTextFromPmDoc('not valid json')).toBe('not valid json')
  })

  test('returns empty string for null/undefined', () => {
    expect(extractTextFromPmDoc(null)).toBe('')
    expect(extractTextFromPmDoc(undefined)).toBe('')
  })

  test('handles heading nodes', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
      ],
    }
    expect(extractTextFromPmDoc(doc)).toBe('TitleBody')
  })

  test('skips non-text inline nodes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'before ' },
            { type: 'inlineref', attrs: { targetMatrixId: 1, targetRowId: 2 } },
            { type: 'text', text: ' after' },
          ],
        },
      ],
    }
    expect(extractTextFromPmDoc(doc)).toBe('before  after')
  })
})
