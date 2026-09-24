import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

const mocks = vi.hoisted(() => ({
  result: vi.fn<() => Record<string, unknown>[] | null>(),
  error: vi.fn<() => Error | null>(),
  getColumns: vi.fn(),
  updateRow: vi.fn(),
  updateViewBlock: vi.fn(),
  execQuery: vi.fn(),
  queryDiscoveryCatalog: vi.fn(),
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
  queryDiscoveryCatalog: mocks.queryDiscoveryCatalog,
}))

vi.mock('../core/client/sql-client', () => ({
  execQuery: mocks.execQuery,
}))

vi.mock('../tags/tag-queries', () => ({
  buildTagTypesWithCountsQuery: () => '',
}))

const { ViewCollection: ProductionViewCollection, registerViewCollectionRendering } =
  await import('./QueryBand')
const { FaceHostSlot } = await import('../core/face-runtime')

type ViewCollectionProps = Parameters<typeof ProductionViewCollection>[0]
const ViewCollection = (
  props: Omit<ViewCollectionProps, 'rootMatrixId'> & { rootMatrixId?: number },
) => <ProductionViewCollection {...props} rootMatrixId={props.rootMatrixId ?? 1} />

const block = {
  marker_matrix_id: 10,
  marker_row_id: 20,
  name: JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open work' }] }],
  }),
  sql: 'SELECT * FROM "mx_30_data"',
}

const membershipScopedSql = `SELECT d.*
FROM "mx_30_data" AS d
WHERE (EXISTS (
    SELECT 1
    FROM joins AS j
    WHERE j.target_matrix_id = 30
      AND j.target_row_id = d.id
      AND j.kind = 'own'
      AND (
        (j.source_matrix_id = 30 AND j.source_row_id = 9)
        OR EXISTS (
          SELECT 1
          FROM closure AS c
          WHERE c.ancestor_matrix_id = 30
            AND c.ancestor_row_id = 9
            AND c.descendant_matrix_id = j.source_matrix_id
            AND c.descendant_row_id = j.source_row_id
        )
      )
  ))
ORDER BY d.id ASC
LIMIT 1000`

describe('ViewCollection', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.result.mockReturnValue([{ id: 7, title: 'Task A' }])
    mocks.error.mockReturnValue(null)
    mocks.execQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        sql === 'SELECT id, title FROM matrix ORDER BY id' ? [{ id: 30, title: 'Tasks' }] : [],
      ),
    )
    mocks.updateViewBlock.mockResolvedValue(undefined)
    mocks.queryDiscoveryCatalog.mockResolvedValue([])
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
      {
        id: 2,
        name: 'due',
        type: 'TEXT',
        displayType: 'date',
        order: 1,
        options: null,
        formula: null,
        constraints: null,
        managedBy: null,
        role: null,
      },
    ])
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    dispose?.()
    container.remove()
  })

  test('renders every result field at substrate fidelity without structural controls', async () => {
    dispose = render(() => <ViewCollection block={block} focused />, container)
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="saved-view-sql-editor"]')).not.toBeNull(),
    )

    const collection = container.querySelector<HTMLElement>('[data-testid="query-band"]')!
    expect(collection.dataset.fidelity).toBe('substrate')
    expect(collection.dataset.markerMatrixId).toBe('10')
    expect(collection.dataset.markerRowId).toBe('20')
    expect(container.querySelector('[data-result-column="id"]')).not.toBeNull()
    expect(container.querySelector('[data-result-column="title"]')).not.toBeNull()
    expect(container.querySelector<HTMLInputElement>('.tag-panel-field-input')?.value).toBe(
      'Task A',
    )
    expect(container.querySelector('[data-testid="saved-view-sql-editor"]')).not.toBeNull()
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

  test('recognizes chips and preserves opaque SQL when a structured filter is removed', async () => {
    const dialectBlock = {
      ...block,
      sql: `SELECT d.*
FROM "mx_30_data" AS d
WHERE d."title" = 'Open' AND (json_valid(d."title") /*kept*/)
ORDER BY d.id ASC
LIMIT 1000`,
    }
    dispose = render(() => <ViewCollection block={dialectBlock} />, container)
    await vi.waitFor(() =>
      expect(
        container.querySelectorAll('[data-testid="saved-view-predicate-chip"]'),
      ).toHaveLength(1),
    )

    expect(
      container.querySelector('[data-testid="saved-view-opaque-chip"]')?.textContent,
    ).toContain('json_valid')

    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-predicate-chip"]')!
      .click()
    expect(mocks.updateViewBlock).not.toHaveBeenCalled()
    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-chip-remove"]')!
      .click()

    expect(mocks.updateViewBlock).toHaveBeenCalledOnce()
    const nextSql = mocks.updateViewBlock.mock.calls[0]![2] as string
    expect(nextSql).not.toContain(`d."title" = 'Open'`)
    expect(nextSql).toContain('json_valid(d."title") /*kept*/')
  })

  test('edits structured chips only after a complete gesture commit', async () => {
    const dialectBlock = {
      ...block,
      sql: `SELECT d.*
FROM "mx_30_data" AS d
WHERE d."title" = 'Open'
ORDER BY d.id ASC
LIMIT 1000`,
    }
    dispose = render(() => <ViewCollection block={dialectBlock} />, container)
    await vi.waitFor(() =>
      expect(
        container.querySelector('[data-testid="saved-view-predicate-chip"]'),
      ).not.toBeNull(),
    )

    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-predicate-chip"]')!
      .click()
    const value = container.querySelector<HTMLInputElement>(
      '[data-testid="saved-view-chip-input"]',
    )!
    expect(value.value).toBe('Open')
    value.value = 'Closed'
    value.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(mocks.updateViewBlock).not.toHaveBeenCalled()
    value.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(mocks.updateViewBlock).toHaveBeenCalledOnce()
    const nextSql = mocks.updateViewBlock.mock.calls[0]![2] as string
    expect(nextSql).toContain(`d."title" = 'Closed'`)
  })

  test('reopens a frozen closed date range as one on gesture', async () => {
    const dialectBlock = {
      ...block,
      sql: `SELECT d.*
FROM "mx_30_data" AS d
WHERE d."due" >= '2026-09-21'
  AND d."due" <= '2026-09-27'
ORDER BY d.id ASC
LIMIT 1000`,
    }
    dispose = render(() => <ViewCollection block={dialectBlock} />, container)
    await vi.waitFor(() =>
      expect(
        container.querySelectorAll('[data-testid="saved-view-predicate-chip"]'),
      ).toHaveLength(1),
    )

    const chip = container.querySelector<HTMLButtonElement>(
      '[data-testid="saved-view-predicate-chip"]',
    )!
    expect(chip.textContent).toContain('due = 2026-09-21..2026-09-27')
    chip.click()
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="saved-view-chip-input"]')?.value,
    ).toBe('2026-09-21..2026-09-27')
  })

  test('atomically edits both boundaries of a frozen closed date range', async () => {
    const dialectBlock = {
      ...block,
      sql: `SELECT d.*
FROM "mx_30_data" AS d
WHERE (json_valid(d."title") /*before*/)
  AND d."due" >= '2026-09-21'
  AND d."due" <= '2026-09-27'
  AND (length(d."title") > 0 /*after*/)
ORDER BY d.id ASC
LIMIT 1000`,
    }
    dispose = render(() => <ViewCollection block={dialectBlock} />, container)
    await vi.waitFor(() =>
      expect(
        container.querySelectorAll('[data-testid="saved-view-predicate-chip"]'),
      ).toHaveLength(1),
    )

    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-predicate-chip"]')!
      .click()
    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="saved-view-chip-input"]',
    )!
    input.value = '2026-10-01..2026-10-04'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(mocks.updateViewBlock).toHaveBeenCalledOnce()
    const nextSql = mocks.updateViewBlock.mock.calls[0]![2] as string
    expect(nextSql).not.toContain('2026-09-21')
    expect(nextSql).not.toContain('2026-09-27')
    expect(nextSql).toContain(`d."due" >= '2026-10-01'`)
    expect(nextSql).toContain(`d."due" <= '2026-10-04'`)
    expect(nextSql.indexOf('/*before*/')).toBeLessThan(nextSql.indexOf('2026-10-01'))
    expect(nextSql.indexOf('2026-10-04')).toBeLessThan(nextSql.indexOf('/*after*/'))
  })

  test('removes both boundaries of a frozen closed date range', async () => {
    const dialectBlock = {
      ...block,
      sql: `SELECT d.*
FROM "mx_30_data" AS d
WHERE d."due" >= '2026-09-21'
  AND d."due" <= '2026-09-27'
ORDER BY d.id ASC
LIMIT 1000`,
    }
    dispose = render(() => <ViewCollection block={dialectBlock} />, container)
    await vi.waitFor(() =>
      expect(
        container.querySelectorAll('[data-testid="saved-view-predicate-chip"]'),
      ).toHaveLength(1),
    )

    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-predicate-chip"]')!
      .click()
    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-chip-remove"]')!
      .click()

    expect(mocks.updateViewBlock).toHaveBeenCalledOnce()
    const nextSql = mocks.updateViewBlock.mock.calls[0]![2] as string
    expect(nextSql).not.toContain('d."due"')
    expect(nextSql).not.toContain('WHERE')
  })

  test('serializes rapid structured edits and composes them from optimistic SQL', async () => {
    const writes: {
      resolve: () => void
      reject: (error: Error) => void
    }[] = []
    mocks.updateViewBlock.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          writes.push({ resolve: () => resolve(), reject })
        }),
    )
    const dialectBlock = {
      ...block,
      sql: `SELECT d.*
FROM "mx_30_data" AS d
WHERE d."title" = 'Open'
ORDER BY d.id ASC
LIMIT 1000`,
    }
    dispose = render(() => <ViewCollection block={dialectBlock} />, container)
    await vi.waitFor(() =>
      expect(
        container.querySelector('[data-testid="saved-view-predicate-chip"]'),
      ).not.toBeNull(),
    )

    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-predicate-chip"]')!
      .click()
    let input = container.querySelector<HTMLInputElement>(
      '[data-testid="saved-view-chip-input"]',
    )!
    input.value = 'Closed'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    await vi.waitFor(() => expect(writes).toHaveLength(1))
    container.querySelector<HTMLButtonElement>('[data-testid="saved-view-limit-chip"]')!.click()
    input = container.querySelector<HTMLInputElement>('[data-testid="saved-view-chip-input"]')!
    input.value = '25'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(mocks.updateViewBlock).toHaveBeenCalledOnce()
    writes[0]!.resolve()
    await vi.waitFor(() => expect(mocks.updateViewBlock).toHaveBeenCalledTimes(2))
    const nextSql = mocks.updateViewBlock.mock.calls[1]![2] as string
    expect(nextSql).toContain(`d."title" = 'Closed'`)
    expect(nextSql).toContain('LIMIT 25')
    writes[1]!.resolve()
  })

  test('surfaces a rejected structured write and restores the confirmed SQL', async () => {
    let rejectWrite: ((error: Error) => void) | undefined
    mocks.updateViewBlock.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectWrite = reject
        }),
    )
    const dialectBlock = {
      ...block,
      sql: `SELECT d.*
FROM "mx_30_data" AS d
WHERE d."title" = 'Open'
ORDER BY d.id ASC
LIMIT 1000`,
    }
    dispose = render(() => <ViewCollection block={dialectBlock} />, container)
    await vi.waitFor(() =>
      expect(
        container.querySelector('[data-testid="saved-view-predicate-chip"]'),
      ).not.toBeNull(),
    )

    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-predicate-chip"]')!
      .click()
    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="saved-view-chip-input"]',
    )!
    input.value = 'Closed'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(rejectWrite).toBeTypeOf('function'))
    rejectWrite!(new Error('write refused'))

    await vi.waitFor(() =>
      expect(
        container.querySelector('[data-testid="saved-view-structured-error"]')?.textContent,
      ).toContain('write refused'),
    )
    expect(
      container.querySelector('[data-testid="saved-view-predicate-chip"]')?.textContent,
    ).toContain('Open')
    expect(mocks.updateViewBlock).toHaveBeenCalledOnce()
  })

  test('authors text, order, and limit through the shared chip grammar', async () => {
    const dialectBlock = {
      ...block,
      sql: `SELECT d.*
FROM "mx_30_data" AS d
ORDER BY d.id ASC
LIMIT 1000`,
    }
    dispose = render(() => <ViewCollection block={dialectBlock} />, container)
    await vi.waitFor(() =>
      expect(
        container.querySelector('[data-testid="saved-view-add-text-chip"]'),
      ).not.toBeNull(),
    )

    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-add-text-chip"]')!
      .click()
    let input = container.querySelector<HTMLInputElement>(
      '[data-testid="saved-view-chip-input"]',
    )!
    input.value = 'urgent'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(mocks.updateViewBlock).toHaveBeenCalledTimes(1))
    expect(mocks.updateViewBlock.mock.calls[0]?.[2]).toContain("LIKE '%urgent%'")

    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-add-order-chip"]')!
      .click()
    container.querySelector<HTMLButtonElement>('[role="option"]')!.click()
    const descending = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ].find((button) => button.textContent?.includes('descending'))!
    descending.click()
    await vi.waitFor(() => expect(mocks.updateViewBlock).toHaveBeenCalledTimes(2))
    expect(mocks.updateViewBlock.mock.calls[1]?.[2]).toContain('ORDER BY d."title" DESC')

    container.querySelector<HTMLButtonElement>('[data-testid="saved-view-limit-chip"]')!.click()
    input = container.querySelector<HTMLInputElement>('[data-testid="saved-view-chip-input"]')!
    input.value = '25'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(mocks.updateViewBlock).toHaveBeenCalledTimes(3))
    expect(mocks.updateViewBlock.mock.calls[2]?.[2]).toContain('LIMIT 25')
  })

  test('adds a predicate through column, operator, and value stages', async () => {
    const dialectBlock = {
      ...block,
      sql: `SELECT d.*
FROM "mx_30_data" AS d
ORDER BY d.id ASC
LIMIT 1000`,
    }
    dispose = render(() => <ViewCollection block={dialectBlock} />, container)
    await vi.waitFor(() =>
      expect(
        container.querySelector('[data-testid="saved-view-add-predicate-chip"]'),
      ).not.toBeNull(),
    )

    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-add-predicate-chip"]')!
      .click()
    container.querySelector<HTMLButtonElement>('[role="option"]')!.click()
    const equals = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (button) => button.textContent?.includes('equals'),
    )!
    equals.click()
    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="saved-view-chip-input"]',
    )!
    input.value = 'Open'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(mocks.updateViewBlock).not.toHaveBeenCalled()
    container.querySelector<HTMLButtonElement>('[data-testid="saved-view-chip-apply"]')!.click()

    expect(mocks.updateViewBlock.mock.calls[0]?.[2]).toContain(`d."title" = 'Open'`)
  })

  test('changes kind while retaining opaque leaves and clearing incompatible owned clauses', async () => {
    mocks.execQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        sql === 'SELECT id, title FROM matrix ORDER BY id' ?
          [
            { id: 30, title: 'Tasks' },
            { id: 31, title: 'Archive' },
          ]
        : [],
      ),
    )
    const dialectBlock = {
      ...block,
      sql: `SELECT d.*
FROM "mx_30_data" AS d
WHERE d."title" = 'Open' AND (json_valid(d."title") /*kept*/)
ORDER BY d."title" DESC, d.id ASC
LIMIT 1000`,
    }
    dispose = render(() => <ViewCollection block={dialectBlock} />, container)
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="saved-view-kind-chip"]')).not.toBeNull(),
    )

    container.querySelector<HTMLButtonElement>('[data-testid="saved-view-kind-chip"]')!.click()
    const archive = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="saved-view-kind-option"]',
      ),
    ].find((button) => button.textContent?.includes('Archive'))!
    archive.click()

    const nextSql = mocks.updateViewBlock.mock.calls[0]?.[2] as string
    expect(nextSql).toContain('FROM "mx_31_data" AS d')
    expect(nextSql).toContain('json_valid(d."title") /*kept*/')
    expect(nextSql).not.toContain(`d."title" = 'Open'`)
    expect(nextSql).toContain('ORDER BY d.id ASC')
  })

  test('adds a named scope discovered from the current workspace', async () => {
    mocks.result.mockReturnValue([])
    mocks.queryDiscoveryCatalog.mockResolvedValue([
      {
        id: 'row:30:9',
        family: 'row',
        target: { type: 'node', node: { matrixId: 30, rowId: 9 } },
        label: 'Planning',
        content: '',
        breadcrumb: [],
        navigation: {
          type: 'membership',
          node: { matrixId: 30, rowId: 9 },
          matrixId: 30,
          containers: [],
          alternativeAppearances: [],
          liveAppearanceCount: 0,
        },
        ownedMatrixIds: [],
        structuralDepth: 1,
        structuralOrder: 'a',
        matchTarget: 'label',
        matchQuality: 'browse',
        score: 0,
      },
    ])
    const dialectBlock = {
      ...block,
      sql: `SELECT d.*
FROM "mx_30_data" AS d
ORDER BY d.id ASC
LIMIT 1000`,
    }
    dispose = render(() => <ViewCollection block={dialectBlock} rootMatrixId={1} />, container)
    await vi.waitFor(() =>
      expect(
        container.querySelector('[data-testid="saved-view-add-scope-chip"]'),
      ).not.toBeNull(),
    )

    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-add-scope-chip"]')!
      .click()
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="saved-view-scope-option"]')).not.toBeNull(),
    )
    expect(mocks.queryDiscoveryCatalog).toHaveBeenLastCalledWith({
      rootMatrixId: 1,
      query: '',
      filter: 'named',
      limit: 50,
    })
    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-scope-option"]')!
      .click()

    const nextSql = mocks.updateViewBlock.mock.calls[0]?.[2] as string
    expect(nextSql).toContain('c.ancestor_row_id = 9')
  })

  test('uses the workspace root when a nested view renders through a focused face', async () => {
    mocks.result.mockReturnValue([])
    const sql = `SELECT d.*
FROM "mx_30_data" AS d
ORDER BY d.id ASC
LIMIT 1000`
    registerViewCollectionRendering('test.saved-view')

    dispose = render(
      () => (
        <FaceHostSlot
          host="focus-panel"
          kind="collection"
          subject={{ mode: 'view', matrixId: 10, rowId: 20, sql }}
          recipe={{ faceTypeId: 'test.saved-view', slotBindings: {}, settings: {} }}
          rootMatrixId={1}
          fidelity="substrate"
        />
      ),
      container,
    )
    await vi.waitFor(() =>
      expect(
        container.querySelector('[data-testid="saved-view-add-scope-chip"]'),
      ).not.toBeNull(),
    )

    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-add-scope-chip"]')!
      .click()

    await vi.waitFor(() =>
      expect(mocks.queryDiscoveryCatalog).toHaveBeenLastCalledWith({
        rootMatrixId: 1,
        query: '',
        filter: 'named',
        limit: 50,
      }),
    )
  })

  test('recovers a saved scope with one exact row-existence check', async () => {
    mocks.result.mockReturnValue([])
    mocks.queryDiscoveryCatalog.mockResolvedValue([])
    mocks.execQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        sql === 'SELECT id, title FROM matrix ORDER BY id' ? [{ id: 30, title: 'Tasks' }]
        : sql === 'SELECT 1 AS found FROM "mx_30_data" WHERE id = 9 LIMIT 1' ? [{ found: 1 }]
        : [],
      ),
    )
    const scopedBlock = {
      ...block,
      sql: membershipScopedSql,
    }

    dispose = render(() => <ViewCollection block={scopedBlock} />, container)

    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="saved-view-scope-chip"]')).not.toBeNull(),
    )
    expect(container.querySelector('[data-testid="saved-view-custom-chip"]')).toBeNull()
    expect(
      container.querySelector('[data-testid="saved-view-scope-chip"]')?.textContent,
    ).toContain('30:9')
    expect(mocks.queryDiscoveryCatalog).not.toHaveBeenCalled()
    expect(mocks.execQuery).toHaveBeenCalledWith(
      'SELECT 1 AS found FROM "mx_30_data" WHERE id = 9 LIMIT 1',
    )
  })

  test('keeps a deleted saved scope in custom SQL mode', async () => {
    mocks.result.mockReturnValue([])
    mocks.queryDiscoveryCatalog.mockResolvedValue([])
    dispose = render(
      () => <ViewCollection block={{ ...block, sql: membershipScopedSql }} />,
      container,
    )

    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="saved-view-custom-chip"]')).not.toBeNull(),
    )
    expect(container.querySelector('[data-testid="saved-view-scope-chip"]')).toBeNull()
    expect(mocks.queryDiscoveryCatalog).not.toHaveBeenCalled()
    expect(mocks.execQuery).toHaveBeenCalledWith(
      'SELECT 1 AS found FROM "mx_30_data" WHERE id = 9 LIMIT 1',
    )
  })

  test('validates raw SQL live and applies only a preparable read-only query', async () => {
    const customBlock = { ...block, sql: 'SELECT 1 AS answer' }
    dispose = render(() => <ViewCollection block={customBlock} />, container)
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="saved-view-sql-editor"]')).not.toBeNull(),
    )
    expect(container.querySelector('[data-testid="saved-view-custom-chip"]')).not.toBeNull()

    const editor = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="saved-view-sql-editor"]',
    )!
    const apply = container.querySelector<HTMLButtonElement>(
      '[data-testid="saved-view-sql-apply"]',
    )!
    editor.value = 'DELETE FROM matrix'
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(apply.disabled).toBe(true)
    expect(
      container.querySelector('[data-testid="saved-view-sql-invalid"]')?.textContent,
    ).toContain('read-only SELECT')

    editor.value = 'SELECT 2 AS answer'
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(apply.disabled).toBe(false)
    apply.click()
    expect(mocks.updateViewBlock).toHaveBeenCalledWith(10, 20, 'SELECT 2 AS answer')
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="saved-view-sql-editor"]')).toBeNull(),
    )
    container
      .querySelector<HTMLButtonElement>('[data-testid="saved-view-sql-disclosure"]')!
      .click()
    expect(
      container.querySelector<HTMLTextAreaElement>('[data-testid="saved-view-sql-editor"]')
        ?.value,
    ).toBe('SELECT 2 AS answer')
  })

  test('recognizes the raw SQL draft before Apply without persisting it', async () => {
    const customBlock = { ...block, sql: 'SELECT 1 AS answer' }
    dispose = render(() => <ViewCollection block={customBlock} />, container)
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="saved-view-sql-editor"]')).not.toBeNull(),
    )

    const editor = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="saved-view-sql-editor"]',
    )!
    editor.value = `SELECT d.*
FROM "mx_30_data" AS d
WHERE d."title" = 'Open'
ORDER BY d.id ASC
LIMIT 1000`
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))

    expect(container.querySelector('[data-testid="saved-view-custom-chip"]')).toBeNull()
    expect(container.querySelector('[data-testid="saved-view-predicate-chip"]')).not.toBeNull()
    expect(
      container.querySelector<HTMLButtonElement>('[data-testid="saved-view-predicate-chip"]')!
        .disabled,
    ).toBe(true)
    expect(mocks.updateViewBlock).not.toHaveBeenCalled()
  })

  test('cancel leaves existing invalid stored SQL untouched', async () => {
    const invalidBlock = { ...block, sql: 'SELECT FROM' }
    dispose = render(() => <ViewCollection block={invalidBlock} />, container)
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="saved-view-sql-cancel"]')).not.toBeNull(),
    )

    container.querySelector<HTMLButtonElement>('[data-testid="saved-view-sql-cancel"]')!.click()
    expect(mocks.updateViewBlock).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="saved-view-sql-editor"]')).toBeNull()
    expect(container.querySelector('[data-testid="saved-view-sql-disclosure"]')).not.toBeNull()
  })
})
