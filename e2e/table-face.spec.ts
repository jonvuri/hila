import { test, expect, type Page } from '@playwright/test'

import { openEmbeddedTable } from './helpers/embedded-table'

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

const waitForRows = async (page: Page) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
}

const applyTableFace = async (page: Page) => {
  return openEmbeddedTable(page)
}

const reopenEmbeddedTable = async (page: Page) => {
  await page.reload()
  await waitForRows(page)
  const ownerRow = page.locator('.outline-row').first()
  await ownerRow.hover()
  await ownerRow.locator('.nav-row-open-focus').click()
  await expect(page.getByTestId('table-face')).toBeVisible({ timeout: 5000 })
}

const addTextColumn = async (page: Page, name?: string) => {
  await page.locator('button[title="Add column"]').click()
  await page.getByRole('button', { name: /Text/ }).click()
  await expect(page.locator('th', { hasText: name ?? 'New Column' })).toBeVisible({
    timeout: 5000,
  })
}

const addNumberColumn = async (page: Page) => {
  await page.locator('button[title="Add column"]').click()
  await page.getByRole('button', { name: /Number/ }).click()
  await expect(page.locator('th', { hasText: 'New Column' })).toBeVisible({
    timeout: 5000,
  })
}

const getCellInput = (page: Page) => page.locator('table tbody td input')

test.describe('Table face', () => {
  let tableMatrixId: number

  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page)
    tableMatrixId = await applyTableFace(page)
  })

  test('click a cell to edit, type a value, press Enter, verify saved', async ({ page }) => {
    await addTextColumn(page)

    // The table has 1 data row (the welcome row). Click the cell in the new column.
    // Workspace matrix columns: # | label | content | New Column (index 3)
    const cell = page.locator('table tbody tr').first().locator('td').nth(3)
    await cell.click()
    await cell.dblclick()

    const input = getCellInput(page)
    await expect(input).toBeVisible({ timeout: 3000 })
    await input.fill('Hello World')
    await page.keyboard.press('Enter')

    await expect(cell).toContainText('Hello World', { timeout: 5000 })
  })

  test('add a column via the "+" button, specify a type, verify it appears', async ({
    page,
  }) => {
    const headersBefore = await page.locator('table thead th').count()

    await page.locator('button[title="Add column"]').click()
    await page.getByRole('button', { name: /Number/ }).click()

    await expect(async () => {
      const headersAfter = await page.locator('table thead th').count()
      expect(headersAfter).toBe(headersBefore + 1)
    }).toPass({ timeout: 5000 })

    await expect(page.locator('th', { hasText: 'New Column' })).toBeVisible()
  })

  test('delete a column via context menu, verify it is removed', async ({ page }) => {
    await addTextColumn(page)
    await expect(page.locator('th', { hasText: 'New Column' })).toBeVisible()

    const headersBefore = await page.locator('table thead th').count()

    // Right-click the new column header to open context menu
    await page.locator('th', { hasText: 'New Column' }).click({ button: 'right' })
    await page.getByRole('button', { name: 'Delete Column' }).click()

    await expect(async () => {
      const headersAfter = await page.locator('table thead th').count()
      expect(headersAfter).toBe(headersBefore - 1)
    }).toPass({ timeout: 5000 })

    await expect(page.locator('th', { hasText: 'New Column' })).not.toBeVisible()
  })

  test('add a row, verify it appears', async ({ page }) => {
    const rowsBefore = await page.locator('table tbody tr').count()

    await page.getByRole('button', { name: '+ New Row' }).click()

    await expect(async () => {
      const rowsAfter = await page.locator('table tbody tr').count()
      expect(rowsAfter).toBe(rowsBefore + 1)
    }).toPass({ timeout: 5000 })
  })

  test('sort by clicking a column header, verify row ordering changes', async ({ page }) => {
    await addTextColumn(page)

    // Add two more rows to get 3 total
    await page.getByRole('button', { name: '+ New Row' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '+ New Row' }).click()
    await page.waitForTimeout(300)

    // Enter values in the text column: Banana, Apple, Cherry
    // Workspace matrix columns: # | label | content | New Column (index 3)
    const values = ['Banana', 'Apple', 'Cherry']
    for (let i = 0; i < 3; i++) {
      const cell = page.locator('table tbody tr').nth(i).locator('td').nth(3)
      await cell.dblclick()
      const input = getCellInput(page)
      await expect(input).toBeVisible({ timeout: 3000 })
      await input.fill(values[i]!)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(200)
    }

    // Click the "New Column" header to sort ascending
    await page.locator('th', { hasText: 'New Column' }).locator('button').first().click()

    // Verify ascending order: Apple, Banana, Cherry
    await expect(async () => {
      const firstCell = page.locator('table tbody tr').nth(0).locator('td').nth(3)
      await expect(firstCell).toContainText('Apple')
    }).toPass({ timeout: 5000 })

    const secondCell = page.locator('table tbody tr').nth(1).locator('td').nth(3)
    await expect(secondCell).toContainText('Banana')
    const thirdCell = page.locator('table tbody tr').nth(2).locator('td').nth(3)
    await expect(thirdCell).toContainText('Cherry')

    // Click again to sort descending
    await page.locator('th', { hasText: 'New Column' }).locator('button').first().click()

    await expect(async () => {
      const firstCell = page.locator('table tbody tr').nth(0).locator('td').nth(3)
      await expect(firstCell).toContainText('Cherry')
    }).toPass({ timeout: 5000 })

    const secondCellDesc = page.locator('table tbody tr').nth(1).locator('td').nth(3)
    await expect(secondCellDesc).toContainText('Banana')
    const thirdCellDesc = page.locator('table tbody tr').nth(2).locator('td').nth(3)
    await expect(thirdCellDesc).toContainText('Apple')
  })

  test('keyboard navigation: arrow keys between cells, Tab to advance', async ({ page }) => {
    await addTextColumn(page)

    // Add another row
    await page.getByRole('button', { name: '+ New Row' }).click()
    await page.waitForTimeout(300)

    const tableRoot = page.getByTestId('table-face')

    // Double-click cell (0, New Column) to enter edit mode directly
    // Workspace matrix columns: # | label | content | New Column (index 3)
    const cell01 = page.locator('table tbody tr').nth(0).locator('td').nth(3)
    await cell01.dblclick()

    // Wait for the editor input to appear and receive focus
    const input = getCellInput(page)
    await expect(input).toBeVisible({ timeout: 3000 })
    await expect(input).toBeFocused({ timeout: 3000 })

    // Type value and press Tab to commit + advance to next cell
    await input.fill('Alpha')
    await page.keyboard.press('Tab')

    // Tab should commit "Alpha" and move selection forward
    await expect(cell01).toContainText('Alpha', { timeout: 5000 })

    // Focus the table container for arrow key navigation
    await tableRoot.focus()

    // Tab from the last data column wraps to # column of next row.
    // Navigate right to reach "New Column" (index 3) in row 2.
    // Workspace columns: # | label | content | New Column → need 3 ArrowRight presses
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')

    // Press Enter to start editing cell (1, New Column)
    await page.keyboard.press('Enter')

    const input2 = getCellInput(page)
    await expect(input2).toBeVisible({ timeout: 3000 })
    await expect(input2).toBeFocused({ timeout: 3000 })

    await input2.fill('Beta')
    await page.keyboard.press('Enter')

    const cell11 = page.locator('table tbody tr').nth(1).locator('td').nth(3)
    await expect(cell11).toContainText('Beta', { timeout: 5000 })
  })

  test('pages large tables with stable global row positions', async ({ page }) => {
    await page.evaluate(async (matrixId) => {
      // @ts-expect-error -- Vite resolves this browser-only module at runtime.
      const sql = await import('/src/core/client/sql-client.ts')
      // @ts-expect-error -- Vite resolves this browser-only module at runtime.
      const matrix = await import('/src/core/client/matrix-client.ts')
      const rows = await sql.execQuery(
        `SELECT owner_matrix_id AS matrixId, owner_row_id AS rowId FROM matrix WHERE id = ${matrixId}`,
      )
      const owner = rows[0] as { matrixId: number; rowId: number }
      for (let index = 0; index < 104; index += 1) {
        await matrix.createDependentRow(owner.matrixId, owner.rowId, matrixId, {
          title: `Paged row ${index + 2}`,
        })
      }
    }, tableMatrixId)

    const dataRows = page.locator('tbody tr[data-table-row-index]')
    await expect(dataRows).toHaveCount(100, { timeout: 10_000 })
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(dataRows).toHaveCount(5, { timeout: 5000 })
    await expect(dataRows.first()).toHaveAttribute('data-table-row-index', '100')
    await expect(page.getByText('Page 2')).toBeVisible()
  })

  test('keeps every treatment independent from theme, polarity, and narrow width', async ({
    page,
  }) => {
    const treatments = ['thin-line', 'corner-notch', 'cell-dots'] as const
    const visualThemes = ['ghost', 'null', 'wipeout'] as const
    const polarities = ['dark', 'light'] as const

    for (const treatment of treatments) {
      await page.setViewportSize({ width: 1180, height: 844 })
      await page.evaluate(
        async ({ matrixId, nextTreatment }) => {
          // @ts-expect-error -- Vite resolves this browser-only module at runtime.
          const matrix = await import('/src/core/client/matrix-client.ts')
          const config = await matrix.getFaceConfigForMatrix(matrixId)
          if (!config) throw new Error('Missing table recipe')
          await matrix.saveFaceConfig({
            ...config,
            settings: { ...config.settings, tableTreatment: nextTreatment },
          })
        },
        { matrixId: tableMatrixId, nextTreatment: treatment },
      )
      await reopenEmbeddedTable(page)
      const table = page.getByTestId('table-face')
      await expect(table).toHaveAttribute('data-table-treatment', treatment)

      for (const visualTheme of visualThemes) {
        for (const polarity of polarities) {
          await page.evaluate(
            ([nextVisualTheme, nextPolarity]) => {
              document.documentElement.dataset.visualTheme = nextVisualTheme
              document.documentElement.dataset.theme = nextPolarity
            },
            [visualTheme, polarity] as const,
          )

          await expect(page.locator('html')).toHaveAttribute('data-visual-theme', visualTheme)
          await expect(page.locator('html')).toHaveAttribute('data-theme', polarity)
          await expect(table).toHaveAttribute('data-table-treatment', treatment)
          await expect
            .poll(() =>
              table.evaluate((element, activeTreatment) => {
                const tableElement = element.querySelector('table')
                const header = tableElement?.querySelector('th:nth-child(2)')
                const cell = tableElement?.querySelector('tbody td:nth-child(2)')
                const frame = tableElement?.parentElement?.parentElement
                if (!header || !cell || !frame) return false

                if (activeTreatment === 'thin-line') {
                  return getComputedStyle(header).textTransform === 'uppercase'
                }
                if (activeTreatment === 'corner-notch') {
                  const notch = getComputedStyle(frame, '::before')
                  return notch.content !== 'none' && notch.borderTopStyle === 'solid'
                }

                const dot = getComputedStyle(cell, '::before')
                return dot.content !== 'none' && dot.width === '3px' && dot.height === '3px'
              }, treatment),
            )
            .toBe(true)
        }
      }

      await page.setViewportSize({ width: 500, height: 844 })
      await expect(page.getByTestId('workspace-shell')).toHaveAttribute(
        'data-shell-presentation',
        'single-panel',
      )
      await expect(table).toBeVisible()
      await expect(table).toHaveAttribute('data-table-treatment', treatment)
      await expect(page.getByRole('button', { name: '+ New Row' })).toBeVisible()
    }
  })
})
