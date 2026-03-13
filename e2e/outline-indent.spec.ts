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
  await page.locator('.sidebar-tab', { hasText: 'Matrix Debug' }).click()
  await page.getByRole('button', { name: 'Reset Database' }).click()
  await expect(page.getByRole('button', { name: 'Reset Database' })).toBeEnabled()
}

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  const count = await page.locator('.outline-row').count()
  expect(count).toBeGreaterThanOrEqual(minCount)
  return count
}

const INDENT_PX = 24

const getIndentWidth = async (page: Page, rowIndex: number): Promise<number> => {
  const indent = page.locator('.outline-row-indent').nth(rowIndex)
  return indent.evaluate((el) => (el as HTMLElement).offsetWidth)
}

const getEditorTexts = async (page: Page): Promise<string[]> => {
  const editors = page.locator('.ProseMirror')
  const count = await editors.count()
  const texts: string[] = []
  for (let i = 0; i < count; i++) {
    texts.push(((await editors.nth(i).textContent()) ?? '').trim())
  }
  return texts
}

/**
 * Build two root-level rows: "First" and "Second" from the welcome row.
 * Returns the total row count.
 */
const setupTwoRootRows = async (page: Page): Promise<number> => {
  await resetDB(page)
  await waitForRows(page, 1)

  const firstEditor = page.locator('.ProseMirror').first()
  await firstEditor.click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('First')

  await page.keyboard.press('Meta+ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.keyboard.type('Second')

  await page.waitForTimeout(500)

  return page.locator('.outline-row').count()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Indent / outdent', () => {
  test('Tab indents row as child of previous sibling', async ({ page }) => {
    await setupTwoRootRows(page)

    // Second row is at index 1
    const indentBefore = await getIndentWidth(page, 1)
    expect(indentBefore).toBe(0)

    // Focus second row and press Tab
    const editors = page.locator('.ProseMirror')
    await editors.nth(1).click()
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // After indent, second row should be indented one level
    const indentAfter = await getIndentWidth(page, 1)
    expect(indentAfter).toBe(INDENT_PX)
  })

  test('Shift-Tab outdents row back to parent level', async ({ page }) => {
    await setupTwoRootRows(page)

    const editors = page.locator('.ProseMirror')

    // Indent first
    await editors.nth(1).click()
    await page.keyboard.press('Tab')

    await expect(async () => {
      const indentAfterTab = await getIndentWidth(page, 1)
      expect(indentAfterTab).toBe(INDENT_PX)
    }).toPass({ timeout: 5000 })

    // Now outdent
    await editors.nth(1).click()
    await page.keyboard.press('Shift+Tab')

    await expect(async () => {
      const indentAfterShiftTab = await getIndentWidth(page, 1)
      expect(indentAfterShiftTab).toBe(0)
    }).toPass({ timeout: 5000 })
  })

  test('Tab on the first row (no previous sibling) is a no-op', async ({ page }) => {
    await setupTwoRootRows(page)

    const indentBefore = await getIndentWidth(page, 0)
    expect(indentBefore).toBe(0)

    const editors = page.locator('.ProseMirror')
    await editors.nth(0).click()
    await page.keyboard.press('Tab')
    await page.waitForTimeout(500)

    const indentAfter = await getIndentWidth(page, 0)
    expect(indentAfter).toBe(0)
  })

  test('Shift-Tab on a root row (no parent) is a no-op', async ({ page }) => {
    await setupTwoRootRows(page)

    const indentBefore = await getIndentWidth(page, 0)
    expect(indentBefore).toBe(0)

    const editors = page.locator('.ProseMirror')
    await editors.nth(0).click()
    await page.keyboard.press('Shift+Tab')
    await page.waitForTimeout(500)

    const indentAfter = await getIndentWidth(page, 0)
    expect(indentAfter).toBe(0)
  })

  test('indented row shows parent disclosure triangle', async ({ page }) => {
    await setupTwoRootRows(page)

    const bullets = page.locator('[data-testid="outline-bullet"]')

    // Before indent: "First" row should have a leaf bullet
    await expect(bullets.nth(0)).toHaveText('•')

    // Indent "Second" under "First"
    const editors = page.locator('.ProseMirror')
    await editors.nth(1).click()
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // "First" should now show a disclosure triangle (has children)
    const firstBulletText = (await bullets.nth(0).textContent())?.trim()
    expect(firstBulletText === '▼' || firstBulletText === '▶').toBe(true)
  })
})
