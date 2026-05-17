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

const waitForOutline = async (page: Page) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
}

const applyTableFace = async (page: Page) => {
  await page.getByTestId('view-as-button').click()
  await expect(page.getByTestId('face-config-panel')).toBeVisible()
  await page.getByTestId('face-type-picker').selectOption('hila.table')
  await page.getByTestId('face-config-apply').click()
  await expect(page.getByTestId('face-config-panel')).not.toBeVisible({ timeout: 5000 })
  await expect(page.locator('table')).toBeVisible({ timeout: 5000 })
}

const dataRows = (page: Page) =>
  page.locator('table tbody tr').filter({ hasNot: page.getByRole('button', { name: '+ New Row' }) })

const addFormulaColumnViaAPI = async (page: Page, name: string, expression: string) => {
  await page.evaluate(
    async ({ name, expression }) => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sqlClient = await import('/src/core/client/sql-client.ts')
      const matrices = await sqlClient.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
      const matrixId = (matrices[0] as { id: number }).id
      await matrixClient.addFormulaColumn(matrixId, name, expression)
    },
    { name, expression },
  )
  await page.waitForTimeout(500)
}

test.describe('Formula columns', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
    await applyTableFace(page)
  })

  test('add a formula column, verify it appears with computed values', async ({ page }) => {
    await addFormulaColumnViaAPI(page, 'content_len', 'length(content)')

    // The formula column header should appear with "fx" indicator
    await expect(page.locator('th', { hasText: 'content_len' })).toBeVisible({ timeout: 5000 })

    await expect(async () => {
      const header = page.locator('th', { hasText: 'content_len' })
      await expect(header).toContainText('fx')

      const headers = page.locator('table thead th')
      const headerCount = await headers.count()
      const formulaCellIdx = headerCount - 2
      const cell = dataRows(page).first().locator('td').nth(formulaCellIdx)
      const text = await cell.textContent()
      expect(Number(text?.trim())).toBeGreaterThan(0)
    }).toPass({ timeout: 5000 })
  })

  test('formula cell is non-editable (click does not enter edit mode)', async ({ page }) => {
    await addFormulaColumnViaAPI(page, 'content_len', 'length(content)')
    await expect(page.locator('th', { hasText: 'content_len' })).toBeVisible({ timeout: 5000 })

    const headers = page.locator('table thead th')
    const headerCount = await headers.count()
    const formulaCellIdx = headerCount - 2

    const formulaCell = dataRows(page).first().locator('td').nth(formulaCellIdx)

    await formulaCell.click()
    await page.waitForTimeout(200)

    await formulaCell.dblclick()
    await page.waitForTimeout(200)

    const inputCount = await formulaCell.locator('input').count()
    expect(inputCount).toBe(0)

    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const inputCountAfterEnter = await formulaCell.locator('input').count()
    expect(inputCountAfterEnter).toBe(0)
  })
})
