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
 * Build a hierarchy: "FocusParent" > "FocusChild" + sibling "FocusSibling".
 * Creates all rows at root first, then indents to form the hierarchy.
 */
const setupHierarchy = async (page: Page) => {
  await resetDB(page)
  await waitForRows(page, 1)

  // Create three root rows: FocusParent, FocusChild, FocusSibling
  const firstEditor = page.locator('.ProseMirror').first()
  await firstEditor.click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('FocusParent')

  await page.keyboard.press('Meta+ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.keyboard.type('FocusChild')

  await page.keyboard.press('Meta+ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.keyboard.type('FocusSibling')

  await page.waitForTimeout(500)

  // Now indent FocusChild (row index 1) under FocusParent
  const editors = page.locator('.ProseMirror')
  await editors.nth(1).click()
  await page.keyboard.press('Tab')
  await page.waitForTimeout(800)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Focus view (zoom into subtree)', () => {
  test('Mod-ArrowDown zooms into a row, showing only its children', async ({ page }) => {
    await setupHierarchy(page)

    const rowCountBefore = await page.locator('.outline-row').count()

    // Focus the parent (first editor) and zoom in
    const editors = page.locator('.ProseMirror')
    await editors.nth(0).click()
    await page.keyboard.press('Meta+ArrowDown')
    await page.waitForTimeout(500)

    // Breadcrumb bar should appear with "Home"
    await expect(page.locator('[data-testid="breadcrumb-home"]')).toBeVisible()

    // Focus title should show "FocusParent"
    await expect(page.locator('[data-testid="focus-title"]')).toContainText('FocusParent')

    // Only children of FocusParent should be visible as outline rows
    const rowCountAfter = await page.locator('.outline-row').count()
    expect(rowCountAfter).toBeLessThan(rowCountBefore)

    // "FocusChild" should be visible
    const textsAfter = await getEditorTexts(page)
    expect(textsAfter.some((t) => t === 'FocusChild')).toBe(true)

    // "FocusSibling" should NOT be visible (outside the focused subtree)
    expect(textsAfter.some((t) => t === 'FocusSibling')).toBe(false)
  })

  test('clicking Home breadcrumb returns to full outline', async ({ page }) => {
    await setupHierarchy(page)

    const editors = page.locator('.ProseMirror')
    await editors.nth(0).click()
    await page.keyboard.press('Meta+ArrowDown')
    await page.waitForTimeout(500)

    await expect(page.locator('[data-testid="breadcrumb-home"]')).toBeVisible()

    // Click "Home"
    await page.locator('[data-testid="breadcrumb-home"]').click()
    await page.waitForTimeout(500)

    // Breadcrumb bar should disappear
    await expect(page.locator('[data-testid="breadcrumb-home"]')).not.toBeVisible()

    // All rows should be visible again
    const texts = await getEditorTexts(page)
    expect(texts.some((t) => t === 'FocusParent')).toBe(true)
    expect(texts.some((t) => t === 'FocusChild')).toBe(true)
  })

  test('Mod-ArrowUp zooms out one level', async ({ page }) => {
    await setupHierarchy(page)

    const editors = page.locator('.ProseMirror')
    await editors.nth(0).click()
    await page.keyboard.press('Meta+ArrowDown')
    await page.waitForTimeout(500)

    await expect(page.locator('[data-testid="focus-title"]')).toContainText('FocusParent')

    // Focus a child editor and press Mod-ArrowUp to zoom out
    const childEditors = page.locator('.ProseMirror')
    if ((await childEditors.count()) > 0) {
      await childEditors.first().click()
    }
    await page.keyboard.press('Meta+ArrowUp')
    await page.waitForTimeout(500)

    // Should be back at root level (no breadcrumbs)
    await expect(page.locator('[data-testid="breadcrumb-home"]')).not.toBeVisible()

    const texts = await getEditorTexts(page)
    expect(texts.some((t) => t === 'FocusParent')).toBe(true)
  })

  test('double-clicking a parent bullet zooms into that row', async ({ page }) => {
    await setupHierarchy(page)

    const bullets = page.locator('[data-testid="outline-bullet"]')
    const parentBullet = bullets.nth(0)

    // Parent should have a disclosure triangle
    const bulletText = (await parentBullet.textContent())?.trim()
    expect(bulletText === '▼' || bulletText === '▶').toBe(true)

    // Double-click the bullet to zoom in
    await parentBullet.dblclick()
    await page.waitForTimeout(500)

    await expect(page.locator('[data-testid="focus-title"]')).toContainText('FocusParent')
    await expect(page.locator('[data-testid="breadcrumb-home"]')).toBeVisible()
  })
})
