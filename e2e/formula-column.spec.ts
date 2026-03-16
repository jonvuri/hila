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

const addFormulaColumn = async (page: Page, name: string, expression: string) => {
  await page.locator('button[title="Add column"]').click()
  await page.getByRole('button', { name: /Formula/ }).click()

  // Fill in the formula dialog
  const nameInput = page.locator('input[placeholder="Column name"]')
  await expect(nameInput).toBeVisible({ timeout: 3000 })
  await nameInput.fill(name)

  const exprInput = page.locator('input[placeholder*="SQL expression"]')
  await exprInput.fill(expression)

  await page.getByRole('button', { name: 'Add', exact: true }).click()
}

test.describe('Formula columns', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
    await applyTableFace(page)
  })

  test('add a formula column, verify it appears with computed values', async ({ page }) => {
    // The table has one data row with a "content" column containing ProseMirror JSON.
    // Add a formula: length(content) which computes the string length.
    await addFormulaColumn(page, 'content_len', 'length(content)')

    // The formula column header should appear with "fx" indicator
    await expect(page.locator('th', { hasText: 'content_len' })).toBeVisible({ timeout: 5000 })

    // The formula column should show a computed value (length of the JSON string, > 0)
    const formulaCell = page
      .locator('table tbody tr')
      .first()
      .locator('td')
      .last()
      // Skip the empty trailing td (from the add-column header)
      .locator('xpath=preceding-sibling::td[1]')

    // Alternative: just check that the last data column's cell has a number
    await expect(async () => {
      // The formula column header should contain "fx"
      const header = page.locator('th', { hasText: 'content_len' })
      await expect(header).toContainText('fx')

      // Get the cell in the formula column row
      const headers = page.locator('table thead th')
      const headerCount = await headers.count()
      // Formula column is the last data column, just before the "+" column
      const formulaCellIdx = headerCount - 2 // -1 for 0-index, -1 for add column
      const cell = page.locator('table tbody tr').first().locator('td').nth(formulaCellIdx)
      const text = await cell.textContent()
      // The value should be a positive number (length of the JSON string)
      expect(Number(text?.trim())).toBeGreaterThan(0)
    }).toPass({ timeout: 5000 })
  })

  test('formula cell is non-editable (click does not enter edit mode)', async ({ page }) => {
    await addFormulaColumn(page, 'content_len', 'length(content)')
    await expect(page.locator('th', { hasText: 'content_len' })).toBeVisible({ timeout: 5000 })

    // Find the formula column index
    const headers = page.locator('table thead th')
    const headerCount = await headers.count()
    const formulaCellIdx = headerCount - 2

    const formulaCell = page.locator('table tbody tr').first().locator('td').nth(formulaCellIdx)

    // Click the formula cell
    await formulaCell.click()
    await page.waitForTimeout(200)

    // Double-click should NOT open an edit input
    await formulaCell.dblclick()
    await page.waitForTimeout(200)

    // No input element should appear within the cell
    const inputCount = await formulaCell.locator('input').count()
    expect(inputCount).toBe(0)

    // Also verify pressing Enter doesn't open an edit input
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const inputCountAfterEnter = await formulaCell.locator('input').count()
    expect(inputCountAfterEnter).toBe(0)
  })
})
