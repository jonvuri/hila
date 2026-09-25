import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

const mocks = vi.hoisted(() => ({
  addPortal: vi.fn(),
  removePortal: vi.fn(),
  moveOwner: vi.fn(),
  deleteHomeGhostingPortals: vi.fn(),
  hardDeleteIncludingRefs: vi.fn(),
  deleteTagType: vi.fn(),
}))

vi.mock('../core/client/matrix-client', () => mocks)

const { RowGestureMenu } = await import('./row-gestures')

describe('RowGestureMenu', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    for (const fn of Object.values(mocks)) fn.mockResolvedValue(undefined)
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    dispose?.()
    container.remove()
    vi.unstubAllGlobals()
  })

  const openMenu = () => {
    container
      .querySelector<HTMLButtonElement>('[data-testid="substrate-gesture-toggle"]')!
      .click()
  }

  test('keeps ordinary rows on the portal-aware delete path', () => {
    dispose = render(() => <RowGestureMenu target={{ matrixId: 7, rowId: 11 }} />, container)

    openMenu()
    container
      .querySelector<HTMLButtonElement>('[data-testid="substrate-gesture-delete"]')!
      .click()

    expect(mocks.deleteHomeGhostingPortals).toHaveBeenCalledWith(7, 11)
    expect(mocks.deleteTagType).not.toHaveBeenCalled()
  })

  test('confirms and deletes a promoted type through deleteTagType', () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    dispose = render(
      () => <RowGestureMenu target={{ matrixId: 7, rowId: 11 }} isTypeNode />,
      container,
    )

    openMenu()

    expect(container.querySelector('[data-testid="substrate-gesture-delete"]')).toBeNull()
    expect(container.querySelector('[data-testid="substrate-gesture-hard-delete"]')).toBeNull()
    container
      .querySelector<HTMLButtonElement>('[data-testid="substrate-gesture-delete-type"]')!
      .click()

    expect(confirm).toHaveBeenCalledWith(
      'Delete this type? Its table and every row in it will be deleted.',
    )
    expect(mocks.deleteTagType).toHaveBeenCalledWith(11)
    expect(mocks.deleteHomeGhostingPortals).not.toHaveBeenCalled()
    expect(mocks.hardDeleteIncludingRefs).not.toHaveBeenCalled()
  })
})
