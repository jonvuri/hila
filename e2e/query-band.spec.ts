import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Query bands — Phase 9.3 read slice
//
// Attach a live SQL view to a node, persisted, rendered read-only through the
// schema-adaptive renderer; editing the underlying data updates the band live.
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

const openFocusPanel = async (page: Page) => {
  const firstRow = page.locator('.outline-row').first()
  const focusBtn = firstRow.locator('.nav-row-open-focus')
  await firstRow.hover()
  await expect(async () => {
    const opacity = await focusBtn.evaluate((el) => window.getComputedStyle(el).opacity)
    expect(Number(opacity)).toBeGreaterThan(0)
  }).toPass({ timeout: 3000 })
  await focusBtn.click()
  await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
}

// Create a Tasks matrix with one row, returning the matrix id and row id.
const seedTasksMatrix = async (page: Page): Promise<{ tasksId: number; rowId: number }> =>
  page.evaluate(async () => {
    // @ts-expect-error -- resolved by Vite dev server at runtime
    const client = await import('/src/core/client/matrix-client.ts')
    const tasksId = (await client.createMatrix('Tasks')) as number
    const { rowId } = (await client.insertRow(tasksId, {
      values: { title: 'Task A' },
    })) as { rowId: number }
    return { tasksId, rowId }
  })

test.describe('Query bands (read slice)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test('attach a SQL band, see live read-only results, edit data → band updates', async ({
    page,
  }) => {
    const { tasksId, rowId } = await seedTasksMatrix(page)
    expect(tasksId).toBeGreaterThan(0)

    await openFocusPanel(page)

    // Author a raw-SQL band over the Tasks matrix via the dev-grade box.
    const sqlInput = page.getByTestId('query-band-sql-input')
    await expect(sqlInput).toBeVisible({ timeout: 5000 })
    await sqlInput.fill(`SELECT * FROM "mx_${tasksId}_data"`)
    await page.getByTestId('query-band-save').click()

    // The band renders, with a read-only row showing the seeded task.
    const band = page.getByTestId('query-band')
    await expect(band).toBeVisible({ timeout: 5000 })
    const bandRow = page.getByTestId('query-band-row').first()
    await expect(bandRow).toContainText('Task A', { timeout: 5000 })

    // The cells are genuinely read-only (display spans, not editable inputs).
    await expect(bandRow.locator('input')).toHaveCount(0)
    await expect(
      bandRow.getByTestId('property-row-readonly-cell').first(),
    ).toBeVisible()

    // Edit the underlying data — the band updates live (SQLite update hook →
    // subscription re-run), no manual refresh.
    await page.evaluate(
      async ([mid, rid]) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const client = await import('/src/core/client/matrix-client.ts')
        await client.updateRow(mid, rid, { title: 'Task A edited' })
      },
      [tasksId, rowId] as const,
    )

    await expect(page.getByTestId('query-band-row').first()).toContainText('Task A edited', {
      timeout: 5000,
    })
  })

  test('band persists across a page reload', async ({ page }) => {
    const { tasksId } = await seedTasksMatrix(page)

    await openFocusPanel(page)

    const sqlInput = page.getByTestId('query-band-sql-input')
    await sqlInput.fill(`SELECT * FROM "mx_${tasksId}_data"`)
    await page.getByTestId('query-band-save').click()
    await expect(page.getByTestId('query-band')).toBeVisible({ timeout: 5000 })

    // Reload the page — the band is persisted in the bands table (read back from
    // storage), not just live view state.
    await page.reload()
    await goToWorkspace(page)
    await waitForRows(page, 1)

    await openFocusPanel(page)
    await expect(page.getByTestId('query-band')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('query-band-row').first()).toContainText('Task A', {
      timeout: 5000,
    })
  })
})
