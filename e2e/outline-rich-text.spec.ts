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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Rich text formatting', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page, 1)
  })

  test('Mod-B applies bold formatting', async ({ page }) => {
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('bold text')

    // Select all and apply bold
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Meta+b')
    await page.waitForTimeout(200)

    const strongEl = firstEditor.locator('strong')
    await expect(strongEl).toBeVisible()
    await expect(strongEl).toContainText('bold text')
  })

  test('Mod-I applies italic formatting', async ({ page }) => {
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('italic text')

    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Meta+i')
    await page.waitForTimeout(200)

    const emEl = firstEditor.locator('em')
    await expect(emEl).toBeVisible()
    await expect(emEl).toContainText('italic text')
  })

  test('Mod-E applies code formatting', async ({ page }) => {
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('code text')

    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Meta+e')
    await page.waitForTimeout(200)

    const codeEl = firstEditor.locator('code')
    await expect(codeEl).toBeVisible()
    await expect(codeEl).toContainText('code text')
  })

  test('Mod-B toggles bold off when applied twice', async ({ page }) => {
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('toggle')

    // Apply bold
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Meta+b')
    await page.waitForTimeout(200)
    await expect(firstEditor.locator('strong')).toBeVisible()

    // Remove bold
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Meta+b')
    await page.waitForTimeout(200)
    await expect(firstEditor.locator('strong')).not.toBeVisible()
  })

  test('rich text formatting persists after save cycle', async ({ page }) => {
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('persistent bold')

    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Meta+b')
    await page.waitForTimeout(200)
    await expect(firstEditor.locator('strong')).toBeVisible()

    // Wait for debounced save
    await page.waitForTimeout(1000)

    // Reload page to force fresh load from DB
    await page.reload()
    await waitForRows(page, 1)

    const editor = page.locator('.ProseMirror').first()
    await expect(editor.locator('strong')).toBeVisible({ timeout: 3000 })
  })
})
