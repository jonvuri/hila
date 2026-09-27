import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

import type { FaceConfig, FaceRecipe } from '../core/face-types'
import type { ColumnDefinition } from '../core/matrix'

const mocks = vi.hoisted(() => ({
  getFaceConfigForMatrix: vi.fn(),
  requestInsert: vi.fn(),
  requestNavigation: vi.fn(),
  deleteRow: vi.fn(),
  rows: [] as Record<string, unknown>[],
  queryObservers: new Map<
    string,
    (result: Record<string, unknown>[] | null, error: Error | null) => void
  >(),
  queryRequests: [] as string[],
}))

vi.mock('../core/client/matrix-client', () => ({
  addColumn: vi.fn(),
  addFormulaColumn: vi.fn(),
  deleteJoin: vi.fn(),
  deleteOwnedTarget: vi.fn(),
  deleteRow: mocks.deleteRow,
  getFaceConfigForMatrix: mocks.getFaceConfigForMatrix,
  insertJoin: vi.fn(),
  removeColumn: vi.fn(),
  renameColumn: vi.fn(),
  reorderColumns: vi.fn(),
  saveFaceConfig: vi.fn(),
  updateColumnDisplayType: vi.fn(),
  updateRow: vi.fn(),
}))

const columns: ColumnDefinition[] = [
  {
    id: 1,
    name: 'title',
    type: 'TEXT',
    displayType: 'text',
    order: 0,
    options: null,
    formula: null,
    constraints: null,
    managedBy: null,
    role: 'label',
  },
]

vi.mock('../core/client/sql-client', () => ({
  addObserver: vi.fn(
    (
      request: string | { sql: string },
      observer: (result: Record<string, unknown>[] | null, error: Error | null) => void,
    ) => {
      const sql = typeof request === 'string' ? request : request.sql
      mocks.queryObservers.set(sql, observer)
      mocks.queryRequests.push(sql)
      if (sql.includes('FROM matrix_columns')) observer(columns, null)
      else if (sql.includes('FROM matrix ORDER BY title')) observer([], null)
      else if (sql.includes('SELECT * FROM "mx_30_data"') && !sql.includes(' OFFSET ')) {
        observer(mocks.rows, null)
      }
    },
  ),
  execQuery: vi.fn(() => Promise.resolve([])),
  removeObserver: vi.fn(),
}))

const { default: TableFace, TABLE_PAGE_SIZE } = await import('./TableFace')

const config = (settings: Record<string, unknown> = {}): FaceConfig => ({
  id: 'table-config',
  matrixId: 30,
  faceTypeId: 'hila.table',
  slotBindings: {},
  settings,
  createdByPlugin: null,
  sort: null,
  filters: [],
})

const recipe = (settings: Record<string, unknown> = {}): FaceRecipe => ({
  faceTypeId: 'hila.table',
  slotBindings: {},
  settings,
})

describe('registered table collection interior', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rows = Array.from({ length: TABLE_PAGE_SIZE + 1 }, (_, index) => ({
      id: index + 1,
      title: `Row ${index + 1}`,
    }))
    mocks.queryObservers.clear()
    mocks.queryRequests.length = 0
    mocks.getFaceConfigForMatrix.mockResolvedValue(config({ tableTreatment: 'invalid' }))
    mocks.requestInsert.mockResolvedValue({ matrixId: 30, rowId: 102 })
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    dispose?.()
    dispose = undefined
    container.remove()
    delete document.documentElement.dataset.visualTheme
  })

  test('keeps insertion, navigation, paging, and treatment behind the collection contract', async () => {
    dispose = render(
      () => (
        <TableFace
          subject={{
            mode: 'container',
            matrixId: 10,
            rowId: 20,
            extentMatrixId: 30,
          }}
          recipe={recipe({ tableTreatment: 'invalid' })}
          rootMatrixId={1}
          density="wide"
          fidelity="composed"
          services={{
            requestInsert: mocks.requestInsert,
            requestNavigation: mocks.requestNavigation,
          }}
        />
      ),
      container,
    )

    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="table-face"]')).not.toBeNull(),
    )
    const table = container.querySelector<HTMLElement>('[data-testid="table-face"]')!
    expect(table.dataset.tableTreatment).toBe('thin-line')
    expect(container.querySelectorAll('tbody tr[data-table-row-index]')).toHaveLength(
      TABLE_PAGE_SIZE,
    )

    container.querySelector<HTMLButtonElement>('[data-testid="table-open-row-btn"]')!.click()
    expect(mocks.requestNavigation).toHaveBeenCalledWith({ matrixId: 30, rowId: 1 })
    ;[...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('+ New Row'))!
      .click()
    expect(mocks.requestInsert).toHaveBeenCalledWith({})
    await vi.waitFor(() =>
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        'New row created.',
      ),
    )
    ;[...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Open new row')!
      .click()
    expect(mocks.requestNavigation).toHaveBeenLastCalledWith({ matrixId: 30, rowId: 102 })
    const nextButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Next',
    )!
    nextButton.click()

    expect(container.querySelector('tbody tr[data-table-row-index]')).toBeNull()
    expect(nextButton.disabled).toBe(true)
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === 'Previous',
      )?.disabled,
    ).toBe(true)
    nextButton.click()
    expect(mocks.queryRequests.filter((sql) => sql.includes('OFFSET 100'))).toHaveLength(1)
    expect(mocks.queryRequests.some((sql) => sql.includes('OFFSET 200'))).toBe(false)

    const pageTwoQuery = [...mocks.queryObservers.keys()].find((sql) =>
      sql.includes('OFFSET 100'),
    )!
    mocks.queryObservers.get(pageTwoQuery)!(
      Array.from({ length: TABLE_PAGE_SIZE + 1 }, (_, index) => ({
        id: index + 101,
        title: `Row ${index + 101}`,
      })),
      null,
    )

    await vi.waitFor(() =>
      expect(
        container.querySelector<HTMLElement>('tbody tr[data-table-row-index]')?.dataset
          .tableRowIndex,
      ).toBe('100'),
    )
    expect(nextButton.disabled).toBe(false)
  })

  test('keeps a valid treatment independent from the visual theme', async () => {
    mocks.rows = [{ id: 1, title: 'First' }]
    mocks.getFaceConfigForMatrix.mockResolvedValue(config({ tableTreatment: 'cell-dots' }))
    dispose = render(
      () => (
        <TableFace
          subject={{
            mode: 'container',
            matrixId: 10,
            rowId: 20,
            extentMatrixId: 30,
          }}
          recipe={recipe({ tableTreatment: 'cell-dots' })}
          rootMatrixId={1}
          density="wide"
          fidelity="substrate"
          services={{}}
        />
      ),
      container,
    )

    await vi.waitFor(() =>
      expect(container.querySelector('[data-table-treatment="cell-dots"]')).not.toBeNull(),
    )
    document.documentElement.dataset.visualTheme = 'wipeout'
    expect(container.querySelector('[data-table-treatment="cell-dots"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Table pages"]')).toBeNull()
    expect(container.textContent).not.toContain('+ New Row')
  })

  test('clears cell selection and editing when the page changes', async () => {
    dispose = render(
      () => (
        <TableFace
          subject={{
            mode: 'container',
            matrixId: 10,
            rowId: 20,
            extentMatrixId: 30,
          }}
          recipe={recipe()}
          rootMatrixId={1}
          density="wide"
          fidelity="composed"
          services={{}}
        />
      ),
      container,
    )

    await vi.waitFor(() =>
      expect(container.querySelector('tbody tr[data-table-row-index="0"]')).not.toBeNull(),
    )
    const firstCell = container.querySelector<HTMLElement>(
      'tbody tr[data-table-row-index="0"] td:nth-child(2) > div',
    )!
    firstCell.click()
    firstCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(container.querySelector('tbody input[type="text"]')).not.toBeNull()
    ;[...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Next')!
      .click()

    const pageTwoQuery = [...mocks.queryObservers.keys()].find((sql) =>
      sql.includes('OFFSET 100'),
    )!
    mocks.queryObservers.get(pageTwoQuery)!([{ id: 101, title: 'Row 101' }], null)

    await vi.waitFor(() =>
      expect(container.querySelector('tbody tr[data-table-row-index="100"]')).not.toBeNull(),
    )
    expect(container.querySelector('tbody input')).toBeNull()
    expect(container.querySelector('tbody td[aria-selected="true"]')).toBeNull()

    container
      .querySelector<HTMLElement>('[data-testid="table-face"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(mocks.deleteRow).not.toHaveBeenCalled()
  })

  test('fails visibly for unsupported subjects without loading recipe state', () => {
    dispose = render(
      () => (
        <TableFace
          subject={{ mode: 'view', matrixId: 10, rowId: 20, sql: 'SELECT 1' }}
          recipe={recipe()}
          rootMatrixId={1}
          density="wide"
          fidelity="composed"
          services={{}}
        />
      ),
      container,
    )

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'require a container subject',
    )
    expect(mocks.getFaceConfigForMatrix).not.toHaveBeenCalled()
  })
})
