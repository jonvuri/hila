import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

const mocks = vi.hoisted(() => ({
  result: vi.fn<() => Record<string, unknown>[] | null>(),
  error: vi.fn<() => Error | null>(),
  getColumns: vi.fn(),
  updateRow: vi.fn(),
  updateViewBlock: vi.fn(),
}))

vi.mock('../sql/useQuery', () => ({
  useQuery: () => ({ result: mocks.result, error: mocks.error }),
}))

vi.mock('../core/client/matrix-client', () => ({
  createViewBlock: vi.fn(),
  deleteViewBlock: vi.fn(),
  getColumns: mocks.getColumns,
  updateRow: mocks.updateRow,
  updateViewBlock: mocks.updateViewBlock,
}))

vi.mock('../tags/tag-queries', () => ({
  buildTagTypesWithCountsQuery: () => '',
}))

const { ViewCollection } = await import('./QueryBand')

const block = {
  marker_matrix_id: 10,
  marker_row_id: 20,
  name: JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open work' }] }],
  }),
  sql: 'SELECT * FROM "mx_30_data"',
}

describe('ViewCollection', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.result.mockReturnValue([{ id: 7, title: 'Task A' }])
    mocks.error.mockReturnValue(null)
    mocks.getColumns.mockResolvedValue([
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
    ])
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    dispose?.()
    container.remove()
  })

  test('renders every result field at substrate fidelity without structural controls', () => {
    dispose = render(() => <ViewCollection block={block} focused />, container)

    const collection = container.querySelector<HTMLElement>('[data-testid="query-band"]')!
    expect(collection.dataset.fidelity).toBe('substrate')
    expect(collection.dataset.markerMatrixId).toBe('10')
    expect(collection.dataset.markerRowId).toBe('20')
    expect(container.querySelector('[data-result-column="id"]')).not.toBeNull()
    expect(container.querySelector('[data-result-column="title"]')).not.toBeNull()
    expect(container.textContent).toContain('Task A')
    expect(container.querySelector('[data-testid="view-place-sql"]')?.textContent).toBe(
      block.sql,
    )
    expect(container.querySelector('[data-testid="query-band-authoring"]')).toBeNull()
    expect(container.textContent).not.toContain('Add row')
  })

  test('keeps empty and invalid SQL as explicit collection states', () => {
    mocks.result.mockReturnValue([])
    dispose = render(() => <ViewCollection block={block} focused />, container)
    expect(container.querySelector('[data-testid="query-band-empty"]')?.textContent).toContain(
      'No results',
    )
    dispose()

    mocks.error.mockReturnValue(new Error('no such column: missing'))
    dispose = render(() => <ViewCollection block={block} focused />, container)
    expect(container.querySelector('[data-testid="query-band-error"]')?.textContent).toContain(
      'no such column',
    )
  })

  test('opens the same named marker identity from its inline presentation', () => {
    const onOpen = vi.fn()
    dispose = render(() => <ViewCollection block={block} onOpen={onOpen} />, container)
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="view-place-open"]',
    )!
    expect(button.textContent).toContain('Open work')
    button.click()
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
