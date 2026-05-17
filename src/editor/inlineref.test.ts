import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'
import { Node } from 'prosemirror-model'

import {
  initMatrixSchema,
  createMatrix,
  insertDataRow,
  insertJoin,
  getTargets,
} from '../core/matrix'
import { createTreePosition } from '../core/tree'
import { ensureTrait } from '../core/traits'

import { schema } from './schema'
import { extractInlineRefs } from './inlineref-sync'

const makeDocWithInlineRef = (
  text: string,
  ref: { targetMatrixId: number; targetRowId: number; kind?: string; cachedTitle?: string },
) =>
  JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text },
          {
            type: 'inlineref',
            attrs: {
              targetMatrixId: ref.targetMatrixId,
              targetRowId: ref.targetRowId,
              kind: ref.kind ?? 'ref',
              cachedTitle: ref.cachedTitle ?? null,
            },
          },
        ],
      },
    ],
  })

const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

describe('Inline references in outline rows', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('outline content with inlineref node roundtrips through JSON', () => {
    const matrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'closure', matrixId)

    const targetRow = insertDataRow(db, matrixId, { content: EMPTY_DOC })
    createTreePosition(db, matrixId, targetRow)

    const docJson = makeDocWithInlineRef('see ', {
      targetMatrixId: matrixId,
      targetRowId: targetRow,
    })

    const srcRow = insertDataRow(db, matrixId, { content: docJson })
    createTreePosition(db, matrixId, srcRow)

    const stmt = db.prepare(`SELECT content FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([srcRow])
    stmt.step()
    const stored = (stmt.get({}) as { content: string }).content
    stmt.finalize()

    const doc = Node.fromJSON(schema, JSON.parse(stored))
    const refs = extractInlineRefs(doc)
    expect(refs).toEqual([{ targetMatrixId: matrixId, targetRowId: targetRow, kind: 'ref' }])
  })

  test('extractInlineRefs extracts refs from outline-style doc content', () => {
    const matrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'closure', matrixId)

    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('link to '),
        schema.nodes.inlineref!.create({
          targetMatrixId: matrixId,
          targetRowId: 100,
          kind: 'ref',
          cachedTitle: 'Target',
        }),
        schema.text(' done'),
      ]),
    ])

    const refs = extractInlineRefs(doc)
    expect(refs).toHaveLength(1)
    expect(refs[0]).toEqual({ targetMatrixId: matrixId, targetRowId: 100, kind: 'ref' })
  })

  test('syncInlineRefs creates join entries for outline row refs (direct DB)', () => {
    const matrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'closure', matrixId)

    const srcRow = insertDataRow(db, matrixId, { content: EMPTY_DOC })
    createTreePosition(db, matrixId, srcRow)

    const tgtRow = insertDataRow(db, matrixId, { content: EMPTY_DOC })
    createTreePosition(db, matrixId, tgtRow)

    insertJoin(db, matrixId, srcRow, matrixId, tgtRow)
    const targets = getTargets(db, matrixId, srcRow)
    expect(targets).toEqual([{ targetMatrixId: matrixId, targetRowId: tgtRow, kind: 'ref' }])
  })

  test('own-kind inlineref in outline content is extracted correctly', () => {
    const outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const tagMatrixId = createMatrix(db, 'Tags', [{ name: 'label', type: 'TEXT' }])
    ensureTrait(db, 'rank', outlineMatrixId)
    ensureTrait(db, 'closure', outlineMatrixId)

    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('tagged '),
        schema.nodes.inlineref!.create({
          targetMatrixId: tagMatrixId,
          targetRowId: 42,
          kind: 'own',
          cachedTitle: 'task',
        }),
      ]),
    ])

    const refs = extractInlineRefs(doc)
    expect(refs).toEqual([{ targetMatrixId: tagMatrixId, targetRowId: 42, kind: 'own' }])
  })

  test('plain text content does not contain inlineref nodes', () => {
    const plainText = 'Just a simple plain text row'
    const wrappedDoc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: plainText }],
        },
      ],
    })
    const doc = Node.fromJSON(schema, JSON.parse(wrappedDoc))
    const refs = extractInlineRefs(doc)
    expect(refs).toHaveLength(0)
  })

  test('multiple inlineref nodes in single outline paragraph are all extracted', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.nodes.inlineref!.create({
          targetMatrixId: 1,
          targetRowId: 10,
          kind: 'ref',
        }),
        schema.text(' and '),
        schema.nodes.inlineref!.create({
          targetMatrixId: 2,
          targetRowId: 20,
          kind: 'own',
          cachedTitle: 'tag',
        }),
      ]),
    ])

    const refs = extractInlineRefs(doc)
    expect(refs).toHaveLength(2)
    expect(refs[0]).toEqual({ targetMatrixId: 1, targetRowId: 10, kind: 'ref' })
    expect(refs[1]).toEqual({ targetMatrixId: 2, targetRowId: 20, kind: 'own' })
  })
})
