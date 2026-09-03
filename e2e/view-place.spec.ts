import { expect, test, type Page } from '@playwright/test'

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
  const reset = page.getByTestId('reset-db-btn')
  await reset.click()
  await expect(reset).toContainText('Confirm', { timeout: 3000 })
  await reset.click()
  await expect(reset).toContainText('Reset DB', { timeout: 10000 })
  await page.getByTestId('workspace-tab').click()
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
}

const openFirstFocus = async (page: Page) => {
  const row = page.locator('.outline-row').first()
  await row.hover()
  await row.locator('.nav-row-open-focus').click()
  await expect(page.getByTestId('focus-panel')).toHaveCount(1, { timeout: 5000 })
}

const seedTasks = (page: Page): Promise<{ matrixId: number; rowId: number }> =>
  page.evaluate(async () => {
    // @ts-expect-error -- resolved by Vite in the browser.
    const client = await import('/src/core/client/matrix-client.ts')
    // @ts-expect-error -- resolved by Vite in the browser.
    const sql = await import('/src/core/client/sql-client.ts')
    const matrixId = (await client.createMatrix('Tasks')) as number
    await sql.execMutation(`INSERT INTO "mx_${matrixId}_data" (title) VALUES ('Task A')`)
    const rows = (await sql.execQuery(
      `SELECT id FROM "mx_${matrixId}_data" WHERE title = 'Task A'`,
    )) as { id: number }[]
    return { matrixId, rowId: rows[0]!.id }
  })

const workspaceRoot = (page: Page): Promise<{ matrixId: number; rowId: number }> =>
  page.evaluate(async () => {
    // @ts-expect-error -- resolved by Vite in the browser.
    const sql = await import('/src/core/client/sql-client.ts')
    const rows = (await sql.execQuery(
      'SELECT matrix_id, row_id FROM scroll_index ORDER BY global_lexkey LIMIT 1',
    )) as { matrix_id: number; row_id: number }[]
    return { matrixId: rows[0]!.matrix_id, rowId: rows[0]!.row_id }
  })

test.describe('named view places', () => {
  test.beforeEach(async ({ page }) => resetDB(page))

  test('creates, focuses, renames, navigates back, and deletes one marker identity', async ({
    page,
  }) => {
    const tasks = await seedTasks(page)
    await openFirstFocus(page)

    const parent = page.getByTestId('focus-panel').first()
    await parent.getByTestId('query-band-name-input').fill('Open work')
    await parent
      .getByTestId('query-band-sql-input')
      .fill(`SELECT * FROM "mx_${tasks.matrixId}_data"`)
    await parent.getByTestId('query-band-save').click()

    const inline = parent.getByTestId('query-band').first()
    await expect(inline.getByTestId('view-place-open')).toContainText('Open work', {
      timeout: 5000,
    })
    const markerMatrixId = Number(await inline.getAttribute('data-marker-matrix-id'))
    const markerRowId = Number(await inline.getAttribute('data-marker-row-id'))
    expect(markerMatrixId).toBeGreaterThan(0)
    expect(markerRowId).toBeGreaterThan(0)

    const foldedResult = page.locator('[data-block-row="true"]')
    await expect(foldedResult).toHaveCount(1, { timeout: 5000 })
    await expect(foldedResult.locator('.outline-row-handle')).toHaveCount(0)
    await expect(foldedResult.locator('.nav-row-gestures')).toHaveCount(0)

    await inline.getByTestId('view-place-open').click()
    await expect(page.getByTestId('focus-panel')).toHaveCount(2, { timeout: 5000 })
    const focused = page.getByTestId('focus-panel').last()
    const focusedCollection = focused.getByTestId('query-band')
    await expect(focused.getByTestId('view-place-collection')).toBeVisible()
    await expect(focusedCollection).toHaveAttribute('data-marker-row-id', String(markerRowId))
    await expect(focusedCollection.getByTestId('query-band-row').locator('input')).toHaveValue(
      'Task A',
    )

    const ownershipBefore = await page.evaluate(
      async ([matrixId, rowId]) => {
        // @ts-expect-error -- resolved by Vite in the browser.
        const sql = await import('/src/core/client/sql-client.ts')
        const rows = (await sql.execQuery(
          `SELECT COUNT(*) AS n FROM joins WHERE target_matrix_id = ${matrixId} AND target_row_id = ${rowId}`,
        )) as { n: number }[]
        return rows[0]!.n
      },
      [tasks.matrixId, tasks.rowId] as const,
    )
    expect(ownershipBefore).toBe(0)

    const title = focused.getByTestId('focus-label-editor')
    await title.click()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await page.keyboard.type('Current work')
    await expect(async () => {
      const stored = await page.evaluate(
        async ([matrixId, rowId]) => {
          // @ts-expect-error -- resolved by Vite in the browser.
          const sql = await import('/src/core/client/sql-client.ts')
          const rows = (await sql.execQuery(
            `SELECT label FROM "mx_${matrixId}_data" WHERE id = ${rowId}`,
          )) as { label: string }[]
          return rows[0]?.label
        },
        [markerMatrixId, markerRowId] as const,
      )
      expect(stored).toContain('Current work')
    }).toPass({ timeout: 5000 })

    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Control+ArrowLeft',
    )
    await expect(page.getByTestId('focus-panel')).toHaveCount(1)
    await inline.getByTestId('view-place-open').click()
    await expect(page.getByTestId('focus-panel')).toHaveCount(2)

    await page.getByTestId('focus-panel').last().getByTestId('query-band-delete').click()
    await expect(page.getByTestId('focus-panel')).toHaveCount(1, { timeout: 5000 })
    await expect(parent.getByTestId('query-band')).toHaveCount(0)

    const durable = await page.evaluate(
      async ([matrixId, rowId, taskMatrixId, taskRowId]) => {
        // @ts-expect-error -- resolved by Vite in the browser.
        const sql = await import('/src/core/client/sql-client.ts')
        const source = await sql.execQuery(
          `SELECT 1 FROM block_sources WHERE marker_matrix_id = ${matrixId} AND marker_row_id = ${rowId}`,
        )
        const marker = await sql.execQuery(
          `SELECT 1 FROM "mx_${matrixId}_data" WHERE id = ${rowId}`,
        )
        const ownership = (await sql.execQuery(
          `SELECT COUNT(*) AS n FROM joins WHERE target_matrix_id = ${taskMatrixId} AND target_row_id = ${taskRowId}`,
        )) as { n: number }[]
        return { source: source.length, marker: marker.length, ownership: ownership[0]!.n }
      },
      [markerMatrixId, markerRowId, tasks.matrixId, tasks.rowId] as const,
    )
    expect(durable).toEqual({ source: 0, marker: 0, ownership: 0 })
  })

  test('empty and invalid SQL remain named, focusable places', async ({ page }) => {
    const root = await workspaceRoot(page)
    await page.evaluate(
      async ([matrixId, rowId]) => {
        // @ts-expect-error -- resolved by Vite in the browser.
        const client = await import('/src/core/client/matrix-client.ts')
        await client.createViewBlock(matrixId, rowId, 'SELECT 1 WHERE 0', 'Nothing here')
        await client.createViewBlock(
          matrixId,
          rowId,
          'SELECT * FROM missing_view_source',
          'Broken view',
        )
      },
      [root.matrixId, root.rowId] as const,
    )
    await openFirstFocus(page)

    const parent = page.getByTestId('focus-panel').first()
    const openButtons = parent.getByTestId('view-place-open')
    await expect(openButtons).toHaveCount(2, { timeout: 5000 })

    await openButtons.filter({ hasText: 'Nothing here' }).click()
    await expect(
      page.getByTestId('focus-panel').last().getByTestId('query-band-empty'),
    ).toBeVisible()
    await expect(page.getByTestId('focus-panel')).toHaveCount(2)
    await page
      .getByTestId('focus-panel')
      .first()
      .getByRole('button', { name: 'Collapse to this panel' })
      .click()
    await expect(page.getByTestId('focus-panel')).toHaveCount(1)

    await parent.getByTestId('view-place-open').filter({ hasText: 'Broken view' }).click()
    await expect(
      page.getByTestId('focus-panel').last().getByTestId('query-band-error'),
    ).toContainText('Error preparing SQL', { timeout: 5000 })

    const folded = page.locator('[data-block-row="true"]')
    await expect(folded).toHaveCount(0)
  })
})
