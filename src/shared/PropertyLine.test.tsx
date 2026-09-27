import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { ColumnDefinition } from '../core/matrix'

import { PropertyLine } from './PropertyLine'

const mocks = vi.hoisted(() => ({
  getColumns: vi.fn(),
  updateRow: vi.fn(),
  useRowData: vi.fn(),
}))

vi.mock('../core/client/matrix-client', () => ({
  getColumns: mocks.getColumns,
  updateRow: mocks.updateRow,
}))

vi.mock('../sql/useRowData', () => ({
  useRowData: mocks.useRowData,
}))

const labelColumn: ColumnDefinition = {
  id: 1,
  name: 'label',
  type: 'TEXT',
  displayType: 'text',
  order: 0,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role: 'label',
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('PropertyLine', () => {
  let dispose: (() => void) | undefined

  beforeEach(() => {
    mocks.getColumns.mockReset()
    mocks.updateRow.mockReset()
    mocks.updateRow.mockResolvedValue(undefined)
    mocks.useRowData.mockReset()
  })

  afterEach(() => {
    dispose?.()
    dispose = undefined
    document.body.replaceChildren()
  })

  test('removes stale controls until the next subject schema and row hydrate', async () => {
    const columnRequests = new Map<number, ReturnType<typeof deferred<ColumnDefinition[]>>>()
    const rowRequests = new Map<
      string,
      (row: Record<string, unknown> | null) => Record<string, unknown> | null
    >()

    mocks.getColumns.mockImplementation((matrixId: number) => {
      const request = deferred<ColumnDefinition[]>()
      columnRequests.set(matrixId, request)
      return request.promise
    })
    mocks.useRowData.mockImplementation(
      (matrixId: () => number | null, rowId: () => number | null) => {
        const [row, setRow] = createSignal<Record<string, unknown> | null>(null)
        rowRequests.set(`${matrixId()}:${rowId()}`, setRow)
        return row
      },
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    const [subject, setSubject] = createSignal({ matrixId: 1, rowId: 11 })
    dispose = render(
      () => (
        <PropertyLine matrixId={subject().matrixId} rowId={subject().rowId} density="wide" />
      ),
      container,
    )

    rowRequests.get('1:11')?.({ id: 11, label: 'First subject' })
    columnRequests.get(1)?.resolve([labelColumn])
    await flush()

    const staleInput = container.querySelector<HTMLInputElement>('input')!
    expect(staleInput.value).toBe('First subject')

    setSubject({ matrixId: 2, rowId: 22 })

    expect(container.querySelector('input')).toBeNull()
    expect(
      container.querySelector('[data-testid="property-line"]')?.getAttribute('aria-busy'),
    ).toBe('true')

    staleInput.value = 'Stale edit'
    staleInput.dispatchEvent(new InputEvent('input', { bubbles: true }))
    staleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(mocks.updateRow).not.toHaveBeenCalledWith(2, 22, expect.anything())

    rowRequests.get('2:22')?.({ id: 22, label: 'Second subject' })
    await flush()
    expect(container.querySelector('input')).toBeNull()

    columnRequests.get(2)?.resolve([labelColumn])
    await flush()

    const currentInput = container.querySelector<HTMLInputElement>('input')!
    expect(currentInput.value).toBe('Second subject')
    currentInput.value = 'Current edit'
    currentInput.dispatchEvent(new InputEvent('input', { bubbles: true }))
    currentInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(mocks.updateRow).toHaveBeenCalledWith(2, 22, { label: 'Current edit' })
  })
})
