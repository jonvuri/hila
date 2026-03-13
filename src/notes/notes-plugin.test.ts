import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  insertRow,
  insertDataRow,
  updateRow,
} from '../core/matrix'
import { registerPlugin, getPlugin } from '../core/plugin'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { getFaceConfigsForMatrix } from '../core/face-config'
import { ensureTrait, getTraits } from '../core/traits'
import { tableFaceTypeDefinition } from '../table/table-plugin'

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
    const key = insertRow(db, { matrixId, rowKind: 0, rowId })

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
    const key1 = insertRow(db, { matrixId, rowKind: 0, rowId: id1 })

    const id2 = insertDataRow(db, matrixId, { title: 'Second', body: EMPTY_DOC_JSON })
    const key2 = insertRow(db, { matrixId, rowKind: 0, rowId: id2, prevKey: key1 })

    const id3 = insertDataRow(db, matrixId, { title: 'Third', body: EMPTY_DOC_JSON })
    insertRow(db, { matrixId, rowKind: 0, rowId: id3, prevKey: key2 })

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
    insertRow(db, { matrixId, rowKind: 0, rowId })

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

    const { deleteRow } = await import('../core/matrix')

    const rowId = insertDataRow(db, matrixId, { title: 'Doomed', body: EMPTY_DOC_JSON })
    const key = insertRow(db, { matrixId, rowKind: 0, rowId })

    deleteRow(db, { matrixId, key })

    const stmt = db.prepare(`SELECT 1 FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(false)
    stmt.finalize()

    const rankStmt = db.prepare('SELECT 1 FROM rank WHERE matrix_id = ? AND key = ?')
    rankStmt.bind([matrixId, key])
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
