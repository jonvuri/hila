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
  await expect(async () => {
    const count = await page.locator('.outline-row').count()
    expect(count).toBeGreaterThanOrEqual(minCount)
  }).toPass({ timeout: 5000 })
}

const openFocusPanelOnRow = async (page: Page, rowIndex: number) => {
  const row = page.locator('.outline-row').nth(rowIndex)
  const focusBtn = row.locator('.nav-row-open-focus')
  await row.hover()
  await expect(async () => {
    const opacity = await focusBtn.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    )
    expect(Number(opacity)).toBeGreaterThan(0)
  }).toPass({ timeout: 3000 })
  await focusBtn.click()
  await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Stream view: panel management', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page, 1)
  })

  test('initial state is single navigation panel at full width', async ({ page }) => {
    const streamView = page.getByTestId('stream-view')
    await expect(streamView).toBeVisible()

    const navColumns = page.getByTestId('stream-nav-column')
    await expect(navColumns).toHaveCount(1)

    const focusColumns = page.getByTestId('stream-focus-column')
    await expect(focusColumns).toHaveCount(0)

    await expect(page.getByTestId('navigation-panel')).toBeVisible()
  })

  test('click right-arrow opens focus panel to the right', async ({ page }) => {
    await openFocusPanelOnRow(page, 0)

    const navColumns = page.getByTestId('stream-nav-column')
    await expect(navColumns).toHaveCount(1)

    const focusColumns = page.getByTestId('stream-focus-column')
    await expect(focusColumns).toHaveCount(1)

    const labelEditor = page.getByTestId('focus-label-editor')
    await expect(labelEditor).toBeVisible()
    const text = await labelEditor.textContent()
    expect(text).toContain('Welcome to Hila')
  })

  test('click right-arrow on child replaces focus panel', async ({ page }) => {
    // Create a child row
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    // Type in the second row and indent it to make it a child
    const secondEditor = page
      .locator('.outline-row')
      .nth(1)
      .locator('.nav-label-editor .ProseMirror')
    await secondEditor.click()
    await page.keyboard.type('Child item')
    await page.keyboard.press('Tab')

    await expect(async () => {
      const depth = await page.locator('.outline-row').nth(1).getAttribute('data-depth')
      expect(depth).toBe('1')
    }).toPass({ timeout: 5000 })

    // Open focus panel on the parent row
    await openFocusPanelOnRow(page, 0)

    // Wait for children section to load in the focus panel
    const childrenSection = page.getByTestId('focus-panel-children')
    await expect(childrenSection).toBeVisible({ timeout: 5000 })

    await expect(async () => {
      const navPanel = childrenSection.getByTestId('navigation-panel')
      await expect(navPanel).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 8000 })

    // Find the child row's right-arrow button inside the focus panel's children
    const childRow = childrenSection.locator('.outline-row').first()
    await expect(childRow).toBeVisible({ timeout: 5000 })
    const childFocusBtn = childRow.locator('.nav-row-open-focus')
    await childRow.hover()
    await expect(async () => {
      const opacity = await childFocusBtn.evaluate(
        (el) => window.getComputedStyle(el).opacity,
      )
      expect(Number(opacity)).toBeGreaterThan(0)
    }).toPass({ timeout: 3000 })
    await childFocusBtn.click()

    // The focus panel should now show the child, not the parent
    await expect(async () => {
      const labelEditor = page.getByTestId('focus-label-editor')
      const text = await labelEditor.textContent()
      expect(text).toContain('Child item')
    }).toPass({ timeout: 5000 })

    // Still only one focus column (replaced, not added)
    const focusColumns = page.getByTestId('stream-focus-column')
    await expect(focusColumns).toHaveCount(1)
  })

  test('Cmd/Ctrl+L opens focus panel for focused row', async ({ page }) => {
    // Focus the first row's label editor
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()

    // No focus panel yet
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(0)

    // Press Cmd/Ctrl+L
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+l`)

    // Focus panel should open
    await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
    const focusColumns = page.getByTestId('stream-focus-column')
    await expect(focusColumns).toHaveCount(1)
  })

  test('Cmd+Left closes rightmost panel', async ({ page }) => {
    // Open a focus panel first
    await openFocusPanelOnRow(page, 0)
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(1)

    // Press Cmd+Left (Meta+ArrowLeft)
    await page.keyboard.press('Meta+ArrowLeft')

    // Focus panel should be closed
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(0)

    // Navigation panel should still be visible
    await expect(page.getByTestId('stream-nav-column')).toHaveCount(1)
    await expect(page.getByTestId('navigation-panel')).toBeVisible()
  })

  test('navigation panel count stays within limit', async ({ page }) => {
    // With the current flow, only 1 navigation panel is created in the
    // state array. Verify the limit is respected by checking the stream
    // view only has 1 navigation column.
    await expect(page.getByTestId('stream-nav-column')).toHaveCount(1)

    // Open a focus panel — still only 1 navigation column
    await openFocusPanelOnRow(page, 0)
    await expect(page.getByTestId('stream-nav-column')).toHaveCount(1)
  })
})
