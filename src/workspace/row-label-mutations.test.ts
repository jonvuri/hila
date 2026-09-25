import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  refreshCachedTitles: vi.fn(),
  updateRow: vi.fn(),
  updateTagType: vi.fn(),
}))

vi.mock('../core/client/matrix-client', () => ({
  updateRow: mocks.updateRow,
  updateTagType: mocks.updateTagType,
}))

vi.mock('../editor/inlineref-sync', () => ({
  refreshCachedTitles: mocks.refreshCachedTitles,
}))

const { updateEditableRowLabel } = await import('./row-label-mutations')

const label = (text: string): Record<string, unknown> => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

describe('editable row label mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.refreshCachedTitles.mockImplementation((doc) => Promise.resolve(doc))
    mocks.updateRow.mockResolvedValue(undefined)
    mocks.updateTagType.mockResolvedValue(undefined)
  })

  test('renames a promoted type through the type-aware mutation', async () => {
    await updateEditableRowLabel(
      { matrixId: 7, rowId: 11, column: 'label', isTypeNode: true },
      label('Review'),
    )

    expect(mocks.updateTagType).toHaveBeenCalledWith(11, { name: 'Review' })
    expect(mocks.updateRow).not.toHaveBeenCalled()
  })

  test('keeps an ordinary role-adaptive label on the generic row mutation', async () => {
    const doc = label('Ordinary row')

    await updateEditableRowLabel(
      { matrixId: 7, rowId: 12, column: 'title', isTypeNode: false },
      doc,
    )

    expect(mocks.updateRow).toHaveBeenCalledWith(7, 12, { title: JSON.stringify(doc) })
    expect(mocks.updateTagType).not.toHaveBeenCalled()
  })
})
