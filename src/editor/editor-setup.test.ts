import { describe, expect, test, vi } from 'vitest'
import { Node } from 'prosemirror-model'

import { schema } from './schema'
import { labelSchema } from './label-schema'
import {
  createLabelEditorState,
  createContentEditorState,
  createDebouncedSave,
} from './editor-setup'
import { extractInlineRefs } from './inlineref-sync'

// ---------------------------------------------------------------------------
// Label schema: single-paragraph only
// ---------------------------------------------------------------------------

describe('labelSchema', () => {
  test('accepts a single paragraph', () => {
    const doc = Node.fromJSON(labelSchema, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    })
    expect(doc.childCount).toBe(1)
    expect(doc.firstChild!.type.name).toBe('paragraph')
  })

  test('content expression only allows a single paragraph', () => {
    const docType = labelSchema.nodes.doc!
    const paraType = labelSchema.nodes.paragraph!
    const match = docType.contentMatch.matchType(paraType)
    expect(match).not.toBeNull()
    // After matching one paragraph, the match must be at a valid end
    expect(match!.validEnd).toBe(true)
    // A second paragraph should not match
    const secondMatch = match!.matchType(paraType)
    expect(secondMatch).toBeNull()
  })

  test('does not include heading node type', () => {
    expect(labelSchema.nodes.heading).toBeUndefined()
  })

  test('supports bold mark', () => {
    const doc = Node.fromJSON(labelSchema, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              marks: [{ type: 'bold' }],
              text: 'Bold text',
            },
          ],
        },
      ],
    })
    expect(doc.firstChild!.firstChild!.marks[0]!.type.name).toBe('bold')
  })

  test('supports italic mark', () => {
    const doc = Node.fromJSON(labelSchema, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Emphasis' }],
        },
      ],
    })
    expect(doc.firstChild!.firstChild!.marks[0]!.type.name).toBe('italic')
  })

  test('supports code mark', () => {
    const doc = Node.fromJSON(labelSchema, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'code' }], text: 'code' }],
        },
      ],
    })
    expect(doc.firstChild!.firstChild!.marks[0]!.type.name).toBe('code')
  })

  test('supports inlineref nodes', () => {
    const doc = Node.fromJSON(labelSchema, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'see ' },
            {
              type: 'inlineref',
              attrs: { targetMatrixId: 1, targetRowId: 2, kind: 'ref', cachedTitle: 'Foo' },
            },
          ],
        },
      ],
    })
    const refs = extractInlineRefs(doc)
    expect(refs).toHaveLength(1)
    expect(refs[0]).toEqual({ targetMatrixId: 1, targetRowId: 2, kind: 'ref' })
  })
})

// ---------------------------------------------------------------------------
// Content schema (full): paragraphs and headings
// ---------------------------------------------------------------------------

describe('contentSchema (full schema)', () => {
  test('accepts paragraphs and headings', () => {
    const doc = Node.fromJSON(schema, {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
      ],
    })
    expect(doc.childCount).toBe(2)
    expect(doc.firstChild!.type.name).toBe('heading')
    expect(doc.lastChild!.type.name).toBe('paragraph')
  })

  test('accepts multiple paragraphs', () => {
    const doc = Node.fromJSON(schema, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
      ],
    })
    expect(doc.childCount).toBe(3)
  })

  test('supports inlineref in content schema', () => {
    const doc = Node.fromJSON(schema, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'link ' },
            {
              type: 'inlineref',
              attrs: { targetMatrixId: 3, targetRowId: 4, kind: 'own', cachedTitle: 'tag' },
            },
          ],
        },
      ],
    })
    const refs = extractInlineRefs(doc)
    expect(refs).toEqual([{ targetMatrixId: 3, targetRowId: 4, kind: 'own' }])
  })
})

// ---------------------------------------------------------------------------
// createLabelEditorState
// ---------------------------------------------------------------------------

describe('createLabelEditorState', () => {
  test('creates state with label schema', () => {
    const state = createLabelEditorState()
    expect(state.schema).toBe(labelSchema)
  })

  test('loads doc JSON into label schema', () => {
    const docJson = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    }
    const state = createLabelEditorState(docJson)
    expect(state.doc.textContent).toBe('Hello')
    expect(state.doc.childCount).toBe(1)
  })

  test('creates empty doc when no JSON provided', () => {
    const state = createLabelEditorState()
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild!.type.name).toBe('paragraph')
  })
})

// ---------------------------------------------------------------------------
// createContentEditorState
// ---------------------------------------------------------------------------

describe('createContentEditorState', () => {
  test('creates state with full schema', () => {
    const state = createContentEditorState()
    expect(state.schema).toBe(schema)
  })

  test('loads doc JSON with headings', () => {
    const docJson = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
      ],
    }
    const state = createContentEditorState(docJson)
    expect(state.doc.childCount).toBe(2)
    expect(state.doc.firstChild!.type.name).toBe('heading')
  })

  test('creates empty doc when no JSON provided', () => {
    const state = createContentEditorState()
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild!.type.name).toBe('paragraph')
  })
})

// ---------------------------------------------------------------------------
// createDebouncedSave
// ---------------------------------------------------------------------------

describe('createDebouncedSave', () => {
  test('calls save function after debounce period', () => {
    vi.useFakeTimers()
    const saveFn = vi.fn()
    const handle = createDebouncedSave(saveFn, 200)

    const doc = Node.fromJSON(labelSchema, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'test' }] }],
    })

    handle.schedule(doc)
    expect(saveFn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(saveFn).toHaveBeenCalledOnce()
    expect(saveFn).toHaveBeenCalledWith(doc)

    vi.useRealTimers()
  })

  test('debounces multiple rapid calls', () => {
    vi.useFakeTimers()
    const saveFn = vi.fn()
    const handle = createDebouncedSave(saveFn, 200)

    const doc1 = Node.fromJSON(labelSchema, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }],
    })
    const doc2 = Node.fromJSON(labelSchema, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }],
    })

    handle.schedule(doc1)
    vi.advanceTimersByTime(100)
    handle.schedule(doc2)
    vi.advanceTimersByTime(200)

    expect(saveFn).toHaveBeenCalledOnce()
    expect(saveFn).toHaveBeenCalledWith(doc2)

    vi.useRealTimers()
  })

  test('flush saves immediately', () => {
    vi.useFakeTimers()
    const saveFn = vi.fn()
    const handle = createDebouncedSave(saveFn, 200)

    const doc = Node.fromJSON(labelSchema, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'test' }] }],
    })

    handle.schedule(doc)
    expect(saveFn).not.toHaveBeenCalled()

    handle.flush()
    expect(saveFn).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(200)
    expect(saveFn).toHaveBeenCalledOnce()

    vi.useRealTimers()
  })

  test('destroy flushes pending save', () => {
    vi.useFakeTimers()
    const saveFn = vi.fn()
    const handle = createDebouncedSave(saveFn, 200)

    const doc = Node.fromJSON(labelSchema, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'test' }] }],
    })

    handle.schedule(doc)
    handle.destroy()
    expect(saveFn).toHaveBeenCalledOnce()

    vi.useRealTimers()
  })

  test('flush with no pending save is a no-op', () => {
    const saveFn = vi.fn()
    const handle = createDebouncedSave(saveFn, 200)
    handle.flush()
    expect(saveFn).not.toHaveBeenCalled()
  })
})
