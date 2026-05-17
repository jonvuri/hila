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

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  await expect(async () => {
    const count = await page.locator('.outline-row').count()
    expect(count).toBeGreaterThanOrEqual(minCount)
  }).toPass({ timeout: 5000 })
}

test.describe('Welcome row and empty state', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
  })

  test('fresh app shows welcome row with "Welcome to Hila" label', async ({ page }) => {
    await waitForRows(page, 1)

    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await expect(firstEditor).toContainText('Welcome to Hila', { timeout: 5000 })
  })

  test('deleting all rows shows empty state', async ({ page }) => {
    await waitForRows(page, 1)

    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()

    // Select all text and delete it to make the row empty
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+a`)
    await page.keyboard.press('Backspace')

    // Wait for the row to be empty
    await expect(async () => {
      const text = ((await firstEditor.textContent()) ?? '').trim()
      expect(text).toBe('')
    }).toPass({ timeout: 3000 })

    // Wait for the debounced save to complete
    await page.waitForTimeout(500)

    // Press Backspace at start of empty row to delete it
    await page.keyboard.press('Home')
    await page.keyboard.press('Backspace')

    // Empty state should appear
    const emptyState = page.getByTestId('navigation-panel-empty')
    await expect(emptyState).toBeVisible({ timeout: 5000 })
    await expect(emptyState).toContainText('Press Enter to create your first row.')
  })

  test('pressing Enter in empty state creates a new row', async ({ page }) => {
    await waitForRows(page, 1)

    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()

    // Clear the welcome row and delete it
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+a`)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(500)
    await page.keyboard.press('Home')
    await page.keyboard.press('Backspace')

    // Wait for empty state
    const emptyState = page.getByTestId('navigation-panel-empty')
    await expect(emptyState).toBeVisible({ timeout: 5000 })

    // Press Enter to create a new row
    await page.keyboard.press('Enter')

    // A new row should appear
    await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('navigation-panel-empty')).not.toBeVisible({ timeout: 3000 })
  })
})
