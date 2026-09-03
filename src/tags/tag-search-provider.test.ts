import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execQuery: vi.fn(),
  getColumns: vi.fn(),
}))

vi.mock('../core/client/sql-client', () => ({ execQuery: mocks.execQuery }))
vi.mock('../core/client/matrix-client', () => ({
  getAllTagTypes: vi.fn().mockResolvedValue([]),
  createTagType: vi.fn(),
  createDependentRow: vi.fn(),
  getColumns: mocks.getColumns,
}))

const { createTagSearchProvider } = await import('./tag-search-provider')

describe('place reference search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getColumns.mockResolvedValue([
      { name: 'label', role: 'label' },
      { name: 'content', role: 'content' },
    ])
  })

  test('discovers named view marker rows through the normal label-role field', async () => {
    mocks.execQuery.mockResolvedValue([
      {
        id: 42,
        stored_name: JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open work' }] }],
        }),
      },
    ])

    const results = await createTagSearchProvider(10)('@', 'Open')

    expect(mocks.execQuery).toHaveBeenCalledWith(expect.stringContaining('"label" LIKE'))
    expect(results).toEqual([{ id: 42, title: 'Open work' }])
  })

  test('returns no place results when a matrix has no naming field', async () => {
    mocks.getColumns.mockResolvedValue([{ name: 'body', role: 'content' }])
    await expect(createTagSearchProvider(10)('[[', 'x')).resolves.toEqual([])
    expect(mocks.execQuery).not.toHaveBeenCalled()
  })
})
