import { test, expect, type Page } from '@playwright/test'

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

/**
 * Waits for the seed "Welcome to Hila" row, then attaches a #task aspect with
 * status=todo and priority=high to it. Returns identifiers for DB assertions.
 */
const setupTaggedRow = async (page: Page) => {
  await expect(async () => {
    const count = await page
      .locator('.outline-row')
      .filter({ hasText: 'Welcome to Hila' })
      .count()
    expect(count).toBeGreaterThanOrEqual(1)
  }).toPass({ timeout: 10000 })

  return await page.evaluate(async () => {
    // @ts-expect-error -- resolved by Vite dev server at runtime
    const sql = await import('/src/core/client/sql-client.ts')
    // @ts-expect-error -- resolved by Vite dev server at runtime
    const client = await import('/src/core/client/matrix-client.ts')

    const matrices = await sql.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
    const wsId = (matrices[0] as { id: number }).id

    const tag = await client.createTagType('task', [
      { name: 'status', type: 'TEXT' },
      { name: 'priority', type: 'TEXT' },
    ])

    // Use the first non-type-node workspace row (the seed "Welcome to Hila" row).
    const rows = await sql.execQuery(`
      SELECT d.id FROM "mx_${wsId}_data" d
      WHERE NOT EXISTS (
        SELECT 1 FROM promoted_nodes p
        WHERE p.matrix_id = ${wsId} AND p.row_id = d.id
      )
      ORDER BY d.id
      LIMIT 1
    `)
    const hostRowId = (rows[0] as { id: number }).id

    const aspectRowId = await client.createDependentRow(wsId, hostRowId, tag.matrixId, {
      status: 'todo',
      priority: 'high',
    })

    return { wsId, hostRowId, tagMatrixId: tag.matrixId, aspectRowId }
  })
}

const openFocusOnWelcomeRow = async (page: Page) => {
  const row = page.locator('.outline-row').filter({ hasText: 'Welcome to Hila' }).first()
  const focusBtn = row.locator('.nav-row-open-focus')
  await row.hover()
  await expect(async () => {
    const opacity = await focusBtn.evaluate((el) => window.getComputedStyle(el).opacity)
    expect(Number(opacity)).toBeGreaterThan(0)
  }).toPass({ timeout: 3000 })
  await focusBtn.click()
  await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
}

test.describe('Property surface — aspect band (Phase 9.2)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
  })

  test('focus panel renders an editable aspect band for owned #task aspects', async ({
    page,
  }) => {
    const { tagMatrixId, aspectRowId } = await setupTaggedRow(page)
    await openFocusOnWelcomeRow(page)

    const band = page.getByTestId('focus-aspect-band')
    await expect(band).toBeVisible({ timeout: 8000 })

    // Type-badge bullet identifies the aspect's type.
    await expect(band.getByTestId('aspect-type-badge').first()).toHaveAttribute(
      'aria-label',
      '#task',
    )

    // Fields render as always-live seamless inputs, in column order (status, priority).
    const inputs = band.locator('input.tag-panel-field-input--seamless')
    await expect(inputs.nth(0)).toHaveValue('todo')
    await expect(inputs.nth(1)).toHaveValue('high')

    // Edit a field in place; it persists to the aspect row.
    await inputs.nth(0).fill('done')
    await inputs.nth(0).press('Enter')
    await expect(inputs.nth(0)).toHaveValue('done')

    await expect(async () => {
      const persisted = await page.evaluate(
        async ({ mid, rid }) => {
          // @ts-expect-error -- resolved by Vite dev server at runtime
          const sql = await import('/src/core/client/sql-client.ts')
          const r = await sql.execQuery(`SELECT status FROM "mx_${mid}_data" WHERE id = ${rid}`)
          return (r[0] as { status: string } | undefined)?.status
        },
        { mid: tagMatrixId, rid: aspectRowId },
      )
      expect(persisted).toBe('done')
    }).toPass({ timeout: 5000 })
  })
})
