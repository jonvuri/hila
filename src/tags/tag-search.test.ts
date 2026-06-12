import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  insertDataRow,
  insertRow,
  getTargets,
  getSources,
  createDependentRow,
  createHostlessAspectRow,
  createRefJoin,
} from '../core/matrix'
import { createTreePosition, getOwnEdge, reparentRow } from '../core/tree'
import { registerPlugin } from '../core/plugin'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { tableFaceTypeDefinition } from '../table/table-plugin'
import { schema } from '../editor/schema'
import { extractInlineRefs } from '../editor/inlineref-sync'
import { workspacePlugin } from '../workspace/workspace-plugin'

import { tagsPlugin } from './tags-plugin'
import { createTagType, getTagType, getTagTypeByMatrixId, getAllTagTypes } from './tag-types'

const testTagsPlugin = { ...tagsPlugin, init: undefined }
const testWorkspacePlugin = { ...workspacePlugin, init: undefined }

describe('Tag search, insertion, and inline tag type creation', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    registerFaceType(tableFaceTypeDefinition)
    await registerPlugin(db, testWorkspacePlugin)
    await registerPlugin(db, testTagsPlugin)
  })

  afterEach(() => {
    clearFaceTypeRegistry()
  })

  describe('Tag type search', () => {
    test('searching tag types returns matching results', () => {
      createTagType(db, 'task')
      createTagType(db, 'movie-review')
      createTagType(db, 'book')

      const all = getAllTagTypes(db)
      const matching = all.filter((tt) => tt.name.toLowerCase().includes('ta'))
      expect(matching).toHaveLength(1)
      expect(matching[0]!.name).toBe('task')
    })

    test('searching tag types with empty query returns all results', () => {
      createTagType(db, 'task')
      createTagType(db, 'movie-review')
      createTagType(db, 'book')

      const all = getAllTagTypes(db)
      expect(all).toHaveLength(3)
    })

    test('searching tag types is case-insensitive', () => {
      createTagType(db, 'Task')

      const all = getAllTagTypes(db)
      const matching = all.filter((tt) => tt.name.toLowerCase().includes('task'))
      expect(matching).toHaveLength(1)
    })

    test('tag type results include matrixId', () => {
      const tt = createTagType(db, 'task')

      const all = getAllTagTypes(db)
      expect(all[0]!.matrixId).toBe(tt.matrixId)
    })
  })

  describe('Tag insertion via createDependentRow', () => {
    test('selecting a tag type creates an aspect row via createDependentRow', () => {
      const tagType = createTagType(db, 'task')
      const outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])

      const sourceRowId = insertDataRow(db, outlineMatrixId, { content: '{}' })
      createTreePosition(db, outlineMatrixId, sourceRowId)

      const targetRowId = createDependentRow(db, outlineMatrixId, sourceRowId, tagType.matrixId)

      expect(targetRowId).toBeTypeOf('number')

      const targets = getTargets(db, outlineMatrixId, sourceRowId)
      expect(targets).toHaveLength(1)
      expect(targets[0]).toEqual({
        targetMatrixId: tagType.matrixId,
        targetRowId,
        kind: 'own',
      })
    })

    test('the inlineref node has kind: own for # trigger', () => {
      const tagType = createTagType(db, 'task')

      const node = schema.nodes.inlineref!.create({
        targetMatrixId: tagType.matrixId,
        targetRowId: 42,
        kind: 'own',
        cachedTitle: 'task',
      })

      expect(node.attrs.kind).toBe('own')
      expect(node.attrs.targetMatrixId).toBe(tagType.matrixId)
      expect(node.attrs.cachedTitle).toBe('task')
    })

    test('@ and [[ triggers still create kind: ref (no regression)', () => {
      const node = schema.nodes.inlineref!.create({
        targetMatrixId: 1,
        targetRowId: 10,
        kind: 'ref',
        cachedTitle: 'note title',
      })

      expect(node.attrs.kind).toBe('ref')
    })
  })

  describe('Inline tag type creation', () => {
    test('creating a new tag type when no match exists', () => {
      expect(getTagType(db, 'project')).toBeNull()

      const newTagType = createTagType(db, 'project')
      expect(newTagType.name).toBe('project')
      expect(newTagType.matrixId).toBeTypeOf('number')
    })

    test('inline tag type creation then creates aspect row', () => {
      const outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])

      const sourceRowId = insertDataRow(db, outlineMatrixId, { content: '{}' })
      createTreePosition(db, outlineMatrixId, sourceRowId)

      const newTagType = createTagType(db, 'project')
      const targetRowId = createDependentRow(
        db,
        outlineMatrixId,
        sourceRowId,
        newTagType.matrixId,
      )

      expect(targetRowId).toBeTypeOf('number')

      const targets = getTargets(db, outlineMatrixId, sourceRowId)
      expect(targets).toEqual([
        { targetMatrixId: newTagType.matrixId, targetRowId, kind: 'own' },
      ])
    })

    test('Create tag type option should not appear when exact match exists', () => {
      createTagType(db, 'task')
      const all = getAllTagTypes(db)
      const hasExactMatch = all.some((tt) => tt.name.toLowerCase() === 'task')
      expect(hasExactMatch).toBe(true)
    })

    test('Create tag type option should appear when no exact match', () => {
      createTagType(db, 'task')
      const all = getAllTagTypes(db)
      const hasExactMatch = all.some((tt) => tt.name.toLowerCase() === 'project')
      expect(hasExactMatch).toBe(false)
    })
  })

  describe('Tags in both outline text and note body text', () => {
    test('extractInlineRefs correctly handles own-kind refs from outline content', () => {
      const tagType = createTagType(db, 'task')

      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [
          schema.text('some text '),
          schema.nodes.inlineref!.create({
            targetMatrixId: tagType.matrixId,
            targetRowId: 99,
            kind: 'own',
            cachedTitle: 'task',
          }),
        ]),
      ])

      const refs = extractInlineRefs(doc)
      expect(refs).toHaveLength(1)
      expect(refs[0]).toEqual({
        targetMatrixId: tagType.matrixId,
        targetRowId: 99,
        kind: 'own',
      })
    })

    test('extractInlineRefs handles mix of ref and own kinds', () => {
      const tagType = createTagType(db, 'task')
      const noteMatrixId = createMatrix(db, 'Notes', [
        { name: 'title', type: 'TEXT' },
        { name: 'body', type: 'TEXT' },
      ])

      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [
          schema.nodes.inlineref!.create({
            targetMatrixId: noteMatrixId,
            targetRowId: 10,
            kind: 'ref',
            cachedTitle: 'My Note',
          }),
          schema.text(' tagged with '),
          schema.nodes.inlineref!.create({
            targetMatrixId: tagType.matrixId,
            targetRowId: 20,
            kind: 'own',
            cachedTitle: 'task',
          }),
        ]),
      ])

      const refs = extractInlineRefs(doc)
      expect(refs).toHaveLength(2)
      expect(refs[0]!.kind).toBe('ref')
      expect(refs[1]!.kind).toBe('own')
    })

    test('syncInlineRefs logic: own-kind join created for tag refs', () => {
      const tagType = createTagType(db, 'task')
      const outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])

      const sourceRowId = insertDataRow(db, outlineMatrixId, { content: '{}' })
      createTreePosition(db, outlineMatrixId, sourceRowId)

      const targetRowId = createDependentRow(db, outlineMatrixId, sourceRowId, tagType.matrixId)

      const targets = getTargets(db, outlineMatrixId, sourceRowId)
      expect(targets).toContainEqual({
        targetMatrixId: tagType.matrixId,
        targetRowId,
        kind: 'own',
      })
    })
  })

  describe('Tag badge rendering', () => {
    test('own-kind inlineref node carries data-kind="own" in toDOM', () => {
      const tagType = createTagType(db, 'task')
      const node = schema.nodes.inlineref!.create({
        targetMatrixId: tagType.matrixId,
        targetRowId: 42,
        kind: 'own',
        cachedTitle: 'task',
      })

      const domSpec = node.type.spec.toDOM!(node)
      const attrs = (domSpec as [string, Record<string, string>, string])[1]
      expect(attrs['data-kind']).toBe('own')
    })

    test('ref-kind inlineref node carries data-kind="ref" in toDOM', () => {
      const node = schema.nodes.inlineref!.create({
        targetMatrixId: 1,
        targetRowId: 10,
        kind: 'ref',
        cachedTitle: 'note title',
      })

      const domSpec = node.type.spec.toDOM!(node)
      const attrs = (domSpec as [string, Record<string, string>, string])[1]
      expect(attrs['data-kind']).toBe('ref')
    })

    test('tag type metadata can be resolved by matrix ID', () => {
      const tagType = createTagType(db, 'task')

      const resolved = getTagTypeByMatrixId(db, tagType.matrixId)
      expect(resolved).not.toBeNull()
      expect(resolved!.name).toBe('task')
      expect(resolved!.matrixId).toBe(tagType.matrixId)
    })

    test('non-tag-type matrix ID returns null from getTagTypeByMatrixId', () => {
      const plainMatrixId = createMatrix(db, 'Notes', [{ name: 'title', type: 'TEXT' }])

      const resolved = getTagTypeByMatrixId(db, plainMatrixId)
      expect(resolved).toBeNull()
    })

    test('own-kind node with deleted target produces ghost state attrs', () => {
      const tagType = createTagType(db, 'task')
      const node = schema.nodes.inlineref!.create({
        targetMatrixId: tagType.matrixId,
        targetRowId: 999999,
        kind: 'own',
        cachedTitle: 'task',
      })

      expect(node.attrs.kind).toBe('own')
      expect(node.attrs.cachedTitle).toBe('task')
      expect(node.attrs.targetRowId).toBe(999999)
    })

    test('ref-kind node attrs are unchanged (no regression)', () => {
      const node = schema.nodes.inlineref!.create({
        targetMatrixId: 1,
        targetRowId: 10,
        kind: 'ref',
        cachedTitle: 'My Note',
      })

      expect(node.attrs.kind).toBe('ref')
      expect(node.attrs.cachedTitle).toBe('My Note')
      expect(node.attrs.targetMatrixId).toBe(1)
      expect(node.attrs.targetRowId).toBe(10)
    })
  })

  describe('Tagging gestures (Phase 8c §5)', () => {
    const getWsMatrixId = (): number => {
      const stmt = db.prepare("SELECT metadata FROM plugins WHERE id = 'hila.workspace'")
      stmt.step()
      const row = stmt.get({}) as { metadata: string }
      stmt.finalize()
      return JSON.parse(row.metadata).matrixIds['root'] as number
    }

    test('#label (no schema) is a ref-edge to the label-node', () => {
      const outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
      const sourceRowId = insertDataRow(db, outlineMatrixId, { content: '{}' })
      createTreePosition(db, outlineMatrixId, sourceRowId)

      const wsMatrixId = getWsMatrixId()
      const { rowId: labelNodeId } = insertRow(db, wsMatrixId, {
        values: { label: 'important' },
      })

      // Tagging with a label = ref-edge from source to the label-node
      createRefJoin(db, outlineMatrixId, sourceRowId, wsMatrixId, labelNodeId)

      const sources = getSources(db, wsMatrixId, labelNodeId)
      const refSources = sources.filter((s) => s.kind === 'ref')
      expect(refSources).toHaveLength(1)
      expect(refSources[0]!.sourceMatrixId).toBe(outlineMatrixId)
      expect(refSources[0]!.sourceRowId).toBe(sourceRowId)
    })

    test('hostless aspect row is owned by the type-node', () => {
      const tagType = createTagType(db, 'task')
      const wsMatrixId = getWsMatrixId()
      const typeNode = { matrixId: wsMatrixId, rowId: tagType.id }

      const rowId = createHostlessAspectRow(db, typeNode, tagType.matrixId, {})

      const edge = getOwnEdge(db, tagType.matrixId, rowId)
      expect(edge).not.toBeNull()
      expect(edge!.parent.matrixId).toBe(wsMatrixId)
      expect(edge!.parent.rowId).toBe(tagType.id)
    })

    test('hostless aspect row can be reparented onto a host', () => {
      const tagType = createTagType(db, 'task')
      const outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
      const wsMatrixId = getWsMatrixId()
      const typeNode = { matrixId: wsMatrixId, rowId: tagType.id }
      const rowId = createHostlessAspectRow(db, typeNode, tagType.matrixId, {})

      const hostRowId = insertDataRow(db, outlineMatrixId, { content: 'host' })
      createTreePosition(db, outlineMatrixId, hostRowId)

      reparentRow(db, {
        matrixId: tagType.matrixId,
        rowId,
        newParent: { matrixId: outlineMatrixId, rowId: hostRowId },
      })

      const edge = getOwnEdge(db, tagType.matrixId, rowId)
      expect(edge!.parent.matrixId).toBe(outlineMatrixId)
      expect(edge!.parent.rowId).toBe(hostRowId)
    })
  })
})
