import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'
import { Node } from 'prosemirror-model'

import {
  initMatrixSchema,
  createMatrix,
  insertDataRow,
  updateRow,
  insertJoin,
  deleteJoin,
  getTargets,
  getSources,
  deleteOwnedTarget,
} from '../core/matrix'
import { createTreePosition, removeTreePosition } from '../core/tree'
import { registerPlugin, getPlugin } from '../core/plugin'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { getFaceConfigsForMatrix } from '../core/face-config'
import { ensureTrait, getTraits } from '../core/traits'
import { tableFaceTypeDefinition } from '../table/table-plugin'
import { schema } from '../editor/schema'
import { extractInlineRefs, updateCachedTitlesInPlace } from '../editor/inlineref-sync'

import {
  noteListFaceTypeDefinition,
  noteFaceTypeDefinition,
  notesPlugin,
  buildAllNotesQuery,
  buildSingleNoteQuery,
} from './notes-plugin'

const EMPTY_DOC_JSON = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

// Strip init to avoid worker calls in unit tests (init calls seedRow via worker client)
const testNotesPlugin = { ...notesPlugin, init: undefined }

afterEach(() => {
  clearFaceTypeRegistry()
})

describe('Notes plugin', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    registerFaceType(tableFaceTypeDefinition)
    registerFaceType(noteListFaceTypeDefinition)
    registerFaceType(noteFaceTypeDefinition)
  })

  test('registering the notes plugin creates the notes matrix and rank trait', async () => {
    const ctx = await registerPlugin(db, testNotesPlugin)
    const matrixId = ctx.matrixIds['notes']!

    expect(matrixId).toBeTypeOf('number')

    const plugin = getPlugin(db, 'hila.notes')
    expect(plugin).not.toBeNull()
    expect(plugin!.name).toBe('Notes')

    const traits = getTraits(db, matrixId)
    const traitTypes = traits.map((t) => t.trait_type)
    expect(traitTypes).toContain('rank')
    expect(traitTypes).not.toContain('closure')
  })

  test('notes plugin creates face configs for note-list and note face types', async () => {
    const ctx = await registerPlugin(db, testNotesPlugin)
    const matrixId = ctx.matrixIds['notes']!

    const configs = getFaceConfigsForMatrix(db, matrixId)
    const faceTypeIds = configs.map((c) => c.faceTypeId)

    expect(faceTypeIds).toContain('hila.note-list')
    expect(faceTypeIds).toContain('hila.note')
    expect(faceTypeIds).toContain('hila.table')
  })

  test('note face config has correct slot bindings', async () => {
    const ctx = await registerPlugin(db, testNotesPlugin)
    const matrixId = ctx.matrixIds['notes']!

    const configs = getFaceConfigsForMatrix(db, matrixId)
    const noteConfig = configs.find((c) => c.faceTypeId === 'hila.note')!

    expect(noteConfig.slotBindings).toEqual({ title: 'title', body: 'body' })
  })

  test('re-registering the notes plugin is idempotent', async () => {
    const ctx1 = await registerPlugin(db, testNotesPlugin)
    const ctx2 = await registerPlugin(db, testNotesPlugin)

    expect(ctx2.matrixIds['notes']).toBe(ctx1.matrixIds['notes'])
  })

  test('inserting a note into a rank-only matrix works', async () => {
    const matrixId = createMatrix(db, 'TestNotes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const rowId = insertDataRow(db, matrixId, { title: 'My Note', body: EMPTY_DOC_JSON })
    const key = createTreePosition(db, matrixId, rowId)

    expect(key).toBeInstanceOf(Uint8Array)
    expect(key.length).toBeGreaterThan(0)

    const stmt = db.prepare(`SELECT title, body FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { title: string; body: string }
    expect(row.title).toBe('My Note')
    stmt.finalize()
  })

  test('inserting multiple notes preserves rank ordering', async () => {
    const matrixId = createMatrix(db, 'TestNotes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const id1 = insertDataRow(db, matrixId, { title: 'First', body: EMPTY_DOC_JSON })
    const key1 = createTreePosition(db, matrixId, id1)

    const id2 = insertDataRow(db, matrixId, { title: 'Second', body: EMPTY_DOC_JSON })
    const key2 = createTreePosition(db, matrixId, id2, { prevKey: key1 })

    const id3 = insertDataRow(db, matrixId, { title: 'Third', body: EMPTY_DOC_JSON })
    createTreePosition(db, matrixId, id3, { prevKey: key2 })

    const query = buildAllNotesQuery(matrixId)
    const stmt = db.prepare(query)
    const titles: string[] = []
    while (stmt.step()) {
      const row = stmt.get({}) as { title: string }
      titles.push(row.title)
    }
    stmt.finalize()

    expect(titles).toEqual(['First', 'Second', 'Third'])
  })

  test('updating a note persists changes', async () => {
    const matrixId = createMatrix(db, 'TestNotes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const rowId = insertDataRow(db, matrixId, { title: 'Original', body: EMPTY_DOC_JSON })
    createTreePosition(db, matrixId, rowId)

    const newBody = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated body' }] }],
    })
    updateRow(db, { matrixId, rowId, values: { title: 'Updated', body: newBody } })

    const query = buildSingleNoteQuery(matrixId, rowId)
    const stmt = db.prepare(query)
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { title: string; body: string }
    expect(row.title).toBe('Updated')
    expect(row.body).toBe(newBody)
    stmt.finalize()
  })

  test('deleting a note from a rank-only matrix works', async () => {
    const matrixId = createMatrix(db, 'TestNotes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const rowId = insertDataRow(db, matrixId, { title: 'Doomed', body: EMPTY_DOC_JSON })
    createTreePosition(db, matrixId, rowId)

    removeTreePosition(db, matrixId, rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [rowId] })

    const stmt = db.prepare(`SELECT 1 FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(false)
    stmt.finalize()

    const rankStmt = db.prepare('SELECT 1 FROM rank WHERE matrix_id = ? AND row_id = ?')
    rankStmt.bind([matrixId, rowId])
    expect(rankStmt.step()).toBe(false)
    rankStmt.finalize()
  })

  test('buildAllNotesQuery returns correct SQL', () => {
    const query = buildAllNotesQuery(42)
    expect(query).toContain('mx_42_data')
    expect(query).toContain('rank r')
    expect(query).toContain('ORDER BY r.key')
  })

  test('buildSingleNoteQuery returns correct SQL', () => {
    const query = buildSingleNoteQuery(42, 7)
    expect(query).toContain('mx_42_data')
    expect(query).toContain('WHERE d.id = 7')
  })

  test('overflow columns appear in note matrix when added', async () => {
    const matrixId = createMatrix(db, 'TestNotes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const { addColumn, getColumns } = await import('../core/matrix')

    addColumn(db, matrixId, { name: 'tags', type: 'TEXT' })

    const columns = getColumns(db, matrixId)
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('title')
    expect(colNames).toContain('body')
    expect(colNames).toContain('tags')
  })
})

describe('Inlineref schema node', () => {
  test('inlineref node type exists in the schema', () => {
    expect(schema.nodes.inlineref).toBeDefined()
  })

  test('inlineref node is inline and atom', () => {
    const spec = schema.nodes.inlineref!.spec
    expect(spec.inline).toBe(true)
    expect(spec.atom).toBe(true)
    expect(spec.group).toBe('inline')
  })

  test('inlineref node can be created with targetMatrixId and targetRowId attrs', () => {
    const node = schema.nodes.inlineref!.create({ targetMatrixId: 1, targetRowId: 42 })
    expect(node.attrs.targetMatrixId).toBe(1)
    expect(node.attrs.targetRowId).toBe(42)
    expect(node.attrs.kind).toBe('ref')
    expect(node.attrs.cachedTitle).toBeNull()
  })

  test('inlineref node supports kind and cachedTitle attrs', () => {
    const node = schema.nodes.inlineref!.create({
      targetMatrixId: 1,
      targetRowId: 42,
      kind: 'own',
      cachedTitle: 'My Tag',
    })
    expect(node.attrs.kind).toBe('own')
    expect(node.attrs.cachedTitle).toBe('My Tag')
  })

  test('inlineref node roundtrips through JSON serialization', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('before '),
        schema.nodes.inlineref!.create({ targetMatrixId: 5, targetRowId: 10 }),
        schema.text(' after'),
      ]),
    ])

    const json = doc.toJSON()
    const restored = Node.fromJSON(schema, json)

    let found = false
    restored.descendants((node) => {
      if (node.type.name === 'inlineref') {
        expect(node.attrs.targetMatrixId).toBe(5)
        expect(node.attrs.targetRowId).toBe(10)
        expect(node.attrs.kind).toBe('ref')
        found = true
      }
    })
    expect(found).toBe(true)
  })
})

describe('extractInlineRefs', () => {
  test('extracts inlineref links from a PM doc', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('see '),
        schema.nodes.inlineref!.create({ targetMatrixId: 1, targetRowId: 2 }),
        schema.text(' and '),
        schema.nodes.inlineref!.create({ targetMatrixId: 1, targetRowId: 3 }),
      ]),
    ])

    const refs = extractInlineRefs(doc)
    expect(refs).toEqual([
      { targetMatrixId: 1, targetRowId: 2, kind: 'ref' },
      { targetMatrixId: 1, targetRowId: 3, kind: 'ref' },
    ])
  })

  test('returns empty array for doc without inlineref nodes', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('plain text')]),
    ])

    expect(extractInlineRefs(doc)).toEqual([])
  })

  test('extracts inlineref links across multiple paragraphs', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.nodes.inlineref!.create({ targetMatrixId: 1, targetRowId: 10 }),
      ]),
      schema.node('paragraph', null, [
        schema.nodes.inlineref!.create({ targetMatrixId: 1, targetRowId: 20 }),
      ]),
    ])

    const refs = extractInlineRefs(doc)
    expect(refs).toHaveLength(2)
    expect(refs[0]).toEqual({ targetMatrixId: 1, targetRowId: 10, kind: 'ref' })
    expect(refs[1]).toEqual({ targetMatrixId: 1, targetRowId: 20, kind: 'ref' })
  })

  test('skips inlineref nodes with null target IDs', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.nodes.inlineref!.create({ targetMatrixId: null, targetRowId: null }),
        schema.nodes.inlineref!.create({ targetMatrixId: 1, targetRowId: 5 }),
      ]),
    ])

    const refs = extractInlineRefs(doc)
    expect(refs).toEqual([{ targetMatrixId: 1, targetRowId: 5, kind: 'ref' }])
  })

  test('extracts kind from inlineref nodes', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.nodes.inlineref!.create({ targetMatrixId: 1, targetRowId: 2, kind: 'ref' }),
        schema.nodes.inlineref!.create({ targetMatrixId: 1, targetRowId: 3, kind: 'own' }),
      ]),
    ])

    const refs = extractInlineRefs(doc)
    expect(refs).toEqual([
      { targetMatrixId: 1, targetRowId: 2, kind: 'ref' },
      { targetMatrixId: 1, targetRowId: 3, kind: 'own' },
    ])
  })
})

describe('Inlineref join sync (direct DB)', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('inserting a wikilink creates a join table row', () => {
    const matrixId = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const srcId = insertDataRow(db, matrixId, { title: 'Source', body: '' })
    createTreePosition(db, matrixId, srcId)

    const tgtId = insertDataRow(db, matrixId, { title: 'Target', body: '' })
    createTreePosition(db, matrixId, tgtId)

    insertJoin(db, matrixId, srcId, matrixId, tgtId)

    const targets = getTargets(db, matrixId, srcId)
    expect(targets).toEqual([{ targetMatrixId: matrixId, targetRowId: tgtId, kind: 'ref' }])
  })

  test('deleting a wikilink removes the join table row', () => {
    const matrixId = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const srcId = insertDataRow(db, matrixId, { title: 'Source', body: '' })
    createTreePosition(db, matrixId, srcId)

    const tgtId = insertDataRow(db, matrixId, { title: 'Target', body: '' })
    createTreePosition(db, matrixId, tgtId)

    insertJoin(db, matrixId, srcId, matrixId, tgtId)
    expect(getTargets(db, matrixId, srcId)).toHaveLength(1)

    deleteJoin(db, matrixId, srcId, matrixId, tgtId)
    expect(getTargets(db, matrixId, srcId)).toHaveLength(0)
  })

  test('multiple wikilinks create multiple join rows', () => {
    const matrixId = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const srcId = insertDataRow(db, matrixId, { title: 'Source', body: '' })
    createTreePosition(db, matrixId, srcId)

    const tgt1 = insertDataRow(db, matrixId, { title: 'Target 1', body: '' })
    createTreePosition(db, matrixId, tgt1)

    const tgt2 = insertDataRow(db, matrixId, { title: 'Target 2', body: '' })
    createTreePosition(db, matrixId, tgt2)

    const tgt3 = insertDataRow(db, matrixId, { title: 'Target 3', body: '' })
    createTreePosition(db, matrixId, tgt3)

    insertJoin(db, matrixId, srcId, matrixId, tgt1)
    insertJoin(db, matrixId, srcId, matrixId, tgt2)
    insertJoin(db, matrixId, srcId, matrixId, tgt3)

    const targets = getTargets(db, matrixId, srcId)
    expect(targets).toHaveLength(3)
    const targetRowIds = targets.map((t) => t.targetRowId).sort((a, b) => a - b)
    expect(targetRowIds).toEqual([tgt1, tgt2, tgt3].sort((a, b) => a - b))
  })

  test('backlinks (reverse lookup) returns correct sources', () => {
    const matrixId = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const note1 = insertDataRow(db, matrixId, { title: 'Note 1', body: '' })
    createTreePosition(db, matrixId, note1)

    const note2 = insertDataRow(db, matrixId, { title: 'Note 2', body: '' })
    createTreePosition(db, matrixId, note2)

    const note3 = insertDataRow(db, matrixId, { title: 'Note 3', body: '' })
    createTreePosition(db, matrixId, note3)

    // note1 and note2 both link to note3
    insertJoin(db, matrixId, note1, matrixId, note3)
    insertJoin(db, matrixId, note2, matrixId, note3)

    const sources = getSources(db, matrixId, note3)
    expect(sources).toHaveLength(2)
    const sourceIds = sources.map((s) => s.sourceRowId).sort((a, b) => a - b)
    expect(sourceIds).toEqual([note1, note2].sort((a, b) => a - b))
  })

  test('duplicate join insertion is idempotent', () => {
    const matrixId = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const srcId = insertDataRow(db, matrixId, { title: 'Source', body: '' })
    createTreePosition(db, matrixId, srcId)

    const tgtId = insertDataRow(db, matrixId, { title: 'Target', body: '' })
    createTreePosition(db, matrixId, tgtId)

    insertJoin(db, matrixId, srcId, matrixId, tgtId)
    insertJoin(db, matrixId, srcId, matrixId, tgtId)

    expect(getTargets(db, matrixId, srcId)).toHaveLength(1)
  })

  test('inserting a join with kind=own creates an own-kind join entry', () => {
    const matrixId = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const srcId = insertDataRow(db, matrixId, { title: 'Source', body: '' })
    createTreePosition(db, matrixId, srcId)

    const tgtId = insertDataRow(db, matrixId, { title: 'Owned Target', body: '' })
    createTreePosition(db, matrixId, tgtId)

    insertJoin(db, matrixId, srcId, matrixId, tgtId, 'own')

    const targets = getTargets(db, matrixId, srcId)
    expect(targets).toEqual([{ targetMatrixId: matrixId, targetRowId: tgtId, kind: 'own' }])
  })

  test('mixed ref and own joins coexist and return correct kinds', () => {
    const matrixId = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const srcId = insertDataRow(db, matrixId, { title: 'Source', body: '' })
    createTreePosition(db, matrixId, srcId)

    const refTarget = insertDataRow(db, matrixId, { title: 'Ref Target', body: '' })
    createTreePosition(db, matrixId, refTarget)

    const ownTarget = insertDataRow(db, matrixId, { title: 'Own Target', body: '' })
    createTreePosition(db, matrixId, ownTarget)

    insertJoin(db, matrixId, srcId, matrixId, refTarget, 'ref')
    insertJoin(db, matrixId, srcId, matrixId, ownTarget, 'own')

    const targets = getTargets(db, matrixId, srcId)
    expect(targets).toHaveLength(2)

    const refEntry = targets.find((t) => t.targetRowId === refTarget)
    const ownEntry = targets.find((t) => t.targetRowId === ownTarget)
    expect(refEntry?.kind).toBe('ref')
    expect(ownEntry?.kind).toBe('own')
  })

  test('removing an own-kind join and calling deleteOwnedTarget cascade-deletes the target row', () => {
    const matrixId = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const srcId = insertDataRow(db, matrixId, { title: 'Source', body: '' })
    createTreePosition(db, matrixId, srcId)

    const ownTarget = insertDataRow(db, matrixId, { title: 'Owned', body: '' })
    createTreePosition(db, matrixId, ownTarget)

    insertJoin(db, matrixId, srcId, matrixId, ownTarget, 'own')
    expect(getTargets(db, matrixId, srcId)).toHaveLength(1)

    deleteJoin(db, matrixId, srcId, matrixId, ownTarget)
    deleteOwnedTarget(db, matrixId, ownTarget)

    expect(getTargets(db, matrixId, srcId)).toHaveLength(0)

    const stmt = db.prepare(`SELECT 1 FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([ownTarget])
    expect(stmt.step()).toBe(false)
    stmt.finalize()
  })

  test('backlinks query includes kind column', () => {
    const matrixId = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    ensureTrait(db, 'rank', matrixId)

    const src1 = insertDataRow(db, matrixId, { title: 'Ref Source', body: '' })
    createTreePosition(db, matrixId, src1)

    const src2 = insertDataRow(db, matrixId, { title: 'Own Source', body: '' })
    createTreePosition(db, matrixId, src2)

    const target = insertDataRow(db, matrixId, { title: 'Target', body: '' })
    createTreePosition(db, matrixId, target)

    insertJoin(db, matrixId, src1, matrixId, target, 'ref')
    insertJoin(db, matrixId, src2, matrixId, target, 'own')

    const sql = `
      SELECT j.source_row_id AS id, j.kind, d.title
      FROM joins j
      JOIN "mx_${matrixId}_data" d ON j.source_row_id = d.id
      WHERE j.target_matrix_id = ${matrixId} AND j.target_row_id = ${target}
        AND j.source_matrix_id = ${matrixId}
      ORDER BY d.title
    `
    const stmt = db.prepare(sql)
    const results: { id: number; kind: string; title: string }[] = []
    while (stmt.step()) {
      const row = stmt.get({}) as { id: number; kind: string; title: string }
      results.push(row)
    }
    stmt.finalize()

    expect(results).toHaveLength(2)
    const ownBacklink = results.find((r) => r.id === src2)
    const refBacklink = results.find((r) => r.id === src1)
    expect(ownBacklink?.kind).toBe('own')
    expect(refBacklink?.kind).toBe('ref')
  })
})

describe('updateCachedTitlesInPlace', () => {
  test('updates cachedTitle in doc JSON from title map', () => {
    const docJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineref',
              attrs: {
                targetMatrixId: 1,
                targetRowId: 42,
                kind: 'ref',
                cachedTitle: 'old title',
              },
            },
          ],
        },
      ],
    }

    const titleMap = new Map<string, string | null>([['1:42', 'new title']])
    updateCachedTitlesInPlace(docJson, titleMap)

    const attrs = (docJson.content[0] as { content: { attrs: { cachedTitle: string } }[] })
      .content[0]!.attrs
    expect(attrs.cachedTitle).toBe('new title')
  })

  test('sets cachedTitle to null for deleted targets', () => {
    const docJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineref',
              attrs: {
                targetMatrixId: 2,
                targetRowId: 99,
                kind: 'ref',
                cachedTitle: 'still here',
              },
            },
          ],
        },
      ],
    }

    const titleMap = new Map<string, string | null>([['2:99', null]])
    updateCachedTitlesInPlace(docJson, titleMap)

    const attrs = (
      docJson.content[0] as { content: { attrs: { cachedTitle: string | null } }[] }
    ).content[0]!.attrs
    expect(attrs.cachedTitle).toBeNull()
  })

  test('skips inlineref nodes with null targets', () => {
    const docJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineref',
              attrs: {
                targetMatrixId: null,
                targetRowId: null,
                kind: 'ref',
                cachedTitle: 'empty',
              },
            },
          ],
        },
      ],
    }

    const titleMap = new Map<string, string | null>()
    updateCachedTitlesInPlace(docJson, titleMap)

    const attrs = (docJson.content[0] as { content: { attrs: { cachedTitle: string } }[] })
      .content[0]!.attrs
    expect(attrs.cachedTitle).toBe('empty')
  })

  test('updates multiple inlineref nodes across paragraphs', () => {
    const docJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineref',
              attrs: { targetMatrixId: 1, targetRowId: 10, kind: 'ref', cachedTitle: null },
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineref',
              attrs: { targetMatrixId: 1, targetRowId: 20, kind: 'own', cachedTitle: null },
            },
          ],
        },
      ],
    }

    const titleMap = new Map<string, string | null>([
      ['1:10', 'First Note'],
      ['1:20', 'Second Note'],
    ])
    updateCachedTitlesInPlace(docJson, titleMap)

    type ContentNode = { content: { attrs: { cachedTitle: string | null } }[] }
    const first = (docJson.content[0] as ContentNode).content[0]!.attrs
    const second = (docJson.content[1] as ContentNode).content[0]!.attrs
    expect(first.cachedTitle).toBe('First Note')
    expect(second.cachedTitle).toBe('Second Note')
  })
})
