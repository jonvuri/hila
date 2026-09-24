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
    const roots = (await sql.execQuery(
      'SELECT matrix_id, row_id FROM scroll_index ORDER BY global_lexkey LIMIT 1',
    )) as { matrix_id: number; row_id: number }[]
    const owner = roots[0]!
    const matrixId = (await client.createOwnedMatrix(
      { matrixId: owner.matrix_id, rowId: owner.row_id },
      'Tasks',
      [{ name: 'title', type: 'TEXT', role: 'label' }],
    )) as number
    const rowId = (await client.createDependentRow(owner.matrix_id, owner.row_id, matrixId, {
      title: 'Task A',
    })) as number
    return { matrixId, rowId }
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
    const title = parent.getByTestId('focus-label-editor').locator('.ProseMirror')
    await title.click()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
    const launcher = page.getByTestId('quick-launcher')
    const launcherInput = launcher.locator('#quick-launcher-input')
    await launcherInput.fill('Tasks')
    await expect(launcher.getByRole('option', { name: /Tasks/ }).first()).toBeVisible({
      timeout: 10_000,
    })
    await launcherInput.press('Tab')
    await expect(launcher.locator('[data-chip-type="kind"]')).toContainText('Tasks')
    await expect(launcher.getByRole('button', { name: 'Save view' })).toBeEnabled()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S')
    await expect(launcher).toHaveCount(0)
    await expect(page.getByTestId('focus-panel')).toHaveCount(1, { timeout: 5_000 })

    const focused = page.getByTestId('focus-panel').last()
    const generatedTitle = focused.getByTestId('focus-label-editor').locator('.ProseMirror')
    await expect(generatedTitle).toBeFocused()
    await expect(generatedTitle).toHaveText('Tasks')
    const selectedName = await generatedTitle.evaluate(() => window.getSelection()?.toString())
    expect(selectedName).toBe('Tasks')

    await page.keyboard.type('Open work')
    await expect(generatedTitle).toHaveText('Open work')
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Control+ArrowLeft',
    )
    await expect(page.getByTestId('focus-panel')).toHaveCount(0)
    await openFirstFocus(page)

    const inline = parent.getByTestId('query-band').first()
    await expect(inline.getByTestId('view-place-open')).toContainText('Open work', {
      timeout: 5000,
    })
    const markerMatrixId = Number(await inline.getAttribute('data-marker-matrix-id'))
    const markerRowId = Number(await inline.getAttribute('data-marker-row-id'))
    expect(markerMatrixId).toBeGreaterThan(0)
    expect(markerRowId).toBeGreaterThan(0)
    const storedView = await page.evaluate(
      async ([matrixId, rowId]) => {
        // @ts-expect-error -- resolved by Vite in the browser.
        const sql = await import('/src/core/client/sql-client.ts')
        return sql.execQuery(
          `SELECT sql FROM block_sources
           WHERE marker_matrix_id = ${matrixId} AND marker_row_id = ${rowId}`,
        )
      },
      [markerMatrixId, markerRowId] as const,
    )
    expect(storedView).toHaveLength(1)
    expect((storedView[0] as { sql: string }).sql).toContain(
      `FROM "mx_${tasks.matrixId}_data" AS d`,
    )
    expect((storedView[0] as { sql: string }).sql).toContain('ORDER BY d.id ASC')
    expect((storedView[0] as { sql: string }).sql).toContain('LIMIT 1000')

    const foldedResult = page.locator('[data-block-row="true"]')
    await expect(foldedResult.first()).toBeVisible({ timeout: 5000 })
    await expect(foldedResult.locator('.outline-row-handle')).toHaveCount(0)
    await expect(foldedResult.locator('.nav-row-gestures')).toHaveCount(0)

    await inline.getByTestId('view-place-open').click()
    await expect(page.getByTestId('focus-panel')).toHaveCount(2, { timeout: 5000 })
    const focusedCollection = focused.getByTestId('query-band')
    await expect(focused.getByTestId('view-place-collection')).toBeVisible()
    await expect(focused.getByTestId('view-collection-host-chrome')).toBeVisible()
    const hostSlot = focused.getByTestId('face-host-slot')
    await expect(hostSlot).toHaveAttribute('data-host', 'focus-panel')
    await expect(hostSlot).toHaveAttribute('data-face-rendering', 'collection')
    await expect(hostSlot).toHaveAttribute('data-fidelity', 'substrate')
    await expect(hostSlot).toHaveAttribute('data-subject-mode', 'view')
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
    expect(ownershipBefore).toBeGreaterThan(0)

    const renamedTitle = focused.getByTestId('focus-label-editor')
    await renamedTitle.click()
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

    await page.reload()
    await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('workspace-tab').focus()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
    const reopenLauncher = page.getByTestId('quick-launcher')
    const reopenInput = reopenLauncher.locator('#quick-launcher-input')
    await reopenInput.fill('Current work')
    await expect(
      reopenLauncher.getByRole('option', { name: /Current work/ }).first(),
    ).toBeVisible({
      timeout: 10_000,
    })
    await reopenInput.press('Enter')
    await expect(reopenLauncher).toHaveCount(0)
    const reopened = page.getByTestId('focus-panel').last()
    await expect(reopened.getByTestId('saved-view-chips')).toBeVisible({ timeout: 10_000 })
    await expect(reopened.getByTestId('query-band-row').locator('input')).toHaveValue('Task A')

    await reopened.getByTestId('saved-view-add-predicate-chip').click()
    const chipEditor = reopened.getByTestId('saved-view-chip-editor')
    await chipEditor.getByRole('option', { name: 'title' }).click()
    await chipEditor.getByRole('option', { name: /equals/ }).click()
    await chipEditor.getByTestId('saved-view-chip-input').fill('Task A')
    await chipEditor.getByTestId('saved-view-chip-apply').click()
    await expect(reopened.getByTestId('saved-view-predicate-chip')).toContainText(
      'title = Task A',
    )
    await expect(async () => {
      const storedSql = await page.evaluate(
        async ([matrixId, rowId]) => {
          // @ts-expect-error -- resolved by Vite in the browser.
          const sql = await import('/src/core/client/sql-client.ts')
          const rows = (await sql.execQuery(
            `SELECT sql FROM block_sources
             WHERE marker_matrix_id = ${matrixId} AND marker_row_id = ${rowId}`,
          )) as { sql: string }[]
          return rows[0]?.sql
        },
        [markerMatrixId, markerRowId] as const,
      )
      expect(storedSql).toContain(`d."title" = 'Task A'`)
    }).toPass({ timeout: 5_000 })

    await page.reload()
    await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('workspace-tab').focus()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
    const editedLauncher = page.getByTestId('quick-launcher')
    const editedInput = editedLauncher.locator('#quick-launcher-input')
    await editedInput.fill('Current work')
    await expect(
      editedLauncher.getByRole('option', { name: /Current work/ }).first(),
    ).toBeVisible({
      timeout: 10_000,
    })
    await editedInput.press('Enter')
    await expect(editedLauncher).toHaveCount(0)
    const editedReopened = page.getByTestId('focus-panel').last()
    await expect(editedReopened.getByTestId('saved-view-predicate-chip')).toContainText(
      'title = Task A',
      { timeout: 10_000 },
    )
    await expect(editedReopened.getByTestId('query-band-row').locator('input')).toHaveValue(
      'Task A',
    )

    await page.getByTestId('focus-panel').last().getByTestId('query-band-delete').click()
    await expect(page.getByTestId('focus-panel')).toHaveCount(0, { timeout: 5000 })

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
    expect(durable).toEqual({ source: 0, marker: 0, ownership: ownershipBefore })
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
    await expect(page.getByTestId('focus-panel')).toHaveCount(2, { timeout: 5_000 })
    const emptyFocused = page.getByTestId('focus-panel').last()
    await expect(emptyFocused.getByTestId('query-band-empty')).toBeVisible()
    await expect(emptyFocused.getByTestId('saved-view-custom-chip')).toBeVisible()
    await expect(emptyFocused.getByTestId('saved-view-sql-editor')).toHaveValue(
      'SELECT 1 WHERE 0',
    )
    await expect(emptyFocused.getByTestId('saved-view-sql-apply')).toBeEnabled()
    await expect(page.getByTestId('focus-panel')).toHaveCount(2)
    await emptyFocused.getByTestId('saved-view-sql-editor').fill('SELECT 2 AS answer')
    await expect(emptyFocused.getByTestId('saved-view-sql-apply')).toBeEnabled()
    await emptyFocused.getByTestId('saved-view-sql-apply').click()
    await expect(emptyFocused.getByTestId('saved-view-sql-editor')).toHaveCount(0)
    await emptyFocused.getByTestId('saved-view-sql-disclosure').click()
    await expect(emptyFocused.getByTestId('saved-view-sql-editor')).toHaveValue(
      'SELECT 2 AS answer',
    )
    await emptyFocused.getByTestId('saved-view-sql-cancel').click()
    await page
      .getByTestId('focus-panel')
      .first()
      .getByRole('button', { name: 'Collapse to this panel' })
      .click()
    await expect(page.getByTestId('focus-panel')).toHaveCount(1)

    await parent.getByTestId('view-place-open').filter({ hasText: 'Broken view' }).click()
    await expect(page.getByTestId('focus-panel')).toHaveCount(2, { timeout: 5_000 })
    const brokenFocused = page.getByTestId('focus-panel').last()
    await expect(brokenFocused.getByTestId('query-band-error')).toContainText(
      'Error preparing SQL',
      { timeout: 5000 },
    )
    await expect(brokenFocused.getByTestId('saved-view-sql-editor')).toHaveValue(
      'SELECT * FROM missing_view_source',
    )
    await expect(brokenFocused.getByTestId('saved-view-sql-apply')).toBeDisabled()
    await expect(brokenFocused.getByTestId('saved-view-sql-invalid')).toBeVisible()

    const folded = page.locator('[data-block-row="true"]')
    await expect(folded).toHaveCount(0)
  })
})
