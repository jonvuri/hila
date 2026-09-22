import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { createViewBlock } from './block-marker'
import { buildDiscoveryRowProjection, queryDiscoveryCatalog } from './discovery'
import {
  addFormulaColumn,
  createMatrix,
  createOwnedMatrix,
  initMatrixSchema,
  insertRow,
  promoteNode,
  updateColumnRole,
  updateRow,
} from './matrix'
import { reparentRow } from './tree'

const doc = (text: string): string =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

describe('discovery row projection', () => {
  test('includes content only for the all-content filter', () => {
    expect(buildDiscoveryRowProjection('label', 'content', 'all')).toBe(
      'id, "label", "content"',
    )

    for (const filter of ['named', 'types', 'commands', 'containers'] as const) {
      expect(buildDiscoveryRowProjection('label', 'content', filter)).toBe('id, "label"')
    }
  })

  test('deduplicates role columns and preserves row identities without a label', () => {
    expect(buildDiscoveryRowProjection('same', 'same', 'all')).toBe('id, "same"')
    expect(buildDiscoveryRowProjection(null, 'content', 'named')).toBe('id')
    expect(buildDiscoveryRowProjection(null, null, 'all')).toBeNull()
  })
})

describe('worker discovery catalog', () => {
  let db: Database
  let workspaceId: number

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    workspaceId = createMatrix(db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
  })

  const search = (query: string, filter: 'all' | 'containers' | 'types' = 'all') =>
    queryDiscoveryCatalog(db, { rootMatrixId: workspaceId, query, filter, limit: 12 })

  test('discovers cross-matrix label and nested ProseMirror content', () => {
    const owner = {
      matrixId: workspaceId,
      rowId: insertRow(db, workspaceId, { values: { label: doc('Projects') } }).rowId,
    }
    const taskMatrix = createOwnedMatrix(db, owner, 'Tasks', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
    const nested = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            {
              type: 'list_item',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Needle %_ literal' }] },
              ],
            },
          ],
        },
      ],
    })
    const rowId = insertRow(db, taskMatrix, {
      parent: owner,
      values: { label: doc('Write tests'), content: nested },
    }).rowId

    expect(search('write')[0]).toMatchObject({
      family: 'row',
      target: { type: 'node', node: { matrixId: taskMatrix, rowId } },
    })
    expect(search('%_')[0]).toMatchObject({
      content: expect.stringContaining('Needle %_ literal'),
      breadcrumb: expect.arrayContaining([{ node: owner, label: 'Projects' }]),
    })
  })

  test('classifies views, promoted types, containers, and ordinary rows once', () => {
    const ordinary = {
      matrixId: workspaceId,
      rowId: insertRow(db, workspaceId, { values: { label: doc('Ordinary result') } }).rowId,
    }
    const view = createViewBlock(db, ordinary, 'SELECT 1', 'Saved result')

    const typeNode = {
      matrixId: workspaceId,
      rowId: insertRow(db, workspaceId, { values: { label: doc('Task type') } }).rowId,
    }
    const typeMatrix = createOwnedMatrix(db, typeNode, 'Task type', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    promoteNode(db, typeNode)

    const containerNode = {
      matrixId: workspaceId,
      rowId: insertRow(db, workspaceId, { values: { label: doc('Project node') } }).rowId,
    }
    const containerMatrix = createOwnedMatrix(db, containerNode, 'Project records', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])

    expect(search('Ordinary')).toHaveLength(1)
    expect(search('Ordinary')[0]?.family).toBe('row')
    expect(search('Saved')).toHaveLength(1)
    expect(search('Saved')[0]).toMatchObject({ family: 'view', target: { node: view } })
    expect(search('Task type', 'types')[0]).toMatchObject({
      family: 'type',
      subjectMatrixId: typeMatrix,
    })
    expect(search('Project records', 'containers')[0]).toMatchObject({
      family: 'container',
      subjectMatrixId: containerMatrix,
      target: { node: containerNode },
    })
  })

  test('represents the workspace matrix as the existing root', () => {
    const root = search('', 'containers').find(({ target }) => target.type === 'root')
    expect(root).toMatchObject({
      id: `root:${workspaceId}`,
      family: 'container',
      target: { type: 'root', matrixId: workspaceId },
      subjectMatrixId: workspaceId,
    })
  })

  test('rejects formula-backed semantic roles without disrupting discovery', () => {
    const matrixId = createMatrix(db, 'Computed', [{ name: 'source', type: 'TEXT' }])
    addFormulaColumn(db, matrixId, 'computed', 'upper(source)')

    for (const role of ['label', 'content'] as const) {
      expect(() => updateColumnRole(db, matrixId, 'computed', role)).toThrow(
        `Formula column "computed" cannot have semantic role '${role}'`,
      )
    }

    const rowId = insertRow(db, workspaceId, {
      values: { label: doc('Discovery remains available') },
    }).rowId
    expect(search('remains')[0]).toMatchObject({
      target: { type: 'node', node: { matrixId: workspaceId, rowId } },
    })
  })

  test('preserves an exact label match longer than its display excerpt', () => {
    const label = 'exact-label-'.repeat(25)
    const node = {
      matrixId: workspaceId,
      rowId: insertRow(db, workspaceId, { values: { label: doc(label) } }).rowId,
    }

    const result = search(label)[0]
    expect(result).toMatchObject({
      target: { type: 'node', node },
      matchTarget: 'label',
      matchQuality: 'exact',
    })
    expect(result?.label).not.toBe(label)
    expect(result?.label.length).toBeLessThanOrEqual(240)
  })

  test('preserves a long content match late in a capped display excerpt', () => {
    const query = 'late-content-query-'.repeat(15)
    const content = `${'before '.repeat(80)}${query}${' after'.repeat(80)}`
    const node = {
      matrixId: workspaceId,
      rowId: insertRow(db, workspaceId, {
        values: { label: doc('Long content result'), content: doc(content) },
      }).rowId,
    }

    const result = search(query)[0]
    expect(result).toMatchObject({
      target: { type: 'node', node },
      matchTarget: 'content',
    })
    expect(result?.content).not.toContain(query)
    expect(result?.content.length).toBeLessThanOrEqual(240)
  })

  test('bounds root and ancestor breadcrumb labels without losing useful context', () => {
    const rootTitle = `Root start ${'r'.repeat(1_200)} root end`
    const longAncestorLabel = `Ancestor start ${'a'.repeat(1_200)} ancestor end`
    const rootMatrixId = createMatrix(db, rootTitle, [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    let parent: { matrixId: number; rowId: number } | undefined
    for (let depth = 0; depth < 8; depth += 1) {
      parent = {
        matrixId: rootMatrixId,
        rowId: insertRow(db, rootMatrixId, {
          parent,
          values: { label: doc(depth === 7 ? longAncestorLabel : `Ancestor ${depth}`) },
        }).rowId,
      }
    }
    const longAncestor = parent
    for (const label of ['Breadcrumb match one', 'Breadcrumb match two']) {
      insertRow(db, rootMatrixId, { parent, values: { label: doc(label) } })
    }

    const results = queryDiscoveryCatalog(db, {
      rootMatrixId,
      query: 'Breadcrumb match',
      filter: 'all',
      limit: 12,
    })

    expect(results).toHaveLength(2)
    for (const result of results) {
      expect(result.breadcrumb).toHaveLength(8)
      expect(result.breadcrumb[0]?.label).toMatch(/^Root start .*….* root end$/)
      expect(result.breadcrumb.at(-1)).toMatchObject({ node: longAncestor })
      expect(result.breadcrumb.at(-1)?.label).toMatch(/^Ancestor start .*….* ancestor end$/)
      for (const item of result.breadcrumb) {
        expect(Array.from(item.label).length).toBeLessThanOrEqual(1_024)
      }
    }
  })

  test.each(['first', 'last'] as const)(
    'retains a shallow result at the %s end of an over-cap catalog',
    (catalogSide) => {
      const parent = {
        matrixId: workspaceId,
        rowId: insertRow(db, workspaceId).rowId,
      }
      const nodes = Array.from({ length: 97 }, () => ({
        matrixId: workspaceId,
        rowId: insertRow(db, workspaceId, {
          parent,
          values: { label: 'x' },
        }).rowId,
      })).toSorted((left, right) => left.rowId - right.rowId)
      const shallow = catalogSide === 'first' ? nodes[0]! : nodes.at(-1)!

      reparentRow(db, { matrixId: shallow.matrixId, rowId: shallow.rowId })
      updateRow(db, {
        matrixId: shallow.matrixId,
        rowId: shallow.rowId,
        values: { label: 'this shallow result has a deliberately longer label' },
      })

      const results = search('')
      expect(results).toHaveLength(96)
      expect(results.slice(0, 2).map(({ id }) => id)).toEqual([
        `root:${workspaceId}`,
        `row:${shallow.matrixId}:${shallow.rowId}`,
      ])
    },
  )
})
