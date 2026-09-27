import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

const mocks = vi.hoisted(() => ({
  getColumns: vi.fn(),
  updateRow: vi.fn(),
  row: { title: 'Task', status: 'todo' } as Record<string, unknown> | null,
}))

vi.mock('../core/client/matrix-client', () => ({
  getColumns: mocks.getColumns,
  updateRow: mocks.updateRow,
}))

vi.mock('../sql/useRowData', () => ({
  useRowData: () => () => mocks.row,
}))

const { resolveFaceAffinity, SUBSTRATE_FACE_AFFINITY } = await import('../core/face-affinity')
const { clearFaceRenderings, FaceHostSlot, registerFaceRenderings, EMPTY_FACE_HOST_SERVICES } =
  await import('../core/face-runtime')
const { PropertyLine } = await import('../shared/PropertyLine')
const { default: TableLine } = await import('./TableLine')

const recipe = { faceTypeId: 'hila.table', slotBindings: {}, settings: {} }
const subject = { mode: 'loose' as const, matrixId: 10, rowId: 20 }

describe('table property-line interior', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.row = { title: 'Task', status: 'todo' }
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
        name: 'status',
        type: 'TEXT',
        displayType: 'text',
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
    clearFaceRenderings()
    container.remove()
  })

  test('renders through a host line slot with host-owned density', async () => {
    registerFaceRenderings(recipe.faceTypeId, { line: TableLine })
    dispose = render(
      () => (
        <FaceHostSlot
          host="aspect-row"
          kind="line"
          subject={subject}
          affinity={resolveFaceAffinity(recipe)}
          rootMatrixId={1}
          density="narrow"
          services={EMPTY_FACE_HOST_SERVICES}
          substrate={<div>fallback</div>}
        />
      ),
      container,
    )

    await vi.waitFor(() =>
      expect(container.querySelector('[data-field-control="status"]')).not.toBeNull(),
    )
    expect(
      container.querySelector('[data-testid="face-host-slot"]')?.getAttribute('data-density'),
    ).toBe('narrow')
    expect(
      container.querySelector('[data-testid="property-row"]')?.getAttribute('data-density'),
    ).toBe('narrow')
    expect(container.textContent).not.toContain('fallback')
  })

  test('uses the same data-owning property line as the substrate fallback', async () => {
    dispose = render(
      () => (
        <FaceHostSlot
          host="aspect-row"
          kind="line"
          subject={subject}
          affinity={SUBSTRATE_FACE_AFFINITY}
          rootMatrixId={1}
          services={EMPTY_FACE_HOST_SERVICES}
          substrate={<PropertyLine matrixId={10} rowId={20} density="wide" />}
        />
      ),
      container,
    )

    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="property-line"]')).not.toBeNull(),
    )
    expect(
      container
        .querySelector('[data-testid="face-host-slot"]')
        ?.getAttribute('data-face-source'),
    ).toBe('substrate')
    expect(mocks.getColumns).toHaveBeenCalledTimes(1)
  })

  test('keeps a dry source row read-only', async () => {
    mocks.row = null
    dispose = render(() => <PropertyLine matrixId={10} rowId={20} density="wide" />, container)

    await vi.waitFor(() => expect(mocks.getColumns).toHaveBeenCalled())
    expect(container.querySelector('input')).toBeNull()
    expect(
      container.querySelector('[data-testid="property-line"]')?.getAttribute('aria-busy'),
    ).toBe('true')
  })
})
