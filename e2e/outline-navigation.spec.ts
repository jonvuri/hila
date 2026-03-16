import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
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

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  const count = await page.locator('.outline-row').count()
  expect(count).toBeGreaterThanOrEqual(minCount)
  return count
}

/** Build three rows from the welcome row: Row1, Row2, Row3. */
const setupThreeRows = async (page: Page) => {
  await resetDB(page)
  await waitForRows(page, 1)

  // Overwrite the welcome row
  const firstEditor = page.locator('.ProseMirror').first()
  await firstEditor.click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('Row1')

  await page.keyboard.press('Meta+ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.keyboard.type('Row2')

  await page.keyboard.press('Meta+ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.keyboard.type('Row3')

  await page.waitForTimeout(500)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Arrow key navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupThreeRows(page)
  })

  test('ArrowDown from first row focuses second row', async ({ page }) => {
    const editors = page.locator('.ProseMirror')

    // Row1 is the first editor, Row2 is second, Row3 is third
    await editors.nth(0).click()
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)

    await expect(editors.nth(1)).toBeFocused()
  })

  test('ArrowUp from second row focuses first row', async ({ page }) => {
    const editors = page.locator('.ProseMirror')

    await editors.nth(1).click()
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(200)

    await expect(editors.nth(0)).toBeFocused()
  })

  test('ArrowDown from last row is a no-op', async ({ page }) => {
    const editors = page.locator('.ProseMirror')
    const lastIdx = (await editors.count()) - 1

    await editors.nth(lastIdx).click()
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)

    await expect(editors.nth(lastIdx)).toBeFocused()
  })

  test('ArrowUp from first row is a no-op', async ({ page }) => {
    const editors = page.locator('.ProseMirror')

    await editors.nth(0).click()
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(200)

    await expect(editors.nth(0)).toBeFocused()
  })

  test('sequential ArrowDown traverses all rows', async ({ page }) => {
    const editors = page.locator('.ProseMirror')

    await editors.nth(0).click()

    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    await expect(editors.nth(1)).toBeFocused()

    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    await expect(editors.nth(2)).toBeFocused()
  })
})
