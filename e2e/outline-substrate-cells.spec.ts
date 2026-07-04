import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Outline substrate merge — Phase 9.7 Stage C2 (meshed cross-matrix cells).
//
// C2's first increment routes every loose outline row through the substrate
// renderer: a meshed cross-matrix row's own non-label fields render as
// always-live inline `FieldEditor`s (OutlineCellStrip, NavigationPanel.tsx),
// and a contiguous same-schema run hoists its column names to one shared
// `CoalescedHeader` (grid coalescing, §3) — directly in the main/nested
// outline, not just the focus-panel SubstrateRegion.
//
// This is distinct from Stage C2's *other* increment (inline block folding,
// covered by inline-block-fold.spec.ts): here the aspect rows are ordinary
// meshed own-children (real scroll_index positions), not gathered content.
// ---------------------------------------------------------------------------

const openSidebar = async (page: Page) => {
  const sidebar = page.locator('.app-sidebar')
  if (!(await sidebar.isVisible())) {
    await page.getByRole('button', { name: 'Toggle dev tools' }).click()
    await expect(sidebar).toBeVisible({ timeout: 3000 })
  }
}

const resetDB = async (page: Page) => {
  await page.goto('/')
  await openSidebar(page)
  const resetBtn = page.getByTestId('reset-db-btn')
  await resetBtn.click()
  await expect(resetBtn).toContainText('Confirm', { timeout: 3000 })
  await resetBtn.click()
  await expect(resetBtn).toContainText('Reset DB', { timeout: 10000 })
}

const goToWorkspace = async (page: Page) => {
  await page.getByTestId('workspace-tab').click()
}

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  await expect(async () => {
    const count = await page.locator('.outline-row').count()
    expect(count).toBeGreaterThanOrEqual(minCount)
  }).toPass({ timeout: 5000 })
}

/** Two `#task`-shaped aspects, back to back, owned by a plain host row. */
const seedTaskAspects = (page: Page): Promise<{ hostRowId: number; taskMatrixId: number }> =>
  page.evaluate(async () => {
    // @ts-expect-error -- resolved by Vite dev server at runtime
    const sql = await import('/src/core/client/sql-client.ts')
    // @ts-expect-error -- resolved by Vite dev server at runtime
    const client = await import('/src/core/client/matrix-client.ts')
    const wsRows = (await sql.execQuery(
      'SELECT matrix_id, row_id FROM scroll_index ORDER BY global_lexkey LIMIT 1',
    )) as { matrix_id: number; row_id: number }[]
    const wsId = wsRows[0]!.matrix_id

    // A tag type's matrix (like `ensureTagType` in the demo subtree) needs an
    // explicit `label` column alongside its fields, so `createDependentRow` can
    // set one.
    const taskType = (await client.createTagType('task-e2e', [
      { name: 'label', type: 'TEXT' },
      { name: 'status', type: 'TEXT' },
      { name: 'due', type: 'TEXT' },
    ])) as { matrixId: number }
    const taskMatrixId = taskType.matrixId

    const host = await client.insertRow(wsId, {
      values: { label: JSON.stringify({ type: 'doc', content: [] }) },
    })
    await client.createDependentRow(wsId, host.rowId, taskMatrixId, {
      label: JSON.stringify({ type: 'doc', content: [] }),
      status: 'in-progress',
      due: '2026-08-01',
    })
    await client.createDependentRow(wsId, host.rowId, taskMatrixId, {
      label: JSON.stringify({ type: 'doc', content: [] }),
      status: 'todo',
      due: '2026-08-05',
    })
    return { hostRowId: host.rowId, taskMatrixId }
  })

test.describe('Outline substrate merge (meshed cross-matrix inline cells)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test('a meshed #task row renders its fields as editable inline cells in the main outline', async ({
    page,
  }) => {
    await seedTaskAspects(page)

    const strips = page.getByTestId('outline-cell-strip')
    await expect(async () => {
      expect(await strips.count()).toBe(2)
    }).toPass({ timeout: 5000 })

    const values = await strips
      .locator('input')
      .evaluateAll((els) => (els as HTMLInputElement[]).map((e) => e.value).sort())
    expect(values).toEqual(['2026-08-01', '2026-08-05', 'in-progress', 'todo'])
  })

  test('a contiguous same-schema run hoists one coalesced grid header', async ({ page }) => {
    await seedTaskAspects(page)

    await expect(page.getByTestId('outline-cell-strip')).toHaveCount(2, { timeout: 5000 })

    // Exactly one shared header for the two-row run (not one per row).
    const headers = page.getByTestId('substrate-grid-header')
    await expect(headers).toHaveCount(1, { timeout: 5000 })
    const headerText = await headers.first().textContent()
    expect(headerText).toContain('status')
    expect(headerText).toContain('due')
  })

  test('editing an inline outline cell persists through updateRow', async ({ page }) => {
    const { taskMatrixId } = await seedTaskAspects(page)

    const strips = page.getByTestId('outline-cell-strip')
    await expect(strips).toHaveCount(2, { timeout: 5000 })

    // The second aspect's fields render in its own cell strip (status, then
    // due) — its status field was seeded to "todo".
    const todoInput = strips.nth(1).locator('input').first()
    await expect(todoInput).toHaveValue('todo', { timeout: 5000 })
    await todoInput.fill('done')
    await todoInput.blur()

    await expect(async () => {
      const rows = await page.evaluate(async (mid: number) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        return (await sql.execQuery(
          `SELECT status FROM "mx_${mid}_data" WHERE status = 'done'`,
        )) as { status: string }[]
      }, taskMatrixId)
      expect(rows.length).toBe(1)
    }).toPass({ timeout: 5000 })
  })
})
