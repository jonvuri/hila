import { Schema } from 'prosemirror-model'

/**
 * Single-line ProseMirror schema for label (title) editing.
 *
 * Allows exactly one paragraph block with inline content (text, marks,
 * inline refs, hard breaks). No headings or multi-block content.
 */
export const labelSchema = new Schema({
  nodes: {
    doc: {
      content: 'paragraph',
    },

    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0]
      },
    },

    inlineref: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        targetMatrixId: { default: null },
        targetRowId: { default: null },
        kind: { default: 'ref' },
        cachedTitle: { default: null },
      },
      toDOM(node) {
        return [
          'span',
          {
            class: 'inlineref',
            'data-target-matrix-id': String(node.attrs.targetMatrixId),
            'data-target-row-id': String(node.attrs.targetRowId),
            'data-kind': String(node.attrs.kind),
            'data-cached-title': String(node.attrs.cachedTitle ?? ''),
          },
          '',
        ]
      },
      parseDOM: [
        {
          tag: 'span.inlineref',
          getAttrs(dom) {
            const el = dom as HTMLElement
            return {
              targetMatrixId:
                el.getAttribute('data-target-matrix-id') ?
                  Number(el.getAttribute('data-target-matrix-id'))
                : null,
              targetRowId:
                el.getAttribute('data-target-row-id') ?
                  Number(el.getAttribute('data-target-row-id'))
                : null,
              kind: el.getAttribute('data-kind') || 'ref',
              cachedTitle: el.getAttribute('data-cached-title') || null,
            }
          },
        },
      ],
    },

    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM() {
        return ['br']
      },
    },

    text: {
      group: 'inline',
    },
  },

  marks: {
    bold: {
      parseDOM: [
        { tag: 'strong' },
        {
          tag: 'b',
          getAttrs: (node) => (node as HTMLElement).style.fontWeight !== 'normal' && null,
        },
        {
          style: 'font-weight=400',
          clearMark: (m) => m.type.name === 'bold',
        },
        {
          style: 'font-weight',
          getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null,
        },
      ],
      toDOM() {
        return ['strong', 0]
      },
    },

    italic: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM() {
        return ['em', 0]
      },
    },

    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM() {
        return ['code', 0]
      },
    },

    link: {
      attrs: { href: { validate: 'string' } },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs(node) {
            return { href: (node as HTMLElement).getAttribute('href') }
          },
        },
      ],
      toDOM(node) {
        return ['a', { href: node.attrs.href as string }, 0]
      },
    },
  },
})
