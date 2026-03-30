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
} from '../core/matrix'
import { createTreePosition, removeTreePosition } from '../core/tree'
import { registerPlugin, getPlugin } from '../core/plugin'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { getFaceConfigsForMatrix } from '../core/face-config'
import { ensureTrait, getTraits } from '../core/traits'
import { tableFaceTypeDefinition } from '../table/table-plugin'
import { schema } from '../editor/schema'

import {
  noteListFaceTypeDefinition,
  noteFaceTypeDefinition,
  notesPlugin,
  buildAllNotesQuery,
  buildSingleNoteQuery,
} from './notes-plugin'
import { extractWikilinks } from './wikilink-sync'

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

describe('Wikilink schema node', () => {
  test('wikilink node type exists in the schema', () => {
    expect(schema.nodes.wikilink).toBeDefined()
  })

  test('wikilink node is inline and atom', () => {
    const spec = schema.nodes.wikilink!.spec
    expect(spec.inline).toBe(true)
    expect(spec.atom).toBe(true)
    expect(spec.group).toBe('inline')
  })

  test('wikilink node can be created with matrixId and rowId attrs', () => {
    const node = schema.nodes.wikilink!.create({ matrixId: 1, rowId: 42 })
    expect(node.attrs.matrixId).toBe(1)
    expect(node.attrs.rowId).toBe(42)
  })

  test('wikilink node roundtrips through JSON serialization', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('before '),
        schema.nodes.wikilink!.create({ matrixId: 5, rowId: 10 }),
        schema.text(' after'),
      ]),
    ])

    const json = doc.toJSON()
    const restored = Node.fromJSON(schema, json)

    let foundWikilink = false
    restored.descendants((node) => {
      if (node.type.name === 'wikilink') {
        expect(node.attrs.matrixId).toBe(5)
        expect(node.attrs.rowId).toBe(10)
        foundWikilink = true
      }
    })
    expect(foundWikilink).toBe(true)
  })
})

describe('extractWikilinks', () => {
  test('extracts wikilinks from a PM doc', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('see '),
        schema.nodes.wikilink!.create({ matrixId: 1, rowId: 2 }),
        schema.text(' and '),
        schema.nodes.wikilink!.create({ matrixId: 1, rowId: 3 }),
      ]),
    ])

    const links = extractWikilinks(doc)
    expect(links).toEqual([
      { matrixId: 1, rowId: 2 },
      { matrixId: 1, rowId: 3 },
    ])
  })

  test('returns empty array for doc without wikilinks', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('plain text')]),
    ])

    expect(extractWikilinks(doc)).toEqual([])
  })

  test('extracts wikilinks across multiple paragraphs', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.nodes.wikilink!.create({ matrixId: 1, rowId: 10 }),
      ]),
      schema.node('paragraph', null, [
        schema.nodes.wikilink!.create({ matrixId: 1, rowId: 20 }),
      ]),
    ])

    const links = extractWikilinks(doc)
    expect(links).toHaveLength(2)
    expect(links[0]).toEqual({ matrixId: 1, rowId: 10 })
    expect(links[1]).toEqual({ matrixId: 1, rowId: 20 })
  })
})

describe('Wikilink join sync (direct DB)', () => {
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
})
